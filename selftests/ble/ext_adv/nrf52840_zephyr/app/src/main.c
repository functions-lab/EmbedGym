// BLE extended advertising selftest: from t = 1000 ms, extended
// non-connectable, non-scannable advertising as "GYM-EXT" with 191 bytes of
// advertising data, more than legacy advertising's 31: the name, then
// manufacturer data: company 0xFFFF, a little-endian 16-bit sequence number
// and 176 pattern bytes, byte i = (seq * 31 + i * 7) & 0xff. The sequence
// number starts at 0 and increments every 1000 ms; each value is printed once
// it is advertised as "EXT seq=<n> len=<bytes> crc=<CRC-32 of the whole
// advertising data, 8 hex digits>".
#include <zephyr/kernel.h>
#include <zephyr/sys/byteorder.h>
#include <zephyr/sys/crc.h>
#include <zephyr/sys/printk.h>
#include <zephyr/bluetooth/bluetooth.h>

#define NAME "GYM-EXT"
#define PATTERN_LEN 176

static uint8_t mfg_data[4 + PATTERN_LEN] = {0xff, 0xff};

static const struct bt_data ad[] = {
    BT_DATA(BT_DATA_NAME_COMPLETE, NAME, sizeof(NAME) - 1),
    BT_DATA(BT_DATA_MANUFACTURER_DATA, mfg_data, sizeof(mfg_data)),
};

static void fill(uint16_t seq)
{
    sys_put_le16(seq, &mfg_data[2]);
    for (int i = 0; i < PATTERN_LEN; i++) {
        mfg_data[4 + i] = (seq * 31 + i * 7) & 0xff;
    }
}

// The advertising data as sent: each element is length, type, data.
static void print_advertised(uint16_t seq)
{
    uint32_t crc = 0;
    unsigned int len = 0;

    for (size_t i = 0; i < ARRAY_SIZE(ad); i++) {
        uint8_t header[] = {ad[i].data_len + 1, ad[i].type};

        crc = crc32_ieee_update(crc, header, sizeof(header));
        crc = crc32_ieee_update(crc, ad[i].data, ad[i].data_len);
        len += sizeof(header) + ad[i].data_len;
    }
    printk("EXT seq=%u len=%u crc=%08x\n", seq, len, crc);
}

int main(void)
{
    struct bt_le_ext_adv *adv;
    int err = bt_enable(NULL);

    if (err) {
        printk("Bluetooth init failed (err %d)\n", err);
        return 0;
    }
    err = bt_le_ext_adv_create(BT_LE_EXT_ADV_NCONN, NULL, &adv);
    if (err) {
        printk("Advertising set failed (err %d)\n", err);
        return 0;
    }
    fill(0);
    err = bt_le_ext_adv_set_data(adv, ad, ARRAY_SIZE(ad), NULL, 0);
    if (err) {
        printk("Advertising data failed (err %d)\n", err);
        return 0;
    }

    k_sleep(K_TIMEOUT_ABS_MS(1000));
    err = bt_le_ext_adv_start(adv, BT_LE_EXT_ADV_START_DEFAULT);
    if (err) {
        printk("Advertising failed to start (err %d)\n", err);
        return 0;
    }
    print_advertised(0);

    for (uint16_t seq = 1;; seq++) {
        k_sleep(K_TIMEOUT_ABS_MS(1000 + 1000 * (int64_t)seq));
        fill(seq);
        err = bt_le_ext_adv_set_data(adv, ad, ARRAY_SIZE(ad), NULL, 0);
        if (err) {
            printk("Advertising data update failed (err %d)\n", err);
            return 0;
        }
        print_advertised(seq);
    }
    return 0;
}
