// KY-038 unit test sketch:
//   Polls D0 every 1 ms and timestamps its raw transitions. Once D0 has held
//   for SETTLE_MS it reports the settled change: how many transitions led to
//   it and, for a rise, when the later ones came (ms after the first). A0's
//   loud/quiet state is reported as it changes. The harness pokes
//   `set mic.soundLevel` and `set mic.threshold` across each other, so both
//   outputs must follow.

const int DOUT_PIN = 7;
const int AOUT_PIN = A0;
const unsigned long SETTLE_MS = 50;
const int MAX_EDGES = 4;

int stableDout;
int lastDout;
int edges = 0;
unsigned long edgeMs[MAX_EDGES];
unsigned long lastEdgeMs = 0;
bool loud = false;

void setup() {
  Serial.begin(115200);
  pinMode(DOUT_PIN, INPUT);
  stableDout = lastDout = digitalRead(DOUT_PIN);
}

void loop() {
  unsigned long now = millis();
  int dout = digitalRead(DOUT_PIN);
  if (dout != lastDout) {
    lastDout = dout;
    if (edges < MAX_EDGES) edgeMs[edges] = now;
    edges++;
    lastEdgeMs = now;
  }
  if (edges > 0 && now - lastEdgeMs >= SETTLE_MS) {
    if (dout == stableDout) {
      Serial.print("Glitch edges: ");
      Serial.println(edges);
    } else if (dout == HIGH) {
      Serial.print("Sound edges: ");
      Serial.println(edges);
      Serial.print("Sound chatter:");
      for (int i = 1; i < edges && i < MAX_EDGES; i++) {
        Serial.print(' ');
        Serial.print(edgeMs[i] - edgeMs[0]);
      }
      Serial.println();
    } else {
      Serial.print("Quiet edges: ");
      Serial.println(edges);
    }
    stableDout = dout;
    edges = 0;
  }

  // A0 carries soundLevel/1023 * 5 V, so analogRead ~= soundLevel.
  bool nowLoud = analogRead(AOUT_PIN) > 700;
  if (nowLoud != loud) {
    loud = nowLoud;
    Serial.println(loud ? "LOUD" : "QUIET");
  }

  delay(1);
}
