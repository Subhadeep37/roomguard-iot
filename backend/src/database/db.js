// RoomGuard IoT — Data access layer.
//
// Uses PostgreSQL when DATABASE_URL is set. Otherwise falls back to an
// in-memory store so the API is fully usable for local development and
// testing without any database setup.

const logger = require('../utils/logger');

let pool = null;
let isPostgres = false;

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

const mem = {
  devices: new Map(),   // device_id -> device
  cards: new Map(),     // uid -> card
  accessEvents: [],
  environmentReadings: [],
  deviceCommands: [],
  dht11Readings: [],
  seq: { card: 1, event: 1, env: 1, cmd: 1, dht: 1 }
};

function resetMemStore() {
  mem.devices.clear();
  mem.cards.clear();
  mem.accessEvents.length = 0;
  mem.environmentReadings.length = 0;
  mem.deviceCommands.length = 0;
  mem.dht11Readings.length = 0;
  mem.seq = { card: 1, event: 1, env: 1, cmd: 1, dht: 1 };
}

function seedMemStore() {
  resetMemStore();
  const now = Date.now();

  mem.devices.set('ROOMGUARD-01', {
    device_id: 'ROOMGUARD-01',
    name: 'Server Room Sentinel',
    firmware_version: '1.0.0',
    wifi_rssi: -60,
    uptime_seconds: 0,
    bmp280_available: false,
    rc522_available: false,
    dht11_available: false,
    last_ping: null,
    created_at: new Date(now),
    updated_at: new Date(now)
  });

  const cards = [
    { uid: 'A1B2C3D4', name: 'Master Admin Keycard', enabled: true },
    { uid: 'E5F60718', name: 'Lead Engineer Badge', enabled: true },
    { uid: '04A25F82', name: 'Facility Security Token', enabled: true }
  ];
  for (const c of cards) {
    mem.cards.set(c.uid, {
      id: mem.seq.card++,
      uid: c.uid,
      name: c.name,
      enabled: c.enabled,
      created_at: new Date(now),
      updated_at: new Date(now)
    });
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function initDatabase() {
  const connectionString = process.env.DATABASE_URL;

  if (connectionString && connectionString.trim() !== '') {
    try {
      const { Pool } = require('pg');
      pool = new Pool({
        connectionString,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      });
      const client = await pool.connect();
      client.release();
      isPostgres = true;
      logger.info('Connected to PostgreSQL database.');
      return;
    } catch (error) {
      logger.warn(`PostgreSQL connection failed (${error.message}). Falling back to in-memory store.`);
      pool = null;
      isPostgres = false;
    }
  }

  logger.info('DATABASE_URL not set — using in-memory data store (fine for dev/testing, resets on restart).');
  seedMemStore();
}

const getIsPostgres = () => isPostgres;

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

async function upsertDevice(fields) {
  const {
    device_id, name, firmware_version,
    wifi_rssi, uptime_seconds,
    bmp280_available, rc522_available, dht11_available
  } = fields;

  if (isPostgres) {
    const { rows } = await pool.query(
      `INSERT INTO devices (
         device_id, name, firmware_version, wifi_rssi, uptime_seconds,
         bmp280_available, rc522_available, dht11_available, last_ping, updated_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
       ON CONFLICT (device_id) DO UPDATE SET
         name = EXCLUDED.name,
         firmware_version = EXCLUDED.firmware_version,
         wifi_rssi = EXCLUDED.wifi_rssi,
         uptime_seconds = EXCLUDED.uptime_seconds,
         bmp280_available = EXCLUDED.bmp280_available,
         rc522_available = EXCLUDED.rc522_available,
         dht11_available = EXCLUDED.dht11_available,
         last_ping = NOW(),
         updated_at = NOW()
       RETURNING *`,
      [device_id, name || 'ESP32 Device', firmware_version || '1.0.0',
       wifi_rssi ?? null, uptime_seconds ?? 0,
       Boolean(bmp280_available), Boolean(rc522_available), Boolean(dht11_available)]
    );
    return rows[0];
  }

  const now = new Date();
  const existing = mem.devices.get(device_id) || {};
  const device = {
    device_id,
    name: name || existing.name || 'ESP32 Device',
    firmware_version: firmware_version || existing.firmware_version || '1.0.0',
    wifi_rssi: wifi_rssi !== undefined ? wifi_rssi : (existing.wifi_rssi ?? null),
    uptime_seconds: uptime_seconds !== undefined ? uptime_seconds : (existing.uptime_seconds || 0),
    bmp280_available: Boolean(bmp280_available),
    rc522_available: Boolean(rc522_available),
    dht11_available: Boolean(dht11_available),
    last_ping: now,
    created_at: existing.created_at || now,
    updated_at: now
  };
  mem.devices.set(device_id, device);
  return device;
}

async function getDevice(deviceId) {
  if (isPostgres) {
    const { rows } = await pool.query('SELECT * FROM devices WHERE device_id = $1 LIMIT 1', [deviceId]);
    return rows[0] || null;
  }
  return mem.devices.get(deviceId) || null;
}

async function getLatestDevice() {
  if (isPostgres) {
    const { rows } = await pool.query('SELECT * FROM devices ORDER BY updated_at DESC LIMIT 1');
    return rows[0] || null;
  }
  const arr = Array.from(mem.devices.values())
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  return arr[0] || null;
}

// ---------------------------------------------------------------------------
// Authorized RFID cards
// ---------------------------------------------------------------------------

async function findCardByUid(uid) {
  if (isPostgres) {
    const { rows } = await pool.query(
      'SELECT * FROM authorized_rfid_cards WHERE uid = $1 AND enabled = TRUE LIMIT 1',
      [uid]
    );
    return rows[0] || null;
  }
  const card = mem.cards.get(uid);
  return card && card.enabled ? card : null;
}

// ---------------------------------------------------------------------------
// Access events (RFID history)
// ---------------------------------------------------------------------------

async function insertAccessEvent({ device_id, uid, event_type, card_label }) {
  if (isPostgres) {
    const { rows } = await pool.query(
      `INSERT INTO access_events (device_id, uid, event_type, card_label, created_at)
       VALUES ($1,$2,$3,$4,NOW()) RETURNING *`,
      [device_id, uid, event_type, card_label]
    );
    return rows[0];
  }
  const event = {
    id: mem.seq.event++,
    device_id, uid, event_type, card_label,
    created_at: new Date()
  };
  mem.accessEvents.push(event);
  return event;
}

async function getLatestAccessEvent(deviceId) {
  if (isPostgres) {
    const { rows } = await pool.query(
      'SELECT * FROM access_events WHERE device_id = $1 ORDER BY created_at DESC LIMIT 1',
      [deviceId]
    );
    return rows[0] || null;
  }
  const events = mem.accessEvents.filter(e => e.device_id === deviceId);
  return events.length ? events[events.length - 1] : null;
}

async function listAccessEvents({ page, limit, eventType }) {
  const offset = (page - 1) * limit;

  if (isPostgres) {
    const params = [];
    let where = '';
    if (eventType) {
      params.push(eventType);
      where = `WHERE event_type = $${params.length}`;
    }
    const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM access_events ${where}`, params);
    const dataParams = [...params, limit, offset];
    const rowsRes = await pool.query(
      `SELECT * FROM access_events ${where}
       ORDER BY created_at DESC
       LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );
    return { rows: rowsRes.rows, total: countRes.rows[0].total };
  }

  let events = [...mem.accessEvents].reverse(); // newest first
  if (eventType) events = events.filter(e => e.event_type === eventType);
  const total = events.length;
  const rows = events.slice(offset, offset + limit);
  return { rows, total };
}

// ---------------------------------------------------------------------------
// Environment (BMP280) readings
// ---------------------------------------------------------------------------

async function insertEnvironmentReading({ device_id, temperature, pressure }) {
  if (isPostgres) {
    const { rows } = await pool.query(
      `INSERT INTO environment_readings (device_id, temperature, pressure, recorded_at)
       VALUES ($1,$2,$3,NOW()) RETURNING *`,
      [device_id, temperature, pressure]
    );
    return rows[0];
  }
  const reading = {
    id: mem.seq.env++,
    device_id, temperature, pressure,
    recorded_at: new Date()
  };
  mem.environmentReadings.push(reading);
  return reading;
}

async function getLatestEnvironmentReading(deviceId) {
  if (isPostgres) {
    const { rows } = await pool.query(
      'SELECT * FROM environment_readings WHERE device_id = $1 ORDER BY recorded_at DESC LIMIT 1',
      [deviceId]
    );
    return rows[0] || null;
  }
  const readings = mem.environmentReadings.filter(r => r.device_id === deviceId);
  return readings.length ? readings[readings.length - 1] : null;
}

async function listEnvironmentReadings({ deviceId, since }) {
  if (isPostgres) {
    const { rows } = await pool.query(
      `SELECT * FROM environment_readings
       WHERE device_id = $1 AND recorded_at >= $2
       ORDER BY recorded_at ASC`,
      [deviceId, since]
    );
    return rows;
  }
  return mem.environmentReadings
    .filter(r => r.device_id === deviceId && new Date(r.recorded_at) >= since)
    .sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at));
}

