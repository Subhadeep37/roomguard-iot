// RoomGuard IoT — Dashboard-facing controller.
// Matches frontend/src/services/api.js and docs/API.md exactly.

const db = require('../database/db');

const HEARTBEAT_TIMEOUT_MS = (Number(process.env.HEARTBEAT_TIMEOUT_SECONDS) || 60) * 1000;
const DEFAULT_DEVICE_ID = 'ROOMGUARD-01';

const RANGE_MS = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000
};

const MAX_CHART_POINTS = 200;

function fail(res, status, code, message) {
  return res.status(status).json({ success: false, error: { code, message } });
}

// Averages consecutive readings down into at most `maxPoints` buckets so
// charts stay fast even over a 7-day window.
function downsample(readings, maxPoints) {
  if (readings.length <= maxPoints) return readings;

  const bucketSize = Math.ceil(readings.length / maxPoints);
  const buckets = [];

  for (let i = 0; i < readings.length; i += bucketSize) {
    const chunk = readings.slice(i, i + bucketSize);
    const avg = (key) => chunk.reduce((sum, r) => sum + Number(r[key]), 0) / chunk.length;
    buckets.push({
      recorded_at: chunk[chunk.length - 1].recorded_at,
      temperature: Number(avg('temperature').toFixed(2)),
      pressure: Number(avg('pressure').toFixed(2))
    });
  }

  return buckets;
}

// ==========================================================================
// GET /api/dashboard/overview?device_id=...
// ==========================================================================

async function getOverview(req, res) {
  try {
    const requestedDeviceId = req.query.device_id;

    const device = requestedDeviceId
      ? await db.getDevice(requestedDeviceId)
      : await db.getLatestDevice();

    const deviceId = device?.device_id || requestedDeviceId || DEFAULT_DEVICE_ID;

    let deviceOut = null;
    if (device) {
      const lastPingMs = device.last_ping ? new Date(device.last_ping).getTime() : 0;
      const isOnline = lastPingMs > 0 && (Date.now() - lastPingMs) <= HEARTBEAT_TIMEOUT_MS;
      deviceOut = {
        id: device.device_id,
        name: device.name,
        status: isOnline ? 'ONLINE' : 'OFFLINE',
        is_online: isOnline,
        wifi_rssi: device.wifi_rssi,
        uptime_seconds: device.uptime_seconds,
        firmware_version: device.firmware_version,
        last_ping: device.last_ping
      };
    }

    const [bmp, dht, rfid] = await Promise.all([
      db.getLatestEnvironmentReading(deviceId),
      db.getLatestDht11Reading(deviceId),
      db.getLatestAccessEvent(deviceId)
    ]);

    return res.status(200).json({
      success: true,
      data: {
        device: deviceOut,
        latest_bmp280: bmp
          ? { temperature: bmp.temperature, pressure: bmp.pressure, recorded_at: bmp.recorded_at }
          : null,
        latest_dht11: dht
          ? { temperature: dht.temperature, humidity: dht.humidity, measured_at: dht.recorded_at }
          : null,
        latest_rfid: rfid
          ? { uid: rfid.uid, card_label: rfid.card_label, event_type: rfid.event_type, timestamp: rfid.created_at }
          : null
      }
    });
  } catch (error) {
    console.error('Dashboard overview error:', error);
    return fail(res, 500, 'DASHBOARD_ERROR', 'Failed to retrieve dashboard overview.');
  }
}

// ==========================================================================
// GET /api/dashboard/access-events?page=&limit=&event_type=
// ==========================================================================

