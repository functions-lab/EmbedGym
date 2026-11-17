// BLE scan response selftest: from t = 1000 ms, legacy scannable,
// non-connectable advertising (ADV_SCAN_IND) as "GYM-SR". The advertising data
// holds only the flags and the name; the scan response holds manufacturer
// data: company 0xFFFF, then a little-endian 16-bit counter. The counter starts
// at 0 and increments every 1000 ms; each value is printed as "SR <n>" once it
// is in the scan response.
#include <zephyr/kernel.h>
#include <zephyr/sys/byteorder.h>
#include <zephyr/sys/printk.h>
#include <zephyr/bluetooth/bluetooth.h>

#define NAME "GYM-SR"

static uint8_t mfg_data[] = {0xff, 0xff, 0x00, 0x00};

static const struct bt_data ad[] = {
    BT_DATA_BYTES(BT_DATA_FLAGS, BT_LE_AD_NO_BREDR),
    BT_DATA(BT_DATA_NAME_COMPLETE, NAME, sizeof(NAME) - 1),
};

static const struct bt_data sd[] = {
    BT_DATA(BT_DATA_MANUFACTURER_DATA, mfg_data, sizeof(mfg_data)),
};

int main(void)
{
    int err = bt_enable(NULL);
    if (err) {
        printk("Bluetooth init failed (err %d)\n", err);
        return 0;
    }

    k_sleep(K_TIMEOUT_ABS_MS(1000));
    err = bt_le_adv_start(BT_LE_ADV_PARAM(BT_LE_ADV_OPT_SCANNABLE, BT_GAP_ADV_FAST_INT_MIN_2,
                                          BT_GAP_ADV_FAST_INT_MAX_2, NULL),
                          ad, ARRAY_SIZE(ad), sd, ARRAY_SIZE(sd));
    if (err) {
        printk("Advertising failed to start (err %d)\n", err);
        return 0;
    }
    printk("SR 0\n");

    for (uint16_t n = 1;; n++) {
        k_sleep(K_TIMEOUT_ABS_MS(1000 + 1000 * (int64_t)n));
        sys_put_le16(n, &mfg_data[2]);
        err = bt_le_adv_update_data(ad, ARRAY_SIZE(ad), sd, ARRAY_SIZE(sd));
        if (err) {
            printk("Advertising data update failed (err %d)\n", err);
            return 0;
        }
        printk("SR %d\n", n);
    }
    return 0;
}
