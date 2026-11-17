// SAADC exerciser for adc_probe.py.
//
// Through Zephyr's ADC API: every channel once (channel n is wired to
// AIN(7-n) in the overlay; channel 0 asks for an offset calibration first),
// channel 7 at each gain, reference and resolution the probe checks, a
// differential pair both ways, and an 8x oversampled read. Then the
// peripheral's own registers, interrupts masked, for what the driver never
// issues: LIMIT comparators, oversampling without burst, SAMPLERATE-timed
// sampling, STOP mid-buffer. Then a LIVE line on channel 0 every 100 ms.
#include <zephyr/kernel.h>
#include <zephyr/drivers/adc.h>
#include <zephyr/dt-bindings/adc/nrf-saadc.h>
#include <zephyr/sys/printk.h>
#include <nrfx.h>

#define DT_SPEC_AND_COMMA(node_id, prop, idx) ADC_DT_SPEC_GET_BY_IDX(node_id, idx),

static const struct adc_dt_spec channels[] = {
    DT_FOREACH_PROP_ELEM(DT_PATH(zephyr_user), io_channels, DT_SPEC_AND_COMMA)
};

#define RAW_CH 3  /* AIN4 in the overlay; the probe never re-drives it */
#define RAW_PSELP SAADC_CH_PSELP_PSELP_AnalogInput4
#define LIMIT_RESET 0x7FFF8000  /* high 0x7FFF, low -32768 */
#define SAMPLERATE_TASK 0x7FF
#define CONT_CC 2047
#define CONT_SAMPLES 40

static int read_raw(const struct adc_dt_spec *spec, uint8_t resolution, uint8_t oversampling,
                    bool calibrate, int16_t *raw)
{
    struct adc_sequence seq = {
        .channels = BIT(spec->channel_id),
        .buffer = raw,
        .buffer_size = sizeof(*raw),
        .resolution = resolution,
        .oversampling = oversampling,
        .calibrate = calibrate,
    };
    return adc_read(spec->dev, &seq);
}

static void map_phase(void)
{
    for (size_t i = 0; i < ARRAY_SIZE(channels); i++) {
        int rc = adc_channel_setup_dt(&channels[i]);
        if (rc < 0) {
            printk("ERR setup ch=%d rc=%d\n", channels[i].channel_id, rc);
            return;
        }
        int16_t raw;
        rc = read_raw(&channels[i], 12, 0, i == 0, &raw);
        if (rc < 0) {
            printk("ERR read ch=%d rc=%d\n", channels[i].channel_id, rc);
            return;
        }
        int32_t mv = raw;
        adc_raw_to_millivolts_dt(&channels[i], &mv);
        printk("MAP ch=%d ain=%d raw=%d mv=%d\n", channels[i].channel_id,
               channels[i].channel_cfg.input_positive - NRF_SAADC_AIN0, raw, mv);
    }
}

static void scale_phase(void)
{
    static const struct { enum adc_gain gain; enum adc_reference ref; const char *gain_name; const char *ref_name; } scales[] = {
        { ADC_GAIN_1_6, ADC_REF_INTERNAL, "1_6", "int" },
        { ADC_GAIN_1_2, ADC_REF_INTERNAL, "1_2", "int" },
        { ADC_GAIN_1, ADC_REF_INTERNAL, "1", "int" },
        { ADC_GAIN_1_4, ADC_REF_VDD_1_4, "1_4", "vdd4" },
    };
    static const uint8_t resolutions[] = { 8, 10, 12, 14 };
    const struct adc_dt_spec *spec = &channels[7];

    for (size_t s = 0; s < ARRAY_SIZE(scales); s++) {
        struct adc_channel_cfg cfg = spec->channel_cfg;
        cfg.gain = scales[s].gain;
        cfg.reference = scales[s].ref;
        int rc = adc_channel_setup(spec->dev, &cfg);
        if (rc < 0) {
            printk("ERR setup scale=%s/%s rc=%d\n", scales[s].gain_name, scales[s].ref_name, rc);
            return;
        }
        for (size_t r = 0; r < ARRAY_SIZE(resolutions); r++) {
            int16_t raw;
            rc = read_raw(spec, resolutions[r], 0, false, &raw);
            if (rc < 0) {
                printk("ERR read scale=%s/%s res=%d rc=%d\n", scales[s].gain_name, scales[s].ref_name, resolutions[r], rc);
                return;
            }
            printk("SCALE gain=%s ref=%s res=%d raw=%d\n", scales[s].gain_name, scales[s].ref_name, resolutions[r], raw);
        }
    }
}