// ---------------------------------------------------------------------------
// Device command queue (e.g. REQUEST_DHT11)
// ---------------------------------------------------------------------------

async function enqueueCommand({ device_id, command }) {
  if (isPostgres) {
    const { rows } = await pool.query(
      `INSERT INTO device_commands (device_id, command, status, created_at)
       VALUES ($1,$2,'PENDING',NOW()) RETURNING *`,
      [device_id, command]
    );
    return rows[0];
  }
  const cmd = {
    id: mem.seq.cmd++,
    device_id, command,
    status: 'PENDING',
    result: null,
    created_at: new Date(),
    processed_at: null
  };
  mem.deviceCommands.push(cmd);
  return cmd;
}

async function getNextPendingCommand(deviceId) {
  if (isPostgres) {
    const { rows } = await pool.query(
      `UPDATE device_commands SET status = 'PROCESSING'
       WHERE id = (
         SELECT id FROM device_commands
         WHERE device_id = $1 AND status = 'PENDING'
         ORDER BY created_at ASC LIMIT 1
       )
       RETURNING *`,
      [deviceId]
    );
    return rows[0] || null;
  }
  const cmd = mem.deviceCommands
    .filter(c => c.device_id === deviceId && c.status === 'PENDING')
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0];
  if (cmd) cmd.status = 'PROCESSING';
  return cmd || null;
}

