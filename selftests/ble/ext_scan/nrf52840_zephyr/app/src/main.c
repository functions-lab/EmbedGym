// BLE extended scan selftest: scan passively, with extended scanning, for the
// "GYM-CHAIN" advertiser: extended non-connectable advertising with 250 bytes
// of data, more than one AUX_ADV_IND holds, so they arrive over an AUX chain.
// The data: the name, then manufacturer data: company 0xFFFF, a little-endian
// 16-bit sequence number and pattern bytes. Each new sequence number is printed
// once, from the reassembled data, as "EXT seq=<n> len=<bytes> crc=<CRC-32 of
// the whole advertising data, 8 hex digits>".
#include <string.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/byteorder.h>
#include <zephyr/sys/crc.h>
#include <zephyr/sys/printk.h>
#include <zephyr/bluetooth/bluetooth.h>

#define CHAIN_NAME "GYM-CHAIN"
#define COMPANY_ID 0xffff

struct chain_report {
    bool named;
    bool has_seq;
    uint16_t seq;
};

static bool printed;
static uint16_t last_seq;

static bool parse_ad(struct bt_data *data, void *user_data)
{
    struct chain_report *report = user_data;

    switch (data->type) {
    case BT_DATA_NAME_COMPLETE:
        report->named = data->data_len == strlen(CHAIN_NAME) &&
                        memcmp(data->data, CHAIN_NAME, data->data_len) == 0;
        break;
    case BT_DATA_MANUFACTURER_DATA:
        if (data->data_len >= 4 && sys_get_le16(data->data) == COMPANY_ID) {
            report->has_seq = true;
            report->seq = sys_get_le16(&data->data[2]);
        }
        break;
    default:
        break;
    }
    return true;
}

static void scan_recv(const struct bt_le_scan_recv_info *info, struct net_buf_simple *buf)
{
    struct chain_report report = {0};
    unsigned int len = buf->len;
    uint32_t crc = crc32_ieee(buf->data, buf->len);

    if (!(info->adv_props & BT_GAP_ADV_PROP_EXT_ADV)) {
        return;
    }
    bt_data_parse(buf, parse_ad, &report);
    if (!report.named || !report.has_seq || (printed && report.seq == last_seq)) {
        return;
    }
    printed = true;
    last_seq = report.seq;
    printk("EXT seq=%u len=%u crc=%08x\n", report.seq, len, crc);
}

static struct bt_le_scan_cb scan_callbacks = {
    .recv = scan_recv,
};

int main(void)
{
    // No duplicate filter: the controller filters by address and SID, and the
    // advertiser keeps both while its data changes.
    struct bt_le_scan_param param = {
        .type = BT_LE_SCAN_TYPE_PASSIVE,
        .options = BT_LE_SCAN_OPT_NONE,
        .interval = BT_GAP_SCAN_FAST_INTERVAL_MIN,
        .window = BT_GAP_SCAN_FAST_WINDOW,
    };

    int err = bt_enable(NULL);
    if (err) {
        printk("Bluetooth init failed (err %d)\n", err);
        return 0;
    }
    bt_le_scan_cb_register(&scan_callbacks);
    err = bt_le_scan_start(&param, NULL);
    if (err) {
        printk("Scanning failed to start (err %d)\n", err);
    }
    return 0;
}