static void diff_read(uint8_t ain_p, uint8_t ain_n)
{
    const struct adc_dt_spec *spec = &channels[1];
    struct adc_channel_cfg cfg = spec->channel_cfg;
    cfg.differential = 1;
    cfg.input_positive = NRF_SAADC_AIN0 + ain_p;
    cfg.input_negative = NRF_SAADC_AIN0 + ain_n;
    int rc = adc_channel_setup(spec->dev, &cfg);
    if (rc < 0) {
        printk("ERR setup diff p=%d n=%d rc=%d\n", ain_p, ain_n, rc);
        return;
    }
    int16_t raw;
    rc = read_raw(spec, 12, 0, false, &raw);
    if (rc < 0) {
        printk("ERR read diff p=%d n=%d rc=%d\n", ain_p, ain_n, rc);
        return;
    }
    printk("DIFF p=%d n=%d raw=%d\n", ain_p, ain_n, raw);
}

static void over_phase(void)
{
    int16_t raw;
    int rc = read_raw(&channels[2], 12, 3, false, &raw);
    if (rc < 0) {
        printk("ERR read over rc=%d\n", rc);
        return;
    }
    printk("OVER x=8 raw=%d\n", raw);
}

static void raw_clear_events(void)
{
    NRF_SAADC->EVENTS_STARTED = 0;
    NRF_SAADC->EVENTS_END = 0;
    NRF_SAADC->EVENTS_DONE = 0;
    NRF_SAADC->EVENTS_RESULTDONE = 0;
    NRF_SAADC->EVENTS_STOPPED = 0;
    NRF_SAADC->EVENTS_CH[RAW_CH].LIMITH = 0;
    NRF_SAADC->EVENTS_CH[RAW_CH].LIMITL = 0;
}

static void raw_start(int16_t *buf, uint16_t count)
{
    NRF_SAADC->RESULT.PTR = (uint32_t)buf;
    NRF_SAADC->RESULT.MAXCNT = count;
    NRF_SAADC->TASKS_START = 1;
    while (!NRF_SAADC->EVENTS_STARTED) {
    }
}

static void raw_stop(void)
{
    NRF_SAADC->TASKS_STOP = 1;
    while (!NRF_SAADC->EVENTS_STOPPED) {
    }
}

static void raw_limit_read(int16_t low, int16_t high, const char *label)
{
    int16_t buf;
    NRF_SAADC->CH[RAW_CH].LIMIT = ((uint32_t)(uint16_t)high << 16) | (uint16_t)low;
    raw_start(&buf, 1);
    NRF_SAADC->TASKS_SAMPLE = 1;
    while (!NRF_SAADC->EVENTS_END) {
    }
    printk("RAW limit=%s hit_high=%d hit_low=%d raw=%d\n", label,
           (int)NRF_SAADC->EVENTS_CH[RAW_CH].LIMITH, (int)NRF_SAADC->EVENTS_CH[RAW_CH].LIMITL, buf);
    raw_clear_events();
}

static void raw_over_read(void)
{
    int16_t buf;
    NRF_SAADC->OVERSAMPLE = SAADC_OVERSAMPLE_OVERSAMPLE_Over4x;
    raw_start(&buf, 1);
    int samples = 0;
    while (!NRF_SAADC->EVENTS_END && samples < 8) {
        NRF_SAADC->TASKS_SAMPLE = 1;
        samples++;
    }
    printk("RAWOVER samples=%d amount=%d raw=%d\n", samples, (int)NRF_SAADC->RESULT.AMOUNT, buf);
    raw_clear_events();
    NRF_SAADC->OVERSAMPLE = SAADC_OVERSAMPLE_OVERSAMPLE_Bypass;
}