async function getCommandById(id) {
  if (isPostgres) {
    const { rows } = await pool.query('SELECT * FROM device_commands WHERE id = $1 LIMIT 1', [id]);
    return rows[0] || null;
  }
  return mem.deviceCommands.find(c => c.id === id) || null;
}

async function getLatestCommandByType(deviceId, commandType) {
  if (isPostgres) {
    const { rows } = await pool.query(
      `SELECT * FROM device_commands
       WHERE device_id = $1 AND command = $2
       ORDER BY created_at DESC LIMIT 1`,
      [deviceId, commandType]
    );
    return rows[0] || null;
  }
  const cmds = mem.deviceCommands
    .filter(c => c.device_id === deviceId && c.command === commandType)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return cmds[0] || null;
}

async function completeCommand(id, { status, result }) {
  if (isPostgres) {
    const { rows } = await pool.query(
      `UPDATE device_commands
       SET status = $1, result = $2, processed_at = NOW()
       WHERE id = $3 RETURNING *`,
      [status, JSON.stringify(result ?? null), id]
    );
    return rows[0] || null;
  }
  const cmd = mem.deviceCommands.find(c => c.id === id);
  if (!cmd) return null;
  cmd.status = status;
  cmd.result = result ?? null;
  cmd.processed_at = new Date();
  return cmd;
}

// ---------------------------------------------------------------------------
// DHT11 readings
// ---------------------------------------------------------------------------

async function insertDht11Reading({ device_id, command_id, temperature, humidity }) {
  if (isPostgres) {
    const { rows } = await pool.query(
      `INSERT INTO dht11_readings (device_id, command_id, temperature, humidity, recorded_at)
       VALUES ($1,$2,$3,$4,NOW()) RETURNING *`,
      [device_id, command_id ?? null, temperature, humidity]
    );
    return rows[0];
  }
  const reading = {
    id: mem.seq.dht++,
    device_id,
    command_id: command_id ?? null,
    temperature, humidity,
    recorded_at: new Date()
  };
  mem.dht11Readings.push(reading);
  return reading;
}

async function getDht11ReadingByCommand(commandId) {
  if (isPostgres) {
    const { rows } = await pool.query(
      'SELECT * FROM dht11_readings WHERE command_id = $1 ORDER BY recorded_at DESC LIMIT 1',
      [commandId]
    );
    return rows[0] || null;
  }
  const readings = mem.dht11Readings.filter(r => r.command_id === commandId);
  return readings.length ? readings[readings.length - 1] : null;
}

async function getLatestDht11Reading(deviceId) {
  if (isPostgres) {
    const { rows } = await pool.query(
      'SELECT * FROM dht11_readings WHERE device_id = $1 ORDER BY recorded_at DESC LIMIT 1',
      [deviceId]
    );
    return rows[0] || null;
  }
  const readings = mem.dht11Readings.filter(r => r.device_id === deviceId);
  return readings.length ? readings[readings.length - 1] : null;
}

module.exports = {
  initDatabase,
  getIsPostgres,
  // devices
  upsertDevice,
  getDevice,
  getLatestDevice,
  // cards
  findCardByUid,
  // access events
  insertAccessEvent,
  getLatestAccessEvent,
  listAccessEvents,
  // environment
  insertEnvironmentReading,
  getLatestEnvironmentReading,
  listEnvironmentReadings,
  // commands
  enqueueCommand,
  getNextPendingCommand,
  getCommandById,
  getLatestCommandByType,
  completeCommand,
  // dht11
  insertDht11Reading,
  getDht11ReadingByCommand,
  getLatestDht11Reading,
  // test/debug helper
  _resetMemStore: resetMemStore
};
