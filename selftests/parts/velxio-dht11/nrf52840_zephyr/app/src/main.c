// DHT11 unit test firmware (nRF52840 / Zephyr variant of code/code.ino):
//   bit-bang the single-wire protocol and print both values as whole numbers.
//   The harness pokes `set sensor.temperature` and `set sensor.humidity`
//   partway through, so the printed values must follow.
//
// Reads rotate through the three ways a host can treat the line:
//   - start signal released by switching the pin to an input,
//   - start signal released by an open-drain output going high (the pin stays
//     an output for the whole frame),
//   - a 5 ms low, too short to be a start signal, which must get no reply.
// Any other outcome prints an error and stops, so the values go stale and the
// test fails.
//
// Pulse widths are read from TIMER1 at 1 MHz; the 32768 Hz system clock
// (30.5 us) cannot tell a 28 us bit from a 70 us one.
#include <zephyr/kernel.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/sys/printk.h>
#include <hal/nrf_timer.h>

#define START_LOW_MS       20
#define SHORT_LOW_MS       5
#define PULSE_TIMEOUT_US   1000
#define ONE_THRESHOLD_US   49

static const struct gpio_dt_spec data = GPIO_DT_SPEC_GET(DT_ALIAS(data_dht11), gpios);

static uint32_t micros(void)
{
    nrf_timer_task_trigger(NRF_TIMER1, NRF_TIMER_TASK_CAPTURE0);
    return nrf_timer_cc_get(NRF_TIMER1, NRF_TIMER_CC_CHANNEL0);
}

/* Length in us of the time the line stays at `level`, or -1 on timeout. */
static int pulse_us(int level)
{
    uint32_t start = micros();

    while (gpio_pin_get_raw(data.port, data.pin) == level) {
        if (micros() - start > PULSE_TIMEOUT_US) {
            return -1;
        }
    }
    return micros() - start;
}

static void start_signal(int low_ms, bool open_drain)
{
    if (open_drain) {
        gpio_pin_configure(data.port, data.pin, GPIO_INPUT | GPIO_OUTPUT_LOW | GPIO_OPEN_DRAIN);
        k_msleep(low_ms);
        gpio_pin_set_raw(data.port, data.pin, 1);
    } else {
        gpio_pin_configure(data.port, data.pin, GPIO_OUTPUT_LOW);
        k_msleep(low_ms);
        gpio_pin_configure(data.port, data.pin, GPIO_INPUT | GPIO_PULL_UP);
    }
}

/* 0 on a good frame, -1 when the sensor never answers, -2 on a broken frame. */
static int read_frame(int low_ms, bool open_drain, uint8_t frame[5])
{
    start_signal(low_ms, open_drain);

    if (pulse_us(1) < 0) {
        return -1;
    }
    if (pulse_us(0) < 0 || pulse_us(1) < 0) {
        return -2;
    }
    for (int i = 0; i < 40; i++) {
        int low = pulse_us(0);
        int high = pulse_us(1);

        if (low < 0 || high < 0) {
            return -2;
        }
        frame[i / 8] = (frame[i / 8] << 1) | (high > ONE_THRESHOLD_US);
    }
    if (((frame[0] + frame[1] + frame[2] + frame[3]) & 0xFF) != frame[4]) {
        return -2;
    }
    return 0;
}

int main(void)
{
    if (!gpio_is_ready_dt(&data)) {
        printk("GPIO not ready\n");
        return 1;
    }
    gpio_pin_configure(data.port, data.pin, GPIO_INPUT | GPIO_PULL_UP);

    nrf_timer_mode_set(NRF_TIMER1, NRF_TIMER_MODE_TIMER);
    nrf_timer_bit_width_set(NRF_TIMER1, NRF_TIMER_BIT_WIDTH_32);
    nrf_timer_prescaler_set(NRF_TIMER1, NRF_TIMER_FREQ_1MHz);
    nrf_timer_task_trigger(NRF_TIMER1, NRF_TIMER_TASK_START);

    for (int round = 0;; round++) {
        uint8_t frame[5] = {0};
        int mode = round % 3;
        int result = read_frame(mode == 2 ? SHORT_LOW_MS : START_LOW_MS, mode == 1, frame);

        if (mode == 2) {
            if (result != -1) {
                printk("short start was answered\n");
                return 1;
            }
        } else if (result != 0) {
            printk("DHT read failed (%d)\n", result);
            return 1;
        } else {
            printk("T=%d H=%d\n", frame[2], frame[0]);
        }
        k_msleep(250);
    }
    return 0;
}
