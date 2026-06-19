// ============================================================
//  Smart Queue System: Keypad + LCD + Servo + LEDs + Buzzer + WiFi + Firebase
//  Board: NodeMCU ESP-32S
//  Wi-Fi SSID: iPhone | Password: Remy1004
// ============================================================

#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Keypad.h>
#include <ESP32Servo.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ---- WiFi Config --------------------------------------------
const char* ssid = "iPhone";
const char* password = "Remy1004";
const char* firebaseHost = "https://queuing-system-ed24f-default-rtdb.firebaseio.com/";

// ---- Keypad -------------------------------------------------
const byte ROWS = 4;
const byte COLS = 4;
char keys[ROWS][COLS] = {
  {'1','2','3','A'},
  {'4','5','6','B'},
  {'7','8','9','C'},
  {'*','0','#','D'}
};
byte rowPins[ROWS] = {13, 12, 14, 33};
byte colPins[COLS] = {32, 15, 16, 17};
Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);

// ---- LCD ----------------------------------------------------
LiquidCrystal_I2C lcd(0x27, 16, 2);

// ---- Servo --------------------------------------------------
Servo gateServo;
#define SERVO_PIN    19
#define SERVO_OPEN   90
#define SERVO_CLOSE  0

// ---- Teller Button ------------------------------------------
#define BTN_TELLER   5
#define DEBOUNCE_MS  50
unsigned long lastDebounce = 0;

// ---- LEDs ---------------------------------------------------
#define RED_LED    26
#define GREEN_LED  25

// ---- Buzzer -------------------------------------------------
#define BUZZER_PIN  27

// ---- Queue --------------------------------------------------
#define MAX_QUEUE 100
int  queue[MAX_QUEUE];
int  queueHead         = 0;
int  queueTail         = 0;
int  queueSize         = 0;
int  queueTokenCounter = 0;
int  currentToken      = 0;
int  nextToken         = 0;

// ---- State Machine ------------------------------------------
enum SystemState {
  STATE_IDLE,
  STATE_MENU,
  STATE_SHOW_TOKEN,
  STATE_WAIT_TOKEN,
  STATE_ENTRY_OPEN,
  STATE_SERVING,
  STATE_EXIT_OPEN
};
SystemState currentState = STATE_IDLE;
SystemState returnState  = STATE_IDLE;

// ---- Timing -------------------------------------------------
unsigned long stateStart = 0;
#define ENTRY_OPEN_MS  2000
#define EXIT_OPEN_MS   2000
#define TOKEN_SHOW_MS  3000

// ---- LCD toggle ---------------------------------------------
unsigned long lcdToggleTime = 0;
bool          showWaiting   = false;
#define LCD_TOGGLE_MS  4000

// ---- Token input --------------------------------------------
String inputBuffer    = "";
bool   awaitingInput  = false;
bool   wrongToken     = false;
unsigned long wrongBeepLast = 0;

// ---- Firebase & Sync Syncing Timers -------------------------
unsigned long lastFirebaseSync = 0;
#define FIREBASE_SYNC_MS  2500 // Poll every 2.5 seconds
unsigned long lastHeartbeat = 0;
#define HEARTBEAT_MS  6000     // 6 seconds heartbeat
unsigned long lastWifiRetry = 0;
#define WIFI_RETRY_MS  5000    // attempt reconnect at most every 5s (non-blocking)

// =============================================================
//  BUZZER CONTROL
// =============================================================
void beepOnce() {
  digitalWrite(BUZZER_PIN, HIGH);
  delay(300);
  digitalWrite(BUZZER_PIN, LOW);
}

void startWrongBeep() {
  wrongToken    = true;
  wrongBeepLast = millis();
  digitalWrite(BUZZER_PIN, HIGH);
  Serial.println("Wrong token - continuous beep started");
}

void stopWrongBeep() {
  wrongToken = false;
  digitalWrite(BUZZER_PIN, LOW);
  Serial.println("Correct token - beep stopped");
}

void handleWrongBeep() {
  if (!wrongToken) return;
  unsigned long now = millis();
  unsigned long elapsed = (now - wrongBeepLast) % 1000;
  if (elapsed < 200) {
    digitalWrite(BUZZER_PIN, HIGH);
  } else {
    digitalWrite(BUZZER_PIN, LOW);
  }
}

