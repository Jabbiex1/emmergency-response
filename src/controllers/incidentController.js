const db = require('../db');
const { getFirstAidGuidance, getSeverityScore } = require('../services/aiService');

// CREATE INCIDENT
const createIncident = async (req, res) => {
  const { emergency_type, description, latitude, longitude } = req.body;
  const user_id = req.user.id;

  try {
    // Get AI first aid guidance and severity simultaneously
    const [firstAid, severity] = await Promise.all([
      getFirstAidGuidance(emergency_type, description),
      getSeverityScore(emergency_type, description)
    ]);

    // Create the incident
    const incident = await db.query(
      `INSERT INTO incidents (user_id, emergency_type, description, latitude, longitude, status)
       VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
      [user_id, emergency_type, description, latitude, longitude]
    );

    // Find nearest available specialized responder
    const responder = await db.query(
      `SELECT r.*, u.full_name, u.phone, u.id as user_id FROM responders r
       JOIN users u ON r.user_id = u.id
       WHERE r.is_available = true
       AND r.is_verified = true
       AND r.specialization = $3
       ORDER BY (
         (r.latitude - $1)^2 + (r.longitude - $2)^2
       ) ASC LIMIT 1`,
      [latitude, longitude, emergency_type]
    );

    const responseData = {
      first_aid_guidance: firstAid,
      severity: severity,
      incident: incident.rows[0]
    };

    if (responder.rows.length === 0) {
      responseData.message = 'Incident created but no specialized responders available right now';
      return res.status(201).json(responseData);
    }

    const assignedResponder = responder.rows[0];

    // Update incident with responder
    const updatedIncident = await db.query(
      `UPDATE incidents SET responder_id = $1, status = 'assigned'
       WHERE id = $2 RETURNING *`,
      [assignedResponder.id, incident.rows[0].id]
    );

    // Mark responder as unavailable
    await db.query(
      `UPDATE responders SET is_available = false WHERE id = $1`,
      [assignedResponder.id]
    );

    // Get user info for the alert
    const userInfo = await db.query(
      `SELECT full_name, phone, blood_type, allergies, medical_conditions FROM users WHERE id = $1`,
      [user_id]
    );

    // Send real-time alert to responder via Socket.io
    const { io } = require('../index');
    io.to(`responder_${assignedResponder.user_id}`).emit('new_incident_alert', {
      incident: updatedIncident.rows[0],
      user: userInfo.rows[0],
      first_aid_guidance: firstAid,
      severity: severity
    });

    responseData.message = 'Incident created and responder notified';
    responseData.incident = updatedIncident.rows[0];
    responseData.responder = {
      id: assignedResponder.id,
      full_name: assignedResponder.full_name,
      phone: assignedResponder.phone,
      responder_type: assignedResponder.specialization
    };

    res.status(201).json(responseData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// PUSH INCIDENT TO NEXT RESPONDER
const pushIncidentToNext = async (req, res) => {
  const { id } = req.params;

  try {
    // Get current incident
    const incident = await db.query(
      `SELECT * FROM incidents WHERE id = $1`,
      [id]
    );

    if (incident.rows.length === 0) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    const currentIncident = incident.rows[0];
    const currentResponderId = currentIncident.responder_id;

    // Free up current responder
    if (currentResponderId) {
      await db.query(
        `UPDATE responders SET is_available = true WHERE id = $1`,
        [currentResponderId]
      );
    }

    // Find next nearest available specialized responder (excluding current)
    const nextResponder = await db.query(
      `SELECT r.*, u.full_name, u.phone, u.id as user_id FROM responders r
       JOIN users u ON r.user_id = u.id
       WHERE r.is_available = true
       AND r.is_verified = true
       AND r.specialization = $3
       AND r.id != $4
       ORDER BY (
         (r.latitude - $1)^2 + (r.longitude - $2)^2
       ) ASC LIMIT 1`,
      [currentIncident.latitude, currentIncident.longitude, currentIncident.emergency_type, currentResponderId]
    );

    if (nextResponder.rows.length === 0) {
      return res.status(200).json({ message: 'No other responders available right now' });
    }

    const assignedResponder = nextResponder.rows[0];

    // Update incident with new responder
    const updatedIncident = await db.query(
      `UPDATE incidents SET responder_id = $1, status = 'assigned'
       WHERE id = $2 RETURNING *`,
      [assignedResponder.id, id]
    );

    // Mark new responder as unavailable
    await db.query(
      `UPDATE responders SET is_available = false WHERE id = $1`,
      [assignedResponder.id]
    );

    // Get user info
    const userInfo = await db.query(
      `SELECT full_name, phone, blood_type, allergies, medical_conditions FROM users WHERE id = $1`,
      [currentIncident.user_id]
    );

    // Send real-time alert to new responder
    const { io } = require('../index');
    io.to(`responder_${assignedResponder.user_id}`).emit('new_incident_alert', {
      incident: updatedIncident.rows[0],
      user: userInfo.rows[0]
    });

    res.json({
      message: 'Incident pushed to next responder',
      incident: updatedIncident.rows[0],
      responder: {
        id: assignedResponder.id,
        full_name: assignedResponder.full_name,
        phone: assignedResponder.phone,
        responder_type: assignedResponder.specialization
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// UPDATE INCIDENT STATUS
const updateIncidentStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['pending', 'assigned', 'en_route', 'arrived', 'resolved'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    const result = await db.query(
      `UPDATE incidents SET status = $1, resolved_at = $2
       WHERE id = $3 RETURNING *`,
      [status, status === 'resolved' ? new Date() : null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    // If resolved, mark responder as available again
    if (status === 'resolved') {
      const incident = result.rows[0];
      if (incident.responder_id) {
        await db.query(
          `UPDATE responders SET is_available = true WHERE id = $1`,
          [incident.responder_id]
        );
      }
    }

    // Send real-time status update
    const { io } = require('../index');
    io.to(id).emit('incident_status', { status });

    res.json({ message: 'Incident status updated', incident: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET ALL INCIDENTS (admin)
const getAllIncidents = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT i.*, u.full_name as user_name, u.phone as user_phone
       FROM incidents i
       JOIN users u ON i.user_id = u.id
       ORDER BY i.created_at DESC`
    );
    res.json({ incidents: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET USER'S OWN INCIDENTS
const getUserIncidents = async (req, res) => {
  const user_id = req.user.id;
  try {
    const result = await db.query(
      `SELECT * FROM incidents WHERE user_id = $1 ORDER BY created_at DESC`,
      [user_id]
    );
    res.json({ incidents: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET SINGLE INCIDENT
const getIncident = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(
      `SELECT i.*, u.full_name as user_name, u.phone as user_phone
       FROM incidents i
       JOIN users u ON i.user_id = u.id
       WHERE i.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    res.json({ incident: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET RESPONDER'S ASSIGNED INCIDENTS
const getResponderIncidents = async (req, res) => {
  const user_id = req.user.id;
  try {
    const responder = await db.query(
      `SELECT id FROM responders WHERE user_id = $1`,
      [user_id]
    );

    if (responder.rows.length === 0) {
      return res.status(404).json({ error: 'Responder profile not found' });
    }

    const responder_id = responder.rows[0].id;

    const result = await db.query(
      `SELECT i.*, u.full_name as user_name, u.phone as user_phone
       FROM incidents i
       JOIN users u ON i.user_id = u.id
       WHERE i.responder_id = $1
       ORDER BY i.created_at DESC`,
      [responder_id]
    );

    res.json({ incidents: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createIncident,
  pushIncidentToNext,
  updateIncidentStatus,
  getAllIncidents,
  getUserIncidents,
  getIncident,
  getResponderIncidents
};