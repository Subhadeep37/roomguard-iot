# ROOMGUARD IoT - Hardware & Wiring Specification

This document provides the complete, authoritative electrical and mechanical wiring specification for the **ESP32 DevKit V1** room monitoring and access control system.

---

## 1. Components Bill of Materials (BOM)

| Item | Component | Specification | Quantity | Purpose |
|:---|:---|:---|:---|:---|
| 1 | **ESP32 DevKit V1** | 30-pin or 38-pin, Dual Core 240MHz, 2.4GHz Wi-Fi + BLE | 1 | Central IoT Gateway Controller |
| 2 | **GY-B11 BMP280** | High-precision digital atmospheric pressure & temperature sensor (I2C) | 1 | Continuous room environmental telemetry |
| 3 | **RC522 RFID Module** | 13.56MHz RFID Reader/Writer (SPI interface) + Mifare 1k Card/Keyfob | 1 | Physical room access verification |
| 4 | **DHT11 Sensor** | Digital relative humidity and temperature sensor (1-wire digital) | 1 | On-demand climate measurement |
| 5 | **Active/Passive Buzzer** | 3.3V / 5V Piezo audio transducer | 1 | Non-blocking audible access feedback |
| 6 | **Pull-up Resistor** | 10kΩ 1/4W resistor (if DHT11 is bare sensor without module PCB) | 1 | DHT11 data line stability |
| 7 | **Breadboard & Jumpers** | Half-size or full breadboard + male-to-female and male-to-male jumper wires | 1 set | Circuit interconnect |
| 8 | **Power Supply** | Micro-USB cable + 5V 1A to 2A regulated USB power adapter | 1 | System power |

---

## 2. Master Wiring & GPIO Pinout Table

> [!CAUTION]
> **CRITICAL VOLTAGE WARNING - RC522 RFID**:
> The RC522 RFID reader is rated for **3.3V ONLY**.
> **NEVER connect the RC522 VCC pin to 5V / VIN.**
> Connecting 5V to the RC522 will permanently damage the internal MFRC522 RF transceiver IC!

| Component | Module Pin | ESP32 DevKit V1 GPIO | Voltage Level | Notes |
|:---|:---|:---|:---|:---|
| **RC522 RFID** | **VCC** | **3V3** | **3.3V ONLY** | **Strictly 3.3V power pin** |
| RC522 RFID | **RST** | **GPIO 4** | 3.3V Logic | Module Hardware Reset |
| RC522 RFID | **GND** | **GND** | Common Ground | System ground |
| RC522 RFID | **MISO / SDO** | **GPIO 19** | 3.3V Logic | SPI Master In / Slave Out |
| RC522 RFID | **MOSI / SDI** | **GPIO 23** | 3.3V Logic | SPI Master Out / Slave In |
| RC522 RFID | **SCK** | **GPIO 18** | 3.3V Logic | SPI Serial Clock |
| RC522 RFID | **SDA / SS** | **GPIO 5** | 3.3V Logic | SPI Slave Select (Chip Select) |
| **GY-B11 BMP280** | **VCC** | **3V3** | 3.3V | Module power supply |
| GY-B11 BMP280 | **GND** | **GND** | Common Ground | System ground |
| GY-B11 BMP280 | **SCL** | **GPIO 22** | 3.3V Logic | I2C Serial Clock |
| GY-B11 BMP280 | **SDA** | **GPIO 21** | 3.3V Logic | I2C Serial Data |
| **DHT11 Sensor** | **VCC / +** | **3V3** | 3.3V (or 5V if 3-pin module) | Power |
| DHT11 Sensor | **DATA / OUT**| **GPIO 15** | 3.3V Logic | Connect 10kΩ pull-up to 3.3V if bare 4-pin |
| DHT11 Sensor | **GND / -** | **GND** | Common Ground | System ground |
| **Buzzer** | **Positive (+)**| **GPIO 25** | 3.3V Logic | Digital signal pulse output |
| Buzzer | **Negative (-)**| **GND** | Common Ground | System ground |

---

## 3. Detailed Subsystem Wiring & Technical Notes

### 3.1 GY-B11 BMP280 Environmental Sensor (I2C)
- **Bus Interface**: Wire I2C hardware bus.
- **Default Address**: `0x76` (common on Chinese GY-B11 breakout boards where the SDO pin is tied to GND). If SDO is pulled high to 3.3V, address changes to `0x77`.
- **Fault-Tolerant Operation**: The firmware initializes the BMP280 during boot. If disconnected or unpowered, the ESP32 logs a diagnostic warning, reports `bmp280: false` in the heartbeat, and proceeds without crashing or blocking other tasks.

### 3.2 RC522 RFID Card & Fob Reader (SPI)
- **Bus Interface**: VSPI hardware SPI bus.
- **Supply Voltage**: Direct connection to ESP32 **3V3** pin.
- **UID Hex Normalization**: The ESP32 firmware reads 4-byte or 7-byte Mifare card UIDs and formats them as standard zero-padded uppercase hexadecimal strings (e.g., `A1B2C3D4` or `04A25F82112233`).
- **Power Decoupling**: If experiencing intermittent RFID reads, place a 10µF to 47µF electrolytic capacitor between the 3V3 and GND pins close to the RC522 module to smooth RF transmitter inrush current.

### 3.3 DHT11 On-Demand Temperature & Humidity Sensor
- **Operation Mode**: On-demand polling only. The DHT11 is queried when the cloud dashboard sends a `REQUEST_DHT11` command.
- **Wiring**:
  - If using a **3-pin module** (marked `S`, `+`, `-`), the 10kΩ pull-up resistor is already surface-mounted on the module PCB.
  - If using a **bare 4-pin sensor**: Pin 1 is VCC (3.3V), Pin 2 is DATA (GPIO 15) with a 10kΩ resistor bridging Pin 1 and Pin 2, Pin 3 is NC (not connected), and Pin 4 is GND.

### 3.4 Piezo Buzzer Feedback Module
- **Drive Logic**: Digital Output on GPIO 25.
- **Audio Feedback Signatures**:
  1. **Card Detect Tick**: Single 40ms pulse.
  2. **ACCESS_GRANTED**: Two cheerful 70ms and 90ms chirps separated by 50ms pause.
  3. **ACCESS_DENIED**: Two low-pitched 180ms and 220ms warning buzzes separated by 80ms pause.
- **Non-blocking**: Uses internal state-machine timers (`millis()`), ensuring Wi-Fi communication and SPI polling are never halted.

---

## 4. Hardware Assembly Checklist

1. [ ] Connect all **GND** lines to a shared ground rail on the breadboard.
2. [ ] Connect all **3V3** lines to the ESP32 3.3V rail. **Verify with multimeter that RC522 receives ≤ 3.3V.**
3. [ ] Connect BMP280 SDA to GPIO 21 and SCL to GPIO 22.
4. [ ] Connect RC522 SPI lines: SCK -> GPIO 18, MISO -> GPIO 19, MOSI -> GPIO 23, SS -> GPIO 5, RST -> GPIO 4.
5. [ ] Connect DHT11 Data line to GPIO 15.
6. [ ] Connect Buzzer (+) to GPIO 25 and (-) to GND.
7. [ ] Connect ESP32 via Micro-USB to computer.
8. [ ] Open Arduino Serial Monitor at **115200 baud**.
9. [ ] Verify all sensor boot checks report online status.