// =============================================================
//  LED CONTROL
// =============================================================
void setLED(bool redOn, bool greenOn) {
  digitalWrite(RED_LED,   redOn   ? HIGH : LOW);
  digitalWrite(GREEN_LED, greenOn ? HIGH : LOW);
}

void ledsWaiting() { setLED(false, true);  }
void ledsServing() { setLED(true,  false); }

// =============================================================
//  HELPERS
// =============================================================
String formatToken(int t) {
  if (t <= 0) return "---";
  String s = String(t);
  while (s.length() < 3) s = "0" + s;
  return s;
}

void lcdPrint(const char* l1, const char* l2) {
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print(l1);
  lcd.setCursor(0, 1); lcd.print(l2);
}

void openGate() {
  gateServo.write(SERVO_OPEN);
  Serial.println("Gate: OPEN");
}

void closeGate() {
  gateServo.write(SERVO_CLOSE);
  Serial.println("Gate: CLOSED");
}

void enqueue(int token) {
  if (queueSize < MAX_QUEUE) {
    queue[queueTail] = token;
    queueTail = (queueTail + 1) % MAX_QUEUE;
    queueSize++;
  }
}

int dequeue() {
  if (queueSize > 0) {
    int t = queue[queueHead];
    queue[queueHead] = 0;
    queueHead = (queueHead + 1) % MAX_QUEUE;
    queueSize--;
    return t;
  }
  return 0;
}

int peekNext() {
  if (queueSize > 0) return queue[queueHead];
  return 0;
}

bool isTellerPressed() {
  if (digitalRead(BTN_TELLER) == LOW) {
    if (millis() - lastDebounce > DEBOUNCE_MS) {
      lastDebounce = millis();
      while (digitalRead(BTN_TELLER) == LOW) delay(10);
      return true;
    }
  }
  return false;
}

void showIdle() {
  lcdPrint(" MTN Queue Sys  ", " Press A: Start ");
}

void showMenu() {
  lcdPrint("1. Join Queue   ", "2. Reservation  ");
}

void showServingScreen() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Serving: ");
  lcd.print(formatToken(currentToken));
  lcd.setCursor(0, 1);
  lcd.print("Next:    ");
  lcd.print(nextToken > 0 ? formatToken(nextToken) : "---");
}

void showWaitingScreen() {
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("Queue waiting:  ");
  lcd.setCursor(0, 1);
  lcd.print("   ");
  lcd.print(queueSize);
  lcd.print(" person(s)      ");
}

void showTokenInput() {
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("Enter token ###:");
  lcd.setCursor(0, 1); lcd.print("> ");
}

// =============================================================
//  FIREBASE REST SYNC METHODS
// =============================================================
void sendStateToFirebase() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String(firebaseHost) + "queue.json";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  // Format system state as string
  String stateStr = "IDLE";
  if (currentState == STATE_SERVING) stateStr = "SERVING";
  else if (currentState == STATE_WAIT_TOKEN) stateStr = "WAIT_TOKEN";
  else if (currentState == STATE_ENTRY_OPEN) stateStr = "ENTRY_OPEN";
  else if (currentState == STATE_EXIT_OPEN) stateStr = "EXIT_OPEN";

  StaticJsonDocument<200> doc;
  doc["current_token"] = currentToken;
  doc["next_token"] = nextToken;
  doc["queue_size"] = queueSize;
  doc["system_state"] = stateStr;
  doc["last_token_issued"] = queueTokenCounter;
  doc["gate_open"] = (gateServo.read() == SERVO_OPEN);

  String jsonStr;
  serializeJson(doc, jsonStr);

  int httpCode = http.PATCH(jsonStr);
  Serial.print("[Firebase] sendStateToFirebase HTTP code: ");
  Serial.println(httpCode);   // 200 = ok, 401/403 = rules rejecting the write
  http.end();
}

void updateTicketStatusInFirebase(int tokenVal, String status) {
  if (WiFi.status() != WL_CONNECTED || tokenVal <= 0) return;

  HTTPClient http;
  String url = String(firebaseHost) + "remote_tickets/" + String(tokenVal) + ".json";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<150> doc;
  doc["status"] = status;
  if (status == "serving") {
    JsonObject sv = doc.createNestedObject("served_time");
    sv[".sv"] = "timestamp";
  } else if (status == "completed") {
    JsonObject sv = doc.createNestedObject("completed_time");
    sv[".sv"] = "timestamp";
  }

  String jsonStr;
  serializeJson(doc, jsonStr);

  int httpCode = http.PATCH(jsonStr);
  Serial.print("[Firebase] updateTicketStatusInFirebase(");
  Serial.print(tokenVal);
  Serial.print(", ");
  Serial.print(status);
  Serial.print(") HTTP code: ");
  Serial.println(httpCode);   // 200 = ok, 401/403 = rules rejecting the write
  http.end();
}

