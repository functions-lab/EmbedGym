// BLE long-link selftest: one connection held for a minute with traffic both
// ways.
//
//   Tick characteristic (notify): while the phone is subscribed, main()
//     notifies a uint32 LE tick count every second.
//   Reads characteristic (read): a uint32 LE count of the reads served so far,
//     this one included.
//
// Serial: ADVERTISING, CONNECTED, SUBSCRIBED <0|1>, TICK <n>, READ <n>,
// DISCONNECTED reason=0x<hex>.
#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>
#include <zephyr/sys/byteorder.h>
#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/bluetooth/conn.h>
#include <zephyr/bluetooth/gatt.h>
#include <zephyr/bluetooth/uuid.h>

#define EMBEDGYM_UUID(n) BT_UUID_128_ENCODE(n, 0x7a6c, 0x4e1d, 0x9b0f, 0x5c3a2e1d0f00ULL)

static const struct bt_uuid_128 service_uuid = BT_UUID_INIT_128(EMBEDGYM_UUID(0x4000));
static const struct bt_uuid_128 tick_uuid = BT_UUID_INIT_128(EMBEDGYM_UUID(0x4001));
static const struct bt_uuid_128 reads_uuid = BT_UUID_INIT_128(EMBEDGYM_UUID(0x4002));

static bool subscribed;
static uint32_t ticks;
static uint32_t reads;

static const struct bt_data ad[] = {
	BT_DATA_BYTES(BT_DATA_FLAGS, (BT_LE_AD_GENERAL | BT_LE_AD_NO_BREDR)),
	BT_DATA(BT_DATA_NAME_COMPLETE, CONFIG_BT_DEVICE_NAME, sizeof(CONFIG_BT_DEVICE_NAME) - 1),
};

static const struct bt_data sd[] = {
	BT_DATA_BYTES(BT_DATA_UUID128_ALL, EMBEDGYM_UUID(0x4000)),
};

static void tick_ccc_changed(const struct bt_gatt_attr *attr, uint16_t value)
{
	subscribed = value == BT_GATT_CCC_NOTIFY;
	printk("SUBSCRIBED %d\n", subscribed);
}

static ssize_t read_reads(struct bt_conn *conn, const struct bt_gatt_attr *attr, void *buf,
			  uint16_t len, uint16_t offset)
{
	// A non-zero offset continues a long read; only a fresh read counts.
	if (offset == 0) {
		reads++;
		printk("READ %u\n", reads);
	}
	uint32_t value = sys_cpu_to_le32(reads);

	return bt_gatt_attr_read(conn, attr, buf, len, offset, &value, sizeof(value));
}

BT_GATT_SERVICE_DEFINE(embedgym_service,
	BT_GATT_PRIMARY_SERVICE(&service_uuid),
	BT_GATT_CHARACTERISTIC(&tick_uuid.uuid, BT_GATT_CHRC_NOTIFY, BT_GATT_PERM_NONE,
			       NULL, NULL, NULL),
	BT_GATT_CCC(tick_ccc_changed, BT_GATT_PERM_READ | BT_GATT_PERM_WRITE),
	BT_GATT_CHARACTERISTIC(&reads_uuid.uuid, BT_GATT_CHRC_READ, BT_GATT_PERM_READ,
			       read_reads, NULL, NULL),
);

// attrs[]: 0 service, 1-2 tick declaration + value, 3 CCC, 4-5 reads declaration + value.
#define TICK_VALUE_ATTR (&embedgym_service.attrs[2])

static void start_advertising(void)
{
	int err = bt_le_adv_start(BT_LE_ADV_CONN_FAST_1, ad, ARRAY_SIZE(ad), sd, ARRAY_SIZE(sd));

	if (err) {
		printk("ADVERTISING FAILED err=%d\n", err);
		return;
	}
	printk("ADVERTISING\n");
}

static void connected(struct bt_conn *conn, uint8_t err)
{
	if (err) {
		printk("CONNECT FAILED err=0x%02x\n", err);
		return;
	}
	printk("CONNECTED\n");
}

static void disconnected(struct bt_conn *conn, uint8_t reason)
{
	printk("DISCONNECTED reason=0x%02x\n", reason);
}

BT_CONN_CB_DEFINE(conn_callbacks) = {
	.connected = connected,
	.disconnected = disconnected,
	.recycled = start_advertising,
};

int main(void)
{
	int err = bt_enable(NULL);

	if (err) {
		printk("BT ENABLE FAILED err=%d\n", err);
		return 0;
	}
	start_advertising();

	for (;;) {
		k_msleep(1000);
		if (!subscribed) {
			continue;
		}
		ticks++;
		uint32_t value = sys_cpu_to_le32(ticks);

		err = bt_gatt_notify(NULL, TICK_VALUE_ATTR, &value, sizeof(value));
		if (err) {
			printk("TICK FAILED err=%d\n", err);
		} else {
			printk("TICK %u\n", ticks);
		}
	}
	return 0;
}
