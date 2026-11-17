/*
 * ESP32-S3 (ESP-IDF v4.4.7) firmware that speaks the PostgreSQL v3.0
 * frontend/backend protocol directly over an lwIP TCP socket.
 *
 *  - joins the open WiFi network "Espressif"
 *  - connects to pg.iot.test:5432 as iot/iotpass (MD5 auth), database iot
 *  - prints "SETPOINT: <value>" from config.key='setpoint'; the LED on
 *    GPIO10 lights when the setpoint is above 22
 *  - inserts 20.0 + 0.5*n into readings(value) every 2 seconds over one
 *    persistent connection; prints "PG ERROR: <msg>" when a query fails
 */
#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <stdbool.h>
#include <string.h>
#include <errno.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"
#include "driver/gpio.h"
#include "esp_system.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "esp_log.h"
#include "nvs_flash.h"

#include "lwip/sockets.h"
#include "lwip/netdb.h"

#include "mbedtls/md5.h"

#define WIFI_SSID      "Espressif"
#define PG_HOST        "pg.iot.test"
#define PG_PORT        "5432"
#define PG_USER        "iot"
#define PG_PASS        "iotpass"
#define PG_DB          "iot"

#define LED_PIN        GPIO_NUM_10

#define INSERT_PERIOD_MS 2000

static const char *TAG = "pgclient";

static EventGroupHandle_t s_wifi_events;
#define WIFI_CONNECTED_BIT BIT0

/* ------------------------------------------------------------------ WiFi */

static void wifi_event_handler(void *arg, esp_event_base_t base,
                               int32_t id, void *data)
{
    if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
        xEventGroupClearBits(s_wifi_events, WIFI_CONNECTED_BIT);
        ESP_LOGW(TAG, "WiFi disconnected, reconnecting");
        esp_wifi_connect();
    } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *ev = (ip_event_got_ip_t *)data;
        printf("WiFi connected, IP " IPSTR "\n", IP2STR(&ev->ip_info.ip));
        xEventGroupSetBits(s_wifi_events, WIFI_CONNECTED_BIT);
    }
}

static void wifi_init_sta(void)
{
    s_wifi_events = xEventGroupCreate();

    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    ESP_ERROR_CHECK(esp_event_handler_instance_register(
        WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler, NULL, NULL));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(
        IP_EVENT, IP_EVENT_STA_GOT_IP, &wifi_event_handler, NULL, NULL));

    wifi_config_t wc;
    memset(&wc, 0, sizeof(wc));
    strncpy((char *)wc.sta.ssid, WIFI_SSID, sizeof(wc.sta.ssid));
    /* open network: password left empty */
    wc.sta.threshold.authmode = WIFI_AUTH_OPEN;
    wc.sta.pmf_cfg.capable = true;
    wc.sta.pmf_cfg.required = false;

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wc));
    ESP_ERROR_CHECK(esp_wifi_start());

    printf("Connecting to WiFi \"%s\"...\n", WIFI_SSID);
    xEventGroupWaitBits(s_wifi_events, WIFI_CONNECTED_BIT, pdFALSE, pdTRUE,
                        portMAX_DELAY);
}

/* ------------------------------------------------------ byte helpers */

static void put32(uint8_t *p, uint32_t v)
{
    p[0] = (uint8_t)(v >> 24);
    p[1] = (uint8_t)(v >> 16);
    p[2] = (uint8_t)(v >> 8);
    p[3] = (uint8_t)v;
}

static uint32_t get32(const uint8_t *p)
{
    return ((uint32_t)p[0] << 24) | ((uint32_t)p[1] << 16) |
           ((uint32_t)p[2] << 8) | (uint32_t)p[3];
}

static uint16_t get16(const uint8_t *p)
{
    return (uint16_t)(((uint16_t)p[0] << 8) | (uint16_t)p[1]);
}

/* ------------------------------------------------------ socket helpers */

static int send_all(int s, const uint8_t *buf, size_t len)
{
    size_t off = 0;
    while (off < len) {
        int n = send(s, buf + off, len - off, 0);
        if (n < 0) {
            if (errno == EINTR) continue;
            return -1;
        }
        off += (size_t)n;
    }
    return 0;
}

