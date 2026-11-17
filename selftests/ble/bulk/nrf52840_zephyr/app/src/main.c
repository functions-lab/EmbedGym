// BLE bulk selftest: ATT MTU 247 and 251-byte link-layer payloads (data length
// extension) on a GATT server, with integrity checks in both directions.
//
//   Sink (write, write without response): every value received is folded into
//     one running CRC-32; each write prints the write count, its length, the
//     running byte total and the running CRC.
//   Blob (read): 400 bytes, byte i = (i * 7 + 3) & 0xff, so reading it takes a
//     Read plus Read Blobs; each request prints its offset.
//   Stream (notify) + burst (write): writing N to burst makes main() send N
//     back-to-back 244-byte notifications (ATT MTU 247 - 3) on stream; byte 0
//     is the sequence number, byte j is (seq + 11 * j) & 0xff.
//
// Serial: ADVERTISING, CONNECTED, DLE tx=<octets> rx=<octets>,
// MTU tx=<mtu> rx=<mtu> (23 at connect, then after each exchange), SUBSCRIBED <0|1>,
// RX n=<writes> len=<length> total=<bytes> crc=<8 hex digits>, READ off=<offset>,
// BURST sent=<n> failed=<n>, DISCONNECTED reason=0x<hex>.
#include <zephyr/kernel.h>
#include <zephyr/sys/crc.h>
#include <zephyr/sys/printk.h>
#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/bluetooth/conn.h>
#include <zephyr/bluetooth/gatt.h>
#include <zephyr/bluetooth/uuid.h>

#define EMBEDGYM_UUID(n) BT_UUID_128_ENCODE(n, 0x7a6c, 0x4e1d, 0x9b0f, 0x5c3a2e1d0f00ULL)
#define BLOB_LEN 400
#define STREAM_LEN 244

static const struct bt_uuid_128 service_uuid = BT_UUID_INIT_128(EMBEDGYM_UUID(0x5000));
static const struct bt_uuid_128 sink_uuid = BT_UUID_INIT_128(EMBEDGYM_UUID(0x5001));
static const struct bt_uuid_128 blob_uuid = BT_UUID_INIT_128(EMBEDGYM_UUID(0x5002));
static const struct bt_uuid_128 stream_uuid = BT_UUID_INIT_128(EMBEDGYM_UUID(0x5003));
static const struct bt_uuid_128 burst_uuid = BT_UUID_INIT_128(EMBEDGYM_UUID(0x5004));

static uint8_t blob[BLOB_LEN];
static uint8_t stream[STREAM_LEN];
static uint32_t rx_writes;
static uint32_t rx_total;
static uint32_t rx_crc;
static uint8_t burst_count;
static K_SEM_DEFINE(burst_sem, 0, 1);

static const struct bt_data ad[] = {
	BT_DATA_BYTES(BT_DATA_FLAGS, (BT_LE_AD_GENERAL | BT_LE_AD_NO_BREDR)),
	BT_DATA(BT_DATA_NAME_COMPLETE, CONFIG_BT_DEVICE_NAME, sizeof(CONFIG_BT_DEVICE_NAME) - 1),
};

static const struct bt_data sd[] = {
	BT_DATA_BYTES(BT_DATA_UUID128_ALL, EMBEDGYM_UUID(0x5000)),
};

static ssize_t write_sink(struct bt_conn *conn, const struct bt_gatt_attr *attr, const void *buf,
			  uint16_t len, uint16_t offset, uint8_t flags)
{
	if (offset != 0) {
		return BT_GATT_ERR(BT_ATT_ERR_INVALID_OFFSET);
	}
	rx_writes++;
	rx_total += len;
	rx_crc = crc32_ieee_update(rx_crc, buf, len);
	printk("RX n=%u len=%u total=%u crc=%08x\n", rx_writes, len, rx_total, rx_crc);
	return len;
}

static ssize_t read_blob(struct bt_conn *conn, const struct bt_gatt_attr *attr, void *buf,
			 uint16_t len, uint16_t offset)
{
	printk("READ off=%u\n", offset);
	return bt_gatt_attr_read(conn, attr, buf, len, offset, blob, sizeof(blob));
}

