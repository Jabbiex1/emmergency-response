const express = require('express');
const router = express.Router();
const { handleUSSD } = require('../services/ussdService');

router.post('/', async (req, res) => {
  console.log('USSD request received:', req.body);
  const { sessionId, serviceCode, phoneNumber, text } = req.body;

  try {
    const response = await handleUSSD(sessionId, serviceCode, phoneNumber, text);
    console.log('USSD response:', response);
    res.set('Content-Type', 'text/plain');
    res.send(response);
  } catch (error) {
    console.error('USSD route error:', error);
    res.set('Content-Type', 'text/plain');
    res.send('END Sorry, an error occurred. Please try again.');
  }
});

module.exports = router;