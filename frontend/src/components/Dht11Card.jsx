import React, { useState } from 'react';
import { requestDht11Measurement, fetchLatestDht11 } from '../services/api';

export default function Dht11Card({ initialData, deviceId }) {
  const [data, setData] = useState(initialData);
  const [status, setStatus] = useState('idle'); // 'idle' | 'requesting' | 'success' | 'timeout' | 'error'
  const [errorMessage, setErrorMessage] = useState('');

  // Update when parent data arrives
  React.useEffect(() => {
    if (initialData) {
      setData(initialData);
    }
  }, [initialData]);

  const handleRequestMeasurement = async () => {
    setStatus('requesting');
    setErrorMessage('');

    try {
      const queueRes = await requestDht11Measurement(deviceId || 'ROOMGUARD-01');
      const commandId = queueRes.command_id;

      // Poll every 1.5s for command completion up to 15s timeout
      const startTime = Date.now();
      const timeoutMs = 15000;

      const pollInterval = setInterval(async () => {
        const elapsed = Date.now() - startTime;

        if (elapsed > timeoutMs) {
          clearInterval(pollInterval);
          setStatus('timeout');
          setErrorMessage('ESP32 did not respond within 15 seconds.');
          return;
        }

        try {
          const checkRes = await fetchLatestDht11(deviceId, commandId);
          if (checkRes.command_status === 'COMPLETED' && checkRes.reading) {
            clearInterval(pollInterval);
            setData(checkRes.reading);
            setStatus('success');
          } else if (checkRes.command_status === 'FAILED') {
            clearInterval(pollInterval);
            setStatus('error');
            setErrorMessage('Sensor read failure reported by ESP32.');
          }
        } catch (err) {
          // Keep polling until timeout
        }
      }, 1500);

    } catch (err) {
      setStatus('error');
      setErrorMessage(err.message || 'Failed to submit measurement request.');
    }
  };

  const temp = data?.temperature !== undefined ? Number(data.temperature).toFixed(1) : '--';
  const humidity = data?.humidity !== undefined ? Number(data.humidity).toFixed(1) : '--';
  const time = data?.measured_at ? new Date(data.measured_at).toLocaleTimeString() : 'No readings yet';

  return (
    <div className="glass-card" style={{ gridColumn: 'span 4' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'rgba(6, 182, 212, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent-cyan)'
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
            </svg>
          </div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>DHT11 Climate</h3>
        </div>
        <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', background: 'rgba(6, 182, 212, 0.1)', color: '#22d3ee', borderRadius: '4px', fontWeight: 600 }}>
          ON-DEMAND
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

        {/* Humidity */}
        <div style={{
          background: 'rgba(31, 41, 55, 0.5)',
          padding: '1rem',
          borderRadius: '10px',
          border: '1px solid rgba(75, 85, 99, 0.25)'
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
            Humidity
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f9fafb' }}>
            {humidity} <span style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--accent-cyan)' }}>%</span>
          </div>
        </div>
      </div>

      {/* Trigger Action Button & State Messages */}
      <div style={{ marginTop: '1.25rem' }}>
        <button
          className="btn-primary"
          onClick={handleRequestMeasurement}
          disabled={status === 'requesting'}
          style={{ width: '100%' }}
        >
          {status === 'requesting' ? (
            <>
              <div className="spinner"></div>
              <span>Requesting DHT11 measurement...</span>
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              <span>Get DHT11 Data</span>
            </>
          )}
        </button>

        {/* Status Alerts */}
        {status === 'timeout' && (
          <div style={{
            marginTop: '0.75rem',
            padding: '0.5rem 0.75rem',
            background: 'rgba(244, 63, 94, 0.15)',
            border: '1px solid rgba(244, 63, 94, 0.4)',
            borderRadius: '6px',
            color: '#fb7185',
            fontSize: '0.8rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem'
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            ESP32 did not respond.
          </div>
        )}

        {status === 'success' && (
          <div style={{
            marginTop: '0.75rem',
            padding: '0.5rem 0.75rem',
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            borderRadius: '6px',
            color: '#34d399',
            fontSize: '0.8rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem'
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            Fresh DHT11 measurement received!
          </div>
        )}

        {status === 'error' && (
          <div style={{
            marginTop: '0.75rem',
            padding: '0.5rem 0.75rem',
            background: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            borderRadius: '6px',
            color: '#fbbf24',
            fontSize: '0.8rem'
          }}>
            {errorMessage || 'Error reading DHT11'}
          </div>
        )}
      </div>

      <div style={{ marginTop: '0.85rem', fontSize: '0.75rem', color: 'var(--text-dim)', display: 'flex', justifyContent: 'space-between' }}>
        <span>Last: {time}</span>
        <span>GPIO 15</span>
      </div>
    </div>
  );
}
