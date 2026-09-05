import React from 'react';

export default function RfidCard({ data }) {
  const isGranted = data?.event_type === 'ACCESS_GRANTED';
  const hasEvent = Boolean(data);

  const uid = data?.uid || '--------';
  const label = data?.card_label || (hasEvent ? 'Unknown Tag' : 'No scans yet');
  const time = data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : '--:--:--';

  return (
    <div className="glass-card" style={{ gridColumn: 'span 4' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: hasEvent 
              ? (isGranted ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)')
              : 'rgba(107, 114, 128, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: hasEvent 
              ? (isGranted ? 'var(--accent-emerald)' : 'var(--accent-rose)')
              : 'var(--text-muted)'
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
          </div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>RC522 RFID Access</h3>
        </div>
        
        {hasEvent && (
          <span className={`status-pill ${isGranted ? 'granted' : 'denied'}`}>
            {isGranted ? 'ACCESS GRANTED' : 'ACCESS DENIED'}
          </span>
        )}
      </div>

      <div style={{
        background: hasEvent 
          ? (isGranted ? 'rgba(16, 185, 129, 0.08)' : 'rgba(244, 63, 94, 0.08)')
          : 'rgba(31, 41, 55, 0.5)',
        border: `1px solid ${hasEvent 
          ? (isGranted ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)')
          : 'rgba(75, 85, 99, 0.25)'}`,
        padding: '1.25rem',
        borderRadius: '10px',
        margin: '1rem 0'
      }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
          Latest Access Attempt
        </div>
        <div style={{
          fontSize: '1.25rem',
          fontWeight: 700,
          color: hasEvent ? (isGranted ? '#34d399' : '#fb7185') : 'var(--text-main)',
          marginBottom: '0.5rem'
        }}>
          {label}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
          <span style={{ color: 'var(--text-dim)' }}>UID:</span>
          <span className="mono-chip">{uid}</span>
        </div>
      </div>

      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'flex', justifyContent: 'space-between' }}>
        <span>Time: {time}</span>
        <span>SPI (3.3V)</span>
      </div>
    </div>
  );
}
