// esp_cloud /state barrier probe firmware (see ../barrier_probe.py).
//
// Joins the open AP "Espressif", opens one MQTT 3.1.1 connection to
// mqtt.iot.test:1883 (raw socket, keepalive 120 s so no PINGREQ interferes),
// then publishes exactly one QoS0 message to toy/event once esp_timer reaches
// PUBLISH_AT_US. The publish is a single send(), so its instant is known;
// esp-mqtt would send from its own task. "PUB" goes out right after send()
// returns, so its first UART byte bounds the publish from above.
#include <stdio.h>
#include <string.h>
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_timer.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "lwip/netdb.h"
#include "lwip/sockets.h"
#include "nvs_flash.h"

#define PUBLISH_AT_US 5000000LL
#define GOT_IP_BIT BIT0

static EventGroupHandle_t s_events;

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

static void join_wifi(void)
{
    s_events = xEventGroupCreate();
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

static void halt(const char *why)
{
    printf("GYMBARRIER FAIL %s\n", why);
    fflush(stdout);
    for (;;) vTaskDelay(pdMS_TO_TICKS(1000));
}

static size_t put_string(uint8_t *p, const char *s)
{
    size_t n = strlen(s);
    p[0] = n >> 8;
    p[1] = n & 0xff;
    memcpy(p + 2, s, n);
    return n + 2;
}

static int mqtt_connect(void)
{
    struct addrinfo hints = { .ai_family = AF_INET, .ai_socktype = SOCK_STREAM };
    struct addrinfo *res;
    if (getaddrinfo("mqtt.iot.test", "1883", &hints, &res) != 0) halt("dns");
    int sock = socket(AF_INET, SOCK_STREAM, 0);
    int one = 1;
    setsockopt(sock, IPPROTO_TCP, TCP_NODELAY, &one, sizeof(one));
    if (connect(sock, res->ai_addr, res->ai_addrlen) != 0) halt("connect");
    freeaddrinfo(res);

    uint8_t pkt[64];
    size_t n = 2;
    static const uint8_t header[] = { 0, 4, 'M', 'Q', 'T', 'T', 4, 0xC2, 0, 120 };
    memcpy(pkt + n, header, sizeof(header));
    n += sizeof(header);
    n += put_string(pkt + n, "gym-barrier");
    n += put_string(pkt + n, "iot");
    n += put_string(pkt + n, "iotpass");
    pkt[0] = 0x10;
    pkt[1] = n - 2;
    if (send(sock, pkt, n, 0) != (int)n) halt("send connect");

    uint8_t ack[4];
    if (recv(sock, ack, 4, MSG_WAITALL) != 4 || ack[0] != 0x20 || ack[3] != 0) halt("connack");
    return sock;
}

void app_main(void)
{
    join_wifi();
    int sock = mqtt_connect();
    printf("CONNACK %lld\n", esp_timer_get_time());
    fflush(stdout);

    uint8_t pkt[32];
    size_t n = 2;
    n += put_string(pkt + n, "toy/event");
    pkt[n++] = '1';
    pkt[0] = 0x30;
    pkt[1] = n - 2;

    while (esp_timer_get_time() < PUBLISH_AT_US) vTaskDelay(1);
    int64_t before = esp_timer_get_time();
    int sent = send(sock, pkt, n, 0);
    int64_t after = esp_timer_get_time();
    printf("PUB\n");
    fflush(stdout);
    printf("GYMBARRIER sent=%d before=%lld after=%lld\n", sent, before, after);
    fflush(stdout);

    for (;;) vTaskDelay(pdMS_TO_TICKS(1000));
}
