// BLE multi-connection selftest: the DUT is a central with two links at once.
// The phone shows up as two tags, "GYM-TAG-A" and "GYM-TAG-B". main() opens
// one link at a time (the stack takes one connection attempt at a time): A
// first, then B. On each link it discovers the tag's level service, reads the
// level once and subscribes to its notifications. When a link drops, main()
// opens it again; the other link stays up meanwhile.
//
// Serial, <tag> = A or B: SCANNING <tag>, FOUND <tag>, CONNECTED <tag>,
// READ <tag> <level>, SUBSCRIBED <tag>, NOTIFY <tag> <level>,
// DISCONNECTED <tag> reason=0x<hex>; failures print a "... FAILED" line.
#include <string.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/atomic.h>
#include <zephyr/sys/printk.h>
#include <zephyr/sys/util.h>
#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/bluetooth/conn.h>
#include <zephyr/bluetooth/gatt.h>
#include <zephyr/bluetooth/uuid.h>

#define EMBEDGYM_UUID(n) BT_UUID_128_ENCODE(n, 0x7a6c, 0x4e1d, 0x9b0f, 0x5c3a2e1d0f00ULL)

static const struct bt_uuid_128 service_uuid = BT_UUID_INIT_128(EMBEDGYM_UUID(0x9000));
static const struct bt_uuid_128 level_uuid = BT_UUID_INIT_128(EMBEDGYM_UUID(0x9001));

struct link {
	char tag;
	const char *name;
	struct bt_conn *conn;
	struct bt_gatt_subscribe_params subscribe_params;
};

static struct link links[] = {
	{.tag = 'A', .name = "GYM-TAG-A"},
	{.tag = 'B', .name = "GYM-TAG-B"},
};

// Bit i: links[i] dropped and main() has not closed it yet.
static atomic_t lost;

static K_SEM_DEFINE(found_sem, 0, 1);
static K_SEM_DEFINE(connected_sem, 0, 1);
static K_SEM_DEFINE(lost_sem, 0, ARRAY_SIZE(links));
static K_SEM_DEFINE(gatt_sem, 0, 1);

// The link main() is scanning for, and the address it found.
static struct link *wanted;
static bt_addr_le_t found_addr;
static uint8_t connect_err;

static struct bt_gatt_discover_params discover_params;
static uint16_t found_handle;
static uint16_t found_end_handle;

static struct bt_gatt_read_params read_params;
static uint8_t read_err;
static uint16_t read_len;
static uint8_t read_level;

static uint8_t subscribe_err;

static struct link *link_of(struct bt_conn *conn)
{
	for (size_t i = 0; i < ARRAY_SIZE(links); i++) {
		if (links[i].conn == conn) {
			return &links[i];
		}
	}
	return NULL;
}

static bool match_name(struct bt_data *data, void *user_data)
{
	bool *match = user_data;

	if (data->type == BT_DATA_NAME_COMPLETE && data->data_len == strlen(wanted->name) &&
	    memcmp(data->data, wanted->name, data->data_len) == 0) {
		*match = true;
		return false;
	}
	return true;
}

static void device_found(const bt_addr_le_t *addr, int8_t rssi, uint8_t type,
			 struct net_buf_simple *ad)
{
	bool match = false;

	if (wanted == NULL || type != BT_GAP_ADV_TYPE_ADV_IND) {
		return;
	}
	bt_data_parse(ad, match_name, &match);
	if (match) {
		wanted = NULL;
		bt_addr_le_copy(&found_addr, addr);
		k_sem_give(&found_sem);
	}
}

static void connected(struct bt_conn *conn, uint8_t err)
{
	connect_err = err;
	k_sem_give(&connected_sem);
}

static void disconnected(struct bt_conn *conn, uint8_t reason)
{
	struct link *link = link_of(conn);

	if (link == NULL) {
		printk("DISCONNECTED FAILED unknown link reason=0x%02x\n", reason);
		return;
	}
	printk("DISCONNECTED %c reason=0x%02x\n", link->tag, reason);
	atomic_set_bit(&lost, link - links);
	k_sem_give(&lost_sem);
}

BT_CONN_CB_DEFINE(conn_callbacks) = {
	.connected = connected,
	.disconnected = disconnected,
};

// One callback for every discovery step: it records the first match and stops,
// or is called once with attr == NULL when nothing (more) matches.
static uint8_t discover_func(struct bt_conn *conn, const struct bt_gatt_attr *attr,
			     struct bt_gatt_discover_params *params)
{
	if (attr != NULL) {
		if (params->type == BT_GATT_DISCOVER_PRIMARY) {
			const struct bt_gatt_service_val *service = attr->user_data;

			found_handle = attr->handle;
			found_end_handle = service->end_handle;
		} else if (params->type == BT_GATT_DISCOVER_CHARACTERISTIC) {
			found_handle = bt_gatt_attr_value_handle(attr);
		} else if (params->type == BT_GATT_DISCOVER_DESCRIPTOR) {
			found_handle = attr->handle;
		} else {
			printk("DISCOVER FAILED unexpected type %u\n", params->type);
		}
	}
	k_sem_give(&gatt_sem);
	return BT_GATT_ITER_STOP;
}

static int discover(struct bt_conn *conn, uint8_t type, const struct bt_uuid *uuid,
		    uint16_t start, uint16_t end)
{
	int err;

	found_handle = 0;
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
	return found_handle ? 0 : -ENOENT;
}

static uint8_t read_func(struct bt_conn *conn, uint8_t err, struct bt_gatt_read_params *params,
			 const void *data, uint16_t length)
{
	read_err = err;
	read_len = data ? length : 0;
	if (read_len > 0) {
		read_level = *(const uint8_t *)data;
	}
	k_sem_give(&gatt_sem);
	return BT_GATT_ITER_STOP;
}

