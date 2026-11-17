// DS1307 selftest firmware for nrf52840_zephyr.
//
// Goes through Zephyr's own maxim,ds1307 driver: its init writes the control
// register and reads the clock-halt bit, rtc_set_time bursts the seven time
// registers, rtc_get_time bursts them back. The v4.2.2 driver copies tm_mon
// into the month register as it is, so tm_mon is the 1-based month here.
#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/rtc.h>
#include <zephyr/sys/printk.h>

static const struct device *const rtc = DEVICE_DT_GET_ONE(maxim_ds1307);

int main(void)
{
    if (!device_is_ready(rtc)) {
        printk("DS1307 not ready\n");
        return 1;
    }
    const struct rtc_time set = {
        .tm_year = 2026 - 1900, .tm_mon = 2, .tm_mday = 2, .tm_wday = 1,
        .tm_hour = 15, .tm_min = 37, .tm_sec = 0,
    };
    if (rtc_set_time(rtc, &set) < 0) {
        printk("DS1307 set failed\n");
        return 1;
    }
    for (;;) {
        struct rtc_time now;
        if (rtc_get_time(rtc, &now) < 0) {
            printk("DS1307 read failed\n");
        } else {
            printk("%04d/%02d/%02d %02d:%02d:%02d\n",
                   now.tm_year + 1900, now.tm_mon, now.tm_mday,
                   now.tm_hour, now.tm_min, now.tm_sec);
        }
        k_msleep(500);
    }
    return 0;
}
