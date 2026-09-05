/*
 * =====================================================================================
 *  ROOMGUARD IoT: Smart Room Environment & RFID Access Monitoring System
 *  ESP32 DevKit V1 Production Firmware
 * =====================================================================================
 * 
 *  Hardware Connections:
 *  -----------------------------------------------------------------------------------
 *  Component       | Pin           | ESP32 DevKit V1 GPIO   | Voltage / Logic Level
 *  -----------------------------------------------------------------------------------
 *  RC522 RFID      | VCC           | 3V3 (3.3V ONLY!)       | 3.3V power (DO NOT USE 5V!)
 *  RC522 RFID      | RST           | GPIO 4                 | 3.3V
 *  RC522 RFID      | GND           | GND                    | Common Ground
 *  RC522 RFID      | MISO          | GPIO 19                | SPI MISO
 *  RC522 RFID      | MOSI          | GPIO 23                | SPI MOSI
 *  RC522 RFID      | SCK           | GPIO 18                | SPI Clock
 *  RC522 RFID      | SDA / SS      | GPIO 5                 | SPI Chip Select
 *  -----------------------------------------------------------------------------------
 *  GY-B11 BMP280   | VCC           | 3V3                    | 3.3V
 *  GY-B11 BMP280   | GND           | GND                    | Common Ground
 *  GY-B11 BMP280   | SCL           | GPIO 22                | I2C SCL
 *  GY-B11 BMP280   | SDA           | GPIO 21                | I2C SDA
 *  -----------------------------------------------------------------------------------
 *  DHT11 Sensor    | VCC           | 3V3                    | 3.3V
 *  DHT11 Sensor    | DATA          | GPIO 15                | 3.3V (10k pull-up to 3.3V)
 *  DHT11 Sensor    | GND           | GND                    | Common Ground
 *  -----------------------------------------------------------------------------------
 *  Buzzer          | Positive (+)  | GPIO 25                | Digital Output (3.3V)
 *  Buzzer          | Negative (-)  | GND                    | Common Ground
 *  -----------------------------------------------------------------------------------
 * 
 *  Required Arduino Libraries:
 *  - WiFi (Built-in ESP32 core)
 *  - HTTPClient (Built-in ESP32 core)
 *  - ArduinoJson (by Benoit Blanchon, v6 or v7)
 *  - Wire (Built-in I2C)
 *  - SPI (Built-in SPI)
 *  - MFRC522 (by GithubCommunity / miguelbalboa)
 *  - Adafruit BMP280 Library (by Adafruit)
 *  - DHT sensor library (by Adafruit)
 * =====================================================================================
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <SPI.h>
#include <MFRC522.h>
#include <Adafruit_BMP280.h>
#include <DHT.h>

// =====================================================================================
// 1. CENTRALIZED CONFIGURATION SECTION
// =====================================================================================

// Wi-Fi Network Credentials
const char* WIFI_SSID           = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD       = "YOUR_WIFI_PASSWORD";

// Backend API Server Configuration
// For local testing: Use computer's local IP (e.g. "http://192.168.1.100:5000")
// For cloud/production: Use full domain (e.g. "https://your-app.onrender.com")
const char* API_BASE_URL        = "http://192.168.1.100:5000";
const char* DEVICE_ID           = "ROOMGUARD-01";
const char* DEVICE_API_KEY      = "YOUR_DEVICE_API_KEY"; // Set matching DEVICE_API_KEY from backend .env
const char* FIRMWARE_VERSION    = "1.0.0";

// Polling & Transmission Intervals (in milliseconds)
const unsigned long HEARTBEAT_INTERVAL        = 30000;  // Send health status every 30 seconds
const unsigned long BMP280_UPDATE_INTERVAL    = 30000;  // Send environment data every 30 seconds
const unsigned long COMMAND_POLL_INTERVAL     = 5000;   // Check for pending commands every 5 seconds
const unsigned long WIFI_RECONNECT_INTERVAL   = 10000;  // Check Wi-Fi link every 10 seconds

// Hardware GPIO Pin Definitions
#define PIN_I2C_SDA             21
#define PIN_I2C_SCL             22
#define BMP280_I2C_ADDRESS      0x76    // Common GY-B11 address (or 0x77)

#define PIN_RFID_SS             5       // Chip select (SDA)
#define PIN_RFID_RST            4       // Reset pin
#define PIN_RFID_SCK            18      // SPI Clock
#define PIN_RFID_MISO           19      // SPI MISO
#define PIN_RFID_MOSI           23      // SPI MOSI

#define PIN_DHT11               15      // Digital data pin
#define DHT_TYPE                DHT11

#define PIN_BUZZER              25      // Buzzer feedback pin

// =====================================================================================
// 2. HARDWARE INSTANCES & GLOBAL STATE
// =====================================================================================

Adafruit_BMP280 bmp;
MFRC522 rfid(PIN_RFID_SS, PIN_RFID_RST);
DHT dht(PIN_DHT11, DHT_TYPE);

bool isBmpAvailable   = false;
bool isRfidAvailable  = false;
bool isDhtAvailable   = false;

// Scheduling timers (millis-based, non-blocking)
unsigned long lastHeartbeatTime     = 0;
unsigned long lastBmp280Time        = 0;
unsigned long lastCommandPollTime   = 0;
unsigned long lastWifiCheckTime     = 0;
unsigned long lastRfidScanTime      = 0;

// Non-blocking Buzzer Pattern State Machine
enum BuzzerPattern {
    BUZZER_IDLE,
    BUZZER_CLICK,
    BUZZER_ACCESS_GRANTED,
    BUZZER_ACCESS_DENIED
};

BuzzerPattern currentBuzzerPattern = BUZZER_IDLE;
unsigned long buzzerStepStart = 0;
int buzzerStep = 0;

// =====================================================================================
// 3. BUZZER CONTROL ROUTINES (NON-BLOCKING)
// =====================================================================================

void triggerBuzzer(BuzzerPattern pattern) {
    currentBuzzerPattern = pattern;
    buzzerStep = 0;
    buzzerStepStart = millis();
}

void updateBuzzer() {
    if (currentBuzzerPattern == BUZZER_IDLE) return;
    unsigned long elapsed = millis() - buzzerStepStart;

    switch (currentBuzzerPattern) {
        case BUZZER_CLICK:
            // Single short 40ms click on RFID detect
            if (buzzerStep == 0) {
                digitalWrite(PIN_BUZZER, HIGH);
                buzzerStep = 1;
            } else if (buzzerStep == 1 && elapsed >= 40) {
                digitalWrite(PIN_BUZZER, LOW);
                currentBuzzerPattern = BUZZER_IDLE;
            }
            break;

        case BUZZER_ACCESS_GRANTED:
            // Two pleasant high-pitched chirps: 70ms ON, 50ms OFF, 90ms ON
            if (buzzerStep == 0) {
                digitalWrite(PIN_BUZZER, HIGH);
                buzzerStep = 1;
            } else if (buzzerStep == 1 && elapsed >= 70) {
                digitalWrite(PIN_BUZZER, LOW);
                buzzerStepStart = millis();
                buzzerStep = 2;
            } else if (buzzerStep == 2 && elapsed >= 50) {
                digitalWrite(PIN_BUZZER, HIGH);
                buzzerStepStart = millis();
                buzzerStep = 3;
            } else if (buzzerStep == 3 && elapsed >= 90) {
                digitalWrite(PIN_BUZZER, LOW);
                currentBuzzerPattern = BUZZER_IDLE;
            }
            break;

        case BUZZER_ACCESS_DENIED:
            // Two distinct warning buzzes: 180ms ON, 80ms OFF, 220ms ON
            if (buzzerStep == 0) {
                digitalWrite(PIN_BUZZER, HIGH);
                buzzerStep = 1;
            } else if (buzzerStep == 1 && elapsed >= 180) {
                digitalWrite(PIN_BUZZER, LOW);
                buzzerStepStart = millis();
                buzzerStep = 2;
            } else if (buzzerStep == 2 && elapsed >= 80) {
                digitalWrite(PIN_BUZZER, HIGH);
                buzzerStepStart = millis();
                buzzerStep = 3;
            } else if (buzzerStep == 3 && elapsed >= 220) {
                digitalWrite(PIN_BUZZER, LOW);
                currentBuzzerPattern = BUZZER_IDLE;
            }
            break;

        default:
            digitalWrite(PIN_BUZZER, LOW);
            currentBuzzerPattern = BUZZER_IDLE;
            break;
    }
}

// =====================================================================================
// 4. NETWORK & HTTP HELPER ROUTINES
// =====================================================================================

void setupWiFi() {
    Serial.print("\n[WIFI] Connecting to SSID: ");
    Serial.println(WIFI_SSID);

    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(500);
        Serial.print(".");
        attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\n[WIFI] Connected successfully!");
        Serial.print("[WIFI] IP Address: ");
        Serial.println(WiFi.localIP());
        Serial.print("[WIFI] RSSI: ");
        Serial.print(WiFi.RSSI());
        Serial.println(" dBm");
    } else {
        Serial.println("\n[WIFI] Initial connection timed out. Background reconnect active.");
    }
}

void verifyWiFiConnection() {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[WIFI] Disconnected! Attempting auto-reconnect...");
        WiFi.disconnect();
        WiFi.reconnect();
    }
}

// Client instances for standard HTTP and secure HTTPS cloud connections
WiFiClient plainClient;
WiFiClientSecure secureClient;

bool openHttpRequest(HTTPClient &http, const String &url) {
    if (url.startsWith("https://")) {
        secureClient.setInsecure(); // Allows SSL connection to cloud services without local CA certs
        return http.begin(secureClient, url);
    } else {
        return http.begin(plainClient, url);
    }
}

// =====================================================================================
// 5. API CLIENT FUNCTIONS
// =====================================================================================

// Send device status heartbeat
void sendHeartbeat() {
    if (WiFi.status() != WL_CONNECTED) return;

    HTTPClient http;
    String url = String(API_BASE_URL) + "/api/device/heartbeat";
    openHttpRequest(http, url);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("x-api-key", DEVICE_API_KEY);
    http.setTimeout(5000);

    StaticJsonDocument<256> doc;
    doc["device_id"]        = DEVICE_ID;
    doc["firmware_version"] = FIRMWARE_VERSION;
    doc["uptime"]           = (millis() / 1000);
    doc["wifi_rssi"]        = WiFi.RSSI();
    doc["bmp280"]           = isBmpAvailable;
    doc["rc522"]            = isRfidAvailable;
    doc["dht11"]            = isDhtAvailable;

    String requestBody;
    serializeJson(doc, requestBody);

    int httpResponseCode = http.POST(requestBody);
    if (httpResponseCode > 0) {
        Serial.printf("[HEARTBEAT] Sent status. HTTP %d\n", httpResponseCode);
    } else {
        Serial.printf("[HEARTBEAT] Error sending heartbeat: %s\n", http.errorToString(httpResponseCode).c_str());
    }
    http.end();
}

// Send BMP280 continuous environment readings
void sendBmp280Readings() {
    if (WiFi.status() != WL_CONNECTED) return;

    float temperature = 0.0;
    float pressure = 0.0;

    if (isBmpAvailable) {
        temperature = bmp.readTemperature();
        pressure = bmp.readPressure() / 100.0F; // Convert Pa to hPa

        // Check for NaN or read errors
        if (isnan(temperature) || isnan(pressure) || pressure <= 300.0) {
            Serial.println("[BMP280] Warning: Invalid sensor reading, skipping upload.");
            return;
        }
    } else {
        Serial.println("[BMP280] Sensor not available. Skipping telemetry.");
        return;
    }

    HTTPClient http;
    String url = String(API_BASE_URL) + "/api/device/sensor-data";
    openHttpRequest(http, url);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("x-api-key", DEVICE_API_KEY);
    http.setTimeout(5000);

    StaticJsonDocument<200> doc;
    doc["device_id"]   = DEVICE_ID;
    doc["temperature"] = serialized(String(temperature, 2));
    doc["pressure"]    = serialized(String(pressure, 2));

    String requestBody;
    serializeJson(doc, requestBody);

    int httpResponseCode = http.POST(requestBody);
    if (httpResponseCode > 0) {
        Serial.printf("[BMP280] Telemetry sent (%.2f °C, %.2f hPa). HTTP %d\n", temperature, pressure, httpResponseCode);
    } else {
        Serial.printf("[BMP280] Telemetry upload failed: %s\n", http.errorToString(httpResponseCode).c_str());
    }
    http.end();
}

// Send RFID detection event to backend for authorization decision
void handleRfidCardDetected(String uidString) {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[RFID] Cannot verify: Wi-Fi disconnected.");
        triggerBuzzer(BUZZER_ACCESS_DENIED);
        return;
    }

    // Audible immediate feedback: click on detect
    triggerBuzzer(BUZZER_CLICK);

    HTTPClient http;
    String url = String(API_BASE_URL) + "/api/device/rfid-event";
    openHttpRequest(http, url);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("x-api-key", DEVICE_API_KEY);
    http.setTimeout(5000);

    StaticJsonDocument<200> doc;
    doc["device_id"]  = DEVICE_ID;
    doc["uid"]        = uidString;
    doc["event_type"] = "RFID_ATTEMPT";

    String requestBody;
    serializeJson(doc, requestBody);

    int httpResponseCode = http.POST(requestBody);
    if (httpResponseCode == 200) {
        String responsePayload = http.getString();
        StaticJsonDocument<300> resDoc;
        DeserializationError err = deserializeJson(resDoc, responsePayload);

        if (!err && resDoc["success"].as<bool>()) {
            bool authorized = resDoc["data"]["authorized"].as<bool>();
            const char* label = resDoc["data"]["card_label"] | "Unknown";

            if (authorized) {
                Serial.printf("[RFID] >>> ACCESS GRANTED <<< Card: %s (UID: %s)\n", label, uidString.c_str());
                triggerBuzzer(BUZZER_ACCESS_GRANTED);
            } else {
                Serial.printf("[RFID] >>> ACCESS DENIED <<< UID: %s (Unauthorized)\n", uidString.c_str());
                triggerBuzzer(BUZZER_ACCESS_DENIED);
            }
        } else {
            Serial.println("[RFID] Malformed authorization response from backend.");
            triggerBuzzer(BUZZER_ACCESS_DENIED);
        }
    } else {
        Serial.printf("[RFID] API verification failed. HTTP %d\n", httpResponseCode);
        triggerBuzzer(BUZZER_ACCESS_DENIED);
    }
    http.end();
}

// Check and process on-demand device commands (e.g., REQUEST_DHT11)
void pollPendingCommands() {
    if (WiFi.status() != WL_CONNECTED) return;

    HTTPClient http;
    String url = String(API_BASE_URL) + "/api/device/commands?device_id=" + String(DEVICE_ID);
    openHttpRequest(http, url);
    http.addHeader("x-api-key", DEVICE_API_KEY);
    http.setTimeout(5000);

    int httpResponseCode = http.GET();
    if (httpResponseCode == 200) {
        String payload = http.getString();
        StaticJsonDocument<384> doc;
        DeserializationError err = deserializeJson(doc, payload);

        if (!err && doc["success"].as<bool>()) {
            // Check if there is an active command
            if (!doc["data"]["command"].isNull()) {
                int commandId = doc["data"]["command"]["id"].as<int>();
                String commandName = doc["data"]["command"]["command"].as<String>();

                Serial.printf("[COMMAND] Received Command ID %d: %s\n", commandId, commandName.c_str());

                if (commandName == "REQUEST_DHT11") {
                    executeDht11Measurement(commandId);
                }
            }
        }
    }
    http.end();
}

// Execute on-demand DHT11 measurement and submit result
void executeDht11Measurement(int commandId) {
    Serial.println("[DHT11] Taking on-demand measurement...");

    float temperature = dht.readTemperature();
    float humidity    = dht.readHumidity();

    bool readSuccess = true;
    if (isnan(temperature) || isnan(humidity)) {
        Serial.println("[DHT11] Failed to read from sensor!");
        readSuccess = false;
        temperature = 0.0;
        humidity = 0.0;
    } else {
        Serial.printf("[DHT11] Measurement: %.1f °C, %.1f %%\n", temperature, humidity);
    }

    HTTPClient http;
    String url = String(API_BASE_URL) + "/api/device/commands/" + String(commandId) + "/result";
    openHttpRequest(http, url);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("x-api-key", DEVICE_API_KEY);
    http.setTimeout(5000);

    StaticJsonDocument<256> doc;
    doc["device_id"]   = DEVICE_ID;
    doc["success"]     = readSuccess;
    doc["temperature"] = serialized(String(temperature, 1));
    doc["humidity"]    = serialized(String(humidity, 1));

    String requestBody;
    serializeJson(doc, requestBody);

    int httpResponseCode = http.POST(requestBody);
    if (httpResponseCode == 200) {
        Serial.printf("[DHT11] Result submitted for Command %d. HTTP 200\n", commandId);
    } else {
        Serial.printf("[DHT11] Failed to submit command result: %s\n", http.errorToString(httpResponseCode).c_str());
    }
    http.end();
}

// =====================================================================================
// 6. ARDUINO SETUP ROUTINE
// =====================================================================================

void setup() {
    Serial.begin(115200);
    delay(500);

    Serial.println("\n==================================================");
    Serial.println("   ROOMGUARD IoT - ESP32 Firmware Starting");
    Serial.println("==================================================");

    // 1. Initialize Buzzer Output
    pinMode(PIN_BUZZER, OUTPUT);
    digitalWrite(PIN_BUZZER, LOW);

    // Initial boot chirp
    triggerBuzzer(BUZZER_CLICK);

    // 2. Initialize I2C and BMP280 Sensor
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
    if (bmp.begin(BMP280_I2C_ADDRESS)) {
        isBmpAvailable = true;
        Serial.println("[INIT] GY-B11 BMP280 initialized successfully.");
        // Configure standard sampling parameters
        bmp.setSampling(Adafruit_BMP280::MODE_NORMAL,
                        Adafruit_BMP280::SAMPLING_X2,
                        Adafruit_BMP280::SAMPLING_X16,
                        Adafruit_BMP280::FILTER_X16,
                        Adafruit_BMP280::STANDBY_MS_500);
    } else {
        isBmpAvailable = false;
        Serial.println("[INIT] WARNING: GY-B11 BMP280 not found! Check SDA/SCL wiring or address.");
    }

    // 3. Initialize SPI and RC522 RFID Reader
    SPI.begin(PIN_RFID_SCK, PIN_RFID_MISO, PIN_RFID_MOSI, PIN_RFID_SS);
    rfid.PCD_Init();
    delay(10);
    byte rfidVersion = rfid.PCD_ReadRegister(rfid.VersionReg);
    if (rfidVersion != 0x00 && rfidVersion != 0xFF) {
        isRfidAvailable = true;
        Serial.printf("[INIT] RC522 RFID reader online. Chip version: 0x%02X\n", rfidVersion);
    } else {
        isRfidAvailable = false;
        Serial.println("[INIT] WARNING: RC522 RFID reader not responding on SPI! Check 3.3V wiring.");
    }

    // 4. Initialize DHT11 Sensor
    dht.begin();
    float testTemp = dht.readTemperature();
    if (!isnan(testTemp)) {
        isDhtAvailable = true;
        Serial.println("[INIT] DHT11 sensor verified online.");
    } else {
        isDhtAvailable = true; // Still marked enabled for on-demand retry
        Serial.println("[INIT] DHT11 sensor initialized (will read on command).");
    }

    // 5. Connect to Wi-Fi
    setupWiFi();

    // 6. Send Initial Startup Heartbeat
    sendHeartbeat();
    Serial.println("[INIT] System initialization complete. Main loop running.\n");
}

// =====================================================================================
// 7. ARDUINO MAIN LOOP (NON-BLOCKING SCHEDULER)
// =====================================================================================

void loop() {
    unsigned long currentMillis = millis();

    // 1. Maintain non-blocking buzzer audio pulses
    updateBuzzer();

    // 2. High-priority scan: Check for RFID tag / card presence
    if (isRfidAvailable && (currentMillis - lastRfidScanTime >= 100)) {
        lastRfidScanTime = currentMillis;

        if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
            // Convert UID bytes to uppercase hex format (e.g., "A1B2C3D4")
            String uidString = "";
            for (byte i = 0; i < rfid.uid.size; i++) {
                if (rfid.uid.uidByte[i] < 0x10) uidString += "0";
                uidString += String(rfid.uid.uidByte[i], HEX);
            }
            uidString.toUpperCase();

            Serial.printf("[RFID] Card Detected! UID: %s\n", uidString.c_str());
            handleRfidCardDetected(uidString);

            // Halt PICC and stop encryption on PCD
            rfid.PICC_HaltA();
            rfid.PCD_StopCrypto1();
        }
    }

    // 3. Periodic Wi-Fi connection health check
    if (currentMillis - lastWifiCheckTime >= WIFI_RECONNECT_INTERVAL) {
        lastWifiCheckTime = currentMillis;
        verifyWiFiConnection();
    }

    // 4. Periodic Heartbeat transmission (Default: 30s)
    if (currentMillis - lastHeartbeatTime >= HEARTBEAT_INTERVAL) {
        lastHeartbeatTime = currentMillis;
        sendHeartbeat();
    }

    // 5. Periodic BMP280 environment readings (Default: 30s)
    if (currentMillis - lastBmp280Time >= BMP280_UPDATE_INTERVAL) {
        lastBmp280Time = currentMillis;
        sendBmp280Readings();
    }

    // 6. Periodic pending command polling (Default: 5s)
    if (currentMillis - lastCommandPollTime >= COMMAND_POLL_INTERVAL) {
        lastCommandPollTime = currentMillis;
        pollPendingCommands();
    }

    // Short yield to feed the ESP32 watchdog timer
    yield();
}
