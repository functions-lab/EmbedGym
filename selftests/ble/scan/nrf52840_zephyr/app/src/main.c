// BLE observer selftest: scan passively for the "GYM-TEMP" tag, whose
// advertising carries Environmental Sensing (UUID 0x181A) service data: a
// little-endian signed 16-bit temperature in 0.01 °C. Each new value is
// printed once as "TEMP <t>" with two decimals (2150 -> "TEMP 21.50",
// -25 -> "TEMP -0.25").
#include <stdlib.h>
#include <string.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/byteorder.h>
#include <zephyr/sys/printk.h>
#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/bluetooth/uuid.h>

#define TAG_NAME "GYM-TEMP"

struct tag_report {
    bool named;
    bool has_temp;
    int16_t temp;
};

static bool printed;
static int16_t last_temp;

static bool parse_ad(struct bt_data *data, void *user_data)
{
    struct tag_report *report = user_data;

    switch (data->type) {
    case BT_DATA_NAME_COMPLETE:
        report->named = data->data_len == strlen(TAG_NAME) &&
                        memcmp(data->data, TAG_NAME, data->data_len) == 0;
        break;
    case BT_DATA_SVC_DATA16:
        if (data->data_len == 4 && sys_get_le16(data->data) == BT_UUID_ESS_VAL) {
            report->has_temp = true;
            report->temp = (int16_t)sys_get_le16(&data->data[2]);
        }
        break;
    default:
        break;
    }
    return true;
}

static void device_found(const bt_addr_le_t *addr, int8_t rssi, uint8_t type,
                         struct net_buf_simple *ad)
{
    struct tag_report report = {0};

    bt_data_parse(ad, parse_ad, &report);
    if (!report.named || !report.has_temp || (printed && report.temp == last_temp)) {
        return;
    }
    printed = true;
    last_temp = report.temp;
    int magnitude = abs(report.temp);
    printk("TEMP %s%d.%02d\n", report.temp < 0 ? "-" : "", magnitude / 100, magnitude % 100);
}

int main(void)
{
    // No duplicate filter: the controller filters by address, and the tag
    // keeps its address while its data changes.
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
    err = bt_le_scan_start(&param, device_found);
    if (err) {
        printk("Scanning failed to start (err %d)\n", err);
    }
    return 0;
}
