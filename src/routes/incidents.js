const express = require('express');
const router = express.Router();
const {
  createIncident,
  updateIncidentStatus,
  getAllIncidents,
  getUserIncidents,
  getIncident
} = require('../controllers/incidentController');
const { protect, adminOnly } = require('../middleware/auth');

// All routes require login
router.post('/', protect, createIncident);
router.get('/my-incidents', protect, getUserIncidents);
router.get('/:id', protect, getIncident);
router.put('/:id/status', protect, updateIncidentStatus);
router.get('/', protect, adminOnly, getAllIncidents);

module.exports = router;