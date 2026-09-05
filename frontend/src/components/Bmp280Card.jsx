import React from 'react';

export default function Bmp280Card({ data }) {
  const temp = data?.temperature !== undefined ? Number(data.temperature).toFixed(1) : '--';
  const pressure = data?.pressure !== undefined ? Number(data.pressure).toFixed(1) : '--';
  const time = data?.recorded_at ? new Date(data.recorded_at).toLocaleTimeString() : 'Awaiting data...';

  return (
    <div className="glass-card" style={{ gridColumn: 'span 4' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'rgba(59, 130, 246, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent-blue)'
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
            </svg>
          </div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>GY-B11 BMP280</h3>
        </div>
        <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', borderRadius: '4px', fontWeight: 600 }}>
          CONTINUOUS (30s)
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', margin: '1rem 0' }}>
        {/* Temperature */}
        <div style={{
          background: 'rgba(31, 41, 55, 0.5)',
          padding: '1rem',
          borderRadius: '10px',
          border: '1px solid rgba(75, 85, 99, 0.25)'
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
            Temperature
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f9fafb' }}>
            {temp} <span style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--accent-emerald)' }}>°C</span>
          </div>
        </div>

        {/* Pressure */}
        <div style={{
          background: 'rgba(31, 41, 55, 0.5)',
          padding: '1rem',
          borderRadius: '10px',
          border: '1px solid rgba(75, 85, 99, 0.25)'
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
            Pressure
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f9fafb' }}>
            {pressure} <span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--accent-cyan)' }}>hPa</span>
          </div>
        </div>
      </div>

      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'flex', justifyContent: 'space-between' }}>
        <span>Updated: {time}</span>
        <span>I2C (0x76)</span>
      </div>
    </div>
  );
}
