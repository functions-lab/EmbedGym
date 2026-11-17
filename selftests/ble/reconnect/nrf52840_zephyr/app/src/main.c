// BLE reconnect selftest: a peripheral that advertises again after every
// disconnect and counts its connections.
//
//   Kick characteristic (write): any write makes the DUT end the link itself
//     200 ms later, once its write response has gone out.
//
// Serial: ADVERTISING, CONN <count>, KICK, DISC reason=0x<hex>.
#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>
#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/bluetooth/conn.h>
#include <zephyr/bluetooth/gatt.h>
#include <zephyr/bluetooth/hci.h>
#include <zephyr/bluetooth/uuid.h>

#define EMBEDGYM_UUID(n) BT_UUID_128_ENCODE(n, 0x7a6c, 0x4e1d, 0x9b0f, 0x5c3a2e1d0f00ULL)

static const struct bt_uuid_128 service_uuid = BT_UUID_INIT_128(EMBEDGYM_UUID(0x3000));
static const struct bt_uuid_128 kick_uuid = BT_UUID_INIT_128(EMBEDGYM_UUID(0x3001));

static struct bt_conn *current;
static unsigned int connections;

static const struct bt_data ad[] = {
	BT_DATA_BYTES(BT_DATA_FLAGS, (BT_LE_AD_GENERAL | BT_LE_AD_NO_BREDR)),
	BT_DATA(BT_DATA_NAME_COMPLETE, CONFIG_BT_DEVICE_NAME, sizeof(CONFIG_BT_DEVICE_NAME) - 1),
};

static const struct bt_data sd[] = {
	BT_DATA_BYTES(BT_DATA_UUID128_ALL, EMBEDGYM_UUID(0x3000)),
};

static void kick_work_handler(struct k_work *work)
{
	if (current == NULL) {
		return;
	}
	int err = bt_conn_disconnect(current, BT_HCI_ERR_REMOTE_USER_TERM_CONN);

	if (err) {
		printk("KICK FAILED err=%d\n", err);
	}
}

static K_WORK_DELAYABLE_DEFINE(kick_work, kick_work_handler);

static ssize_t write_kick(struct bt_conn *conn, const struct bt_gatt_attr *attr, const void *buf,
			  uint16_t len, uint16_t offset, uint8_t flags)
{
	printk("KICK\n");
	k_work_schedule(&kick_work, K_MSEC(200));
	return len;
}

BT_GATT_SERVICE_DEFINE(embedgym_service,
	BT_GATT_PRIMARY_SERVICE(&service_uuid),
	BT_GATT_CHARACTERISTIC(&kick_uuid.uuid, BT_GATT_CHRC_WRITE, BT_GATT_PERM_WRITE,
			       NULL, write_kick, NULL),
);

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
	current = bt_conn_ref(conn);
	connections++;
	printk("CONN %u\n", connections);
}

static void disconnected(struct bt_conn *conn, uint8_t reason)
{
	printk("DISC reason=0x%02x\n", reason);
	k_work_cancel_delayable(&kick_work);
	if (current != NULL) {
		bt_conn_unref(current);
		current = NULL;
	}
}

// Advertising stops on connect; it restarts once the connection object is
// free again, which is after disconnected() has dropped its reference.
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
	return 0;
}
