// HD44780 controller behaviour (nRF52840 / Zephyr variant of code/code.ino):
// bit-banged 4-bit bus, times in ms of uptime.
//   ~50 ms  init without Display ON, print "HIDDEN"  -> nothing visible
//   300     Display ON                                -> "HIDDEN"
//   500     Clear, 'X' with no wait, 2 ms, 'Y'        -> "Y" ('X' lost while busy)
//   700     glyph into CGRAM character 1              -> DDRAM unchanged
//   800     DDRAM 0x01: char 1, 'Z'                   -> "Y\x01Z"
//   1000    decrement mode, Clear, "AB"               -> Clear restores increment
//   1200    display shift left                        -> "B"
//   1400    display shift right twice                 -> " AB"
//   1600    Return Home                               -> "AB"
//   1800    Clear, entry shift on, DDRAM 0x10, "ABC"  -> "ABC" in columns 13-15
#include <zephyr/kernel.h>
#include <zephyr/drivers/gpio.h>

static const struct gpio_dt_spec rs = GPIO_DT_SPEC_GET(DT_ALIAS(rs), gpios);
static const struct gpio_dt_spec en = GPIO_DT_SPEC_GET(DT_ALIAS(e), gpios);
static const struct gpio_dt_spec data[4] = {
    GPIO_DT_SPEC_GET(DT_ALIAS(d_4), gpios),
    GPIO_DT_SPEC_GET(DT_ALIAS(d_5), gpios),
    GPIO_DT_SPEC_GET(DT_ALIAS(d_6), gpios),
    GPIO_DT_SPEC_GET(DT_ALIAS(d_7), gpios),
};

static void lcd_write_nibble(uint8_t nibble)
{
    for (int i = 0; i < 4; i++) {
        gpio_pin_set_dt(&data[i], (nibble >> i) & 1);
    }
    gpio_pin_set_dt(&en, 1);
    k_busy_wait(10);
    gpio_pin_set_dt(&en, 0);
    k_busy_wait(200);
}

static void lcd_send(bool is_data, uint8_t value)
{
    gpio_pin_set_dt(&rs, is_data);
    lcd_write_nibble(value >> 4);
    lcd_write_nibble(value & 0x0f);
}

static void lcd_clear(void)
{
    lcd_send(false, 0x01);
    k_msleep(2);
}

static void lcd_print(const char *text)
{
    while (*text) {
        lcd_send(true, (uint8_t)*text++);
    }
}

int main(void)
{
    gpio_pin_configure_dt(&rs, GPIO_OUTPUT_INACTIVE);
    gpio_pin_configure_dt(&en, GPIO_OUTPUT_INACTIVE);
    for (int i = 0; i < 4; i++) {
        gpio_pin_configure_dt(&data[i], GPIO_OUTPUT_INACTIVE);
    }

    k_sleep(K_TIMEOUT_ABS_MS(50));
    lcd_write_nibble(0x03);
    k_msleep(5);
    lcd_write_nibble(0x03);
    k_msleep(5);
    lcd_write_nibble(0x03);
    k_msleep(1);
    lcd_write_nibble(0x02);
    lcd_send(false, 0x28);
    lcd_clear();
    lcd_send(false, 0x06);
    lcd_print("HIDDEN");

    k_sleep(K_TIMEOUT_ABS_MS(300));
    lcd_send(false, 0x0c);

    k_sleep(K_TIMEOUT_ABS_MS(500));
    lcd_send(false, 0x01);
    lcd_send(true, 'X');
    k_msleep(2);
    lcd_send(true, 'Y');

    k_sleep(K_TIMEOUT_ABS_MS(700));
    static const uint8_t glyph[8] = {0x04, 0x0e, 0x1f, 0x0e, 0x04, 0x00, 0x1f, 0x00};
    lcd_send(false, 0x40 | (1 << 3));
    for (int i = 0; i < 8; i++) {
        lcd_send(true, glyph[i]);
    }

    k_sleep(K_TIMEOUT_ABS_MS(800));
    lcd_send(false, 0x80 | 0x01);
    lcd_send(true, 0x01);
    lcd_send(true, 'Z');

    k_sleep(K_TIMEOUT_ABS_MS(1000));
    lcd_send(false, 0x04);
    lcd_clear();
    lcd_print("AB");

    k_sleep(K_TIMEOUT_ABS_MS(1200));
    lcd_send(false, 0x18);

    k_sleep(K_TIMEOUT_ABS_MS(1400));
    lcd_send(false, 0x1c);
    lcd_send(false, 0x1c);

    k_sleep(K_TIMEOUT_ABS_MS(1600));
    lcd_send(false, 0x02);
    k_msleep(2);

    k_sleep(K_TIMEOUT_ABS_MS(1800));
    lcd_clear();
    lcd_send(false, 0x07);
    lcd_send(false, 0x80 | 0x10);
    lcd_print("ABC");

    for (;;) {
        k_msleep(1000);
    }
    return 0;
}
