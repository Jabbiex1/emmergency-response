const db = require('../db');

// CREATE INCIDENT
const createIncident = async (req, res) => {
  const { emergency_type, description, latitude, longitude } = req.body;
  const user_id = req.user.id;

  try {
    // Create the incident
    const incident = await db.query(
      `INSERT INTO incidents (user_id, emergency_type, description, latitude, longitude, status)
       VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
      [user_id, emergency_type, description, latitude, longitude]
    );

    // Find nearest available responder
    const responder = await db.query(
      `SELECT r.*, u.full_name, u.phone FROM responders r
       JOIN users u ON r.user_id = u.id
       WHERE r.is_available = true AND r.is_verified = true
       ORDER BY (
         (r.latitude - $1)^2 + (r.longitude - $2)^2
       ) ASC LIMIT 1`,
      [latitude, longitude]
    );

    if (responder.rows.length === 0) {
      return res.status(201).json({
        message: 'Incident created but no responders available right now',
        incident: incident.rows[0]
      });
    }

    const assignedResponder = responder.rows[0];

    // Assign responder to incident
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

    res.status(201).json({
      message: 'Incident created and responder assigned',
      incident: updatedIncident.rows[0],
      responder: {
        id: assignedResponder.id,
        full_name: assignedResponder.full_name,
        phone: assignedResponder.phone,
        responder_type: assignedResponder.responder_type
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

module.exports = {
  createIncident,
  updateIncidentStatus,
  getAllIncidents,
  getUserIncidents,
  getIncident
};