async function getAccessEvents(req, res) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
    const eventType = req.query.event_type || null;

    if (eventType && !['ACCESS_GRANTED', 'ACCESS_DENIED'].includes(eventType)) {
      return fail(res, 400, 'INVALID_EVENT_TYPE', 'event_type must be ACCESS_GRANTED or ACCESS_DENIED.');
    }

    const { rows, total } = await db.listAccessEvents({ page, limit, eventType });

    return res.status(200).json({
      success: true,
      data: {
        events: rows.map(e => ({
          id: e.id,
          uid: e.uid,
          card_label: e.card_label,
          event_type: e.event_type,
          created_at: e.created_at
        })),
        pagination: {
          page,
          limit,
          total_records: total,
          total_pages: Math.max(1, Math.ceil(total / limit))
        }
      }
    });
  } catch (error) {
    console.error('Access events error:', error);
    return fail(res, 500, 'ACCESS_EVENTS_ERROR', 'Failed to retrieve RFID access events.');
  }
}

// ==========================================================================
// GET /api/dashboard/environment?device_id=&range=
// ==========================================================================

async function getEnvironment(req, res) {
  try {
    const deviceId = req.query.device_id || DEFAULT_DEVICE_ID;
    const range = req.query.range || '24h';

    if (!RANGE_MS[range]) {
      return fail(res, 400, 'INVALID_RANGE', "range must be one of '1h', '6h', '24h', '7d'.");
    }

    const since = new Date(Date.now() - RANGE_MS[range]);
    const readings = await db.listEnvironmentReadings({ deviceId, since });
    const points = downsample(readings, MAX_CHART_POINTS);

    return res.status(200).json({
      success: true,
      data: {
        range,
        count: points.length,
        readings: points.map(r => ({
          timestamp: r.recorded_at,
          temperature: r.temperature,
          pressure: r.pressure
        }))
      }
    });
  } catch (error) {
    console.error('Environment history error:', error);
    return fail(res, 500, 'ENVIRONMENT_HISTORY_ERROR', 'Failed to retrieve environment history.');
  }
}

// ==========================================================================
// POST /api/dashboard/dht11/request
// ==========================================================================

async function requestDht11(req, res) {
  try {
    const deviceId = req.body?.device_id || DEFAULT_DEVICE_ID;

    if (typeof deviceId !== 'string' || deviceId.trim() === '') {
      return fail(res, 400, 'INVALID_DEVICE_ID', 'device_id is required.');
    }

    const command = await db.enqueueCommand({ device_id: deviceId.trim(), command: 'REQUEST_DHT11' });

    return res.status(202).json({
      success: true,
      data: {
        command_id: command.id,
        status: 'PENDING',
        message: 'DHT11 measurement request queued for ESP32.'
      }
    });
  } catch (error) {
    console.error('Request DHT11 error:', error);
    return fail(res, 500, 'DHT11_REQUEST_ERROR', 'Failed to queue DHT11 request.');
  }
}

// ==========================================================================
// GET /api/dashboard/dht11/latest?device_id=&command_id=
// ==========================================================================

async function getLatestDht11(req, res) {
  try {
    const deviceId = req.query.device_id || DEFAULT_DEVICE_ID;
    const commandId = req.query.command_id !== undefined ? Number(req.query.command_id) : null;

    let command = null;
    let reading = null;

    if (Number.isInteger(commandId) && commandId > 0) {
      command = await db.getCommandById(commandId);
      reading = await db.getDht11ReadingByCommand(commandId);
    } else {
      command = await db.getLatestCommandByType(deviceId, 'REQUEST_DHT11');
      reading = await db.getLatestDht11Reading(deviceId);
    }

    return res.status(200).json({
      success: true,
      data: {
        command_status: command ? command.status : null,
        reading: reading
          ? { temperature: reading.temperature, humidity: reading.humidity, measured_at: reading.recorded_at }
          : null
      }
    });
  } catch (error) {
    console.error('Get latest DHT11 error:', error);
    return fail(res, 500, 'DHT11_LATEST_ERROR', 'Failed to retrieve latest DHT11 reading.');
  }
}

module.exports = {
  getOverview,
  getAccessEvents,
  getEnvironment,
  requestDht11,
  getLatestDht11
};
