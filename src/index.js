const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const db = require('./db');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const incidentRoutes = require('./routes/incidents');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/incidents', incidentRoutes);

// Test route
app.get('/', (req, res) => {
  res.json({ message: 'Emergency Response API is running!' });
});

// Test database connection
app.get('/db-test', async (req, res) => {
  try {
    const result = await db.query('SELECT NOW()');
    res.json({ message: 'Database connected!', time: result.rows[0].now });
  } catch (error) {
    res.status(500).json({ error: 'Database connection failed' });
  }
});

// Socket.io - Real-time layer
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('join_incident', (incidentId) => {
    socket.join(incidentId);
    console.log(`User joined incident room: ${incidentId}`);
  });

  socket.on('update_location', (data) => {
    const { incidentId, latitude, longitude } = data;
    io.to(incidentId).emit('responder_location', { latitude, longitude });
  });

  socket.on('update_status', (data) => {
    const { incidentId, status } = data;
    io.to(incidentId).emit('incident_status', { status });
  });

  socket.on('send_message', (data) => {
    const { incidentId, message, sender } = data;
    io.to(incidentId).emit('new_message', { message, sender, time: new Date() });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { io };