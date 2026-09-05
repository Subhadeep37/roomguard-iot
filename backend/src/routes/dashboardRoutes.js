// Routes called by the React dashboard (see frontend/src/services/api.js).
const express = require('express');
const router = express.Router();

const dashboardController = require('../controllers/dashboardController');

router.get('/overview', dashboardController.getOverview);
router.get('/access-events', dashboardController.getAccessEvents);
router.get('/environment', dashboardController.getEnvironment);
router.post('/dht11/request', dashboardController.requestDht11);
router.get('/dht11/latest', dashboardController.getLatestDht11);

// Note: GET /stream (SSE) is wired up directly in server.js because it needs
// access to the raw `res` object outside the normal JSON response cycle.

module.exports = router;
