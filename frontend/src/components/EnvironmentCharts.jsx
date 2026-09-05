import React, { useState, useEffect } from 'react';
import { fetchEnvironment } from '../services/api';

export default function EnvironmentCharts({ deviceId, refreshTrigger }) {
  const [range, setRange] = useState('24h');
  const [metric, setMetric] = useState('temperature'); // 'temperature' | 'pressure'
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      setIsLoading(true);
      try {
        const res = await fetchEnvironment(deviceId || 'ROOMGUARD-01', range);
        if (isMounted) {
          setData(res.readings || []);
        }
      } catch (err) {
        console.error('Failed to load chart environment telemetry:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    loadData();
    return () => { isMounted = false; };
  }, [deviceId, range, refreshTrigger]);

  // Extract points for SVG rendering
  const values = data.map(d => Number(d[metric]));
  const minVal = values.length > 0 ? Math.min(...values) : 0;
  const maxVal = values.length > 0 ? Math.max(...values) : 100;
  const valRange = (maxVal - minVal) === 0 ? 1 : (maxVal - minVal);

  const svgWidth = 600;
  const svgHeight = 220;
  const padding = 30;

  // Generate SVG Path
  const points = data.map((d, index) => {
    const x = padding + (index / Math.max(1, data.length - 1)) * (svgWidth - padding * 2);
    const normalizedY = (Number(d[metric]) - minVal) / valRange;
    const y = svgHeight - padding - normalizedY * (svgHeight - padding * 2);
    return { x, y, val: Number(d[metric]), time: d.timestamp };
  });

  const linePath = points.reduce((acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`, '');
  const areaPath = points.length > 0
    ? `${linePath} L ${points[points.length - 1].x} ${svgHeight - padding} L ${points[0].x} ${svgHeight - padding} Z`
    : '';

  const isTemp = metric === 'temperature';
  const strokeColor = isTemp ? '#10b981' : '#06b6d4';
  const unit = isTemp ? '°C' : 'hPa';

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
        {/* Metric Selector Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setMetric('temperature')}
            style={{
              padding: '0.35rem 0.8rem',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: 600,
              background: isTemp ? 'rgba(16, 185, 129, 0.2)' : 'rgba(31, 41, 55, 0.6)',
              color: isTemp ? '#34d399' : 'var(--text-muted)',
              border: `1px solid ${isTemp ? 'rgba(16, 185, 129, 0.4)' : 'var(--border-color)'}`,
              cursor: 'pointer'
            }}
          >
            Temperature (°C)
          </button>
          <button
            onClick={() => setMetric('pressure')}
            style={{
              padding: '0.35rem 0.8rem',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: 600,
              background: !isTemp ? 'rgba(6, 182, 212, 0.2)' : 'rgba(31, 41, 55, 0.6)',
              color: !isTemp ? '#22d3ee' : 'var(--text-muted)',
              border: `1px solid ${!isTemp ? 'rgba(6, 182, 212, 0.4)' : 'var(--border-color)'}`,
              cursor: 'pointer'
            }}
          >
            Pressure (hPa)
          </button>
        </div>

        {/* Time Range Selector */}
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          {['1h', '6h', '24h', '7d'].map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              style={{
                padding: '0.25rem 0.55rem',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 600,
                background: range === r ? 'rgba(59, 130, 246, 0.25)' : 'transparent',
                color: range === r ? '#60a5fa' : 'var(--text-dim)',
                border: `1px solid ${range === r ? 'rgba(59, 130, 246, 0.4)' : 'transparent'}`,
                cursor: 'pointer'
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* SVG Chart */}
      <div style={{ width: '100%', position: 'relative' }}>
        {isLoading && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(17, 24, 39, 0.6)',
            borderRadius: '8px',
            zIndex: 5
          }}>
            <div className="spinner"></div>
          </div>
        )}

        {data.length < 2 ? (
          <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
            Awaiting sufficient telemetry for {range} range...
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            style={{ width: '100%', height: '220px', overflow: 'visible' }}
          >
            <defs>
              <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={strokeColor} stopOpacity="0.35" />
                <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Grid Guideline */}
            <line x1={padding} y1={svgHeight - padding} x2={svgWidth - padding} y2={svgHeight - padding} stroke="rgba(75, 85, 99, 0.3)" strokeDasharray="3 3" />
            <line x1={padding} y1={padding} x2={svgWidth - padding} y2={padding} stroke="rgba(75, 85, 99, 0.3)" strokeDasharray="3 3" />

            {/* Area Fill */}
            <path d={areaPath} fill="url(#chartGradient)" />

            {/* Line Trace */}
            <path
              d={linePath}
              fill="none"
              stroke={strokeColor}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Latest Point Circle */}
            {points.length > 0 && (
              <circle
                cx={points[points.length - 1].x}
                cy={points[points.length - 1].y}
                r="4.5"
                fill="#ffffff"
                stroke={strokeColor}
                strokeWidth="2"
              />
            )}

            {/* Y Axis Labels */}
            <text x={padding - 6} y={padding + 4} fill="var(--text-dim)" fontSize="10" textAnchor="end">{maxVal.toFixed(1)}</text>
            <text x={padding - 6} y={svgHeight - padding + 4} fill="var(--text-dim)" fontSize="10" textAnchor="end">{minVal.toFixed(1)}</text>

            {/* X Axis Time Labels */}
            <text x={padding} y={svgHeight - 8} fill="var(--text-dim)" fontSize="10">Oldest</text>
            <text x={svgWidth - padding} y={svgHeight - 8} fill="var(--text-dim)" fontSize="10" textAnchor="end">Latest</text>
          </svg>
        )}
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: '0.5rem',
        fontSize: '0.75rem',
        color: 'var(--text-muted)'
      }}>
        <span>Range: <strong>{range}</strong></span>
        <span>Min: <strong style={{ color: '#fff' }}>{minVal.toFixed(1)} {unit}</strong></span>
        <span>Max: <strong style={{ color: '#fff' }}>{maxVal.toFixed(1)} {unit}</strong></span>
        <span>Samples: <strong>{data.length}</strong></span>
      </div>
    </div>
  );
}
