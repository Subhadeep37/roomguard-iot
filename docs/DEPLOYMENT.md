# ROOMGUARD IoT - Worldwide Cloud Deployment & Remote Access Guide

This guide explains how to deploy RoomGuard IoT to the cloud so that you can view your ESP32 sensor telemetry and RFID access events **from anywhere in the world on any phone, tablet, or PC**.

---

## Architecture for Worldwide Access

```
+------------------+         +-------------------------------+         +---------------------+
| ESP32 Hardware   |  HTTPS  | Cloud Web Server (Render.com) |  HTTPS  | Mobile / PC Browser |
| (Home / Office)  | ------> | Node.js Backend + React Build | <-----> | (Anywhere in World) |
| DevKit V1        |  POST   | + PostgreSQL Cloud Database   |   UI    | Live Dashboard      |
+------------------+         +-------------------------------+         +---------------------+
```

---

## Option 1: Free Cloud Deployment on Render (Recommended)

Render offers free web services and managed PostgreSQL databases. The entire RoomGuard system (backend, PostgreSQL, and React frontend) can run under **a single domain** with automatic SSL (`https://your-app.onrender.com`).

### Step 1: Push Code to GitHub
1. Initialize Git in your project folder:
   ```bash
   cd roomguard-iot
   git init
   git add .
   git commit -m "Initial commit: RoomGuard IoT System"
   ```
2. Create a new repository on GitHub (e.g., `roomguard-iot`) and push your code:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/roomguard-iot.git
   git branch -M main
   git push -u origin main
   ```

### Step 2: Provision a PostgreSQL Database on Render
1. Sign up at [render.com](https://render.com).
2. Click **New +** -> **PostgreSQL**.
3. Name it: `roomguard-db`.
4. Select the **Free** instance type.
5. Click **Create Database**.
6. Once provisioned, copy the **Internal Database URL** (or External URL).

### Step 3: Deploy the Unified Web Service
1. Click **New +** -> **Web Service**.
2. Connect your GitHub repository.
3. Configure the service settings:
   - **Name**: `roomguard-iot`
   - **Environment**: `Node`
   - **Region**: Select closest to you (e.g., Singapore, Frankfurt, Oregon)
   - **Branch**: `main`
   - **Build Command**:
     ```bash
     cd frontend && npm install && npm run build && cd ../backend && npm install
     ```
   - **Start Command**:
     ```bash
     cd backend && npm start
     ```
4. Under **Environment Variables**, add:
   - `NODE_ENV` = `production`
   - `PORT` = `10000`
   - `DATABASE_URL` = `<Paste your Render PostgreSQL connection string>`
   - `DEVICE_API_KEY` = `rg_live_9f83b4e72a` *(or generate a secure random 32-character string)*
   - `HEARTBEAT_TIMEOUT_SECONDS` = `60`
5. Click **Deploy Web Service**.

### Step 4: Initialize the Database Schema
1. On Render, open your PostgreSQL database dashboard and click **Connect** -> **PSQL Command** (or use the web Shell tab on the Web Service).
2. Run the SQL statements from `database/schema.sql` to create the tables and seed default admin RFID keys:
   ```bash
   psql $DATABASE_URL -f database/schema.sql
   ```

### Step 5: Configure the ESP32 Firmware
1. Open `esp32/roomguard/roomguard.ino` in Arduino IDE or VS Code.
2. Update `API_BASE_URL` with your Render public HTTPS URL:
   ```cpp
   const char* API_BASE_URL = "https://roomguard-iot.onrender.com";
   const char* DEVICE_API_KEY = "rg_live_9f83b4e72a";
   ```
3. Upload to your ESP32 DevKit V1.
4. Open the Serial Monitor at 115200 baud to verify connection.
5. Open `https://roomguard-iot.onrender.com` on your smartphone or PC from anywhere in the world!

---

## Option 2: Zero-Cost Tunneling via Cloudflare Tunnels (Zero Router Config)

If you want to run the backend and database on your home computer (e.g. Raspberry Pi, laptop, or desktop) but access it globally without port forwarding:

### Using Cloudflare Tunnels (`cloudflared`):
1. Download Cloudflare Tunnel client:
   - Windows: `winget install Cloudflare.cloudflared`
   - Linux / Mac: `brew install cloudflare/cloudflare/cloudflared` or `sudo apt install cloudflared`
2. Start the RoomGuard backend locally:
   ```bash
   cd roomguard-iot/backend
   npm run dev
   ```
3. In a separate terminal, launch a free public HTTPS tunnel to port 5000:
   ```bash
   cloudflared tunnel --url http://localhost:5000
   ```
4. Cloudflare will output an HTTPS URL such as:
   ```
   https://random-words-subdomain.trycloudflare.com
   ```
5. Enter this URL into `roomguard.ino` as `API_BASE_URL`, and open it on your phone browser from anywhere in the world!

---

## Option 3: Local Development Setup

To run and test the complete system on your local network:

### 1. Start Backend:
```bash
cd roomguard-iot/backend
npm install
npm run dev
```
*(Runs on `http://localhost:5000` with automated SQLite fallback if PostgreSQL is not connected)*

### 2. Start Frontend Dev Server:
```bash
cd roomguard-iot/frontend
npm install
npm run dev
```
*(Runs on `http://localhost:5173` with automatic API proxying to port 5000)*

### 3. Find Your Local LAN IP:
- Windows: `ipconfig` (Look for IPv4 Address, e.g. `192.168.1.100`)
- Linux / Mac: `hostname -I`
- Set `API_BASE_URL` in `roomguard.ino` to `http://192.168.1.100:5000`.
- Both your ESP32 and phone/computer must be on the same Wi-Fi network for LAN mode.
