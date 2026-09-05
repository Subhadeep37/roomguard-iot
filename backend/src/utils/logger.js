// Structured logging utility for the RoomGuard backend.

const timestamp = () => new Date().toISOString();

module.exports = {
  info: (msg, meta) => console.log(`[${timestamp()}] [INFO]  ${msg}`, meta !== undefined ? meta : ''),
  warn: (msg, meta) => console.warn(`[${timestamp()}] [WARN]  ${msg}`, meta !== undefined ? meta : ''),
  error: (msg, meta) => console.error(`[${timestamp()}] [ERROR] ${msg}`, meta !== undefined ? meta : ''),
  debug: (msg, meta) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[${timestamp()}] [DEBUG] ${msg}`, meta !== undefined ? meta : '');
    }
  }
};
