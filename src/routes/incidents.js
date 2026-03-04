const express = require('express');
const router = express.Router();
const {
  createIncident,
  pushIncidentToNext,
  updateIncidentStatus,
  getAllIncidents,
  getUserIncidents,
  getIncident,
  getResponderIncidents
} = require('../controllers/incidentController');
const { protect, adminOnly } = require('../middleware/auth');

router.post('/', protect, createIncident);
router.get('/my-incidents', protect, getUserIncidents);
router.get('/responder-incidents', protect, getResponderIncidents);
router.post('/:id/push', protect, pushIncidentToNext);
router.get('/:id', protect, getIncident);
router.put('/:id/status', protect, updateIncidentStatus);
router.get('/', protect, adminOnly, getAllIncidents);

module.exports = router;