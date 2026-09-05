// Smoke tests for the RoomGuard IoT backend.
// Run with: npm test
// Exercises the full flow: heartbeat -> sensor-data -> rfid-event ->
// dashboard overview/access-events/environment -> dht11 request/poll/result.

const assert = require('assert');
const http = require('http');

process.env.NODE_ENV = 'test';
process.env.PORT = '5099';
process.env.DEVICE_API_KEY = 'test_secret_key_123';
process.env.HEARTBEAT_TIMEOUT_SECONDS = '60';

const { startServer } = require('../src/server');

const HOST = 'localhost';
const PORT = 5099;
const VALID_KEY = 'test_secret_key_123';

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: HOST, port: PORT, ...options }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsed;
        try { parsed = data ? JSON.parse(data) : {}; } catch { parsed = { raw: data }; }
        resolve({ statusCode: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (body !== null) req.write(JSON.stringify(body));
    req.end();
  });
}

const deviceRequest = (path, method, body = null, headers = {}) =>
  request({ path, method, headers: { 'Content-Type': 'application/json', 'x-api-key': VALID_KEY, ...headers } }, body);

const dashboardRequest = (path, method = 'GET', body = null) =>
  request({ path, method, headers: { 'Content-Type': 'application/json' } }, body);

async function run() {
  let server;
  let passed = 0;
  let failed = 0;

  const test = async (name, fn) => {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.log(`  ✗ ${name}`);
      console.log(`    ${err.message}`);
      failed++;
    }
  };

  try {
    server = await startServer();

    await test('health check responds UP', async () => {
      const res = await request({ path: '/api/health', method: 'GET' });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.data.status, 'UP');
    });

    await test('heartbeat rejects missing api key', async () => {
      const res = await request({
        path: '/api/device/heartbeat', method: 'POST', headers: { 'Content-Type': 'application/json' }
      }, { device_id: 'ROOMGUARD-01' });
      assert.strictEqual(res.statusCode, 401);
    });

    await test('heartbeat rejects wrong api key', async () => {
      const res = await deviceRequest('/api/device/heartbeat', 'POST', { device_id: 'ROOMGUARD-01' }, { 'x-api-key': 'nope' });
      assert.strictEqual(res.statusCode, 403);
    });

    await test('heartbeat accepts firmware payload', async () => {
      const res = await deviceRequest('/api/device/heartbeat', 'POST', {
        device_id: 'ROOMGUARD-01', firmware_version: '1.0.0',
        uptime: 12345, wifi_rssi: -58, bmp280: true, rc522: true, dht11: true
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.data.status, 'ONLINE');
    });

    await test('sensor-data stores a BMP280 reading', async () => {
      const res = await deviceRequest('/api/device/sensor-data', 'POST', {
        device_id: 'ROOMGUARD-01', temperature: 27.4, pressure: 1008.2
      });
      assert.strictEqual(res.statusCode, 201);
      assert.ok(res.body.data.id);
    });

    await test('sensor-data rejects out-of-range pressure', async () => {
      const res = await deviceRequest('/api/device/sensor-data', 'POST', {
        device_id: 'ROOMGUARD-01', temperature: 27.4, pressure: 5
      });
      assert.strictEqual(res.statusCode, 400);
    });

    await test('rfid-event authorizes a known card', async () => {
      const res = await deviceRequest('/api/device/rfid-event', 'POST', {
        device_id: 'ROOMGUARD-01', uid: 'A1B2C3D4', event_type: 'RFID_ATTEMPT'
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.data.authorized, true);
      assert.strictEqual(res.body.data.event_type, 'ACCESS_GRANTED');
    });

    await test('rfid-event denies an unknown card', async () => {
      const res = await deviceRequest('/api/device/rfid-event', 'POST', {
        device_id: 'ROOMGUARD-01', uid: '99XX0011', event_type: 'RFID_ATTEMPT'
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.data.authorized, false);
      assert.strictEqual(res.body.data.event_type, 'ACCESS_DENIED');
    });

    await test('dashboard overview reflects latest telemetry', async () => {
      const res = await dashboardRequest('/api/dashboard/overview?device_id=ROOMGUARD-01');
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.data.device.status, 'ONLINE');
      assert.strictEqual(res.body.data.latest_bmp280.temperature, 27.4);
      assert.strictEqual(res.body.data.latest_rfid.event_type, 'ACCESS_DENIED');
    });

    await test('dashboard access-events paginates and filters', async () => {
      const res = await dashboardRequest('/api/dashboard/access-events?page=1&limit=10&event_type=ACCESS_GRANTED');
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.data.events.every(e => e.event_type === 'ACCESS_GRANTED'));
    });

    await test('dashboard environment returns readings for range', async () => {
      const res = await dashboardRequest('/api/dashboard/environment?device_id=ROOMGUARD-01&range=24h');
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.data.range, '24h');
      assert.ok(res.body.data.readings.length >= 1);
    });

    let commandId;

    await test('dashboard can queue a DHT11 request', async () => {
      const res = await dashboardRequest('/api/dashboard/dht11/request', 'POST', { device_id: 'ROOMGUARD-01' });
      assert.strictEqual(res.statusCode, 202);
      assert.strictEqual(res.body.data.status, 'PENDING');
      commandId = res.body.data.command_id;
    });

    await test('device polling picks up the pending command', async () => {
      const res = await deviceRequest('/api/device/commands?device_id=ROOMGUARD-01', 'GET');
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.data.command.id, commandId);
      assert.strictEqual(res.body.data.command.status, 'PROCESSING');
    });

    await test('device can submit the DHT11 result', async () => {
      const res = await deviceRequest(`/api/device/commands/${commandId}/result`, 'POST', {
        device_id: 'ROOMGUARD-01', success: true, temperature: 28.1, humidity: 67.0
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.data.status, 'COMPLETED');
    });

    await test('dashboard sees the completed DHT11 reading', async () => {
      const res = await dashboardRequest(`/api/dashboard/dht11/latest?device_id=ROOMGUARD-01&command_id=${commandId}`);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.data.command_status, 'COMPLETED');
      assert.strictEqual(res.body.data.reading.temperature, 28.1);
      assert.strictEqual(res.body.data.reading.humidity, 67.0);
    });

  } finally {
    if (server) server.close();
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
