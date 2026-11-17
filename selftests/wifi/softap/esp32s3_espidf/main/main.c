// SoftAP provisioning selftest. The device starts the open AP "Velxio-Setup"
// (AP mode, default AP IP 192.168.4.1) with an HTTP server on port 80:
//   POST /provision  body ssid=<name>  -> "OK", then the AP stops and the
//                                         device joins <name> as a station
//                                         (open network, no password)
//   GET  /status                       -> "provisioned" once joined
// Once the station has an address, the LED on GPIO10 turns on and the address
// is printed once.
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

#define LED_PIN GPIO_NUM_10
#define PROVISIONED_BIT BIT0
#define GOT_IP_BIT BIT1

static EventGroupHandle_t s_events;
static char s_ssid[33];
static esp_ip4_addr_t s_ip;

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
    s_ip = ((ip_event_got_ip_t *)data)->ip_info.ip;
    xEventGroupSetBits(s_events, GOT_IP_BIT);
}

static esp_err_t provision_post(httpd_req_t *req)
{
    char body[48];
    if (req->content_len >= sizeof(body)) {
        return httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "expected ssid=<name>");
    }
    size_t received = 0;
    while (received < req->content_len) {
        int n = httpd_req_recv(req, body + received, req->content_len - received);
        if (n <= 0) {
            return ESP_FAIL;
        }
        received += n;
    }
    body[received] = '\0';

    const char *ssid = body + strlen("ssid=");
    if (strncmp(body, "ssid=", strlen("ssid=")) != 0 || ssid[0] == '\0' || strlen(ssid) >= sizeof(s_ssid)) {
        return httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "expected ssid=<name>");
    }
    strcpy(s_ssid, ssid);
    printf("PROVISION ssid=%s\n", s_ssid);
    fflush(stdout);
    esp_err_t err = httpd_resp_sendstr(req, "OK");
    xEventGroupSetBits(s_events, PROVISIONED_BIT);
    return err;
}

static esp_err_t status_get(httpd_req_t *req)
{
    printf("REQ GET /status\n");
    fflush(stdout);
    if (!(xEventGroupGetBits(s_events) & GOT_IP_BIT)) {
        return httpd_resp_sendstr(req, "setup");
    }
    return httpd_resp_sendstr(req, "provisioned");
}

static void start_server(void)
{
    httpd_handle_t server;
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    ESP_ERROR_CHECK(httpd_start(&server, &config));
    const httpd_uri_t provision = { .uri = "/provision", .method = HTTP_POST, .handler = provision_post };
    const httpd_uri_t status = { .uri = "/status", .method = HTTP_GET, .handler = status_get };
    ESP_ERROR_CHECK(httpd_register_uri_handler(server, &provision));
    ESP_ERROR_CHECK(httpd_register_uri_handler(server, &status));
}

void app_main(void)
{
    gpio_reset_pin(LED_PIN);
    gpio_set_direction(LED_PIN, GPIO_MODE_OUTPUT);
    gpio_set_level(LED_PIN, 0);

    s_events = xEventGroupCreate();
    ESP_ERROR_CHECK(nvs_flash_init());
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_ap();
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t init = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&init));
    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, WIFI_EVENT_STA_START, on_sta_start, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, WIFI_EVENT_STA_DISCONNECTED, on_disconnected, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, on_got_ip, NULL));

    wifi_config_t ap = {
        .ap = {
            .ssid = "Velxio-Setup",
            .ssid_len = strlen("Velxio-Setup"),
            .channel = 1,
            .authmode = WIFI_AUTH_OPEN,
            .max_connection = 4,
        },
    };
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_AP));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_AP, &ap));
    ESP_ERROR_CHECK(esp_wifi_start());
    start_server();
    printf("AP UP Velxio-Setup\n");
    fflush(stdout);

    xEventGroupWaitBits(s_events, PROVISIONED_BIT, pdFALSE, pdTRUE, portMAX_DELAY);
    // Give the reply time to reach the phone before the AP goes down.
    vTaskDelay(pdMS_TO_TICKS(500));
    ESP_ERROR_CHECK(esp_wifi_stop());

    wifi_config_t sta = {
        .sta = { .threshold.authmode = WIFI_AUTH_OPEN },
    };
    strcpy((char *)sta.sta.ssid, s_ssid);
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &sta));
    ESP_ERROR_CHECK(esp_wifi_start());

    xEventGroupWaitBits(s_events, GOT_IP_BIT, pdFALSE, pdTRUE, portMAX_DELAY);
    gpio_set_level(LED_PIN, 1);
    printf("IP: " IPSTR "\n", IP2STR(&s_ip));
    fflush(stdout);
}
