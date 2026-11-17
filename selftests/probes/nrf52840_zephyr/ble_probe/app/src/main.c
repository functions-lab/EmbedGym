// BLE peripheral for ble_probe.py.
//
// Advertises "GYM Probe", connectable, with one 128-bit service: LED
// (write) drives P1.15 with its byte, COUNTER (notify) carries a uint32 that
// counts up every 100 ms while the client is subscribed. BULK (write without
// response) takes 244-byte frames, frame k counting up from k, and prints how
// many arrived intact and in sequence; a write of N to BURST (write, notify)
// sends frames 0..N-1 back as notifications.
#include <zephyr/kernel.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/bluetooth/conn.h>
#include <zephyr/bluetooth/gatt.h>
#include <zephyr/bluetooth/uuid.h>
#include <zephyr/sys/atomic.h>
#include <zephyr/sys/byteorder.h>
#include <zephyr/sys/printk.h>

#define PROBE_UUID(n) BT_UUID_128_ENCODE(0x5f1e0000 + (n), 0x7a3c, 0x4b8e, 0x9d21, 0x0c4f6a8b2e10)

static const struct bt_uuid_128 service_uuid = BT_UUID_INIT_128(PROBE_UUID(0));
static const struct bt_uuid_128 led_uuid = BT_UUID_INIT_128(PROBE_UUID(1));
static const struct bt_uuid_128 counter_uuid = BT_UUID_INIT_128(PROBE_UUID(2));
static const struct bt_uuid_128 bulk_uuid = BT_UUID_INIT_128(PROBE_UUID(3));
static const struct bt_uuid_128 burst_uuid = BT_UUID_INIT_128(PROBE_UUID(4));

#define FRAME_LEN 244

static const struct gpio_dt_spec led = GPIO_DT_SPEC_GET(DT_ALIAS(probe_led), gpios);
static atomic_t notifying;
static atomic_t burst_request;
static uint32_t bulk_good, bulk_bad;

static const struct bt_data ad[] = {
    BT_DATA_BYTES(BT_DATA_FLAGS, BT_LE_AD_GENERAL | BT_LE_AD_NO_BREDR),
    BT_DATA(BT_DATA_NAME_COMPLETE, CONFIG_BT_DEVICE_NAME, sizeof(CONFIG_BT_DEVICE_NAME) - 1),
};

static const struct bt_data sd[] = {
    BT_DATA_BYTES(BT_DATA_UUID128_ALL, PROBE_UUID(0)),
};

static ssize_t write_led(struct bt_conn *conn, const struct bt_gatt_attr *attr,
                         const void *buf, uint16_t len, uint16_t offset, uint8_t flags)
{
    if (offset != 0 || len != 1) {
        return BT_GATT_ERR(BT_ATT_ERR_INVALID_ATTRIBUTE_LEN);
    }
    uint8_t on = *(const uint8_t *)buf;
    gpio_pin_set_dt(&led, on != 0);
    printk("LED %s\n", on ? "ON" : "OFF");
    return len;
}

static bool frame_intact(const uint8_t *frame, uint16_t len, uint8_t k)
{
    if (len != FRAME_LEN) {
        return false;
    }
    for (uint16_t i = 0; i < len; i++) {
        if (frame[i] != (uint8_t)(k + i)) {
            return false;
        }
    }
    return true;
}

static ssize_t write_bulk(struct bt_conn *conn, const struct bt_gatt_attr *attr,
                          const void *buf, uint16_t len, uint16_t offset, uint8_t flags)
{
    if (offset == 0 && frame_intact(buf, len, bulk_good + bulk_bad)) {
        bulk_good++;
    } else {
        bulk_bad++;
    }
    printk("BULK %u good %u bad\n", bulk_good, bulk_bad);
    return len;
}

