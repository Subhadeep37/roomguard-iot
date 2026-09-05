/**
 * ROOMGUARD IoT - ESP32 Hardware Simulator Script
 * 
 * Simulates a physical ESP32 DevKit V1 microcontroller:
 * - Sends periodic heartbeats (every 30s)
 * - Sends periodic BMP280 temperature & pressure readings (every 30s)
 * - Polls for pending commands (REQUEST_DHT11) and answers with measurement (every 5s)
 * - Simulates RFID card swipe events (both authorized and unauthorized)
 * 
 * Usage:
 *   node scripts/simulate_esp32.js
 *   node scripts/simulate_esp32.js --once
 *   node scripts/simulate_esp32.js --swipe A1B2C3D4
 */

const http = require('http');
const https = require('https');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000';
const DEVICE_ID = process.env.DEVICE_ID || 'ROOMGUARD-01';
const DEVICE_API_KEY = process.env.DEVICE_API_KEY || 'rg_live_9f83b4e72a';

const parsedUrl = new URL(API_BASE_URL);
const HOST = parsedUrl.hostname;
const IS_HTTPS = parsedUrl.protocol === 'https:';
const PORT = parsedUrl.port || (IS_HTTPS ? 443 : 5000);
const transport = IS_HTTPS ? https : http;

let uptimeSeconds = 0;

const sendRequest = (method, path, body = null) => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: HOST,
      port: PORT,
      path: `/api${path}`,
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': DEVICE_API_KEY
      }
    };

    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`${err.code || 'ERROR'}: ${err.message || 'Unknown connection error'}`));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
};

// 1. Send Heartbeat
const sendHeartbeat = async () => {
  uptimeSeconds += 30;
  const rssi = -50 - Math.floor(Math.random() * 20); // -50 to -70 dBm
  try {
    const res = await sendRequest('POST', '/device/heartbeat', {
      device_id: DEVICE_ID,
      firmware_version: '1.0.0',
      uptime: uptimeSeconds,
      wifi_rssi: rssi,
      bmp280: true,
      rc522: true,
      dht11: true
    });
    if (res.status >= 200 && res.status < 300 && res.data?.success) {
      console.log(`[SIMULATOR] [HEARTBEAT] Pinged backend. Status: ${res.data.data?.status || 'OK'}`);
    } else {
      console.error(`[SIMULATOR] [HEARTBEAT] FAILED (HTTP ${res.status}): ${res.data?.error?.message || JSON.stringify(res.data)}`);
    }
  } catch (err) {
    console.error(`[SIMULATOR] [HEARTBEAT] Failed: ${err.message}`);
  }
};

// 2. Send BMP280 Telemetry
const sendBmp280 = async () => {
  const temp = Number((24.0 + (Math.random() * 3.0 - 1.5)).toFixed(2));
  const press = Number((1012.5 + (Math.random() * 4.0 - 2.0)).toFixed(2));

  try {
    const res = await sendRequest('POST', '/device/sensor-data', {
      device_id: DEVICE_ID,
      temperature: temp,
      pressure: press
    });
    if (res.status >= 200 && res.status < 300 && res.data?.success) {
      console.log(`[SIMULATOR] [BMP280] Uploaded: ${temp} °C, ${press} hPa`);
    } else {
      console.error(`[SIMULATOR] [BMP280] FAILED (HTTP ${res.status}): ${res.data?.error?.message || JSON.stringify(res.data)}`);
    }
  } catch (err) {
    console.error(`[SIMULATOR] [BMP280] Failed: ${err.message}`);
  }
};

// 3. Poll and Execute Pending Commands (DHT11)
const pollCommands = async () => {
  try {
    const res = await sendRequest('GET', `/device/commands?device_id=${DEVICE_ID}`);
    const cmd = res.data?.data?.command;

    if (cmd && cmd.command === 'REQUEST_DHT11') {
      console.log(`[SIMULATOR] [COMMAND] Received REQUEST_DHT11 (ID: ${cmd.id}). Reading sensor...`);

      // Simulate sensor measurement delay (800ms)
      setTimeout(async () => {
        const measuredTemp = Number((25.0 + Math.random() * 2.0).toFixed(1));
        const measuredHumidity = Number((55.0 + Math.random() * 10.0).toFixed(1));

        const resultRes = await sendRequest('POST', `/device/commands/${cmd.id}/result`, {
          device_id: DEVICE_ID,
          success: true,
          temperature: measuredTemp,
          humidity: measuredHumidity
        });

        console.log(`[SIMULATOR] [DHT11] Result submitted for Command ${cmd.id}: ${measuredTemp} °C, ${measuredHumidity} %`);
      }, 800);
    }
  } catch (err) {
    // Silent fail on connection issues during polling
  }
};

// 4. Simulate RFID Swipe
const simulateRfidSwipe = async (cardUid = null) => {
  const testCards = [
    { uid: 'A1B2C3D4', label: 'Master Admin Keycard (Authorized)' },
    { uid: 'E5F60718', label: 'Lead Engineer Badge (Authorized)' },
    { uid: '99887766', label: 'Unknown Keyfob (Unauthorized)' }
  ];

  const card = cardUid 
    ? { uid: cardUid, label: 'Custom Card' }
    : testCards[Math.floor(Math.random() * testCards.length)];

  console.log(`\n[SIMULATOR] [RFID] >>> Swiping Card UID: ${card.uid} (${card.label}) <<<`);

  try {
    const res = await sendRequest('POST', '/device/rfid-event', {
      device_id: DEVICE_ID,
      uid: card.uid,
      event_type: 'RFID_ATTEMPT'
    });

    const d = res.data?.data;
    if (d?.authorized) {
      console.log(`[SIMULATOR] [BUZZER] *Beep-Beep!* ACCESS GRANTED: ${d.card_label}\n`);
    } else {
      console.log(`[SIMULATOR] [BUZZER] *BUZZ-BUZZ!* ACCESS DENIED: Unknown or disabled card.\n`);
    }
  } catch (err) {
    console.error(`[SIMULATOR] [RFID] Failed: ${err.message}`);
  }
};

// Entry point
const run = async () => {
  console.log('===============================================================');
  console.log('       ROOMGUARD IoT - ESP32 Hardware Simulator Starting       ');
  console.log(`       Target Server: ${API_BASE_URL}                          `);
  console.log(`       Device ID:     ${DEVICE_ID}                             `);
  console.log('===============================================================\n');

  // Check command line arguments
  const args = process.argv.slice(2);
  if (args.includes('--swipe')) {
    const idx = args.indexOf('--swipe');
    const uid = args[idx + 1] || 'A1B2C3D4';
    await simulateRfidSwipe(uid);
    process.exit(0);
  }

  // Initial burst
  await sendHeartbeat();
  await sendBmp280();

  if (args.includes('--once')) {
    console.log('[SIMULATOR] Single transmission complete. Exiting.');
    process.exit(0);
  }

  // Interval loops mimicking ESP32 millis() scheduler
  setInterval(pollCommands, 4000);   // Command poll every 4s
  setInterval(sendBmp280, 20000);    // BMP280 every 20s
  setInterval(sendHeartbeat, 30000); // Heartbeat every 30s

  // Random RFID card swipe every 35s
  setInterval(() => {
    simulateRfidSwipe();
  }, 35000);

  console.log('[SIMULATOR] ESP32 simulator running in background loop.');
  console.log('[SIMULATOR] Press Ctrl+C to terminate.\n');
};

run().catch(console.error);
