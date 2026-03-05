const db = require('../db');

// GET ALL RESPONDERS
const getAllResponders = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT r.*, u.full_name, u.phone, u.email FROM responders r
       JOIN users u ON r.user_id = u.id
       ORDER BY r.created_at DESC`
    );
    res.json({ responders: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// VERIFY RESPONDER
const verifyResponder = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(
      `UPDATE responders SET is_verified = true WHERE id = $1 RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Responder not found' });
    }
    res.json({ message: 'Responder verified', responder: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// UNVERIFY RESPONDER
const unverifyResponder = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(
      `UPDATE responders SET is_verified = false WHERE id = $1 RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Responder not found' });
    }
    res.json({ message: 'Responder unverified', responder: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// UPDATE RESPONDER SPECIALIZATION
const updateSpecialization = async (req, res) => {
  const { id } = req.params;
  const { specialization } = req.body;

  const validSpecializations = ['medical', 'fire', 'crime', 'mental_health'];
  if (!validSpecializations.includes(specialization)) {
    return res.status(400).json({ error: 'Invalid specialization' });
  }

  try {
    const result = await db.query(
      `UPDATE responders SET specialization = $1 WHERE id = $2 RETURNING *`,
      [specialization, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Responder not found' });
    }
    res.json({ message: 'Specialization updated', responder: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// DELETE RESPONDER
const deleteResponder = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query(`DELETE FROM responders WHERE id = $1`, [id]);
    res.json({ message: 'Responder removed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getAllResponders,
  verifyResponder,
  unverifyResponder,
  updateSpecialization,
  deleteResponder
};