// DS18B20 unit test firmware (nRF52840 / Zephyr variant of code/code.ino):
//   a bit-banged 1-Wire host doing what OneWire + DallasTemperature do on AVR.
//   Setup runs Search ROM, Read ROM, Read Power Supply, an Alarm Search and a
//   scratchpad read that must still hold the power-on 85 C, then prints the
//   device count. Each round writes TH / TL / resolution, checks Copy
//   Scratchpad + Recall E2, converts (Skip ROM, busy poll), reads the
//   scratchpad back under Match ROM with its CRC, checks the alarm flag
//   against an Alarm Search, and checks that a Match ROM miss deselects the
//   part. The harness pokes `set probe.temperature`, so the printed value
//   must follow. Any other outcome prints an error and stops, so the values go
//   stale and the test fails.
//
// Rounds convert at 12 bits, like the AVR and ESP32 firmware, and alternate
// the way the host treats the line:
//   - an open-drain output, slots timed on TIMER1 at 1 MHz,
//   - a push-pull LOW released by switching the pin to an input, slots timed
//     with k_busy_wait at the datasheet's limits: 15 us write-1 LOW, 60 us
//     write-0 LOW, read slot sampled 15 us after its falling edge. These
//     slots run with interrupts locked: the kernel's 20 ms time-slice
//     interrupt takes about 20 us, more than a slot at its limit can lose.
#include <zephyr/kernel.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/sys/printk.h>
#include <hal/nrf_timer.h>

#define SEARCH_ROM        0xF0
#define READ_ROM          0x33
#define MATCH_ROM         0x55
#define SKIP_ROM          0xCC
#define ALARM_SEARCH      0xEC
#define CONVERT_T         0x44
#define WRITE_SCRATCHPAD  0x4E
#define READ_SCRATCHPAD   0xBE
#define COPY_SCRATCHPAD   0x48
#define RECALL_E2         0xB8
#define READ_POWER_SUPPLY 0xB4

#define ALARM_HIGH_C      28
#define ALARM_LOW_C       (-5)
#define POWER_ON_RAW      0x0550

static const struct gpio_dt_spec data = GPIO_DT_SPEC_GET(DT_ALIAS(data_ds18b20), gpios);

static bool direction_flips;

static uint32_t micros(void)
{
    nrf_timer_task_trigger(NRF_TIMER1, NRF_TIMER_TASK_CAPTURE0);
    return nrf_timer_cc_get(NRF_TIMER1, NRF_TIMER_CC_CHANNEL0);
}

static void wait_until(uint32_t t)
{
    while ((int32_t)(micros() - t) < 0) {
    }
}

static void set_host_style(bool flips)
{
    direction_flips = flips;
    if (flips) {
        gpio_pin_configure(data.port, data.pin, GPIO_INPUT);
    } else {
        gpio_pin_configure(data.port, data.pin, GPIO_INPUT | GPIO_OUTPUT_HIGH | GPIO_OPEN_DRAIN);
    }
}

static void pull_low(void)
{
    if (direction_flips) {
        gpio_pin_configure(data.port, data.pin, GPIO_OUTPUT_LOW);
    } else {
        gpio_pin_set_raw(data.port, data.pin, 0);
    }
}

static void release(void)
{
    if (direction_flips) {
        gpio_pin_configure(data.port, data.pin, GPIO_INPUT);
    } else {
        gpio_pin_set_raw(data.port, data.pin, 1);
    }
}

static int line(void)
{
    return gpio_pin_get_raw(data.port, data.pin);
}

/* true when a presence pulse answers */
static bool reset_bus(void)
{
    uint32_t start = micros();

    pull_low();
    wait_until(start + 480);
    release();
    wait_until(start + 480 + 70);
    bool present = line() == 0;

    wait_until(start + 960);
    return present && line() == 1;
}

static void write_bit(int bit)
{
    if (direction_flips) {
        unsigned int key = irq_lock();

        pull_low();
        k_busy_wait(bit ? 15 : 60);
        release();
        irq_unlock(key);
        k_busy_wait(bit ? 50 : 5);
        return;
    }
    uint32_t start = micros();

    pull_low();
    wait_until(start + (bit ? 6 : 60));
    release();
    wait_until(start + 70);
}

