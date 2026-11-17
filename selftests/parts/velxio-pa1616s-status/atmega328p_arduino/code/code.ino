// PA1616S status unit test sketch:
//   GGA only (PMTK314) at 5 Hz (PMTK220) with the antenna advisory on
//   (PGCMD,33,1), after a firmware query (PMTK605). Prints "FW <release>" for
//   the query's answer, "GGA" / "ANT <status>" / "OTHER" per sentence, and
//   "FIX <ms>" / "PPS <ms>" for every pulse on the status pins (FIX = 2, PPS = 3).
//   SoftwareSerial cannot receive while it transmits, so setup() sends each
//   command only after the module answered the previous one.

#include <SoftwareSerial.h>

SoftwareSerial gps(8, 7);

const int STATUS_PINS[2] = {2, 3};
const char *STATUS_NAMES[2] = {"FIX", "PPS"};
bool level[2] = {false, false};
unsigned long riseMs[2];
char line[128];
int len = 0;

void onSentence() {
  char *star = strchr(line, '*');
  if (star != NULL) *star = '\0';
  if (strncmp(line, "$PMTK705,", 9) == 0) {
    *strchr(line + 9, ',') = '\0';
    Serial.print("FW ");
    Serial.println(line + 9);
  } else if (strncmp(line, "$PGTOP,11,", 10) == 0) {
    Serial.print("ANT ");
    Serial.println(line + 10);
  } else if (strncmp(line, "$GPGGA,", 7) == 0) {
    Serial.println("GGA");
  } else if (strncmp(line, "$PMTK001,", 9) != 0 && strncmp(line, "$PGACK,", 7) != 0) {
    Serial.println("OTHER");
  }
}

// Collects one character; returns true when a complete line is in `line`.
bool readLine() {
  char c = gps.read();
  if (c == '\n') {
    line[len] = '\0';
    len = 0;
    return true;
  }
  if (c != '\r' && len < (int)sizeof(line) - 1) line[len++] = c;
  return false;
}

void command(const char *sentence, const char *replyPrefix) {
  gps.println(sentence);
  while (true) {
    if (gps.available() && readLine()) {
      bool done = strncmp(line, replyPrefix, strlen(replyPrefix)) == 0;
      onSentence();
      if (done) return;
    }
  }
}

void setup() {
  Serial.begin(115200);
  gps.begin(9600);
  pinMode(STATUS_PINS[0], INPUT);
  pinMode(STATUS_PINS[1], INPUT);
  command("$PMTK314,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0*29", "$PMTK001,314,");
  command("$PMTK605*31", "$PMTK705,");
  command("$PGCMD,33,1*6C", "$PGACK,33,");
  command("$PMTK220,200*2C", "$PMTK001,220,");
}

void loop() {
  for (int i = 0; i < 2; i++) {
    bool now = digitalRead(STATUS_PINS[i]) == HIGH;
    if (now && !level[i]) {
      riseMs[i] = millis();
    } else if (!now && level[i]) {
      Serial.print(STATUS_NAMES[i]);
      Serial.print(" ");
      Serial.println(millis() - riseMs[i]);
    }
    level[i] = now;
  }
  if (gps.available() && readLine()) onSentence();
}
