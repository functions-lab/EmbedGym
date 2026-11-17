// BLE vanish selftest: a peripheral that advertises again after every
// disconnect, whatever its reason. When the phone vanishes (its controller
// resets, so no LL_TERMINATE_IND), the link ends after the supervision
// timeout with reason 0x08. That timeout is the phone's: Bumble asks for
// 720 ms and the app never requests other parameters.
//
// Serial: ADVERTISING, CONN <count> peer=<address> timeout=<ms>,
// DISC reason=0x<hex>.
#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>
#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/bluetooth/conn.h>

static unsigned int connections;

static const struct bt_data ad[] = {
	BT_DATA_BYTES(BT_DATA_FLAGS, (BT_LE_AD_GENERAL | BT_LE_AD_NO_BREDR)),
	BT_DATA(BT_DATA_NAME_COMPLETE, CONFIG_BT_DEVICE_NAME, sizeof(CONFIG_BT_DEVICE_NAME) - 1),
};

static void start_advertising(void)
{
	int err = bt_le_adv_start(BT_LE_ADV_CONN_FAST_1, ad, ARRAY_SIZE(ad), NULL, 0);

	if (err) {
		printk("ADVERTISING FAILED err=%d\n", err);
		return;
	}
	printk("ADVERTISING\n");
}

static void connected(struct bt_conn *conn, uint8_t err)
{
	struct bt_conn_info info;
	char peer[BT_ADDR_STR_LEN];

	if (err) {
		printk("CONNECT FAILED err=0x%02x\n", err);
		return;
	}
	connections++;
	int info_err = bt_conn_get_info(conn, &info);

	if (info_err) {
		printk("CONN INFO FAILED err=%d\n", info_err);
		return;
	}
	bt_addr_to_str(&info.le.dst->a, peer, sizeof(peer));
	printk("CONN %u peer=%s timeout=%u\n", connections, peer, info.le.timeout * 10);
}

static void disconnected(struct bt_conn *conn, uint8_t reason)
{
	printk("DISC reason=0x%02x\n", reason);
}

// Advertising stops on connect; it restarts once the connection object is
// free again, after the disconnect.
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
