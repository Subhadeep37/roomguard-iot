import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import DeviceStatus from './components/DeviceStatus';
import Bmp280Card from './components/Bmp280Card';
import Dht11Card from './components/Dht11Card';
import RfidCard from './components/RfidCard';
import EnvironmentCharts from './components/EnvironmentCharts';
import AccessHistoryTable from './components/AccessHistoryTable';
import { fetchOverview, createEventStream } from './services/api';

export default function App() {
  const [overview, setOverview] = useState(null);
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRfidTrigger, setLastRfidTrigger] = useState(null);
  const [chartRefreshTrigger, setChartRefreshTrigger] = useState(0);

  // Load initial dashboard overview data
  const loadOverview = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const data = await fetchOverview('ROOMGUARD-01');
      setOverview(data);
    } catch (err) {
      console.error('Failed to load overview telemetry:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();

    // Setup Server-Sent Events (SSE) stream
    const unsubscribe = createEventStream(
      (eventType, payload) => {
        setIsLiveConnected(true);

        if (eventType === 'heartbeat') {
          setOverview(prev => prev ? {
            ...prev,
            device: {
              ...prev.device,
              status: payload.status,
              is_online: payload.status === 'ONLINE',
              wifi_rssi: payload.wifi_rssi,
              uptime_seconds: payload.uptime_seconds,
              last_ping: payload.last_ping,
              firmware_version: payload.firmware_version
            }
          } : null);
        } else if (eventType === 'sensor_reading') {
          setOverview(prev => prev ? {
            ...prev,
            latest_bmp280: {
              temperature: payload.temperature,
              pressure: payload.pressure,
              recorded_at: payload.recorded_at
            }
          } : null);
          setChartRefreshTrigger(c => c + 1);
        } else if (eventType === 'rfid_event') {
          setOverview(prev => prev ? {
            ...prev,
            latest_rfid: {
              uid: payload.uid,
              card_label: payload.card_label,
              event_type: payload.event_type,
              timestamp: payload.timestamp
            }
          } : null);
          setLastRfidTrigger(Date.now());
        } else if (eventType === 'dht11_reading') {
          setOverview(prev => prev ? {
            ...prev,
            latest_dht11: {
              temperature: payload.temperature,
              humidity: payload.humidity,
              measured_at: payload.measured_at
            }
          } : null);
        }
      },
      (err) => {
        setIsLiveConnected(false);
      }
    );

    // Fallback polling interval every 15s to keep device status fresh
    const pollInterval = setInterval(() => {
      loadOverview();
    }, 15000);

    return () => {
      unsubscribe();
      clearInterval(pollInterval);
    };
  }, [loadOverview]);

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '1rem 1.5rem 3rem 1.5rem' }}>
      {/* Header Bar */}
      <Header
        isLiveConnected={isLiveConnected}
        onRefresh={loadOverview}
        isRefreshing={isRefreshing}
      />

      {/* Main Dashboard Grid */}
      <main className="dashboard-grid">
        {/* Device Gateway Status Header (Span 12) */}
        <DeviceStatus device={overview?.device} />

        {/* 3 Core Metric Cards (Span 4 each) */}
        <Bmp280Card data={overview?.latest_bmp280} />
        <Dht11Card initialData={overview?.latest_dht11} deviceId={overview?.device?.id} />
        <RfidCard data={overview?.latest_rfid} />

        {/* Historical Charts & RFID Access Table (Span 6 each) */}
        <EnvironmentCharts
          deviceId={overview?.device?.id}
          refreshTrigger={chartRefreshTrigger}
        />
        <AccessHistoryTable latestEventTrigger={lastRfidTrigger} />
      </main>

      {/* Footer */}
      <footer style={{
        marginTop: '3rem',
        paddingTop: '1.5rem',
        borderTop: '1px solid var(--border-color)',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '1rem',
        fontSize: '0.8rem',
        color: 'var(--text-dim)'
      }}>
        <div>
          <strong>ROOMGUARD IoT</strong> — Hardware: ESP32 DevKit V1 • GY-B11 BMP280 • RC522 RFID • DHT11
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <span>PostgreSQL Time-Series</span>
          <span>•</span>
          <span>REST API / SSE Push</span>
          <span>•</span>
          <span style={{ color: 'var(--accent-emerald)' }}>Production Ready</span>
        </div>
      </footer>
    </div>
  );
}