void handleFirebaseSync() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String(firebaseHost) + "queue.json";
  http.begin(url);
  
  int httpCode = http.GET();
  if (httpCode == HTTP_CODE_OK) {
    String payload = http.getString();
    
    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, payload);
    if (!error) {
      // 1. Check for remote queue tickets issued by web app
      int firebaseLastIssued = doc["last_token_issued"] | 0;
      if (firebaseLastIssued > queueTokenCounter) {
        Serial.print("Remote joins detected! Local count: ");
        Serial.print(queueTokenCounter);
        Serial.print(" | Firebase count: ");
        Serial.println(firebaseLastIssued);

        // Fetch each ticket info and enqueue
        for (int i = queueTokenCounter + 1; i <= firebaseLastIssued; i++) {
          enqueue(i);
          updateTicketStatusInFirebase(i, "enqueued");
        }
        
        queueTokenCounter = firebaseLastIssued;
        nextToken = peekNext();
        sendStateToFirebase();
        
        // Update display if needed
        if (currentState == STATE_SERVING) {
          if (!showWaiting) showServingScreen();
          else showWaitingScreen();
        }
      }

      // 2. Check for manual admin actions
      bool adminGateOpen = doc["gate_open"] | false;
      bool currentGate = (gateServo.read() == SERVO_OPEN);
      if (adminGateOpen != currentGate) {
        if (adminGateOpen) openGate();
        else closeGate();
      }

      bool triggerBuzzer = doc["trigger_buzzer"] | false;
      if (triggerBuzzer) {
        beepOnce();
        // Reset the trigger trigger
        HTTPClient resetBuzzerHttp;
        resetBuzzerHttp.begin(String(firebaseHost) + "queue.json");
        resetBuzzerHttp.addHeader("Content-Type", "application/json");
        resetBuzzerHttp.PATCH("{\"trigger_buzzer\":false}");
        resetBuzzerHttp.end();
      }
    }
  }
  http.end();
}

void sendHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String(firebaseHost) + "queue.json";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  // Use Server Timestamp mapping
  String payload = "{\"last_updated\": {\".sv\": \"timestamp\"}}";
  int httpCode = http.PATCH(payload);
  Serial.print("[Firebase] sendHeartbeat HTTP code: ");
  Serial.println(httpCode);   // 200 = ok, 401/403 = rules rejecting the write
  http.end();
}