static int recv_exact(int s, uint8_t *buf, size_t len)
{
    size_t off = 0;
    while (off < len) {
        int n = recv(s, buf + off, len - off, 0);
        if (n == 0) return -1;              /* peer closed */
        if (n < 0) {
            if (errno == EINTR) continue;
            return -1;
        }
        off += (size_t)n;
    }
    return 0;
}

/* ------------------------------------------------------ PG protocol */

#define PG_BUF_SIZE 2048
static uint8_t s_txbuf[PG_BUF_SIZE];
static uint8_t s_rxbuf[PG_BUF_SIZE];

typedef struct {
    char type;
    uint32_t len;      /* body length (excluding type byte and length word) */
    bool truncated;    /* body larger than buffer; only prefix kept */
} pg_msg_t;

/* Read one backend message into s_rxbuf. Returns 0 on success. */
static int pg_read_msg(int s, pg_msg_t *m)
{
    uint8_t hdr[5];
    if (recv_exact(s, hdr, 5) < 0) return -1;
    m->type = (char)hdr[0];
    uint32_t l = get32(hdr + 1);
    if (l < 4) return -1;
    l -= 4;
    m->len = l;
    m->truncated = false;

    size_t keep = l;
    if (keep > PG_BUF_SIZE - 1) {
        keep = PG_BUF_SIZE - 1;
        m->truncated = true;
    }
    if (keep && recv_exact(s, s_rxbuf, keep) < 0) return -1;
    s_rxbuf[keep] = 0;

    /* discard any remainder */
    uint32_t rest = l - (uint32_t)keep;
    uint8_t junk[64];
    while (rest) {
        size_t c = rest > sizeof(junk) ? sizeof(junk) : rest;
        if (recv_exact(s, junk, c) < 0) return -1;
        rest -= (uint32_t)c;
    }
    return 0;
}

/* Extract the 'M' (message) field of an ErrorResponse/NoticeResponse. */
static const char *pg_err_field(const pg_msg_t *m, char field)
{
    size_t len = m->truncated ? PG_BUF_SIZE - 1 : m->len;
    size_t i = 0;
    while (i < len && s_rxbuf[i] != 0) {
        char f = (char)s_rxbuf[i++];
        const char *val = (const char *)&s_rxbuf[i];
        size_t vl = strnlen(val, len - i);
        if (f == field) return val;
        i += vl + 1;
    }
    return NULL;
}

static void pg_print_error(const pg_msg_t *m)
{
    const char *msg = pg_err_field(m, 'M');
    printf("PG ERROR: %s\n", msg ? msg : "(no message)");
}

static void md5_hex(const uint8_t *in, size_t len, char out[33])
{
    uint8_t d[16];
    static const char hx[] = "0123456789abcdef";
    mbedtls_md5_ret(in, len, d);
    for (int i = 0; i < 16; i++) {
        out[2 * i] = hx[d[i] >> 4];
        out[2 * i + 1] = hx[d[i] & 0x0f];
    }
    out[32] = 0;
}

static int pg_send_password_md5(int s, const uint8_t salt[4])
{
    uint8_t tmp[64];
    char inner[33], outer[33];

    size_t pl = strlen(PG_PASS), ul = strlen(PG_USER);
    memcpy(tmp, PG_PASS, pl);
    memcpy(tmp + pl, PG_USER, ul);
    md5_hex(tmp, pl + ul, inner);

    memcpy(tmp, inner, 32);
    memcpy(tmp + 32, salt, 4);
    md5_hex(tmp, 36, outer);

    /* 'p' | len | "md5" + outer + '\0' */
    size_t body = 3 + 32 + 1;
    s_txbuf[0] = 'p';
    put32(s_txbuf + 1, (uint32_t)(4 + body));
    memcpy(s_txbuf + 5, "md5", 3);
    memcpy(s_txbuf + 8, outer, 32);
    s_txbuf[40] = 0;
    return send_all(s, s_txbuf, 1 + 4 + body);
}

static int pg_send_cleartext(int s)
{
    size_t pl = strlen(PG_PASS);
    s_txbuf[0] = 'p';
    put32(s_txbuf + 1, (uint32_t)(4 + pl + 1));
    memcpy(s_txbuf + 5, PG_PASS, pl + 1);
    return send_all(s, s_txbuf, 5 + pl + 1);
}

