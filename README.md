# ROOMGUARD IoT - Smart Room Environment & RFID Access Monitoring System

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform: ESP32](https://img.shields.io/badge/Platform-ESP32%20DevKit%20V1-red.svg)](https://www.espressif.com/)
[![Node: v18+](https://img.shields.io/badge/Node-v18%2B-green.svg)](https://nodejs.org/)
[![Database: PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL-blue.svg)](https://www.postgresql.org/)
[![Frontend: React + Vite](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61dafb.svg)](https://vitejs.dev/)

An enterprise-ready, end-to-end IoT monitoring and physical security platform. An **ESP32 DevKit V1** continuously tracks room climate with a **GY-B11 BMP280** sensor, reads on-demand precision telemetry with a **DHT11**, authenticates keycards via an **RC522 RFID reader** against a secure backend database, provides non-blocking audible buzzer feedback, and streams live telemetry to a responsive web dashboard accessible globally.

---

## Key Features

- **Real-Time Environment Monitoring**: Continuous atmospheric pressure (hPa) and ambient temperature (°C) telemetry sampled by GY-B11 BMP280.
- **On-Demand DHT11 Climate Ingestion**: Dashboard button triggers an asynchronous device command queue (`REQUEST_DHT11`) with animated status and timeout safeguards.
- **Strict Server-Side RFID Authorization**: RC522 reads RFID card UIDs, normalizes to hex, and submits to the backend. The backend strictly determines `ACCESS_GRANTED` vs `ACCESS_DENIED` against an encrypted database table.
- **Non-Blocking Audible Feedback**: Buzzer produces distinct sound patterns for access granted, access denied, and card detection ticks without halting the ESP32 event loop.
- **Live Device Heartbeat & Health Monitoring**: Tracks Wi-Fi RSSI signal strength, device uptime, sensor availability flags, and dynamically flags devices as 🟢 `ONLINE` or 🔴 `OFFLINE`.
- **Zero-Friction Dual Database Adapter**: Built for production **PostgreSQL** with zero-config automated **SQLite/in-memory fallback** for immediate local development and testing.
- **Server-Sent Events (SSE) Push Stream**: Live dashboard updates for sensor telemetry and RFID swipes without client-side page refreshing.
- **Standalone Hardware Simulator**: Test all backend endpoints, command queues, and dashboard visuals without physical hardware.

---

## System Architecture

```
                                    +-----------------------------------------+
                                    |         React + Vite Web UI             |
                                    | (Dashboard, Charts, RFID Log, Controls) |
                                    +-----------------------------------------+
                                                         ^
                                                         | HTTPS / SSE
                                                         v
+------------------------+  Wi-Fi   +-----------------------------------------+
|    ESP32 DevKit V1     |  HTTP    |      Node.js / Express REST API         |
| ---------------------- | -------> | --------------------------------------- |
| - BMP280 (I2C)         |          | - Device Auth (x-api-key)               |
| - RC522 RFID (SPI)     | <------- | - RFID Authorization Engine             |
| - DHT11 (GPIO)         |  Commands| - Command Queue System                  |
| - Active Buzzer (GPIO) |          | - Real-time SSE Broadcaster             |
+------------------------+          +-----------------------------------------+
                                                         ^
                                                         | SQL Queries
                                                         v
                                    +-----------------------------------------+
                                    |           PostgreSQL Database           |
                                    | (devices, authorized_rfid_cards, logs)  |
                                    +-----------------------------------------+
```

---

## Directory Structure

```
roomguard-iot/
├── frontend/                     # React 18 + Vite Web Dashboard
│   ├── src/
│   │   ├── components/           # UI cards, tables, charts, status indicators
│   │   ├── services/             # REST API client & SSE consumer
│   │   ├── App.jsx               # Application shell & real-time state
│   │   └── main.jsx              # React entrypoint
│   ├── package.json
│   └── vite.config.js
│
├── backend/                      # Node.js + Express REST API Server
│   ├── src/
│   │   ├── controllers/          # Telemetry, RFID auth, command queue logic
│   │   ├── database/             # PostgreSQL connection pool & SQLite fallback
│   │   ├── middleware/           # API Key authentication & centralized error handler
│   │   ├── routes/               # API route definitions
│   │   └── server.js             # HTTP server bootstrap & SSE broadcaster
│   ├── test/                     # Automated test suite (mocha/supertest)
│   ├── package.json
│   └── .env.example
│
├── esp32/                        # ESP32 C++ Arduino Firmware
│   └── roomguard/
│       └── roomguard.ino         # Main firmware sketch with centralized pinout & Wi-Fi
│
├── database/
│   └── schema.sql                # PostgreSQL DDL schema & initial seed data
│
├── scripts/
│   └── simulate_esp32.js         # Hardware simulator for testing without breadboards
│
├── docs/
│   ├── HARDWARE.md               # Electrical wiring diagrams, pinout table, 3.3V safety
│   ├── API.md                    # REST API endpoints & JSON payloads
│   └── DEPLOYMENT.md             # Worldwide hosting (Render, Railway, Cloudflare Tunnels)
│
├── .gitignore
└── README.md
```

---

## Hardware Pinout Reference

> [!CAUTION]
> The **RC522 RFID Reader** must be powered by **3.3V ONLY**. Connecting 5V will permanently destroy the MFRC522 RF transceiver.

| Module | Pin | ESP32 GPIO | Voltage | Purpose |
|---|---|---|---|---|
| **RC522 RFID** | VCC | **3V3** | **3.3V ONLY** | Power |
| RC522 RFID | RST | GPIO 4 | 3.3V | Reset |
| RC522 RFID | GND | GND | GND | Ground |
| RC522 RFID | MISO | GPIO 19 | 3.3V | SPI Master In |
| RC522 RFID | MOSI | GPIO 23 | 3.3V | SPI Master Out |
| RC522 RFID | SCK | GPIO 18 | 3.3V | SPI Clock |
| RC522 RFID | SDA / SS | GPIO 5 | 3.3V | SPI Chip Select |
| **BMP280** | SCL | GPIO 22 | 3.3V | I2C Clock |
| BMP280 | SDA | GPIO 21 | 3.3V | I2C Data |
| **DHT11** | DATA | GPIO 15 | 3.3V | 1-Wire Digital (10kΩ pull-up) |
| **Buzzer** | + | GPIO 25 | 3.3V | Digital Tone Output |

*(See [docs/HARDWARE.md](docs/HARDWARE.md) for detailed assembly instructions).*

---

## Quickstart Guide

### 1. Start the Backend API
```bash
cd backend
npm install
npm run dev
```
The backend starts on `http://localhost:5000`. By default, it automatically seeds an embedded database if PostgreSQL is not connected, allowing instant testing out of the box!

### 2. Start the Frontend Dashboard
```bash
cd ../frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your web browser.

### 3. Run Automated Tests
```bash
cd ../backend
npm test
```
Executes comprehensive automated tests verifying device authentication, heartbeat tracking, sensor ingestion, RFID authorization logic, command queuing, and error responses.

### 4. Run the ESP32 Hardware Simulator
Want to test the full system before wiring physical hardware?
```bash
cd ..
node scripts/simulate_esp32.js
```
The simulator acts as a live ESP32: sending 30s heartbeats, uploading BMP280 readings, simulating RFID card swipes, and processing on-demand DHT11 requests from the dashboard!

---

## Flashing the ESP32 Firmware

1. Install [Arduino IDE](https://www.arduino.cc/en/software).
2. Add ESP32 board support:
   - Go to **File -> Preferences -> Additional Board Manager URLs**.
   - Add: `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
   - Install **esp32 by Espressif Systems** under Board Manager.
3. Install required libraries via Library Manager:
   - `ArduinoJson` (v6 or v7)
   - `MFRC522`
   - `Adafruit BMP280 Library`
   - `DHT sensor library` (Adafruit)
4. Open `esp32/roomguard/roomguard.ino`.
5. Update your Wi-Fi credentials (`WIFI_SSID`, `WIFI_PASSWORD`) and backend server URL (`API_BASE_URL`).
6. Connect ESP32 DevKit V1 via USB, select **ESP32 Dev Module**, and click **Upload**.

---

## Remote Access From Anywhere

To access your dashboard from your smartphone or anywhere outside your local Wi-Fi:
- Deploy free to **Render** or **Railway** (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)).
- Or use **Cloudflare Tunnels** locally:
  ```bash
  cloudflared tunnel --url http://localhost:5000
  ```
  Enter the provided HTTPS URL into `roomguard.ino` and access the dashboard on any device worldwide!

---

## License

This project is open source and available under the [MIT License](LICENSE).
