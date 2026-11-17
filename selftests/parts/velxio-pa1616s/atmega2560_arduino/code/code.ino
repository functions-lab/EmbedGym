// PA1616S unit test sketch:
//   Adafruit_GPS on Serial1, the library's standard init (RMCGGA output at
//   1 Hz). Every successfully parsed sentence prints one line — "FIX 0"
//   while searching, "FIX 1 LAT <lat> LON <lon>" once the harness drives
//   `set gps.fix = true` plus a position. RMCGGA means two parsed sentences
//   (GGA + RMC) and therefore two printed lines per update cycle.

#include <Adafruit_GPS.h>

Adafruit_GPS GPS(&Serial1);

void setup() {
  Serial.begin(115200);
  GPS.begin(9600);
  GPS.sendCommand(PMTK_SET_NMEA_OUTPUT_RMCGGA);
  GPS.sendCommand(PMTK_SET_NMEA_UPDATE_1HZ);
}

void loop() {
  GPS.read();
  if (GPS.newNMEAreceived()) {
    if (GPS.parse(GPS.lastNMEA())) {
      if (GPS.fix) {
        Serial.print("FIX 1 LAT ");
        Serial.print(GPS.latitudeDegrees, 4);
        Serial.print(" LON ");
        Serial.println(GPS.longitudeDegrees, 4);
      } else {
        Serial.println("FIX 0");
      }
    }
  }
}
