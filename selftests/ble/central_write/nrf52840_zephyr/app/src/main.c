// BLE central write selftest: the DUT is a GATT client that writes to the
// phone. main() scans for the phone advertising "GYM-LOGGER", connects,
// discovers the logger service and subscribes to its command characteristic.
// Every command the phone notifies (one byte) asks for writes, which main()
// performs in order:
//
//   1  write the next log record with response: "log <n>", n counting every
//      log write from 1, rejected ones included;
//   2  write the next five feed records without response: "feed <n>", n
//      counting on across bursts from 1;
//   3  write the 60-byte note with response, byte i = (i * 7 + 5) & 0xff.
//      ATT MTU 23 takes at most 20 bytes per write, so the stack sends it as
//      prepared writes and an execute.
//
// Serial: SCANNING, FOUND, CONNECTED, SUBSCRIBED, WRITE n=<n> err=0x<att>,
// BURST sent=<n> failed=<n>, NOTE len=<len> err=0x<att>,
// DISCONNECTED reason=0x<hex>; failures print a "... FAILED" line.
#include <string.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>
#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/bluetooth/conn.h>
#include <zephyr/bluetooth/gatt.h>
#include <zephyr/bluetooth/uuid.h>

#define PHONE_NAME "GYM-LOGGER"
#define EMBEDGYM_UUID(n) BT_UUID_128_ENCODE(n, 0x7a6c, 0x4e1d, 0x9b0f, 0x5c3a2e1d0f00ULL)
#define ASK_LOG 1
#define ASK_FEED 2
#define ASK_NOTE 3
// Queued for main() instead of a command when the link drops.
#define LINK_LOST (-1)
#define FEED_BURST 5
#define NOTE_LEN 60

static const struct bt_uuid_128 service_uuid = BT_UUID_INIT_128(EMBEDGYM_UUID(0x8000));
static const struct bt_uuid_128 command_uuid = BT_UUID_INIT_128(EMBEDGYM_UUID(0x8001));
static const struct bt_uuid_128 log_uuid = BT_UUID_INIT_128(EMBEDGYM_UUID(0x8002));
static const struct bt_uuid_128 feed_uuid = BT_UUID_INIT_128(EMBEDGYM_UUID(0x8003));
static const struct bt_uuid_128 note_uuid = BT_UUID_INIT_128(EMBEDGYM_UUID(0x8004));

static K_SEM_DEFINE(found_sem, 0, 1);
static K_SEM_DEFINE(connected_sem, 0, 1);
static K_SEM_DEFINE(gatt_sem, 0, 1);
K_MSGQ_DEFINE(commands, sizeof(int), 4, 4);

static bt_addr_le_t phone_addr;
static bool phone_found;
static struct bt_conn *conn;
static uint8_t connect_err;

static struct bt_gatt_discover_params discover_params;
static uint16_t service_start;
static uint16_t service_end;
static uint16_t command_handle;
static uint16_t log_handle;
static uint16_t feed_handle;
static uint16_t note_handle;
static uint16_t ccc_handle;

static struct bt_gatt_subscribe_params subscribe_params;
static uint8_t subscribe_err;

static struct bt_gatt_write_params write_params;
static uint8_t write_err;
static char log_record[16];
static uint8_t note[NOTE_LEN];
static unsigned int log_count;
static unsigned int feed_count;

static bool match_name(struct bt_data *data, void *user_data)
{
	bool *match = user_data;

	if (data->type == BT_DATA_NAME_COMPLETE && data->data_len == strlen(PHONE_NAME) &&
	    memcmp(data->data, PHONE_NAME, data->data_len) == 0) {
		*match = true;
		return false;
	}
	return true;
}

static void device_found(const bt_addr_le_t *addr, int8_t rssi, uint8_t type,
			 struct net_buf_simple *ad)
{
	bool match = false;

	if (phone_found || type != BT_GAP_ADV_TYPE_ADV_IND) {
		return;
	}
	bt_data_parse(ad, match_name, &match);
	if (match) {
		phone_found = true;
		bt_addr_le_copy(&phone_addr, addr);
		k_sem_give(&found_sem);
	}
}

static void connected(struct bt_conn *c, uint8_t err)
{
	connect_err = err;
	k_sem_give(&connected_sem);
}

static void disconnected(struct bt_conn *c, uint8_t reason)
{
	int lost = LINK_LOST;

	printk("DISCONNECTED reason=0x%02x\n", reason);
	// Commands still queued are for the lost link; dropping them also makes
	// room for the marker.
	k_msgq_purge(&commands);
	k_msgq_put(&commands, &lost, K_NO_WAIT);
}

