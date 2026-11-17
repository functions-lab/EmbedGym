// Guest DNS probe firmware (see ../dns_probe.py).
//
// Joins the open AP "Espressif" and resolves the esp_cloud hostnames through
// the guest's own resolver (lwIP -> slirp DNS 192.168.4.3 -> the sim's Docker
// DNS), then GETs http://api.iot.test/nope over a raw socket and prints the
// response's status line and Date header.
#include <stdio.h>
#include <string.h>
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "lwip/netdb.h"
#include "lwip/sockets.h"
#include "nvs_flash.h"

#define GOT_IP_BIT BIT0

static const char *NAMES[] = {
    "mqtt.iot.test", "api.iot.test", "ntp.iot.test", "coap.iot.test",
    "pg.iot.test", "embedgym-sim", "esp_cloud",
};

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

static void resolve_all(void)
{
    struct addrinfo hints = { .ai_family = AF_INET, .ai_socktype = SOCK_STREAM };
    for (int i = 0; i < sizeof(NAMES) / sizeof(NAMES[0]); i++) {
        struct addrinfo *res;
        int rc = getaddrinfo(NAMES[i], NULL, &hints, &res);
        if (rc != 0) {
            printf("DNS %s FAIL %d\n", NAMES[i], rc);
            continue;
        }
        for (struct addrinfo *a = res; a != NULL; a = a->ai_next) {
            char ip[16];
            inet_ntoa_r(((struct sockaddr_in *)a->ai_addr)->sin_addr, ip, sizeof(ip));
            printf("DNS %s %s\n", NAMES[i], ip);
        }
        freeaddrinfo(res);
    }
}

// Prints the first line and the Date header of the response, "HTTP FAIL <step>"
// if the request does not complete.
static void get_nope(void)
{
    struct addrinfo hints = { .ai_family = AF_INET, .ai_socktype = SOCK_STREAM };
    struct addrinfo *res;
    if (getaddrinfo("api.iot.test", "80", &hints, &res) != 0) {
        printf("HTTP FAIL dns\n");
        return;
    }
    int sock = socket(AF_INET, SOCK_STREAM, 0);
    int rc = connect(sock, res->ai_addr, res->ai_addrlen);
    freeaddrinfo(res);
    if (rc != 0) {
        printf("HTTP FAIL connect\n");
        close(sock);
        return;
    }
    static const char request[] =
        "GET /nope HTTP/1.1\r\nHost: api.iot.test\r\nConnection: close\r\n\r\n";
    send(sock, request, strlen(request), 0);

    static char response[2048];
    size_t len = 0;
    int n;
    while (len < sizeof(response) - 1 &&
           (n = recv(sock, response + len, sizeof(response) - 1 - len, 0)) > 0) {
        len += n;
    }
    close(sock);
    response[len] = '\0';

    char *end = strstr(response, "\r\n");
    if (end == NULL) {
        printf("HTTP FAIL response %d bytes\n", (int)len);
        return;
    }
    printf("HTTP %.*s\n", (int)(end - response), response);
    char *date = strstr(response, "\r\nDate: ");
    if (date == NULL) {
        printf("HTTP no Date header\n");
        return;
    }
    date += 2;
    printf("HTTP %.*s\n", (int)(strstr(date, "\r\n") - date), date);
}

void app_main(void)
{
    join_wifi();
    resolve_all();
    get_nope();
    printf("GYMDNS DONE\n");
    fflush(stdout);
    for (;;) vTaskDelay(pdMS_TO_TICKS(1000));
}
