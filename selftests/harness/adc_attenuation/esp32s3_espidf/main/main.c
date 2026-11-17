// ADC attenuation guard (ESP32-S3).
//
// Same TMP36 read loop as the tmp36 selftest, but configured for 2.5 dB
// instead of the 11 dB every other ESP firmware here uses. The QEMU SENS
// stub stores SENS_SAR_ATTEN1/2 and rescales the injected count against the
// channel's full scale (2.5 dB = 1240 mV), so:
//
//   25 C  -> Vout 750 mV,  within range      -> prints 25
//   100 C -> Vout 1500 mV, past 1240 mV      -> saturates, prints 74
//
// Before the stub modeled attenuation it returned the count unscaled and
// this firmware printed -22 at 25 C.
//
// The register store itself is guarded by the joystick selftest, which
// configures two channels: adc1_config_channel_atten read-modify-writes the
// shared word, so a stub that read the register back as 0 would knock VRX
// down to 0 dB on the second call and clamp its idle reading.
//
// TMP36 transfer function: Vout = 0.5 V + 0.01 V/degC * T
//   => T = (Vout - 0.5) * 100, with Vout = raw * 1.240 / 4095 at 2.5 dB.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/adc.h"
#include <math.h>
#include <stdio.h>

#define TMP36_CHANNEL ADC1_CHANNEL_8   // GPIO9

void app_main(void)
{
    adc1_config_width(ADC_WIDTH_BIT_12);
    adc1_config_channel_atten(TMP36_CHANNEL, ADC_ATTEN_DB_2_5);

    for (;;) {
        int raw = adc1_get_raw(TMP36_CHANNEL);
        float volts = raw * 1.240f / 4095.0f;
        float celsius = (volts - 0.5f) * 100.0f;

        printf("Temp: %d C\n", (int)lroundf(celsius));
        fflush(stdout);

        vTaskDelay(pdMS_TO_TICKS(100));
    }
}
