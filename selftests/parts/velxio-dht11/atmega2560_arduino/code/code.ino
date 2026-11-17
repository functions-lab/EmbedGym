// DHT11 unit test sketch:
//   Read temperature and humidity via the standard Adafruit DHT library and
//   print both as whole numbers. The harness pokes `set sensor.temperature` and
//   `set sensor.humidity` partway through, so the printed values must follow.
//
// The DHT11 wire format carries integers only, so the printed values are exact
// and the checksum path is exercised on every read: a failed read prints an
// error instead, which would show up as a missing expected line.
//
// The library enforces a 2 s minimum between reads internally (it returns the
// cached frame otherwise), so the loop polls at 250 ms and the test allows
// >2 s after each `set` before asserting the new value.

#include <DHT.h>

const int DHT_PIN = 14;

DHT dht(DHT_PIN, DHT11);

void setup() {
  Serial.begin(115200);
  dht.begin();
}

void loop() {
  float humidity = dht.readHumidity();
  float celsius = dht.readTemperature();

  if (isnan(humidity) || isnan(celsius)) {
    Serial.println("DHT read failed");
  } else {
    Serial.print("T=");
    Serial.print((int)celsius);
    Serial.print(" H=");
    Serial.println((int)humidity);
  }

  delay(250);
}