static ssize_t write_burst(struct bt_conn *conn, const struct bt_gatt_attr *attr,
                           const void *buf, uint16_t len, uint16_t offset, uint8_t flags)
{
    if (offset != 0 || len != 1) {
        return BT_GATT_ERR(BT_ATT_ERR_INVALID_ATTRIBUTE_LEN);
    }
    atomic_set(&burst_request, *(const uint8_t *)buf);
    return len;
}

static void counter_ccc_changed(const struct bt_gatt_attr *attr, uint16_t value)
{
    atomic_set(&notifying, value == BT_GATT_CCC_NOTIFY);
    printk("NOTIFY %s\n", value == BT_GATT_CCC_NOTIFY ? "ON" : "OFF");
}

BT_GATT_SERVICE_DEFINE(probe_svc,
    BT_GATT_PRIMARY_SERVICE(&service_uuid),
    BT_GATT_CHARACTERISTIC(&led_uuid.uuid, BT_GATT_CHRC_WRITE, BT_GATT_PERM_WRITE, NULL, write_led, NULL),
    BT_GATT_CHARACTERISTIC(&counter_uuid.uuid, BT_GATT_CHRC_NOTIFY, BT_GATT_PERM_NONE, NULL, NULL, NULL),
    BT_GATT_CCC(counter_ccc_changed, BT_GATT_PERM_READ | BT_GATT_PERM_WRITE),
    BT_GATT_CHARACTERISTIC(&bulk_uuid.uuid, BT_GATT_CHRC_WRITE_WITHOUT_RESP, BT_GATT_PERM_WRITE,
                           NULL, write_bulk, NULL),
    BT_GATT_CHARACTERISTIC(&burst_uuid.uuid, BT_GATT_CHRC_WRITE | BT_GATT_CHRC_NOTIFY, BT_GATT_PERM_WRITE,
                           NULL, write_burst, NULL),
    BT_GATT_CCC(NULL, BT_GATT_PERM_READ | BT_GATT_PERM_WRITE),
);

static void burst(int count)
{
    static uint8_t frame[FRAME_LEN];
    int sent = 0;

    for (int i = 0; i < count; i++) {
        frame[0] = i;
        for (int j = 1; j < FRAME_LEN; j++) {
            frame[j] = (uint8_t)(i + j);
        }
        sent += bt_gatt_notify(NULL, &probe_svc.attrs[9], frame, sizeof(frame)) == 0;
    }
    printk("BURST %d/%d sent\n", sent, count);
}

static void connected(struct bt_conn *conn, uint8_t err)
{
    if (err) {
        printk("CONNECT FAILED %u\n", err);
        return;
    }
    printk("CONNECTED\n");
}

static void disconnected(struct bt_conn *conn, uint8_t reason)
{
    printk("DISCONNECTED %u\n", reason);
}

BT_CONN_CB_DEFINE(conn_callbacks) = {
    .connected = connected,
    .disconnected = disconnected,
};

int main(void)
{
    if (!gpio_is_ready_dt(&led) || gpio_pin_configure_dt(&led, GPIO_OUTPUT_INACTIVE) < 0) {
        printk("ERR led\n");
        return 0;
    }
    int err = bt_enable(NULL);
    if (err) {
        printk("ERR bt_enable %d\n", err);
        return 0;
    }
    err = bt_le_adv_start(BT_LE_ADV_CONN_FAST_1, ad, ARRAY_SIZE(ad), sd, ARRAY_SIZE(sd));
    if (err) {
        printk("ERR adv %d\n", err);
        return 0;
    }
    printk("ADVERTISING\n");

    uint32_t counter = 0;
    for (;;) {
        k_msleep(100);
        int count = atomic_set(&burst_request, 0);
        if (count) {
            burst(count);
        }
        if (!atomic_get(&notifying)) {
            continue;
        }
        uint8_t value[4];
        sys_put_le32(++counter, value);
        err = bt_gatt_notify(NULL, &probe_svc.attrs[4], value, sizeof(value));
        if (err) {
            printk("ERR notify %d\n", err);
        }
    }
}
