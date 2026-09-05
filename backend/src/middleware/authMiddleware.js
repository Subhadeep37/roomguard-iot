// Validates the x-api-key header sent by the ESP32 on every /api/device/* call.

function validateDeviceApiKey(req, res, next) {
  const configuredKey = process.env.DEVICE_API_KEY;

  if (!configuredKey) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_MISCONFIGURED',
        message: 'DEVICE_API_KEY is not set on the server. Set it in backend/.env before accepting device traffic.'
      }
    });
  }

  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: { code: 'MISSING_API_KEY', message: 'Missing x-api-key header.' }
    });
  }

  if (apiKey !== configuredKey) {
    return res.status(403).json({
      success: false,
      error: { code: 'INVALID_API_KEY', message: 'Invalid device API key.' }
    });
  }

  next();
}

module.exports = { validateDeviceApiKey };