BT_CONN_CB_DEFINE(conn_callbacks) = {
	.connected = connected,
	.disconnected = disconnected,
};

// One callback for every discovery step. The service and the CCC descriptor
// stop at the first match; the characteristics are walked to the end of the
// service. The callback is called with attr == NULL when nothing (more)
// matches.
static uint8_t discover_func(struct bt_conn *c, const struct bt_gatt_attr *attr,
			     struct bt_gatt_discover_params *params)
{
	if (attr == NULL) {
		k_sem_give(&gatt_sem);
		return BT_GATT_ITER_STOP;
	}
	if (params->type == BT_GATT_DISCOVER_PRIMARY) {
		const struct bt_gatt_service_val *service = attr->user_data;

		service_start = attr->handle;
		service_end = service->end_handle;
	} else if (params->type == BT_GATT_DISCOVER_CHARACTERISTIC) {
		const struct bt_gatt_chrc *chrc = attr->user_data;

		if (bt_uuid_cmp(chrc->uuid, &command_uuid.uuid) == 0) {
			command_handle = chrc->value_handle;
		} else if (bt_uuid_cmp(chrc->uuid, &log_uuid.uuid) == 0) {
			log_handle = chrc->value_handle;
		} else if (bt_uuid_cmp(chrc->uuid, &feed_uuid.uuid) == 0) {
			feed_handle = chrc->value_handle;
		} else if (bt_uuid_cmp(chrc->uuid, &note_uuid.uuid) == 0) {
			note_handle = chrc->value_handle;
		} else {
			printk("DISCOVER FAILED unknown characteristic at %u\n", attr->handle);
		}
		return BT_GATT_ITER_CONTINUE;
	} else if (params->type == BT_GATT_DISCOVER_DESCRIPTOR) {
		ccc_handle = attr->handle;
	} else {
		printk("DISCOVER FAILED unexpected type %u\n", params->type);
	}
	k_sem_give(&gatt_sem);
	return BT_GATT_ITER_STOP;
}

static int discover(uint8_t type, const struct bt_uuid *uuid, uint16_t start, uint16_t end)
{
	int err;

	discover_params.uuid = uuid;
	discover_params.func = discover_func;
	discover_params.start_handle = start;
	discover_params.end_handle = end;
	discover_params.type = type;
	err = bt_gatt_discover(conn, &discover_params);
	if (err) {
		return err;
	}
	k_sem_take(&gatt_sem, K_FOREVER);
	return 0;
}

static uint8_t notify_func(struct bt_conn *c, struct bt_gatt_subscribe_params *params,
			   const void *data, uint16_t length)
{
	if (data == NULL) {
		// The subscription ended with the link.
		params->value_handle = 0;
		return BT_GATT_ITER_STOP;
	}
	if (length != 1) {
		printk("COMMAND FAILED len=%u\n", length);
		return BT_GATT_ITER_CONTINUE;
	}
	int command = *(const uint8_t *)data;

	// Writes wait for buffers, which the BT RX context must not do, so
	// main() performs them.
	if (k_msgq_put(&commands, &command, K_NO_WAIT)) {
		printk("COMMAND FAILED queue full\n");
	}
	return BT_GATT_ITER_CONTINUE;
}

static void subscribe_func(struct bt_conn *c, uint8_t err, struct bt_gatt_subscribe_params *params)
{
	subscribe_err = err;
	k_sem_give(&gatt_sem);
}

static void write_func(struct bt_conn *c, uint8_t err, struct bt_gatt_write_params *params)
{
	write_err = err;
	k_sem_give(&gatt_sem);
}

static bool connect_to_phone(void)
{
	int err;

	phone_found = false;
	err = bt_le_scan_start(BT_LE_SCAN_PASSIVE, device_found);
	if (err) {
		printk("SCAN FAILED err=%d\n", err);
		return false;
	}
	printk("SCANNING\n");
	k_sem_take(&found_sem, K_FOREVER);
	bt_le_scan_stop();
	printk("FOUND\n");

	err = bt_conn_le_create(&phone_addr, BT_CONN_LE_CREATE_CONN, BT_LE_CONN_PARAM_DEFAULT, &conn);
	if (err) {
		printk("CONNECT FAILED err=%d\n", err);
		return false;
	}
	k_sem_take(&connected_sem, K_FOREVER);
	if (connect_err) {
		printk("CONNECT FAILED err=0x%02x\n", connect_err);
		bt_conn_unref(conn);
		conn = NULL;
		return false;
	}
	printk("CONNECTED\n");
	return true;
}