static void raw_continuous(void)
{
    static int16_t buf[CONT_SAMPLES];
    NRF_SAADC->SAMPLERATE = (SAADC_SAMPLERATE_MODE_Timers << SAADC_SAMPLERATE_MODE_Pos) | CONT_CC;
    raw_start(buf, CONT_SAMPLES);
    uint32_t t0 = k_cycle_get_32();
    NRF_SAADC->TASKS_SAMPLE = 1;
    while (!NRF_SAADC->EVENTS_END) {
    }
    uint32_t us = k_cyc_to_us_near32(k_cycle_get_32() - t0);
    int amount = NRF_SAADC->RESULT.AMOUNT;
    raw_stop();
    raw_clear_events();

    /* A START alone must not restart the timer. */
    raw_start(buf, 4);
    k_busy_wait(1000);
    int idle_end = NRF_SAADC->EVENTS_END;
    raw_stop();
    raw_clear_events();
    NRF_SAADC->SAMPLERATE = SAMPLERATE_TASK;
    printk("CONT amount=%d us=%u idle_end=%d first=%d last=%d\n", amount, us, idle_end, buf[0], buf[CONT_SAMPLES - 1]);
}

static void raw_stop_mid_buffer(void)
{
    int16_t buf[4] = { 0, 0, 0, 0 };
    raw_start(buf, 4);
    NRF_SAADC->TASKS_SAMPLE = 1;
    NRF_SAADC->TASKS_SAMPLE = 1;
    int end_before = NRF_SAADC->EVENTS_END;
    raw_stop();
    printk("STOP amount=%d end_before=%d end=%d stopped=%d\n", (int)NRF_SAADC->RESULT.AMOUNT, end_before,
           (int)NRF_SAADC->EVENTS_END, (int)NRF_SAADC->EVENTS_STOPPED);
    raw_clear_events();
}

static void raw_phase(void)
{
    uint32_t inten = NRF_SAADC->INTEN;
    NRF_SAADC->INTENCLR = 0xFFFFFFFF;
    for (int n = 0; n < 8; n++) {
        NRF_SAADC->CH[n].PSELP = SAADC_CH_PSELP_PSELP_NC;
    }
    NRF_SAADC->CH[RAW_CH].PSELP = RAW_PSELP;
    NRF_SAADC->CH[RAW_CH].PSELN = SAADC_CH_PSELN_PSELN_NC;
    NRF_SAADC->CH[RAW_CH].CONFIG = (SAADC_CH_CONFIG_GAIN_Gain1_6 << SAADC_CH_CONFIG_GAIN_Pos)
                                 | (SAADC_CH_CONFIG_REFSEL_Internal << SAADC_CH_CONFIG_REFSEL_Pos)
                                 | (SAADC_CH_CONFIG_TACQ_10us << SAADC_CH_CONFIG_TACQ_Pos);
    NRF_SAADC->RESOLUTION = SAADC_RESOLUTION_VAL_12bit;
    NRF_SAADC->OVERSAMPLE = SAADC_OVERSAMPLE_OVERSAMPLE_Bypass;
    NRF_SAADC->SAMPLERATE = SAMPLERATE_TASK;
    NRF_SAADC->ENABLE = 1;

    raw_limit_read(-32768, 1000, "high");
    raw_limit_read(2000, 32767, "low");
    NRF_SAADC->CH[RAW_CH].LIMIT = LIMIT_RESET;
    raw_over_read();
    raw_continuous();
    raw_stop_mid_buffer();

    NRF_SAADC->ENABLE = 0;
    NRF_SAADC->CH[RAW_CH].PSELP = SAADC_CH_PSELP_PSELP_NC;
    NRF_SAADC->INTENSET = inten;
}

int main(void)
{
    if (!adc_is_ready_dt(&channels[0])) {
        printk("ERR adc not ready\n");
        return 1;
    }
    map_phase();
    scale_phase();
    diff_read(6, 7);
    diff_read(7, 6);
    over_phase();
    raw_phase();
    for (;;) {
        int16_t raw;
        int rc = read_raw(&channels[0], 12, 0, false, &raw);
        if (rc < 0) {
            printk("ERR read live rc=%d\n", rc);
        } else {
            int32_t mv = raw;
            adc_raw_to_millivolts_dt(&channels[0], &mv);
            printk("LIVE raw=%d mv=%d\n", raw, mv);
        }
        k_msleep(100);
    }
    return 0;
}
