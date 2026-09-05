// RoomGuard IoT — Device-facing controller.
// These handlers implement exactly the requests the ESP32 firmware sends
// (see esp32/roomguard/roomguard.ino and docs/API.md).

const db = require('../database/db');

let broadcast = null;
function setBroadcastFunction(fn) {
  broadcast = typeof fn === 'function' ? fn : null;
}
function emit(event, payload) {
  if (broadcast) {
    try { broadcast(event, payload); } catch (err) { console.error('SSE broadcast error:', err); }
  }
}

function fail(res, status, code, message) {
  return res.status(status).json({ success: false, error: { code, message } });
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const isValidDeviceId = (v) => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 100;
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const isValidRssi = (v) => isFiniteNumber(v) && v >= -150 && v <= 0;
const isValidBmpTemp = (v) => isFiniteNumber(v) && v >= -40 && v <= 85;
const isValidBmpPressure = (v) => isFiniteNumber(v) && v >= 300 && v <= 1100;
const isValidDhtTemp = (v) => isFiniteNumber(v) && v >= 0 && v <= 50;
const isValidHumidity = (v) => isFiniteNumber(v) && v >= 0 && v <= 100;
const normalizeUid = (uid) => (typeof uid === 'string' ? uid.replace(/\s+/g, '').toUpperCase() : '');

// ==========================================================================
// POST /api/device/heartbeat
// ==========================================================================

async function heartbeat(req, res) {
  try {
    const body = req.body || {};
    const { device_id, firmware_version, uptime, wifi_rssi, bmp280, rc522, dht11 } = body;

    if (!isValidDeviceId(device_id)) {
      return fail(res, 400, 'INVALID_DEVICE_ID', 'device_id is required.');
    }
    if (uptime !== undefined && (!isFiniteNumber(uptime) || uptime < 0)) {
      return fail(res, 400, 'INVALID_UPTIME', 'uptime must be a non-negative number of seconds.');
    }
    if (wifi_rssi !== undefined && !isValidRssi(wifi_rssi)) {
      return fail(res, 400, 'INVALID_RSSI', 'wifi_rssi must be between -150 and 0 dBm.');
    }

    await db.upsertDevice({
      device_id: device_id.trim(),
      firmware_version,
      wifi_rssi,
      uptime_seconds: uptime,
      bmp280_available: Boolean(bmp280),
      rc522_available: Boolean(rc522),
      dht11_available: Boolean(dht11)
    });

    const acknowledged_at = new Date().toISOString();

    emit('heartbeat', {
      device_id: device_id.trim(),
      status: 'ONLINE',
      wifi_rssi: wifi_rssi ?? null,
      uptime_seconds: uptime ?? 0,
      timestamp: acknowledged_at
    });

    return res.status(200).json({
      success: true,
      data: { device_id: device_id.trim(), status: 'ONLINE', acknowledged_at }
    });
  } catch (error) {
    console.error('Heartbeat error:', error);
    return fail(res, 500, 'HEARTBEAT_ERROR', 'Failed to process heartbeat.');
  }
}

// ==========================================================================
// POST /api/device/sensor-data  (BMP280 continuous readings)
// ==========================================================================

async function sensorData(req, res) {
  try {
    const { device_id, temperature, pressure } = req.body || {};

    if (!isValidDeviceId(device_id)) {
      return fail(res, 400, 'INVALID_DEVICE_ID', 'device_id is required.');
    }
    if (!isValidBmpTemp(temperature)) {
      return fail(res, 400, 'INVALID_TEMPERATURE', 'BMP280 temperature must be between -40 and 85 °C.');
    }
    if (!isValidBmpPressure(pressure)) {
      return fail(res, 400, 'INVALID_PRESSURE', 'BMP280 pressure must be between 300 and 1100 hPa.');
    }

    const reading = await db.insertEnvironmentReading({
      device_id: device_id.trim(), temperature, pressure
    });

    emit('sensor_reading', {
      device_id: reading.device_id,
      temperature: reading.temperature,
      pressure: reading.pressure,
      recorded_at: reading.recorded_at
    });

    return res.status(201).json({
      success: true,
      data: { id: reading.id, recorded_at: reading.recorded_at }
    });
  } catch (error) {
    console.error('Sensor data error:', error);
    return fail(res, 500, 'SENSOR_DATA_ERROR', 'Failed to store BMP280 data.');
  }
}

// ==========================================================================
// POST /api/device/rfid-event
// ==========================================================================

async function rfidEvent(req, res) {
  try {
    const { device_id, uid } = req.body || {};

    if (!isValidDeviceId(device_id)) {
      return fail(res, 400, 'INVALID_DEVICE_ID', 'device_id is required.');
    }

    const normalizedUid = normalizeUid(uid);
    if (!normalizedUid) {
      return fail(res, 400, 'INVALID_RFID_UID', 'RFID uid is required.');
    }

    const card = await db.findCardByUid(normalizedUid);
    const authorized = Boolean(card);
    const event_type = authorized ? 'ACCESS_GRANTED' : 'ACCESS_DENIED';
    const card_label = authorized ? card.name : 'Unknown RFID';

    const event = await db.insertAccessEvent({
      device_id: device_id.trim(),
      uid: normalizedUid,
      event_type,
      card_label
    });

    const timestamp = event.created_at;

    emit('rfid_event', {
      device_id: device_id.trim(),
      uid: normalizedUid,
      card_label,
      event_type,
      timestamp
    });

    return res.status(200).json({
      success: true,
      data: { authorized, uid: normalizedUid, card_label, event_type, timestamp }
    });
  } catch (error) {
    console.error('RFID event error:', error);
    return fail(res, 500, 'RFID_EVENT_ERROR', 'Failed to process RFID event.');
  }
}

// ==========================================================================
// GET /api/device/commands?device_id=...
// ==========================================================================

async function getCommands(req, res) {
  try {
    const deviceId = req.query.device_id;
    if (!isValidDeviceId(deviceId)) {
      return fail(res, 400, 'INVALID_DEVICE_ID', 'device_id query parameter is required.');
    }

    const command = await db.getNextPendingCommand(deviceId.trim());

    return res.status(200).json({ success: true, data: { command } });
  } catch (error) {
    console.error('Get commands error:', error);
    return fail(res, 500, 'COMMAND_ERROR', 'Failed to retrieve device commands.');
  }
}

// ==========================================================================
// POST /api/device/commands/:id/result
// ==========================================================================

async function submitCommandResult(req, res) {
  try {
    const commandId = Number(req.params.id);
    if (!Number.isInteger(commandId) || commandId <= 0) {
      return fail(res, 400, 'INVALID_COMMAND_ID', 'Command id must be a positive integer.');
    }

    const command = await db.getCommandById(commandId);
    if (!command) {
      return fail(res, 404, 'COMMAND_NOT_FOUND', 'Command not found.');
    }

    const body = req.body || {};
    const success = body.success !== false; // ESP32 sends success:false on a failed sensor read

    if (command.command === 'REQUEST_DHT11') {
      if (!success) {
        const failed = await db.completeCommand(commandId, {
          status: 'FAILED',
          result: { error: 'Device reported a failed DHT11 read.' }
        });
        return res.status(200).json({
          success: true,
          data: { command_id: commandId, status: failed.status, processed_at: failed.processed_at }
        });
      }

      const { device_id, temperature, humidity } = body;
      const deviceId = device_id || command.device_id;

      if (!isValidDeviceId(deviceId)) {
        return fail(res, 400, 'INVALID_DEVICE_ID', 'device_id is required.');
      }
      if (!isValidDhtTemp(temperature)) {
        return fail(res, 400, 'INVALID_DHT11_TEMPERATURE', 'DHT11 temperature must be between 0 and 50 °C.');
      }
      if (!isValidHumidity(humidity)) {
        return fail(res, 400, 'INVALID_DHT11_HUMIDITY', 'DHT11 humidity must be between 0 and 100%.');
      }

      const reading = await db.insertDht11Reading({
        device_id: deviceId.trim(), command_id: commandId, temperature, humidity
      });

      const completed = await db.completeCommand(commandId, {
        status: 'COMPLETED',
        result: { temperature, humidity }
      });

      emit('dht11_reading', {
        device_id: reading.device_id,
        temperature: reading.temperature,
        humidity: reading.humidity,
        measured_at: reading.recorded_at
      });

      return res.status(200).json({
        success: true,
        data: { command_id: commandId, status: completed.status, processed_at: completed.processed_at }
      });
    }

    // Generic command completion for any future command types.
    const completed = await db.completeCommand(commandId, { status: 'COMPLETED', result: body });
    return res.status(200).json({
      success: true,
      data: { command_id: commandId, status: completed.status, processed_at: completed.processed_at }
    });
  } catch (error) {
    console.error('Submit command result error:', error);
    return fail(res, 500, 'COMMAND_RESULT_ERROR', 'Failed to submit command result.');
  }
}

module.exports = {
  setBroadcastFunction,
  heartbeat,
  sensorData,
  rfidEvent,
  getCommands,
  submitCommandResult
};