// Finds the logger's characteristics and subscribes to its commands.
static void use_logger(void)
{
	int err;

	service_end = 0;
	err = discover(BT_GATT_DISCOVER_PRIMARY, &service_uuid.uuid, BT_ATT_FIRST_ATTRIBUTE_HANDLE,
		       BT_ATT_LAST_ATTRIBUTE_HANDLE);
	if (err || service_end == 0) {
		printk("DISCOVER FAILED service err=%d\n", err);
		return;
	}
	command_handle = log_handle = feed_handle = note_handle = 0;
	err = discover(BT_GATT_DISCOVER_CHARACTERISTIC, NULL, service_start + 1, service_end);
	if (err || !command_handle || !log_handle || !feed_handle || !note_handle) {
		printk("DISCOVER FAILED characteristics err=%d\n", err);
		return;
	}
	ccc_handle = 0;
	err = discover(BT_GATT_DISCOVER_DESCRIPTOR, BT_UUID_GATT_CCC, command_handle + 1, service_end);
	if (err || ccc_handle == 0) {
		printk("DISCOVER FAILED ccc err=%d\n", err);
		return;
	}

	memset(&subscribe_params, 0, sizeof(subscribe_params));
	subscribe_params.notify = notify_func;
	subscribe_params.subscribe = subscribe_func;
	subscribe_params.value = BT_GATT_CCC_NOTIFY;
	subscribe_params.value_handle = command_handle;
	subscribe_params.ccc_handle = ccc_handle;
	err = bt_gatt_subscribe(conn, &subscribe_params);
	if (err) {
		printk("SUBSCRIBE FAILED err=%d\n", err);
		return;
	}
	k_sem_take(&gatt_sem, K_FOREVER);
	if (subscribe_err) {
		printk("SUBSCRIBE FAILED att=0x%02x\n", subscribe_err);
		return;
	}
	printk("SUBSCRIBED\n");
}

// Writes with response and waits for the phone's answer: its ATT error
// (0 when written), or a negative errno when the write could not be sent.
static int write_and_wait(uint16_t handle, const void *data, uint16_t length)
{
	int err;

	// bt_gatt_write() advances offset, data and length through a long write.
	write_params.func = write_func;
	write_params.handle = handle;
	write_params.offset = 0;
	write_params.data = data;
	write_params.length = length;
	err = bt_gatt_write(conn, &write_params);
	if (err) {
		return err;
	}
	k_sem_take(&gatt_sem, K_FOREVER);
	return write_err;
}

static void write_log(void)
{
	int result;

	log_count++;
	snprintk(log_record, sizeof(log_record), "log %u", log_count);
	result = write_and_wait(log_handle, log_record, strlen(log_record));
	if (result < 0) {
		printk("WRITE FAILED n=%u err=%d\n", log_count, result);
	} else {
		printk("WRITE n=%u err=0x%02x\n", log_count, result);
	}
}

static void write_feed(void)
{
	char record[16];
	unsigned int sent = 0;
	unsigned int failed = 0;

	for (int i = 0; i < FEED_BURST; i++) {
		feed_count++;
		int length = snprintk(record, sizeof(record), "feed %u", feed_count);

		if (bt_gatt_write_without_response(conn, feed_handle, record, length, false) == 0) {
			sent++;
		} else {
			failed++;
		}
	}
	printk("BURST sent=%u failed=%u\n", sent, failed);
}

static void write_note(void)
{
	int result = write_and_wait(note_handle, note, sizeof(note));

	if (result < 0) {
		printk("NOTE FAILED err=%d\n", result);
	} else {
		printk("NOTE len=%u err=0x%02x\n", NOTE_LEN, result);
	}
}

// Runs the phone's commands until the link drops.
static void serve(void)
{
	int command;

	for (;;) {
		k_msgq_get(&commands, &command, K_FOREVER);
		switch (command) {
		case LINK_LOST:
			return;
		case ASK_LOG:
			write_log();
			break;
		case ASK_FEED:
			write_feed();
			break;
		case ASK_NOTE:
			write_note();
			break;
		default:
			printk("COMMAND FAILED unknown %d\n", command);
			break;
		}
	}
}

int main(void)
{
	int err;

	for (int i = 0; i < NOTE_LEN; i++) {
		note[i] = (i * 7 + 5) & 0xff;
	}

	err = bt_enable(NULL);
	if (err) {
		printk("BT ENABLE FAILED err=%d\n", err);
		return 0;
	}

	for (;;) {
		if (!connect_to_phone()) {
			k_msleep(1000);
			continue;
		}
		use_logger();
		serve();
		bt_conn_unref(conn);
		conn = NULL;
	}
	return 0;
}
