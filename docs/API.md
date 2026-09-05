# ROOMGUARD IoT - REST API Reference Documentation

This document describes the complete REST API interface for device telemetry ingestion, RFID authorization, on-demand command execution, and real-time dashboard data streams.

---

## 1. Global Specifications

- **Base URL**: `http://<server-ip>:5000/api` or `https://<your-domain>/api`
- **Content-Type**: `application/json`
- **Device Authentication**: Ingest endpoints require the `x-api-key` HTTP header.
- **Consistent Response Schema**:
  - **Success**:
    ```json
    {
      "success": true,
      "data": { ... }
    }
    ```
  - **Error**:
    ```json
    {
      "success": false,
      "error": {
        "code": "ERROR_CODE_STRING",
        "message": "Human-readable explanation of error"
      }
    }
    ```

---

## 2. Device Endpoints (ESP32 Gateway)

### 2.1 Device Heartbeat
Sends periodic health metrics (uptime, Wi-Fi RSSI, sensor hardware statuses).

- **Method**: `POST`
- **Route**: `/api/device/heartbeat`
- **Headers**:
  - `Content-Type: application/json`
  - `x-api-key: <DEVICE_API_KEY>`
- **Request Body**:
  ```json
  {
    "device_id": "ROOMGUARD-01",
    "firmware_version": "1.0.0",
    "uptime": 123456,
    "wifi_rssi": -57,
    "bmp280": true,
    "rc522": true,
    "dht11": true
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "device_id": "ROOMGUARD-01",
      "status": "ONLINE",
      "acknowledged_at": "2026-09-05T02:00:00.000Z"
    }
  }
  ```

---

### 2.2 Continuous BMP280 Sensor Ingestion
Periodically transmits temperature and atmospheric pressure measurements.

- **Method**: `POST`
- **Route**: `/api/device/sensor-data`
- **Headers**:
  - `Content-Type: application/json`
  - `x-api-key: <DEVICE_API_KEY>`
- **Request Body**:
  ```json
  {
    "device_id": "ROOMGUARD-01",
    "temperature": 27.4,
    "pressure": 1008.2
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "success": true,
    "data": {
      "id": 482,
      "recorded_at": "2026-09-05T02:00:30.000Z"
    }
  }
  ```

---

### 2.3 RFID Access Attempt & Authorization
Evaluates an RFID tag UID against the `authorized_rfid_cards` table and logs the event.

- **Method**: `POST`
- **Route**: `/api/device/rfid-event`
- **Headers**:
  - `Content-Type: application/json`
  - `x-api-key: <DEVICE_API_KEY>`
- **Request Body**:
  ```json
  {
    "device_id": "ROOMGUARD-01",
    "uid": "A1B2C3D4",
    "event_type": "RFID_ATTEMPT"
  }
  ```
- **Response - Authorized (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "authorized": true,
      "uid": "A1B2C3D4",
      "card_label": "Master Admin Keycard",
      "event_type": "ACCESS_GRANTED",
      "timestamp": "2026-09-05T02:01:15.000Z"
    }
  }
  ```
- **Response - Unauthorized (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "authorized": false,
      "uid": "99XX0011",
      "card_label": "Unknown RFID",
      "event_type": "ACCESS_DENIED",
      "timestamp": "2026-09-05T02:01:25.000Z"
    }
  }
  ```

---

### 2.4 Poll Pending Device Commands
ESP32 polls this endpoint periodically to receive server-queued actions (e.g. `REQUEST_DHT11`).

