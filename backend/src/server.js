// RoomGuard IoT — REST API + real-time (SSE) server.
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const logger = require('./utils/logger');
const db = require('./database/db');
const deviceRoutes = require('./routes/deviceRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const deviceController = require('./controllers/deviceController');
const { notFoundHandler, globalErrorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 5000;

// ---------------------------------------------------------------------------
// Security & parsing middleware
// ---------------------------------------------------------------------------

app.use(helmet({ contentSecurityPolicy: false })); // keep off for local dev convenience

function parseCorsOrigin(setting) {
  if (!setting || setting === '*') return '*';
  return setting.includes(',') ? setting.split(',').map(s => s.trim()) : setting.trim();
}

app.use(cors({
  origin: parseCorsOrigin(process.env.CORS_ORIGIN),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-api-key']
}));

app.use(express.json({ limit: '1mb' }));
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_JSON', message: 'Malformed JSON payload in request body.' }
    });
  }
  next(err);
});

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(':method :url :status :response-time ms'));
}

// ---------------------------------------------------------------------------
// Server-Sent Events stream — event names match frontend/src/services/api.js:
// 'heartbeat', 'sensor_reading', 'rfid_event', 'dht11_reading'
// ---------------------------------------------------------------------------

const sseClients = new Set();

function broadcastSSE(eventType, payload) {
  if (sseClients.size === 0) return;
  const message = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(message);
    } catch (err) {
      sseClients.delete(client);
    }
  }
}

deviceController.setBroadcastFunction(broadcastSSE);

app.get('/api/dashboard/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);
  logger.info(`[SSE] Dashboard client connected. Total: ${sseClients.size}`);

  const keepAlive = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch (err) {
      clearInterval(keepAlive);
      sseClients.delete(res);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
    logger.info(`[SSE] Dashboard client disconnected. Remaining: ${sseClients.size}`);
  });
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.use('/api/device', deviceRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'UP',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: db.getIsPostgres() ? 'PostgreSQL' : 'In-memory (dev mode)'
    }
  });
});

// Serve the built React dashboard, if present, from the same origin.
const frontendDistPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendDistPath));
app.get('*', (req, res, next) => {
  if (req.originalUrl.startsWith('/api')) return next();
  res.sendFile(path.join(frontendDistPath, 'index.html'), (err) => {
    if (err) next();
  });
});

app.use(notFoundHandler);
app.use(globalErrorHandler);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

let server = null;

async function startServer() {
  await db.initDatabase();
  server = app.listen(PORT, () => {
    logger.info('====================================================');
    logger.info(`  RoomGuard IoT backend running on port ${PORT}`);
    logger.info(`  Mode: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`  API base: http://localhost:${PORT}/api`);
    logger.info('====================================================');
  });
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer, broadcastSSE };
