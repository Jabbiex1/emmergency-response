const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// REGISTER
const register = async (req, res) => {
  const { full_name, email, phone, password, blood_type, allergies, medical_conditions, role } = req.body;

  try {
    // Check if user already exists
    const existing = await db.query('SELECT * FROM users WHERE phone = $1 OR email = $2', [phone, email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'User with this phone or email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user
    const result = await db.query(
      `INSERT INTO users (full_name, email, phone, password, blood_type, allergies, medical_conditions, role)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, full_name, email, phone, role`,
      [full_name, email, phone, hashedPassword, blood_type, allergies, medical_conditions, role || 'user']
    );

    const user = result.rows[0];

    // Generate token
    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({ message: 'Registration successful', user, token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// LOGIN
const login = async (req, res) => {
  const { phone, password } = req.body;

  try {
    // Find user
    const result = await db.query('SELECT * FROM users WHERE phone = $1', [phone]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Generate token
    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({ message: 'Login successful', user: { id: user.id, full_name: user.full_name, role: user.role }, token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { register, login };