// BLE indicate selftest: the DUT is a GATT server whose counter is indicated,
// not notified, so the phone confirms every value.
//
//   Counter characteristic (indicate): while the phone has indications on
//     (CCCD 0x0002), main() indicates a uint32 LE counter, 1, 2, 3, ..., and
//     sends the next one at the first 20 ms tick after the previous one is
//     confirmed: the phone's confirmations, which take a connection event or
//     two, set the pace.
//
// Serial: ADVERTISING, CONNECTED, DISCONNECTED reason=0x<hex>,
// SUBSCRIBED <CCC value>, IND <n> (queued), CONFIRMED <n> (the phone's
// confirmation arrived); failures print a "... FAILED" line.
#include <zephyr/kernel.h>
#include <zephyr/sys/atomic.h>
#include <zephyr/sys/printk.h>
#include <zephyr/sys/byteorder.h>
#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/bluetooth/conn.h>
#include <zephyr/bluetooth/gatt.h>
#include <zephyr/bluetooth/uuid.h>

#define EMBEDGYM_UUID(n) BT_UUID_128_ENCODE(n, 0x7a6c, 0x4e1d, 0x9b0f, 0x5c3a2e1d0f00ULL)

static const struct bt_uuid_128 service_uuid = BT_UUID_INIT_128(EMBEDGYM_UUID(0xa000));
static const struct bt_uuid_128 counter_uuid = BT_UUID_INIT_128(EMBEDGYM_UUID(0xa001));

static bool indicating;
static atomic_t pending;
static uint32_t counter;
static uint32_t counter_le;
static struct bt_gatt_indicate_params indicate_params;

static const struct bt_data ad[] = {
	BT_DATA_BYTES(BT_DATA_FLAGS, (BT_LE_AD_GENERAL | BT_LE_AD_NO_BREDR)),
	BT_DATA(BT_DATA_NAME_COMPLETE, CONFIG_BT_DEVICE_NAME, sizeof(CONFIG_BT_DEVICE_NAME) - 1),
};

static const struct bt_data sd[] = {
	BT_DATA_BYTES(BT_DATA_UUID128_ALL, EMBEDGYM_UUID(0xa000)),
};

static void counter_ccc_changed(const struct bt_gatt_attr *attr, uint16_t value)
{
	indicating = value == BT_GATT_CCC_INDICATE;
	printk("SUBSCRIBED %u\n", value);
}

BT_GATT_SERVICE_DEFINE(embedgym_service,
	BT_GATT_PRIMARY_SERVICE(&service_uuid),
	BT_GATT_CHARACTERISTIC(&counter_uuid.uuid, BT_GATT_CHRC_INDICATE, BT_GATT_PERM_NONE,
			       NULL, NULL, NULL),
	BT_GATT_CCC(counter_ccc_changed, BT_GATT_PERM_READ | BT_GATT_PERM_WRITE),
);

// attrs[]: 0 service, 1-2 counter declaration + value, 3 CCC.
#define COUNTER_VALUE_ATTR (&embedgym_service.attrs[2])

// Runs when the phone's confirmation arrives, or with an error when the
// indication is dropped (e.g. on disconnect).
static void indicate_done(struct bt_conn *conn, struct bt_gatt_indicate_params *params, uint8_t err)
{
	if (err) {
		printk("CONFIRM FAILED n=%u err=0x%02x\n", counter, err);
	} else {
		printk("CONFIRMED %u\n", counter);
	}
	atomic_clear(&pending);
}

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

// Advertising stops on connect; it restarts once the connection object is
// free again, which is after disconnected() returns.
BT_CONN_CB_DEFINE(conn_callbacks) = {
	.connected = connected,
	.disconnected = disconnected,
	.recycled = start_advertising,
};

int main(void)
{
	int err;

	err = bt_enable(NULL);
	if (err) {
		printk("BT ENABLE FAILED err=%d\n", err);
		return 0;
	}
	start_advertising();

	indicate_params.attr = COUNTER_VALUE_ATTR;
	indicate_params.func = indicate_done;
	indicate_params.data = &counter_le;
	indicate_params.len = sizeof(counter_le);

	for (;;) {
		k_msleep(20);
		if (!indicating || atomic_get(&pending)) {
			continue;
		}
		counter++;
		counter_le = sys_cpu_to_le32(counter);
		atomic_set(&pending, 1);
		// NULL: every connection with indications on; Zephyr checks the CCC.
		err = bt_gatt_indicate(NULL, &indicate_params);
		if (err) {
			atomic_clear(&pending);
			printk("INDICATE FAILED n=%u err=%d\n", counter, err);
			counter--;
			continue;
		}
		printk("IND %u\n", counter);
	}
	return 0;
}
