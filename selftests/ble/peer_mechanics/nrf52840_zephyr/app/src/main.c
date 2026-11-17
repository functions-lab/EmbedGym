// Peer mechanics selftest: legacy non-connectable advertising as "GYM-MECH"
// from boot, with manufacturer data: company 0xFFFF, then a little-endian
// 16-bit counter. The counter starts at 0 and increments at every whole
// second of uptime; each value is printed as "COUNT <n>" once it is in the
// advertising data.
#include <zephyr/kernel.h>
#include <zephyr/sys/byteorder.h>
#include <zephyr/sys/printk.h>
#include <zephyr/bluetooth/bluetooth.h>

#define NAME "GYM-MECH"

static uint8_t mfg_data[] = {0xff, 0xff, 0x00, 0x00};

static const struct bt_data ad[] = {
    BT_DATA_BYTES(BT_DATA_FLAGS, BT_LE_AD_NO_BREDR),
    BT_DATA(BT_DATA_NAME_COMPLETE, NAME, sizeof(NAME) - 1),
    BT_DATA(BT_DATA_MANUFACTURER_DATA, mfg_data, sizeof(mfg_data)),
};

int main(void)
{
    int err = bt_enable(NULL);
    if (err) {
        printk("Bluetooth init failed (err %d)\n", err);
        return 0;
    }

    err = bt_le_adv_start(BT_LE_ADV_NCONN, ad, ARRAY_SIZE(ad), NULL, 0);
    if (err) {
        printk("Advertising failed to start (err %d)\n", err);
        return 0;
    }
    printk("COUNT 0\n");

    for (uint16_t n = 1;; n++) {
        k_sleep(K_TIMEOUT_ABS_MS(1000 * (int64_t)n));
        sys_put_le16(n, &mfg_data[2]);
        err = bt_le_adv_update_data(ad, ARRAY_SIZE(ad), NULL, 0);
        if (err) {
            printk("Advertising data update failed (err %d)\n", err);
            return 0;
        }
        printk("COUNT %d\n", n);
    }
    return 0;
}
