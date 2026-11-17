// MQTT selftest: an IoT sensor node. Joins the open AP "Espressif", connects to
// mqtt.iot.test:1883 as iot/iotpass and subscribes, at QoS 1, to its retained
// configuration gym/node1/config ({"interval_ms":N}) and its commands
// gym/node1/cmd ({"id":N,"led":"on"|"off"}). Once configured it publishes
// {"temp_c":T,"seq":n} on gym/node1/telemetry every interval_ms at QoS 1. Each
// command drives the LED on GPIO10 and is acked at QoS 1 on gym/node1/ack with
// {"id":N,"ok":true|false}.
#include <stdio.h>
#include <string.h>
#include "cJSON.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "driver/gpio.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "mqtt_client.h"
#include "nvs_flash.h"

#define LED_PIN GPIO_NUM_10
#define GOT_IP_BIT BIT0
#define MQTT_UP_BIT BIT1
#define CONFIGURED_BIT BIT2
#define TELEMETRY_TOPIC "gym/node1/telemetry"
#define CMD_TOPIC "gym/node1/cmd"
#define ACK_TOPIC "gym/node1/ack"
#define CONFIG_TOPIC "gym/node1/config"

static EventGroupHandle_t s_events;
static volatile int s_interval_ms;
// The ack awaiting its PUBACK; both are touched only on the MQTT task.
static int s_ack_msg_id = -1;
static int s_ack_command_id;

static void on_sta_start(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    esp_wifi_connect();
}

static void on_disconnected(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    esp_wifi_connect();
}

static void on_got_ip(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    xEventGroupSetBits(s_events, GOT_IP_BIT);
}

static bool topic_is(esp_mqtt_event_handle_t event, const char *topic)
{
    return event->topic_len == strlen(topic) && memcmp(event->topic, topic, event->topic_len) == 0;
}

static void apply_config(esp_mqtt_event_handle_t event)
{
    cJSON *root = cJSON_ParseWithLength(event->data, event->data_len);
    const cJSON *interval = cJSON_GetObjectItem(root, "interval_ms");
    if (!cJSON_IsNumber(interval) || interval->valueint <= 0) {
        printf("BAD CONFIG %.*s\n", event->data_len, event->data);
    } else {
        s_interval_ms = interval->valueint;
        printf("CONFIG interval_ms=%d retained=%d\n", s_interval_ms, event->retain);
        xEventGroupSetBits(s_events, CONFIGURED_BIT);
    }
    fflush(stdout);
    cJSON_Delete(root);
}

static void run_command(esp_mqtt_event_handle_t event)
{
    cJSON *root = cJSON_ParseWithLength(event->data, event->data_len);
    const cJSON *id = cJSON_GetObjectItem(root, "id");
    const char *led = cJSON_GetStringValue(cJSON_GetObjectItem(root, "led"));
    if (!cJSON_IsNumber(id)) {
        printf("BAD COMMAND %.*s\n", event->data_len, event->data);
        fflush(stdout);
        cJSON_Delete(root);
        return;
    }
    bool ok = true;
    if (led != NULL && strcmp(led, "on") == 0) {
        gpio_set_level(LED_PIN, 1);
    } else if (led != NULL && strcmp(led, "off") == 0) {
        gpio_set_level(LED_PIN, 0);
    } else {
        ok = false;
    }
    printf("CMD id=%d led=%s qos=%d\n", id->valueint, led != NULL ? led : "?", event->qos);
    fflush(stdout);

    char ack[40];
    snprintf(ack, sizeof(ack), "{\"id\":%d,\"ok\":%s}", id->valueint, ok ? "true" : "false");
    s_ack_command_id = id->valueint;
    s_ack_msg_id = esp_mqtt_client_publish(event->client, ACK_TOPIC, ack, 0, 1, 0);
    cJSON_Delete(root);
}