/* Returns connected & authenticated socket (ReadyForQuery received), or -1. */
static int pg_connect(void)
{
    struct addrinfo hints;
    struct addrinfo *res = NULL;
    memset(&hints, 0, sizeof(hints));
    hints.ai_family = AF_INET;
    hints.ai_socktype = SOCK_STREAM;

    int err = getaddrinfo(PG_HOST, PG_PORT, &hints, &res);
    if (err != 0 || res == NULL) {
        printf("DNS lookup of %s failed (%d)\n", PG_HOST, err);
        return -1;
    }
    struct sockaddr_in *sa = (struct sockaddr_in *)res->ai_addr;
    char ipstr[16];
    inet_ntoa_r(sa->sin_addr, ipstr, sizeof(ipstr));
    printf("Resolved %s -> %s\n", PG_HOST, ipstr);

    int s = socket(res->ai_family, res->ai_socktype, 0);
    if (s < 0) {
        printf("socket() failed: errno %d\n", errno);
        freeaddrinfo(res);
        return -1;
    }
    struct timeval tv = { .tv_sec = 15, .tv_usec = 0 };
    setsockopt(s, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
    setsockopt(s, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv));
    int one = 1;
    setsockopt(s, IPPROTO_TCP, TCP_NODELAY, &one, sizeof(one));

    if (connect(s, res->ai_addr, res->ai_addrlen) != 0) {
        printf("TCP connect to %s:%s failed: errno %d\n", PG_HOST, PG_PORT, errno);
        freeaddrinfo(res);
        close(s);
        return -1;
    }
    freeaddrinfo(res);
    printf("TCP connected to %s:%s\n", PG_HOST, PG_PORT);

    /* StartupMessage: len | 196608 | params | \0 */
    size_t off = 8;
    const char *params[] = { "user", PG_USER, "database", PG_DB };
    for (size_t i = 0; i < sizeof(params) / sizeof(params[0]); i++) {
        size_t l = strlen(params[i]) + 1;
        memcpy(s_txbuf + off, params[i], l);
        off += l;
    }
    s_txbuf[off++] = 0;
    put32(s_txbuf, (uint32_t)off);
    put32(s_txbuf + 4, 196608u);   /* protocol 3.0 */
    if (send_all(s, s_txbuf, off) < 0) {
        printf("send StartupMessage failed\n");
        close(s);
        return -1;
    }

    pg_msg_t m;
    for (;;) {
        if (pg_read_msg(s, &m) < 0) {
            printf("connection lost during startup\n");
            close(s);
            return -1;
        }
        switch (m.type) {
        case 'R': {
            if (m.len < 4) break;
            uint32_t code = get32(s_rxbuf);
            if (code == 0) {
                printf("PG authentication OK\n");
            } else if (code == 5 && m.len >= 8) {
                uint8_t salt[4];
                memcpy(salt, s_rxbuf + 4, 4);
                if (pg_send_password_md5(s, salt) < 0) {
                    close(s);
                    return -1;
                }
            } else if (code == 3) {
                if (pg_send_cleartext(s) < 0) {
                    close(s);
                    return -1;
                }
            } else {
                printf("PG ERROR: unsupported authentication method %u\n",
                       (unsigned)code);
                close(s);
                return -1;
            }
            break;
        }
        case 'E':
            pg_print_error(&m);
            close(s);
            return -1;
        case 'Z':
            printf("PG connected to database %s\n", PG_DB);
            return s;
        case 'S': /* ParameterStatus */
        case 'K': /* BackendKeyData */
        case 'N': /* Notice */
        default:
            break;
        }
    }
}

typedef void (*pg_row_cb)(int ncols, const char **vals, const int *lens,
                          void *ctx);

/*
 * Run a simple query. Returns:
 *   1  -> query succeeded
 *   0  -> server reported an error (already printed as "PG ERROR: ...")
 *  -1  -> connection failure (socket must be reopened)
 */
