import React from 'react';

export default function DeviceStatus({ device }) {
  if (!device) {
    return (
      <div className="glass-card" style={{ gridColumn: 'span 12' }}>
        <p style={{ color: 'var(--text-muted)' }}>Loading device gateway status...</p>
      </div>
    );
  }

  const isOnline = Boolean(device.is_online);

  // Format uptime seconds into human-readable string
  const formatUptime = (seconds) => {
    if (!seconds || seconds <= 0) return '0m';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) return `${hrs}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  // Format last ping time
  const formatTime = (ts) => {
    if (!ts) return 'Never';
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="glass-card" style={{ gridColumn: 'span 12' }}>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '1.25rem'
      }}>
        {/* Left: Device Name, ID & Status Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.25rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>{device.name || 'RoomGuard Sentinel'}</h2>
              <span className={`status-pill ${isOnline ? 'online' : 'offline'}`}>
                <span className={`pulse-dot ${isOnline ? 'online' : 'offline'}`}></span>
                {isOnline ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <span>ID: <strong className="mono-chip">{device.id}</strong></span>
              <span>•</span>
              <span>FW: <strong>v{device.firmware_version || '1.0.0'}</strong></span>
            </div>
          </div>
        </div>

        {/* Right: Telemetry Health Grid */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '1.5rem',
          fontSize: '0.85rem'
        }}>
          {/* Wi-Fi RSSI */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-cyan)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.55a11 11 0 0 1 14.08 0" />
              <path d="M1.42 9a16 16 0 0 1 21.16 0" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <line x1="12" y1="20" x2="12.01" y2="20" />
            </svg>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Wi-Fi Signal</div>
              <div style={{ fontWeight: 600 }}>{device.wifi_rssi || -60} dBm</div>
            </div>
          </div>

          {/* Uptime */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-emerald)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>System Uptime</div>
              <div style={{ fontWeight: 600 }}>{formatUptime(device.uptime_seconds)}</div>
            </div>
          </div>

          {/* Last Ping */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Last Heartbeat</div>
              <div style={{ fontWeight: 600 }}>{formatTime(device.last_ping)}</div>
            </div>
          </div>

          {/* Sensor Attachment Indicators */}
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            <span style={{
              fontSize: '0.7rem',
              padding: '0.2rem 0.45rem',
              borderRadius: '4px',
              fontWeight: 600,
              background: device.bmp280_available ? 'rgba(16, 185, 129, 0.15)' : 'rgba(107, 114, 128, 0.2)',
              color: device.bmp280_available ? '#34d399' : '#9ca3af'
            }}>
              BMP280
            </span>
            <span style={{
              fontSize: '0.7rem',
              padding: '0.2rem 0.45rem',
              borderRadius: '4px',
              fontWeight: 600,
              background: device.rc522_available ? 'rgba(16, 185, 129, 0.15)' : 'rgba(107, 114, 128, 0.2)',
              color: device.rc522_available ? '#34d399' : '#9ca3af'
            }}>
              RC522
            </span>
            <span style={{
              fontSize: '0.7rem',
              padding: '0.2rem 0.45rem',
              borderRadius: '4px',
              fontWeight: 600,
              background: device.dht11_available ? 'rgba(16, 185, 129, 0.15)' : 'rgba(107, 114, 128, 0.2)',
              color: device.dht11_available ? '#34d399' : '#9ca3af'
            }}>
              DHT11
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
