// REST API Service for RoomGuard React Dashboard

const API_BASE = '/api';

/**
 * Fetch high-level overview metrics
 */
export const fetchOverview = async (deviceId = 'ROOMGUARD-01') => {
  const res = await fetch(`${API_BASE}/dashboard/overview?device_id=${encodeURIComponent(deviceId)}`);
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  const json = await res.json();
  return json.data;
};

/**
 * Fetch paginated access events
 */
export const fetchAccessEvents = async (page = 1, limit = 10, eventType = '') => {
  let url = `${API_BASE}/dashboard/access-events?page=${page}&limit=${limit}`;
  if (eventType) url += `&event_type=${encodeURIComponent(eventType)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  const json = await res.json();
  return json.data;
};

/**
 * Fetch BMP280 environment chart telemetry
 */
export const fetchEnvironment = async (deviceId = 'ROOMGUARD-01', range = '24h') => {
  const res = await fetch(`${API_BASE}/dashboard/environment?device_id=${encodeURIComponent(deviceId)}&range=${range}`);
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  const json = await res.json();
  return json.data;
};

/**
 * Queue an on-demand DHT11 measurement command
 */
export const requestDht11Measurement = async (deviceId = 'ROOMGUARD-01') => {
  const res = await fetch(`${API_BASE}/dashboard/dht11/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: deviceId })
  });
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  const json = await res.json();
  return json.data;
};

/**
 * Poll or get latest DHT11 measurement result
 */
export const fetchLatestDht11 = async (deviceId = 'ROOMGUARD-01', commandId = null) => {
  let url = `${API_BASE}/dashboard/dht11/latest?device_id=${encodeURIComponent(deviceId)}`;
  if (commandId) url += `&command_id=${commandId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  const json = await res.json();
  return json.data;
};

/**
 * Create a resilient Server-Sent Events (SSE) stream listener
 */
export const createEventStream = (onEvent, onError) => {
  const eventSource = new EventSource(`${API_BASE}/dashboard/stream`);

  eventSource.addEventListener('heartbeat', (e) => {
    try { onEvent('heartbeat', JSON.parse(e.data)); } catch (err) {}
  });

  eventSource.addEventListener('sensor_reading', (e) => {
    try { onEvent('sensor_reading', JSON.parse(e.data)); } catch (err) {}
  });

  eventSource.addEventListener('rfid_event', (e) => {
    try { onEvent('rfid_event', JSON.parse(e.data)); } catch (err) {}
  });

  eventSource.addEventListener('dht11_reading', (e) => {
    try { onEvent('dht11_reading', JSON.parse(e.data)); } catch (err) {}
  });

  eventSource.onerror = (err) => {
    if (onError) onError(err);
  };

  return () => {
    eventSource.close();
  };
};