static int pg_query(int s, const char *sql, pg_row_cb cb, void *ctx)
{
    size_t ql = strlen(sql) + 1;
    if (5 + ql > PG_BUF_SIZE) return 0;
    s_txbuf[0] = 'Q';
    put32(s_txbuf + 1, (uint32_t)(4 + ql));
    memcpy(s_txbuf + 5, sql, ql);
    if (send_all(s, s_txbuf, 5 + ql) < 0) {
        printf("PG ERROR: send failed (errno %d)\n", errno);
        return -1;
    }

    bool ok = true;
    pg_msg_t m;
    for (;;) {
        if (pg_read_msg(s, &m) < 0) {
            printf("PG ERROR: connection lost (errno %d)\n", errno);
            return -1;
        }
        switch (m.type) {
        case 'E':
            ok = false;
            pg_print_error(&m);
            break;
        case 'D': {
            if (!cb || m.len < 2) break;
            size_t len = m.truncated ? PG_BUF_SIZE - 1 : m.len;
            int ncols = get16(s_rxbuf);
            if (ncols > 8) ncols = 8;
            const char *vals[8];
            int lens[8];
            size_t p = 2;
            int got = 0;
            for (int i = 0; i < ncols; i++) {
                if (p + 4 > len) break;
                int32_t cl = (int32_t)get32(s_rxbuf + p);
                p += 4;
                if (cl < 0) {
                    vals[i] = NULL;
                    lens[i] = -1;
                } else {
                    if (p + (size_t)cl > len) break;
                    vals[i] = (const char *)(s_rxbuf + p);
                    lens[i] = cl;
                    p += (size_t)cl;
                }
                got++;
            }
            cb(got, vals, lens, ctx);
            break;
        }
        case 'Z':
            return ok ? 1 : 0;
        case 'T': /* RowDescription */
        case 'C': /* CommandComplete */
        case 'I': /* EmptyQueryResponse */
        case 'N': /* Notice */
        case 'S': /* ParameterStatus */
        default:
            break;
        }
    }
}

typedef struct {
    bool found;
} setpoint_ctx_t;

static void setpoint_row(int ncols, const char **vals, const int *lens,
                         void *ctx)
{
    setpoint_ctx_t *c = (setpoint_ctx_t *)ctx;
    if (c->found || ncols < 1) return;
    c->found = true;
    if (vals[0] == NULL) {
        printf("SETPOINT: NULL\n");
    } else {
        printf("SETPOINT: %.*s\n", lens[0], vals[0]);
        char text[16];
        snprintf(text, sizeof(text), "%.*s", lens[0], vals[0]);
        gpio_set_level(LED_PIN, strtof(text, NULL) > 22.0f);
    }
}

static void pg_terminate(int s)
{
    uint8_t t[5] = { 'X', 0, 0, 0, 4 };
    send_all(s, t, sizeof(t));
    close(s);
}

/* ------------------------------------------------------------ main */

void app_main(void)
{
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES ||
        ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    gpio_reset_pin(LED_PIN);
    gpio_set_direction(LED_PIN, GPIO_MODE_OUTPUT);
    gpio_set_level(LED_PIN, 0);

    wifi_init_sta();

    int s = -1;
    while (s < 0) {
        s = pg_connect();
        if (s < 0) {
            printf("Retrying database connection in 2 s\n");
            vTaskDelay(pdMS_TO_TICKS(2000));
        }
    }

    /* Read the setpoint (printed exactly once). */
    setpoint_ctx_t sp = { .found = false };
    for (;;) {
        int r = pg_query(s, "SELECT value FROM config WHERE key = 'setpoint'",
                         setpoint_row, &sp);
        if (r == 1 || r == 0) break;
        /* connection failure: reconnect and retry */
        close(s);
        s = -1;
        while (s < 0) {
            vTaskDelay(pdMS_TO_TICKS(1000));
            s = pg_connect();
        }
    }
    if (!sp.found) {
        printf("setpoint row not found\n");
    }

    /* Insert a reading every 2 seconds over the same connection. */
    char sql[96];
    uint32_t n = 0;
    TickType_t last = xTaskGetTickCount();
    for (;;) {
        unsigned tenths = 200u + 5u * n;   /* 20.0 + 0.5 * n */
        snprintf(sql, sizeof(sql),
                 "INSERT INTO readings (value) VALUES (%u.%u)",
                 tenths / 10u, tenths % 10u);

        if (s < 0) {
            s = pg_connect();
        }
        if (s >= 0) {
            int r = pg_query(s, sql, NULL, NULL);
            if (r == 1) {
                printf("INSERT #%u value=%u.%u ok\n", (unsigned)n,
                       tenths / 10u, tenths % 10u);
            } else if (r < 0) {
                close(s);
                s = -1;
            }
        } else {
            printf("PG ERROR: not connected, insert #%u skipped\n",
                   (unsigned)n);
        }
        n++;

        vTaskDelayUntil(&last, pdMS_TO_TICKS(INSERT_PERIOD_MS));
    }

    pg_terminate(s); /* not reached */
}