- **Method**: `GET`
- **Route**: `/api/device/commands?device_id=ROOMGUARD-01`
- **Headers**:
  - `x-api-key: <DEVICE_API_KEY>`
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "command": {
        "id": 12,
        "device_id": "ROOMGUARD-01",
        "command": "REQUEST_DHT11",
        "status": "PROCESSING",
        "created_at": "2026-09-05T02:02:00.000Z"
      }
    }
  }
  ```
  *(If no command is pending, `command` is `null`)*

---

### 2.5 Submit Command Result
ESP32 reports completion of a queued command with measurement results.

- **Method**: `POST`
- **Route**: `/api/device/commands/:id/result`
- **Headers**:
  - `Content-Type: application/json`
  - `x-api-key: <DEVICE_API_KEY>`
- **Request Body**:
  ```json
  {
    "device_id": "ROOMGUARD-01",
    "success": true,
    "temperature": 28.1,
    "humidity": 67.0
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "command_id": 12,
      "status": "COMPLETED",
      "processed_at": "2026-09-05T02:02:05.000Z"
    }
  }
  ```

---

## 3. Dashboard Endpoints (Web Frontend)

### 3.1 Overview Status & Latest Telemetry
Fetches aggregated overview metrics for primary dashboard display.

- **Method**: `GET`
- **Route**: `/api/dashboard/overview?device_id=ROOMGUARD-01`
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "device": {
        "id": "ROOMGUARD-01",
        "name": "Server Room Sentinel",
        "status": "ONLINE",
        "is_online": true,
        "wifi_rssi": -58,
        "uptime_seconds": 12450,
        "firmware_version": "1.0.0",
        "last_ping": "2026-09-05T02:03:00.000Z"
      },
      "latest_bmp280": {
        "temperature": 27.4,
        "pressure": 1008.2,
        "recorded_at": "2026-09-05T02:02:50.000Z"
      },
      "latest_dht11": {
        "temperature": 28.1,
        "humidity": 67.0,
        "measured_at": "2026-09-05T02:02:05.000Z"
      },
      "latest_rfid": {
        "uid": "A1B2C3D4",
        "card_label": "Master Admin Keycard",
        "event_type": "ACCESS_GRANTED",
        "timestamp": "2026-09-05T02:01:15.000Z"
      }
    }
  }
  ```

---

### 3.2 Access Events History (Paginated)
Retrieves historical access log events with pagination and filtering.

- **Method**: `GET`
- **Route**: `/api/dashboard/access-events?page=1&limit=10&event_type=ACCESS_GRANTED`
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "events": [
        {
          "id": 98,
          "uid": "A1B2C3D4",
          "card_label": "Master Admin Keycard",
          "event_type": "ACCESS_GRANTED",
          "created_at": "2026-09-05T02:01:15.000Z"
        }
      ],
      "pagination": {
        "page": 1,
        "limit": 10,
        "total_records": 1,
        "total_pages": 1
      }
    }
  }
  ```

---

### 3.3 Historical Environment Telemetry (Charts)
Returns BMP280 time-series data filtered and downsampled across specified timeframes.

- **Method**: `GET`
- **Route**: `/api/dashboard/environment?device_id=ROOMGUARD-01&range=24h`
- **Query Parameters**:
  - `range`: `1h`, `6h`, `24h`, `7d` (default: `24h`)
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "range": "24h",
      "count": 48,
      "readings": [
        {
          "timestamp": "2026-09-04T02:00:00.000Z",
          "temperature": 26.8,
          "pressure": 1010.5
        },
        {
          "timestamp": "2026-09-05T02:00:00.000Z",
          "temperature": 27.4,
          "pressure": 1008.2
        }
      ]
    }
  }
  ```

---

### 3.4 Request On-Demand DHT11 Measurement
Frontend triggers on-demand DHT11 reading by queuing a `REQUEST_DHT11` command.

- **Method**: `POST`
- **Route**: `/api/dashboard/dht11/request`
- **Request Body**:
  ```json
  {
    "device_id": "ROOMGUARD-01"
  }
  ```
- **Response (202 Accepted)**:
  ```json
  {
    "success": true,
    "data": {
      "command_id": 15,
      "status": "PENDING",
      "message": "DHT11 measurement request queued for ESP32."
    }
  }
  ```

---

### 3.5 Check DHT11 Command Status / Latest Reading
Polls status of an active measurement or retrieves the most recent reading.

- **Method**: `GET`
- **Route**: `/api/dashboard/dht11/latest?device_id=ROOMGUARD-01&command_id=15`
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "command_status": "COMPLETED",
      "reading": {
        "temperature": 28.1,
        "humidity": 67.0,
        "measured_at": "2026-09-05T02:02:05.000Z"
      }
    }
  }
  ```

---

### 3.6 Real-Time Server-Sent Events (SSE) Stream
Provides real-time pub/sub push updates to the React dashboard without continuous polling.

- **Method**: `GET`
- **Route**: `/api/dashboard/stream`
- **Headers**:
  - `Accept: text/event-stream`
- **Event Types**:
  - `heartbeat`: Dispatched when device pings.
  - `sensor_reading`: Dispatched on new BMP280 data.
  - `rfid_event`: Dispatched immediately upon RFID card swipe.
  - `dht11_reading`: Dispatched when DHT11 result arrives.
