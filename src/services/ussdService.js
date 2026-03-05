const AfricasTalking = require('africastalking');
const db = require('../db');
const { getFirstAidGuidance } = require('./aiService');

const africastalking = AfricasTalking({
  apiKey: process.env.AT_API_KEY,
  username: process.env.AT_USERNAME
});

const sms = africastalking.SMS;

// SEND SMS
const sendSMS = async (to, message) => {
  try {
    await sms.send({
      to: [to],
      message,
      from: 'Emergency'
    });
    console.log(`SMS sent to ${to}`);
  } catch (error) {
    console.error('SMS error:', error);
  }
};

// HANDLE USSD SESSION
const handleUSSD = async (sessionId, serviceCode, phoneNumber, text) => {
    text = text || '';
  let response = '';
  const input = text.split('*');
  const level = input.length;

  // Level 1 — Main Menu
  if (text === '') {
    response = `CON Welcome to Emergency Response
Please select emergency type:
1. Medical Emergency
2. Fire Emergency
3. Crime/Safety Threat
4. Mental Health Crisis`;
  }

  // Level 2 — Emergency type selected
  else if (level === 1) {
    const choice = input[0];
    const types = { '1': 'medical', '2': 'fire', '3': 'crime', '4': 'mental_health' };

    if (!types[choice]) {
      response = `END Invalid choice. Please try again by dialing the service code.`;
    } else {
      response = `CON You selected: ${types[choice].replace('_', ' ').toUpperCase()}
Please briefly describe your emergency:
1. Person unconscious
2. Building on fire
3. Armed threat nearby
4. Person in mental crisis
5. Other`;
    }
  }

  // Level 3 — Description selected, create incident
  else if (level === 2) {
    const typeChoice = input[0];
    const descChoice = input[1];

    const types = { '1': 'medical', '2': 'fire', '3': 'crime', '4': 'mental_health' };
    const descriptions = {
      '1': 'Person unconscious',
      '2': 'Building on fire',
      '3': 'Armed threat nearby',
      '4': 'Person in mental crisis',
      '5': 'Emergency situation'
    };

    const emergency_type = types[typeChoice];
    const description = descriptions[descChoice] || 'Emergency situation';

    if (!emergency_type) {
      response = `END Invalid choice. Please try again.`;
    } else {
      try {
        // Find user by phone number
        const userResult = await db.query(
          `SELECT * FROM users WHERE phone = $1`,
          [phoneNumber]
        );

        let userId;

        if (userResult.rows.length === 0) {
          // Create a basic user account for unregistered users
          const newUser = await db.query(
            `INSERT INTO users (full_name, phone, password, role)
             VALUES ($1, $2, $3, 'user') RETURNING id`,
            [`USSD User ${phoneNumber}`, phoneNumber, 'ussd_user']
          );
          userId = newUser.rows[0].id;
        } else {
          userId = userResult.rows[0].id;
        }

        // Create incident with approximate location (cell tower)
        const incident = await db.query(
          `INSERT INTO incidents (user_id, emergency_type, description, status)
           VALUES ($1, $2, $3, 'pending') RETURNING *`,
          [userId, emergency_type, description]
        );

        // Find nearest available specialized responder
        const responder = await db.query(
          `SELECT r.*, u.full_name, u.phone FROM responders r
           JOIN users u ON r.user_id = u.id
           WHERE r.is_available = true
           AND r.is_verified = true
           AND r.specialization = $1
           LIMIT 1`,
          [emergency_type]
        );

        // Get first aid tips
        const firstAid = await getFirstAidGuidance(emergency_type, description);
        const shortFirstAid = firstAid.split('\n').slice(0, 3).join(' ');

        if (responder.rows.length > 0) {
          const assignedResponder = responder.rows[0];

          // Update incident
          await db.query(
            `UPDATE incidents SET responder_id = $1, status = 'assigned' WHERE id = $2`,
            [assignedResponder.id, incident.rows[0].id]
          );

          // Mark responder unavailable
          await db.query(
            `UPDATE responders SET is_available = false WHERE id = $1`,
            [assignedResponder.id]
          );

          // SMS to user
          await sendSMS(
            phoneNumber,
            `EMERGENCY RESPONSE: Help is on the way! Responder: ${assignedResponder.full_name}. Call: ${assignedResponder.phone}. First Aid: ${shortFirstAid}`
          );

          // SMS to responder
          await sendSMS(
            assignedResponder.phone,
            `NEW EMERGENCY: ${emergency_type.toUpperCase()} reported. Description: ${description}. Caller: ${phoneNumber}. Please respond immediately.`
          );

          response = `END Emergency reported successfully!
Help is on the way.
Responder: ${assignedResponder.full_name}
Contact: ${assignedResponder.phone}
You will receive an SMS with first aid tips.`;
        } else {
          // SMS to user even if no responder
          await sendSMS(
            phoneNumber,
            `EMERGENCY RESPONSE: Your emergency has been logged. No responders available right now. First Aid: ${shortFirstAid}`
          );

          response = `END Emergency reported.
No responders available right now.
Your emergency has been logged.
You will receive an SMS with first aid tips.
Please call the nearest hospital.`;
        }
      } catch (error) {
        console.error('USSD error:', error);
        response = `END Sorry, an error occurred. Please try again or call emergency services directly.`;
      }
    }
  }

  else {
    response = `END Invalid input. Please try again by dialing the service code.`;
  }

  return response;
};

module.exports = { handleUSSD, sendSMS };