static int read_bit(void)
{
    int bit;

    if (direction_flips) {
        unsigned int key = irq_lock();

        pull_low();
        k_busy_wait(3);
        release();
        k_busy_wait(12);
        bit = line();
        irq_unlock(key);
        k_busy_wait(50);
        return bit;
    }
    uint32_t start = micros();

    pull_low();
    release();
    wait_until(start + 12);
    bit = line();
    wait_until(start + 70);
    return bit;
}

static void write_byte(uint8_t value)
{
    for (int i = 0; i < 8; i++) {
        write_bit((value >> i) & 1);
    }
}

static uint8_t read_byte(void)
{
    uint8_t value = 0;

    for (int i = 0; i < 8; i++) {
        value |= read_bit() << i;
    }
    return value;
}

static uint8_t crc8(const uint8_t *bytes, int len)
{
    uint8_t crc = 0;

    for (int i = 0; i < len; i++) {
        uint8_t b = bytes[i];

        for (int j = 0; j < 8; j++) {
            uint8_t mix = (crc ^ b) & 1;

            crc >>= 1;
            if (mix) {
                crc ^= 0x8C;
            }
            b >>= 1;
        }
    }
    return crc;
}

/* One pass of the search; with a single slave there is never a discrepancy.
 * Returns 1 with the ROM filled, 0 when nothing joins, -1 on a bus error. */
static int search(uint8_t command, uint8_t rom[8])
{
    if (!reset_bus()) {
        return -1;
    }
    write_byte(command);
    for (int i = 0; i < 64; i++) {
        int bit = read_bit();
        int complement = read_bit();

        if (bit && complement) {
            return i == 0 ? 0 : -1;
        }
        if (!bit && !complement) {
            return -1;
        }
        if (i % 8 == 0) {
            rom[i / 8] = 0;
        }
        rom[i / 8] |= bit << (i % 8);
        write_bit(bit);
    }
    return crc8(rom, 7) == rom[7] ? 1 : -1;
}

static bool select_rom(const uint8_t rom[8])
{
    if (!reset_bus()) {
        return false;
    }
    write_byte(MATCH_ROM);
    for (int i = 0; i < 8; i++) {
        write_byte(rom[i]);
    }
    return true;
}

static bool read_scratchpad(const uint8_t rom[8], uint8_t scratchpad[9])
{
    if (!select_rom(rom)) {
        return false;
    }
    write_byte(READ_SCRATCHPAD);
    for (int i = 0; i < 9; i++) {
        scratchpad[i] = read_byte();
    }
    return crc8(scratchpad, 8) == scratchpad[8];
}

static bool write_scratchpad(int8_t high, int8_t low, uint8_t config)
{
    if (!reset_bus()) {
        return false;
    }
    write_byte(SKIP_ROM);
    write_byte(WRITE_SCRATCHPAD);
    write_byte((uint8_t)high);
    write_byte((uint8_t)low);
    write_byte(config);
    return true;
}

static bool skip_rom_command(uint8_t command)
{
    if (!reset_bus()) {
        return false;
    }
    write_byte(SKIP_ROM);
    write_byte(command);
    return true;
}

static int fail(const char *what)
{
    printk("DS18B20 error: %s\n", what);
    return 1;
}

static int setup(uint8_t rom[8])
{
    uint8_t read_rom[8];
    uint8_t alarm_rom[8];
    uint8_t scratchpad[9];
    int count = search(SEARCH_ROM, rom);

    if (count != 1 || rom[0] != 0x28) {
        return fail("search");
    }
    if (!reset_bus()) {
        return fail("no presence");
    }
    write_byte(READ_ROM);
    for (int i = 0; i < 8; i++) {
        read_rom[i] = read_byte();
    }
    if (memcmp(rom, read_rom, 8) != 0) {
        return fail("read rom differs from search");
    }
    /* Read ROM selects the part, so a function command may follow. */
    write_byte(READ_POWER_SUPPLY);
    if (read_bit() != 1) {
        return fail("parasite power reported");
    }
    if (!read_scratchpad(rom, scratchpad)) {
        return fail("power-on scratchpad");
    }
    if (((scratchpad[1] << 8) | scratchpad[0]) != POWER_ON_RAW || scratchpad[4] != 0x7F) {
        return fail("power-on values");
    }
    if (search(ALARM_SEARCH, alarm_rom) != 0) {
        return fail("alarm before any conversion");
    }
    printk("Devices: %d\n", count);
    return 0;
}