// =============================================================
//  SETUP
// =============================================================
void setup() {
  Serial.begin(115200);

  pinMode(BTN_TELLER, INPUT_PULLUP);
  pinMode(RED_LED,    OUTPUT);
  pinMode(GREEN_LED,  OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  digitalWrite(BUZZER_PIN, LOW);
  ledsWaiting();

  Wire.begin(21, 22);
  lcd.init();
  lcd.backlight();

  gateServo.attach(SERVO_PIN);
  closeGate();

  showIdle();
  Serial.println("System starting...");

  // ---- Connect to Wi-Fi ----
  lcdPrint("Connecting WiFi ", "SSID: iPhone    ");
  WiFi.begin(ssid, password);
  
  int retry = 0;
  while (WiFi.status() != WL_CONNECTED && retry < 15) {
    delay(1000);
    Serial.print(".");
    retry++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    lcdPrint("WiFi Connected! ", "System Ready    ");
    Serial.println("\nWiFi Connected!");
    Serial.print("IP: "); Serial.println(WiFi.localIP());
    delay(1500);
    
    // Sync current values to firebase to clear states
    sendStateToFirebase();
    sendHeartbeat();
  } else {
    lcdPrint("WiFi Failed!    ", "Running Offline ");
    Serial.println("\nWiFi connection failed. Running in offline fallback.");
    delay(2000);
  }

  showIdle();
}

// =============================================================
//  MAIN LOOP
// =============================================================
void loop() {
  char key           = keypad.getKey();
  bool tellerPressed = isTellerPressed();
  unsigned long now  = millis();

  // ---- Non-blocking WiFi auto-reconnect ----
  // If the link drops, retry at most once every WIFI_RETRY_MS. Never block the
  // loop with a while() so the keypad/servo/state machine keep running offline.
  if (WiFi.status() != WL_CONNECTED && (now - lastWifiRetry >= WIFI_RETRY_MS)) {
    lastWifiRetry = now;
    Serial.println("[WiFi] Disconnected — attempting reconnect...");
    WiFi.reconnect();
  }

  // Handle continuous wrong token beeping every loop
  handleWrongBeep();

  // ---- Periodic Firebase Sync ----
  if (now - lastFirebaseSync >= FIREBASE_SYNC_MS) {
    lastFirebaseSync = now;
    handleFirebaseSync();
  }

  if (now - lastHeartbeat >= HEARTBEAT_MS) {
    lastHeartbeat = now;
    sendHeartbeat();
  }

  // ── INTERRUPT: A pressed to register ──────────────────────
  if (key == 'A' &&
      currentState != STATE_MENU &&
      currentState != STATE_SHOW_TOKEN) {
    returnState  = currentState;
    currentState = STATE_MENU;
    if (wrongToken) stopWrongBeep();
    showMenu();
    Serial.println("INTERRUPTED — registration menu");
    return;
  }

  // ==========================================================
  switch (currentState) {

    // --------------------------------------------------------
    case STATE_IDLE:
      ledsWaiting();
      break;

    // --------------------------------------------------------
    case STATE_MENU:
      if (returnState == STATE_SERVING) ledsServing();
      else ledsWaiting();

      if (!key) break;

      if (key == '1') {
        queueTokenCounter++;
        enqueue(queueTokenCounter);
        nextToken = peekNext();

        lcd.clear();
        lcd.setCursor(0, 0); lcd.print("Queue ticket:   ");
        lcd.setCursor(0, 1);
        lcd.print("  Token: ");
        lcd.print(formatToken(queueTokenCounter));

        Serial.print("Token assigned: ");
        Serial.print(formatToken(queueTokenCounter));
        Serial.print(" | Queue size: ");
        Serial.println(queueSize);

        // Update Firebase
        sendStateToFirebase();
        updateTicketStatusInFirebase(queueTokenCounter, "enqueued");

        stateStart   = now;
        currentState = STATE_SHOW_TOKEN;

      } else if (key == '2') {
        beepOnce();
        
        // Treat reservation as priority enqueuing
        queueTokenCounter++;
        enqueue(queueTokenCounter);
        nextToken = peekNext();
        
        lcdPrint("Emergency/Reserv", "Ticket assigned!");
        delay(1500);

        lcd.clear();
        lcd.setCursor(0, 0); lcd.print("Queue ticket:   ");
        lcd.setCursor(0, 1);
        lcd.print("  Token: ");
        lcd.print(formatToken(queueTokenCounter));

        // Update Firebase with specific service type
        HTTPClient http;
        http.begin(String(firebaseHost) + "remote_tickets/" + String(queueTokenCounter) + ".json");
        http.addHeader("Content-Type", "application/json");
        http.PUT("{\"name\":\"Walk-in Priority\",\"service_type\":\"Reservation/Emergency\",\"join_time\":{\".sv\":\"timestamp\"},\"status\":\"enqueued\",\"source\":\"physical\"}");
        http.end();
        
        sendStateToFirebase();

        stateStart   = now;
        currentState = STATE_SHOW_TOKEN;

      } else if (key == 'A') {
        showMenu();

      } else {
        lcdPrint(" Invalid!       ", " Press 1 or 2   ");
        delay(1500);
        showMenu();
      }
      break;

    // --------------------------------------------------------
    case STATE_SHOW_TOKEN:
      if (returnState == STATE_SERVING) ledsServing();
      else ledsWaiting();

      if (now - stateStart >= TOKEN_SHOW_MS) {

        if (returnState == STATE_SERVING   ||
            returnState == STATE_ENTRY_OPEN ||
            returnState == STATE_EXIT_OPEN  ||
            returnState == STATE_WAIT_TOKEN) {
          currentState = returnState;
          if (currentState == STATE_SERVING) {
            ledsServing();
            showServingScreen();
          } else if (currentState == STATE_EXIT_OPEN) {
            ledsWaiting();
            lcdPrint("Please exit...  ", "Gate closing... ");
          } else if (currentState == STATE_WAIT_TOKEN) {
            ledsWaiting();
            showTokenInput();
          }

        } else {
          if (queueSize > 0 && currentToken == 0) {
            currentToken  = dequeue();
            nextToken     = peekNext();
            currentState  = STATE_WAIT_TOKEN;
            awaitingInput = false;
            inputBuffer   = "";
            ledsWaiting();
            showTokenInput();
            
            // Sync current token calling to Firebase
            sendStateToFirebase();
            updateTicketStatusInFirebase(currentToken, "serving");
            
            Serial.print("Calling token: ");
            Serial.println(formatToken(currentToken));
          } else {
            currentState = STATE_IDLE;
            ledsWaiting();
            showIdle();
            sendStateToFirebase();
          }
        }
      }
      break;

    // --------------------------------------------------------
    case STATE_WAIT_TOKEN:
      ledsWaiting();

      if (!awaitingInput) {
        awaitingInput = true;
        inputBuffer   = "";
        showTokenInput();
      }

      if (key >= '0' && key <= '9') {
        if (inputBuffer.length() < 3) {
          inputBuffer += key;
          lcd.setCursor(2, 1);
          lcd.print(inputBuffer + "   ");
        }
      } else if (key == '#') {
        int entered = inputBuffer.toInt();
        Serial.print("Entered: "); Serial.print(entered);
        Serial.print(" | Expected: "); Serial.println(currentToken);

        if (entered == currentToken) {
          stopWrongBeep();
          Serial.println("Correct — opening gate");
          openGate();
          ledsWaiting();
          currentState = STATE_ENTRY_OPEN;
          stateStart   = now;
          lcdPrint("Token correct!  ", "Please enter... ");
          sendStateToFirebase();
        } else {
          inputBuffer   = "";
          awaitingInput = false;
          startWrongBeep();
          lcdPrint("Invalid token!  ", "Try again...    ");
          delay(2000);
          showTokenInput();
          Serial.println("Wrong token — beeping");
        }

      } else if (key == '*') {
        inputBuffer   = "";
        awaitingInput = false;
        if (wrongToken) stopWrongBeep();
        lcd.setCursor(2, 1); lcd.print("   ");
      }
      break;

    // --------------------------------------------------------
    case STATE_ENTRY_OPEN:
      ledsWaiting();

      if (now - stateStart >= ENTRY_OPEN_MS) {
        closeGate();
        ledsServing();   // RED ON
        beepOnce();      // ONE BEEP
        currentState  = STATE_SERVING;
        stateStart    = now;
        lcdToggleTime = now;
        showWaiting   = false;
        showServingScreen();
        sendStateToFirebase();
        
        Serial.print("Serving: ");
        Serial.println(formatToken(currentToken));
        Serial.println("Teller: press button when done.");
      }
      break;

    // --------------------------------------------------------
    case STATE_SERVING:
      ledsServing();

      if (now - lcdToggleTime >= LCD_TOGGLE_MS) {
        lcdToggleTime = now;
        showWaiting   = !showWaiting;
        if (showWaiting) showWaitingScreen();
        else             showServingScreen();
      }

      if (tellerPressed) {
        Serial.println("Teller done — opening gate for exit");
        openGate();
        ledsWaiting();
        currentState = STATE_EXIT_OPEN;
        stateStart   = now;
        lcdPrint("Service done!   ", "Please exit...  ");
        
        // Update ticket status in firebase to completed
        updateTicketStatusInFirebase(currentToken, "completed");
        sendStateToFirebase();
      }
      break;

    // --------------------------------------------------------
    case STATE_EXIT_OPEN:
      ledsWaiting();

      if (now - stateStart >= EXIT_OPEN_MS) {
        closeGate();

        if (queueSize > 0) {
          currentToken  = dequeue();
          nextToken     = peekNext();
          currentState  = STATE_WAIT_TOKEN;
          awaitingInput = false;
          inputBuffer   = "";
          wrongToken    = false;
          digitalWrite(BUZZER_PIN, LOW);
          ledsWaiting();
          showTokenInput();
          
          sendStateToFirebase();
          updateTicketStatusInFirebase(currentToken, "serving");
          
          Serial.print("Next token: ");
          Serial.println(formatToken(currentToken));
        } else {
          currentToken = 0;
          nextToken    = 0;
          currentState = STATE_IDLE;
          wrongToken   = false;
          digitalWrite(BUZZER_PIN, LOW);
          ledsWaiting();
          showIdle();
          sendStateToFirebase();
          Serial.println("Queue empty — idle");
        }
      }
      break;
  }
}