static void stream_ccc_changed(const struct bt_gatt_attr *attr, uint16_t value)
{
	printk("SUBSCRIBED %d\n", value == BT_GATT_CCC_NOTIFY);
}

// Notifications block for buffers, which the BT RX context must not do, so
// the write only hands the count to main().
static ssize_t write_burst(struct bt_conn *conn, const struct bt_gatt_attr *attr, const void *buf,
			   uint16_t len, uint16_t offset, uint8_t flags)
{
	if (offset != 0 || len != 1) {
		return BT_GATT_ERR(BT_ATT_ERR_INVALID_ATTRIBUTE_LEN);
	}
	burst_count = *(const uint8_t *)buf;
	k_sem_give(&burst_sem);
	return len;
}

BT_GATT_SERVICE_DEFINE(embedgym_service,
	BT_GATT_PRIMARY_SERVICE(&service_uuid),
	BT_GATT_CHARACTERISTIC(&sink_uuid.uuid, BT_GATT_CHRC_WRITE | BT_GATT_CHRC_WRITE_WITHOUT_RESP,
			       BT_GATT_PERM_WRITE, NULL, write_sink, NULL),
	BT_GATT_CHARACTERISTIC(&blob_uuid.uuid, BT_GATT_CHRC_READ, BT_GATT_PERM_READ,
			       read_blob, NULL, NULL),
	BT_GATT_CHARACTERISTIC(&stream_uuid.uuid, BT_GATT_CHRC_NOTIFY, BT_GATT_PERM_NONE,
			       NULL, NULL, NULL),
	BT_GATT_CCC(stream_ccc_changed, BT_GATT_PERM_READ | BT_GATT_PERM_WRITE),
	BT_GATT_CHARACTERISTIC(&burst_uuid.uuid, BT_GATT_CHRC_WRITE, BT_GATT_PERM_WRITE,
			       NULL, write_burst, NULL),
);

// attrs[]: 0 service, 1-2 sink, 3-4 blob, 5-6 stream declaration + value, 7 CCC, 8-9 burst.
#define STREAM_VALUE_ATTR (&embedgym_service.attrs[6])

static void mtu_updated(struct bt_conn *conn, uint16_t tx, uint16_t rx)
{
	printk("MTU tx=%u rx=%u\n", tx, rx);
}

static struct bt_gatt_cb gatt_callbacks = {
	.att_mtu_updated = mtu_updated,
};

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

static void data_len_updated(struct bt_conn *conn, struct bt_conn_le_data_len_info *info)
{
	printk("DLE tx=%u rx=%u\n", info->tx_max_len, info->rx_max_len);
}

BT_CONN_CB_DEFINE(conn_callbacks) = {
	.connected = connected,
	.disconnected = disconnected,
	.recycled = start_advertising,
	.le_data_len_updated = data_len_updated,
};

static void send_burst(uint8_t count)
{
	unsigned int sent = 0;
	unsigned int failed = 0;

	for (unsigned int seq = 0; seq < count; seq++) {
		stream[0] = seq;
		for (unsigned int j = 1; j < STREAM_LEN; j++) {
			stream[j] = (seq + 11 * j) & 0xff;
		}
		if (bt_gatt_notify(NULL, STREAM_VALUE_ATTR, stream, sizeof(stream)) == 0) {
			sent++;
		} else {
			failed++;
		}
	}
	printk("BURST sent=%u failed=%u\n", sent, failed);
}

int main(void)
{
	int err;

	for (unsigned int i = 0; i < BLOB_LEN; i++) {
		blob[i] = (i * 7 + 3) & 0xff;
	}
	bt_gatt_cb_register(&gatt_callbacks);

	err = bt_enable(NULL);
	if (err) {
		printk("BT ENABLE FAILED err=%d\n", err);
		return 0;
	}
	start_advertising();

	for (;;) {
		k_sem_take(&burst_sem, K_FOREVER);
		send_burst(burst_count);
	}
	return 0;
}
