import React, { useState, useEffect } from 'react';
import { fetchAccessEvents } from '../services/api';

export default function AccessHistoryTable({ latestEventTrigger }) {
  const [events, setEvents] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 8, total_pages: 1, total_records: 0 });
  const [filter, setFilter] = useState(''); // '' | 'ACCESS_GRANTED' | 'ACCESS_DENIED'
  const [isLoading, setIsLoading] = useState(false);

  const loadEvents = async (page = 1, currentFilter = filter) => {
    setIsLoading(true);
    try {
      const res = await fetchAccessEvents(page, pagination.limit, currentFilter);
      setEvents(res.events || []);
      setPagination(res.pagination || { page, limit: 8, total_pages: 1, total_records: 0 });
    } catch (err) {
      console.error('Failed to load access history:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadEvents(1, filter);
  }, [filter, latestEventTrigger]);

  const handleFilterChange = (newFilter) => {
    setFilter(newFilter);
  };

  const handlePrevPage = () => {
    if (pagination.page > 1) {
      loadEvents(pagination.page - 1);
    }
  };

  const handleNextPage = () => {
    if (pagination.page < pagination.total_pages) {
      loadEvents(pagination.page + 1);
    }
  };

  return (
    <div className="glass-card" style={{ gridColumn: 'span 6' }}>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem',
        gap: '0.75rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'rgba(245, 158, 11, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent-amber)'
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>RFID Access Log</h3>
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          <button
            onClick={() => handleFilterChange('')}
            style={{
              padding: '0.25rem 0.6rem',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 600,
              background: filter === '' ? 'var(--accent-emerald)' : 'rgba(31, 41, 55, 0.6)',
              color: filter === '' ? '#fff' : 'var(--text-muted)',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            All
          </button>
          <button
            onClick={() => handleFilterChange('ACCESS_GRANTED')}
            style={{
              padding: '0.25rem 0.6rem',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 600,
              background: filter === 'ACCESS_GRANTED' ? 'var(--accent-emerald)' : 'rgba(31, 41, 55, 0.6)',
              color: filter === 'ACCESS_GRANTED' ? '#fff' : 'var(--text-muted)',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Granted
          </button>
          <button
            onClick={() => handleFilterChange('ACCESS_DENIED')}
            style={{
              padding: '0.25rem 0.6rem',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 600,
              background: filter === 'ACCESS_DENIED' ? 'var(--accent-rose)' : 'rgba(31, 41, 55, 0.6)',
              color: filter === 'ACCESS_DENIED' ? '#fff' : 'var(--text-muted)',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Denied
          </button>
        </div>
      </div>

      {/* Events Table */}
      <div style={{ overflowX: 'auto', minHeight: '260px' }}>
        <table className="custom-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>UID</th>
              <th>Card / Identity</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '2rem' }}>
                  {isLoading ? 'Loading events...' : 'No access events recorded.'}
                </td>
              </tr>
            ) : (
              events.map((ev) => {
                const isGranted = ev.event_type === 'ACCESS_GRANTED';
                const timeStr = new Date(ev.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                });
                return (
                  <tr key={ev.id}>
                    <td style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>{timeStr}</td>
                    <td><span className="mono-chip">{ev.uid}</span></td>
                    <td style={{ fontWeight: 500 }}>{ev.card_label || 'Unknown'}</td>
                    <td>
                      <span className={`status-pill ${isGranted ? 'granted' : 'denied'}`} style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}>
                        {isGranted ? 'GRANTED' : 'DENIED'}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: '1rem',
        paddingTop: '0.75rem',
        borderTop: '1px solid var(--border-color)',
        fontSize: '0.8rem',
        color: 'var(--text-muted)'
      }}>
        <span>Page {pagination.page} of {pagination.total_pages || 1} ({pagination.total_records} events)</span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={handlePrevPage}
            disabled={pagination.page <= 1 || isLoading}
            style={{
              padding: '0.3rem 0.75rem',
              borderRadius: '6px',
              background: 'rgba(31, 41, 55, 0.8)',
              color: 'var(--text-main)',
              border: '1px solid var(--border-color)',
              cursor: pagination.page <= 1 ? 'not-allowed' : 'pointer',
              opacity: pagination.page <= 1 ? 0.5 : 1
            }}
          >
            Previous
          </button>
          <button
            onClick={handleNextPage}
            disabled={pagination.page >= pagination.total_pages || isLoading}
            style={{
              padding: '0.3rem 0.75rem',
              borderRadius: '6px',
              background: 'rgba(31, 41, 55, 0.8)',
              color: 'var(--text-main)',
              border: '1px solid var(--border-color)',
              cursor: pagination.page >= pagination.total_pages ? 'not-allowed' : 'pointer',
              opacity: pagination.page >= pagination.total_pages ? 0.5 : 1
            }}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
