// Joystick selftest firmware for nrf52840_zephyr.
//
// Reads VRx (AIN1 = P0.03) and VRy (AIN2 = P0.04) at gain 1/6, internal
// reference, 12-bit, plus SW (P1.10, active-low with pull-up) every 100 ms.
// The module is powered from VDD, so each axis spans 0 V … 3.3 V: the reading
// is scaled to a 0–1023 fraction of that rail and bucketed like the AVR sketch.
#include <zephyr/kernel.h>
#include <zephyr/drivers/adc.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/sys/printk.h>

#define RAIL_MV 3300

static const struct adc_dt_spec vrx = ADC_DT_SPEC_GET_BY_IDX(DT_PATH(zephyr_user), 0);
static const struct adc_dt_spec vry = ADC_DT_SPEC_GET_BY_IDX(DT_PATH(zephyr_user), 1);
static const struct gpio_dt_spec sw = GPIO_DT_SPEC_GET(DT_ALIAS(joystick_sw), gpios);

static const char *bucket(const struct adc_dt_spec *axis)
{
    int16_t raw;
    struct adc_sequence seq = {
        .buffer = &raw,
        .buffer_size = sizeof(raw),
    };
    adc_sequence_init_dt(axis, &seq);
    if (adc_read_dt(axis, &seq) < 0) {
        return "ERROR";
    }
    int32_t mv = raw;
    adc_raw_to_millivolts_dt(axis, &mv);
    int32_t fraction = mv * 1023 / RAIL_MV;
    if (fraction <= 200) {
        return "LOW";
    } else if (fraction <= 800) {
        return "MID";
    } else {
        return "HIGH";
    }
}

int main(void)
{
    if (!adc_is_ready_dt(&vrx) || !adc_is_ready_dt(&vry) || !gpio_is_ready_dt(&sw)) {
        printk("devices not ready\n");
        return 1;
    }
    if (adc_channel_setup_dt(&vrx) < 0 || adc_channel_setup_dt(&vry) < 0) {
        printk("ADC channel setup failed\n");
        return 1;
    }
    gpio_pin_configure_dt(&sw, GPIO_INPUT);
    for (;;) {
        const char *x = bucket(&vrx);
        const char *y = bucket(&vry);
        printk("X: %s Y: %s SW: %s\n", x, y, gpio_pin_get_dt(&sw) == 1 ? "PRESSED" : "RELEASED");
        k_msleep(100);
    }
    return 0;
}
