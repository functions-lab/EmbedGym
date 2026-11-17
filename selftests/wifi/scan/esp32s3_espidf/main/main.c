// WiFi scan selftest: one blocking scan of every channel, then each AP found,
// sorted by SSID, as "AP: <ssid> CH: <channel> RSSI: <dBm>".
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "nvs_flash.h"

#define MAX_APS 16

static int by_ssid(const void *a, const void *b)
{
    return strcmp((const char *)((const wifi_ap_record_t *)a)->ssid,
                  (const char *)((const wifi_ap_record_t *)b)->ssid);
}

void app_main(void)
{
    ESP_ERROR_CHECK(nvs_flash_init());
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t init = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&init));
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_start());

    ESP_ERROR_CHECK(esp_wifi_scan_start(NULL, true));
    wifi_ap_record_t aps[MAX_APS];
    uint16_t count = MAX_APS;
    ESP_ERROR_CHECK(esp_wifi_scan_get_ap_records(&count, aps));
    qsort(aps, count, sizeof aps[0], by_ssid);
    for (int i = 0; i < count; i++) {
        printf("AP: %s CH: %d RSSI: %d\n", (const char *)aps[i].ssid, aps[i].primary, aps[i].rssi);
    }
    fflush(stdout);
}
