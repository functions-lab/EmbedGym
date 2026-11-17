// Startup hook: marks the moment setup() begins on UART0, then runs it.
#include <string.h>
#include "esp_rom_sys.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

extern void __real__Z5setupv(void);

void __wrap__Z5setupv(void)
{
    esp_rom_printf("\x01VLX-APP\x02");
    __real__Z5setupv();
}

// The core's sdkconfig sets CONFIG_ESP_IPC_TASK_STACK_SIZE=1024, which the
// first attachInterrupt() (gpio_install_isr_service on ipc1) overflows when an
// interrupt lands mid-call. Give the IPC tasks IDF v4.4.7's default instead.
extern BaseType_t __real_xTaskCreatePinnedToCore(TaskFunction_t pvTaskCode, const char *const pcName,
                                                 const uint32_t usStackDepth, void *const pvParameters,
                                                 UBaseType_t uxPriority, TaskHandle_t *const pvCreatedTask,
                                                 const BaseType_t xCoreID);

BaseType_t __wrap_xTaskCreatePinnedToCore(TaskFunction_t pvTaskCode, const char *const pcName,
                                          const uint32_t usStackDepth, void *const pvParameters,
                                          UBaseType_t uxPriority, TaskHandle_t *const pvCreatedTask,
                                          const BaseType_t xCoreID)
{
    uint32_t stack = usStackDepth;
    if (strcmp(pcName, "ipc0") == 0 || strcmp(pcName, "ipc1") == 0) {
        stack = 1536;
    }
    return __real_xTaskCreatePinnedToCore(pvTaskCode, pcName, stack, pvParameters, uxPriority, pvCreatedTask, xCoreID);
}
