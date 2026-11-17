// Anchor-gap probe firmware (see ../anchor_probe.py).
//
// Measures, from inside the guest, where a naive sketch's t0 anchor
// (`esp_timer_get_time()` as the first statement of app_main) lands relative
// to the harness's app-start zero. The probe script correlates the printed
// values with the virtual-time stamps of the UART bytes.
//
//   t0        the naive anchor — first statement of app_main
//   t0..t2    two back-to-back reads → per-read cost R
//   analog    a 9-byte marker analog "\x01VLX-APX\x02" through the same ROM
//             putc path as the real marker; its byte stamps measure the
//             marker's own emission cost (delta9). It differs from the real
//             marker at one byte, but that doesn't matter: app start is
//             already recorded, so the filter passes every byte through.
//   t3,t4,'B',t5  a single byte bracketed by clock reads → guest↔virtual
//             offset C, with bracket width t5-t4
#include <inttypes.h>
#include "esp_timer.h"
#include "esp_rom_sys.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

void app_main(void)
{
    int64_t t0 = esp_timer_get_time();
    int64_t t1 = esp_timer_get_time();
    int64_t t2 = esp_timer_get_time();
    esp_rom_printf("\x01VLX-APX\x02");
    int64_t t3 = esp_timer_get_time();
    int64_t t4 = esp_timer_get_time();
    esp_rom_printf("B");
    int64_t t5 = esp_timer_get_time();
    esp_rom_printf("\nGYMPROBE %lld %lld %lld %lld %lld %lld\n",
                   (long long)t0, (long long)t1, (long long)t2,
                   (long long)t3, (long long)t4, (long long)t5);
    for (;;) vTaskDelay(pdMS_TO_TICKS(1000));
}
