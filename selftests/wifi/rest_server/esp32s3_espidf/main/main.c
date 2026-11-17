// REST server selftest: join the open AP "Espressif" and serve on port 80
//   GET  /api/status          -> {"relay":0|1}
//   POST /api/relay  body on  -> relay (the LED on GPIO10) on,  {"relay":1}
//   POST /api/relay  body off -> relay off, {"relay":0}
// Any other POST body (compared byte for byte) gets 400 and leaves the relay as it is.
#include <stdio.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "driver/gpio.h"
#include "esp_event.h"
#include "esp_http_server.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "nvs_flash.h"

#define RELAY_PIN GPIO_NUM_10
#define GOT_IP_BIT BIT0

static EventGroupHandle_t s_events;
static int s_relay;

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

static esp_err_t send_relay(httpd_req_t *req)
{
    char body[16];
    snprintf(body, sizeof(body), "{\"relay\":%d}", s_relay);
    httpd_resp_set_type(req, "application/json");
    return httpd_resp_sendstr(req, body);
}

static esp_err_t status_get(httpd_req_t *req)
{
    printf("REQ GET /api/status\n");
    fflush(stdout);
    return send_relay(req);
}

static esp_err_t relay_post(httpd_req_t *req)
{
    printf("REQ POST /api/relay\n");
    fflush(stdout);
    char body[8];
    if (req->content_len >= sizeof(body)) {
        return httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "expected on or off");
    }
    size_t received = 0;
    while (received < req->content_len) {
        int n = httpd_req_recv(req, body + received, req->content_len - received);
        if (n <= 0) {
            return ESP_FAIL;
        }
        received += n;
    }

    int relay;
    if (received == 2 && memcmp(body, "on", 2) == 0) {
        relay = 1;
    } else if (received == 3 && memcmp(body, "off", 3) == 0) {
        relay = 0;
    } else {
        return httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "expected on or off");
    }
    if (relay != s_relay) {
        s_relay = relay;
        gpio_set_level(RELAY_PIN, s_relay);
        printf("RELAY %s\n", s_relay ? "ON" : "OFF");
        fflush(stdout);
    }
    return send_relay(req);
}

void app_main(void)
{
    gpio_reset_pin(RELAY_PIN);
    gpio_set_direction(RELAY_PIN, GPIO_MODE_OUTPUT);
    gpio_set_level(RELAY_PIN, 0);

    s_events = xEventGroupCreate();
    join_wifi();

    httpd_handle_t server;
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    ESP_ERROR_CHECK(httpd_start(&server, &config));
    const httpd_uri_t status = { .uri = "/api/status", .method = HTTP_GET, .handler = status_get };
    const httpd_uri_t relay = { .uri = "/api/relay", .method = HTTP_POST, .handler = relay_post };
    ESP_ERROR_CHECK(httpd_register_uri_handler(server, &status));
    ESP_ERROR_CHECK(httpd_register_uri_handler(server, &relay));
    printf("SERVER UP gym-rest-server-s3\n");
    fflush(stdout);
}