static uint8_t notify_func(struct bt_conn *conn, struct bt_gatt_subscribe_params *params,
			   const void *data, uint16_t length)
{
	struct link *link = CONTAINER_OF(params, struct link, subscribe_params);

	if (data == NULL) {
		// The subscription ended with the link.
		params->value_handle = 0;
		return BT_GATT_ITER_STOP;
	}
	if (length != 1) {
		printk("NOTIFY FAILED %c len=%u\n", link->tag, length);
		return BT_GATT_ITER_CONTINUE;
	}
	printk("NOTIFY %c %u\n", link->tag, *(const uint8_t *)data);
	return BT_GATT_ITER_CONTINUE;
}

static void subscribe_func(struct bt_conn *conn, uint8_t err,
			   struct bt_gatt_subscribe_params *params)
{
	subscribe_err = err;
	k_sem_give(&gatt_sem);
}

static bool connect_link(struct link *link)
{
	int err;

	wanted = link;
	err = bt_le_scan_start(BT_LE_SCAN_PASSIVE, device_found);
	if (err) {
		wanted = NULL;
		printk("SCAN FAILED %c err=%d\n", link->tag, err);
		return false;
	}
	printk("SCANNING %c\n", link->tag);
	k_sem_take(&found_sem, K_FOREVER);
	bt_le_scan_stop();
	printk("FOUND %c\n", link->tag);

	err = bt_conn_le_create(&found_addr, BT_CONN_LE_CREATE_CONN, BT_LE_CONN_PARAM_DEFAULT,
				&link->conn);
	if (err) {
		printk("CONNECT FAILED %c err=%d\n", link->tag, err);
		return false;
	}
	k_sem_take(&connected_sem, K_FOREVER);
	if (connect_err) {
		printk("CONNECT FAILED %c err=0x%02x\n", link->tag, connect_err);
		bt_conn_unref(link->conn);
		link->conn = NULL;
		return false;
	}
	printk("CONNECTED %c\n", link->tag);
	return true;
}

// Discovers the tag's level characteristic, reads it once and subscribes to it.
static void use_level(struct link *link)
{
	struct bt_conn *conn = link->conn;
	uint16_t value_handle;
	int err;

	err = discover(conn, BT_GATT_DISCOVER_PRIMARY, &service_uuid.uuid,
		       BT_ATT_FIRST_ATTRIBUTE_HANDLE, BT_ATT_LAST_ATTRIBUTE_HANDLE);
	if (err) {
		printk("DISCOVER FAILED %c service err=%d\n", link->tag, err);
		return;
	}
	uint16_t service_end = found_end_handle;

	err = discover(conn, BT_GATT_DISCOVER_CHARACTERISTIC, &level_uuid.uuid, found_handle + 1,
		       service_end);
	if (err) {
		printk("DISCOVER FAILED %c level err=%d\n", link->tag, err);
		return;
	}
	value_handle = found_handle;

	err = discover(conn, BT_GATT_DISCOVER_DESCRIPTOR, BT_UUID_GATT_CCC, value_handle + 1,
		       service_end);
	if (err) {
		printk("DISCOVER FAILED %c ccc err=%d\n", link->tag, err);
		return;
	}

	read_params.func = read_func;
	read_params.handle_count = 1;
	read_params.single.handle = value_handle;
	read_params.single.offset = 0;
	err = bt_gatt_read(conn, &read_params);
	if (err) {
		printk("READ FAILED %c err=%d\n", link->tag, err);
		return;
	}
	k_sem_take(&gatt_sem, K_FOREVER);
	if (read_err || read_len != 1) {
		printk("READ FAILED %c att=0x%02x len=%u\n", link->tag, read_err, read_len);
		return;
	}
	printk("READ %c %u\n", link->tag, read_level);

	memset(&link->subscribe_params, 0, sizeof(link->subscribe_params));
	link->subscribe_params.notify = notify_func;
	link->subscribe_params.subscribe = subscribe_func;
	link->subscribe_params.value = BT_GATT_CCC_NOTIFY;
	link->subscribe_params.value_handle = value_handle;
	link->subscribe_params.ccc_handle = found_handle;
	err = bt_gatt_subscribe(conn, &link->subscribe_params);
	if (err) {
		printk("SUBSCRIBE FAILED %c err=%d\n", link->tag, err);
		return;
	}
	k_sem_take(&gatt_sem, K_FOREVER);
	if (subscribe_err) {
		printk("SUBSCRIBE FAILED %c att=0x%02x\n", link->tag, subscribe_err);
		return;
	}
	printk("SUBSCRIBED %c\n", link->tag);
}

int main(void)
{
	int err = bt_enable(NULL);

	if (err) {
		printk("BT ENABLE FAILED err=%d\n", err);
		return 0;
	}

	for (;;) {
		bool all_up = true;

		for (size_t i = 0; i < ARRAY_SIZE(links); i++) {
			if (atomic_test_and_clear_bit(&lost, i)) {
				bt_conn_unref(links[i].conn);
				links[i].conn = NULL;
			}
		}
		for (size_t i = 0; i < ARRAY_SIZE(links); i++) {
			if (links[i].conn != NULL) {
				continue;
			}
			if (connect_link(&links[i])) {
				use_level(&links[i]);
			} else {
				all_up = false;
			}
		}
		// Sleep until a link drops; retry a missing link after a second.
		k_sem_take(&lost_sem, all_up ? K_FOREVER : K_MSEC(1000));
	}
	return 0;
}