static int measure(const uint8_t rom[8], int resolution_bits)
{
    uint8_t config = ((resolution_bits - 9) << 5) | 0x1F;
    uint8_t scratchpad[9];
    uint8_t alarm_rom[8];
    uint8_t wrong_rom[8];

    /* TH / TL / config reach EEPROM, get overwritten, and come back. */
    if (!write_scratchpad(ALARM_HIGH_C, ALARM_LOW_C, config) || !skip_rom_command(COPY_SCRATCHPAD)) {
        return fail("copy scratchpad");
    }
    if (!write_scratchpad(99, -40, 0x1F) || !read_scratchpad(rom, scratchpad)) {
        return fail("write scratchpad");
    }
    if (scratchpad[2] != 99 || scratchpad[3] != (uint8_t)-40 || scratchpad[4] != 0x1F) {
        return fail("scratchpad readback");
    }
    if (!skip_rom_command(RECALL_E2) || read_bit() != 1 || !read_scratchpad(rom, scratchpad)) {
        return fail("recall");
    }
    if (scratchpad[2] != ALARM_HIGH_C || scratchpad[3] != (uint8_t)ALARM_LOW_C || scratchpad[4] != config) {
        return fail("recalled values");
    }

    if (!skip_rom_command(CONVERT_T)) {
        return fail("convert");
    }
    for (int polls = 0; read_bit() == 0; polls++) {
        if (polls > 10000) {
            return fail("conversion never finished");
        }
    }
    if (!read_scratchpad(rom, scratchpad)) {
        return fail("scratchpad crc");
    }
    int16_t raw = (int16_t)((scratchpad[1] << 8) | scratchpad[0]);

    if (raw & ((1 << (12 - resolution_bits)) - 1)) {
        return fail("undefined bits set");
    }

    int whole = raw >> 4;
    bool alarm_expected = whole >= ALARM_HIGH_C || whole <= ALARM_LOW_C;
    int alarm_found = search(ALARM_SEARCH, alarm_rom);

    if (alarm_found != (alarm_expected ? 1 : 0)) {
        return fail("alarm search");
    }

    memcpy(wrong_rom, rom, 8);
    wrong_rom[3] ^= 0x10;
    if (!select_rom(wrong_rom)) {
        return fail("no presence");
    }
    write_byte(READ_SCRATCHPAD);
    for (int i = 0; i < 9; i++) {
        if (read_byte() != 0xFF) {
            return fail("a deselected part answered");
        }
    }

    int tenths = (raw * 10) / 16;

    printk("Temp: %s%d.%d\n", tenths < 0 ? "-" : "", abs(tenths) / 10, abs(tenths) % 10);
    return 0;
}

int main(void)
{
    uint8_t rom[8];

    if (!gpio_is_ready_dt(&data)) {
        printk("GPIO not ready\n");
        return 1;
    }
    nrf_timer_mode_set(NRF_TIMER1, NRF_TIMER_MODE_TIMER);
    nrf_timer_bit_width_set(NRF_TIMER1, NRF_TIMER_BIT_WIDTH_32);
    nrf_timer_prescaler_set(NRF_TIMER1, NRF_TIMER_FREQ_1MHz);
    nrf_timer_task_trigger(NRF_TIMER1, NRF_TIMER_TASK_START);

    set_host_style(false);
    if (setup(rom) != 0) {
        return 1;
    }
    for (int round = 0;; round++) {
        set_host_style(round % 2 == 1);
        if (measure(rom, 12) != 0) {
            return 1;
        }
        k_msleep(100);
    }
    return 0;
}
