// Routes called by the ESP32 (see esp32/roomguard/roomguard.ino).
const express = require('express');
const router = express.Router();

const deviceController = require('../controllers/deviceController');
const { validateDeviceApiKey } = require('../middleware/authMiddleware');

router.use(validateDeviceApiKey);

router.post('/heartbeat', deviceController.heartbeat);
router.post('/sensor-data', deviceController.sensorData);
router.post('/rfid-event', deviceController.rfidEvent);
router.get('/commands', deviceController.getCommands);
router.post('/commands/:id/result', deviceController.submitCommandResult);

module.exports = router;
