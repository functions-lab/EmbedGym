// KY-038 selftest firmware for nrf52840_zephyr.
//
// Polls D0 (P1.10) every 1 ms and timestamps its raw transitions. Once D0 has
// held for SETTLE_MS it reports the settled change: how many transitions led
// to it and, for a rise, when the later ones came (ms after the first). A0
// (AIN1 = P0.03, gain 1/6, internal reference, 12-bit) reports loud/quiet
// transitions. The module is powered from VDD, so A0 spans 0 V … 3.3 V: the
// reading is scaled to a 0–1023 fraction of that rail and compared like the
// AVR sketch.
#include <zephyr/kernel.h>
#include <zephyr/drivers/adc.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/sys/printk.h>

#define RAIL_MV 3300
#define LOUD_FRACTION 700
#define SETTLE_MS 50
#define MAX_EDGES 4

static const struct gpio_dt_spec d0 = GPIO_DT_SPEC_GET(DT_ALIAS(ky038), gpios);
static const struct adc_dt_spec a0 = ADC_DT_SPEC_GET(DT_PATH(zephyr_user));

int main(void)
{
    if (!gpio_is_ready_dt(&d0) || !adc_is_ready_dt(&a0)) {
        printk("devices not ready\n");
        return 1;
    }
    gpio_pin_configure_dt(&d0, GPIO_INPUT);
    if (adc_channel_setup_dt(&a0) < 0) {
        printk("ADC channel setup failed\n");
        return 1;
    }
    int16_t raw;
    struct adc_sequence seq = {
        .buffer = &raw,
        .buffer_size = sizeof(raw),
    };
    adc_sequence_init_dt(&a0, &seq);

    int stable = gpio_pin_get_dt(&d0);
    int last = stable;
    int edges = 0;
    int64_t edge_ms[MAX_EDGES];
    int64_t last_edge_ms = 0;
    bool loud = false;
    for (;;) {
        int64_t now = k_uptime_get();
        int level = gpio_pin_get_dt(&d0);
        if (level != last) {
            last = level;
            if (edges < MAX_EDGES) edge_ms[edges] = now;
            edges++;
            last_edge_ms = now;
        }
        if (edges > 0 && now - last_edge_ms >= SETTLE_MS) {
            if (level == stable) {
                printk("Glitch edges: %d\n", edges);
            } else if (level) {
                printk("Sound edges: %d\nSound chatter:", edges);
                for (int i = 1; i < edges && i < MAX_EDGES; i++) {
                    printk(" %d", (int)(edge_ms[i] - edge_ms[0]));
                }
                printk("\n");
            } else {
                printk("Quiet edges: %d\n", edges);
            }
            stable = level;
            edges = 0;
        }

        if (adc_read_dt(&a0, &seq) < 0) {
            printk("ADC read failed\n");
            return 1;
        }
        int32_t mv = raw;
        adc_raw_to_millivolts_dt(&a0, &mv);
        bool now_loud = mv * 1023 / RAIL_MV > LOUD_FRACTION;
        if (now_loud != loud) {
            loud = now_loud;
            printk(loud ? "LOUD\n" : "QUIET\n");
        }
        k_msleep(1);
    }
    return 0;
}
