// WiFi join selftest: connect to the open AP "Espressif" (no password). The
// LED on GPIO10 stays off until DHCP assigns an address, then turns on and the
// address and the AP's RSSI are printed once.
#include <WiFi.h>

const int LED_PIN = 10;

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  WiFi.mode(WIFI_STA);
  WiFi.begin("Espressif");
  while (WiFi.status() != WL_CONNECTED) {
    delay(10);
  }
  digitalWrite(LED_PIN, HIGH);
  Serial.printf("IP: %s RSSI: %d\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
}

void loop() {
  delay(1000);
}