static void on_mqtt_connected(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    esp_mqtt_event_handle_t event = data;
    esp_mqtt_client_subscribe(event->client, CMD_TOPIC, 1);
    esp_mqtt_client_subscribe(event->client, CONFIG_TOPIC, 1);
    printf("MQTT connected\n");
    fflush(stdout);
    xEventGroupSetBits(s_events, MQTT_UP_BIT);
}

static void on_mqtt_disconnected(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    printf("MQTT disconnected\n");
    fflush(stdout);
    xEventGroupClearBits(s_events, MQTT_UP_BIT);
}

static void on_mqtt_data(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    esp_mqtt_event_handle_t event = data;
    if (topic_is(event, CONFIG_TOPIC)) {
        apply_config(event);
    } else if (topic_is(event, CMD_TOPIC)) {
        run_command(event);
    } else {
        printf("UNEXPECTED TOPIC %.*s\n", event->topic_len, event->topic);
        fflush(stdout);
    }
}

static void on_mqtt_published(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    esp_mqtt_event_handle_t event = data;
    if (event->msg_id == s_ack_msg_id) {
        printf("ACK id=%d delivered\n", s_ack_command_id);
        fflush(stdout);
        s_ack_msg_id = -1;
    }
}

static void join_wifi(void)
{
    ESP_ERROR_CHECK(nvs_flash_init());
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t init = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&init));
    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, WIFI_EVENT_STA_START, on_sta_start, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, WIFI_EVENT_STA_DISCONNECTED, on_disconnected, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, on_got_ip, NULL));

    wifi_config_t sta = {
        .sta = { .ssid = "Espressif", .threshold.authmode = WIFI_AUTH_OPEN },
    };
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &sta));
    ESP_ERROR_CHECK(esp_wifi_start());
    xEventGroupWaitBits(s_events, GOT_IP_BIT, pdFALSE, pdTRUE, portMAX_DELAY);
}

void app_main(void)
{
    gpio_reset_pin(LED_PIN);
    gpio_set_direction(LED_PIN, GPIO_MODE_OUTPUT);
    gpio_set_level(LED_PIN, 0);

    s_events = xEventGroupCreate();
    join_wifi();

    esp_mqtt_client_config_t config = {
        .uri = "mqtt://mqtt.iot.test:1883",
        .client_id = "gym-mqtt-node1",
        .username = "iot",
        .password = "iotpass",
        // The broker's keepalive check runs on wall-clock time.
        .keepalive = 120,
        // Guest time can run far ahead of the broker while the guest idles; a
        // PUBACK must not look late enough to trigger a duplicate QoS 1 send.
        .message_retransmit_timeout = 30000,
    };
    esp_mqtt_client_handle_t client = esp_mqtt_client_init(&config);
    ESP_ERROR_CHECK(esp_mqtt_client_register_event(client, MQTT_EVENT_CONNECTED, on_mqtt_connected, NULL));
    ESP_ERROR_CHECK(esp_mqtt_client_register_event(client, MQTT_EVENT_DISCONNECTED, on_mqtt_disconnected, NULL));
    ESP_ERROR_CHECK(esp_mqtt_client_register_event(client, MQTT_EVENT_DATA, on_mqtt_data, NULL));
    ESP_ERROR_CHECK(esp_mqtt_client_register_event(client, MQTT_EVENT_PUBLISHED, on_mqtt_published, NULL));
    ESP_ERROR_CHECK(esp_mqtt_client_start(client));

    xEventGroupWaitBits(s_events, CONFIGURED_BIT, pdFALSE, pdTRUE, portMAX_DELAY);
    for (int seq = 0;; seq++) {
        xEventGroupWaitBits(s_events, MQTT_UP_BIT, pdFALSE, pdTRUE, portMAX_DELAY);
        int tenths = 200 + 5 * (seq % 4);
        char payload[48];
        snprintf(payload, sizeof(payload), "{\"temp_c\":%d.%d,\"seq\":%d}", tenths / 10, tenths % 10, seq);
        esp_mqtt_client_publish(client, TELEMETRY_TOPIC, payload, 0, 1, 0);
        vTaskDelay(pdMS_TO_TICKS(s_interval_ms));
    }
}
