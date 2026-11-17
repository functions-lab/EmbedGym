// BLE PHY selftest: a peripheral that keeps notifying while its link moves
// between the 1M and 2M PHYs, at the phone's request and at its own.
// CONFIG_BT_USER_PHY_UPDATE also turns off the automatic 2M request at
// connect, so links start on 1M.
//
//   Counter characteristic (notify): while the phone is subscribed, main()
//     notifies a uint32 LE counter, 1, 2, 3, ..., every 200 ms.
//   PHY characteristic (write): 0x01 makes main() ask for 1M only, 0x02 for
//     2M while still allowing 1M, in both directions (bt_conn_le_phy_update);
//     any other value is refused with ATT error 0x13 (value not allowed).
//     Each side's controller keeps the PHYs it last asked for and the central
//     picks 2M first, so asking for 2M alone would leave the phone unable to
//     move the link back to 1M.
//
// Serial: ADVERTISING, CONNECTED, DISCONNECTED reason=0x<hex>, SUBSCRIBED <0|1>,
// PHY REQUEST <1|2>, PHY tx=<phy> rx=<phy> (each completed update, 1 = 1M,
// 2 = 2M), NOTIFY <n>; failures print a "... FAILED" line.
#include <zephyr/kernel.h>
#include <zephyr/sys/atomic.h>
#include <zephyr/sys/printk.h>
#include <zephyr/sys/byteorder.h>
#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/bluetooth/conn.h>
#include <zephyr/bluetooth/gatt.h>
#include <zephyr/bluetooth/uuid.h>

#define EMBEDGYM_UUID(n) BT_UUID_128_ENCODE(n, 0x7a6c, 0x4e1d, 0x9b0f, 0x5c3a2e1d0f00ULL)
#define PHY_PARAM_2M_PREFERRED BT_CONN_LE_PHY_PARAM(BT_GAP_LE_PHY_1M | BT_GAP_LE_PHY_2M, \
						    BT_GAP_LE_PHY_1M | BT_GAP_LE_PHY_2M)

static const struct bt_uuid_128 service_uuid = BT_UUID_INIT_128(EMBEDGYM_UUID(0xc000));
static const struct bt_uuid_128 counter_uuid = BT_UUID_INIT_128(EMBEDGYM_UUID(0xc001));
static const struct bt_uuid_128 phy_uuid = BT_UUID_INIT_128(EMBEDGYM_UUID(0xc002));

static struct bt_conn *current;
static bool subscribed;
static uint32_t counter;
// The PHY the phone last asked for, until main() requests it; 0 for none.
static atomic_t phy_wanted;

static const struct bt_data ad[] = {
	BT_DATA_BYTES(BT_DATA_FLAGS, (BT_LE_AD_GENERAL | BT_LE_AD_NO_BREDR)),
	BT_DATA(BT_DATA_NAME_COMPLETE, CONFIG_BT_DEVICE_NAME, sizeof(CONFIG_BT_DEVICE_NAME) - 1),
};

static const struct bt_data sd[] = {
	BT_DATA_BYTES(BT_DATA_UUID128_ALL, EMBEDGYM_UUID(0xc000)),
};

static void counter_ccc_changed(const struct bt_gatt_attr *attr, uint16_t value)
{
	subscribed = value == BT_GATT_CCC_NOTIFY;
	printk("SUBSCRIBED %d\n", subscribed);
}

// bt_conn_le_phy_update waits for the controller, which the BT RX context
// must not do, so the write only hands the PHY to main().
static ssize_t write_phy(struct bt_conn *conn, const struct bt_gatt_attr *attr, const void *buf,
			 uint16_t len, uint16_t offset, uint8_t flags)
{
	uint8_t phy;

	if (offset != 0) {
		return BT_GATT_ERR(BT_ATT_ERR_INVALID_OFFSET);
	}
	if (len != 1) {
		return BT_GATT_ERR(BT_ATT_ERR_INVALID_ATTRIBUTE_LEN);
	}
	phy = *(const uint8_t *)buf;
	if (phy != BT_GAP_LE_PHY_1M && phy != BT_GAP_LE_PHY_2M) {
		return BT_GATT_ERR(BT_ATT_ERR_VALUE_NOT_ALLOWED);
	}
	atomic_set(&phy_wanted, phy);
	return len;
}

BT_GATT_SERVICE_DEFINE(embedgym_service,
	BT_GATT_PRIMARY_SERVICE(&service_uuid),
	BT_GATT_CHARACTERISTIC(&counter_uuid.uuid, BT_GATT_CHRC_NOTIFY, BT_GATT_PERM_NONE,
			       NULL, NULL, NULL),
	BT_GATT_CCC(counter_ccc_changed, BT_GATT_PERM_READ | BT_GATT_PERM_WRITE),
	BT_GATT_CHARACTERISTIC(&phy_uuid.uuid, BT_GATT_CHRC_WRITE, BT_GATT_PERM_WRITE,
			       NULL, write_phy, NULL),
);

// attrs[]: 0 service, 1-2 counter declaration + value, 3 CCC, 4-5 PHY.
#define COUNTER_VALUE_ATTR (&embedgym_service.attrs[2])

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
	printk("CONNECTED\n");
}

static void disconnected(struct bt_conn *conn, uint8_t reason)
{
	printk("DISCONNECTED reason=0x%02x\n", reason);
	if (current != NULL) {
		bt_conn_unref(current);
		current = NULL;
	}
}

static void phy_updated(struct bt_conn *conn, struct bt_conn_le_phy_info *info)
{
	printk("PHY tx=%u rx=%u\n", info->tx_phy, info->rx_phy);
}

// Advertising stops on connect; it restarts once the connection object is
// free again, which is after disconnected() returns.
BT_CONN_CB_DEFINE(conn_callbacks) = {
	.connected = connected,
	.disconnected = disconnected,
	.recycled = start_advertising,
	.le_phy_updated = phy_updated,
};

static void request_phy(uint8_t phy)
{
	const struct bt_conn_le_phy_param *param =
		phy == BT_GAP_LE_PHY_2M ? PHY_PARAM_2M_PREFERRED : BT_CONN_LE_PHY_PARAM_1M;
	int err;

	if (current == NULL) {
		printk("PHY REQUEST FAILED not connected\n");
		return;
	}
	err = bt_conn_le_phy_update(current, param);
	if (err) {
		printk("PHY REQUEST FAILED err=%d\n", err);
		return;
	}
	printk("PHY REQUEST %u\n", phy);
}

int main(void)
{
	int err;

	err = bt_enable(NULL);
	if (err) {
		printk("BT ENABLE FAILED err=%d\n", err);
		return 0;
	}
	start_advertising();

	for (;;) {
		k_msleep(200);
		uint8_t phy = atomic_clear(&phy_wanted);

		if (phy != 0) {
			request_phy(phy);
		}
		if (!subscribed) {
			continue;
		}
		counter++;
		uint32_t value = sys_cpu_to_le32(counter);

		err = bt_gatt_notify(NULL, COUNTER_VALUE_ATTR, &value, sizeof(value));
		if (err) {
			printk("NOTIFY FAILED err=%d\n", err);
		} else {
			printk("NOTIFY %u\n", counter);
		}
	}
	return 0;
}
