const Groq = require('groq-sdk');

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// GET FIRST AID GUIDANCE
const getFirstAidGuidance = async (emergency_type, description) => {
  try {
    const response = await groq.chat.completions.create({
      model: 'llama3-8b-8192',
      messages: [
        {
          role: 'system',
          content: `You are an emergency first aid assistant. 
          Provide clear, calm, and concise first aid instructions.
          Always number your steps.
          Keep instructions simple enough for a non-medical person to follow.
          End with a reminder that professional help is on the way.
          Maximum 8 steps.`
        },
        {
          role: 'user',
          content: `Emergency type: ${emergency_type}
          Description: ${description}
          Please provide immediate first aid instructions.`
        }
      ],
      max_tokens: 500
    });

    return response.choices[0].message.content;
  } catch (error) {
    // Fallback first aid tips if AI is unavailable
    return getFallbackTips(emergency_type);
  }
};

// GET SEVERITY SCORE
const getSeverityScore = async (emergency_type, description) => {
  try {
    const response = await groq.chat.completions.create({
      model: 'llama3-8b-8192',
      messages: [
        {
          role: 'system',
          content: `You are an emergency triage assistant.
          Based on the emergency type and description, respond with ONLY one word:
          LOW, MEDIUM, or CRITICAL.
          No explanation, just the single word.`
        },
        {
          role: 'user',
          content: `Emergency type: ${emergency_type}
          Description: ${description}
          What is the severity level?`
        }
      ],
      max_tokens: 10
    });

    const severity = response.choices[0].message.content.trim().toUpperCase();
    if (['LOW', 'MEDIUM', 'CRITICAL'].includes(severity)) {
      return severity;
    }
    return 'MEDIUM';
  } catch (error) {
    return 'MEDIUM';
  }
};

// FALLBACK TIPS (when AI is offline)
const getFallbackTips = (emergency_type) => {
  const tips = {
    medical: `1. Stay calm and keep the person calm.
2. Call for help immediately.
3. Do not move the person unless necessary.
4. Check if the person is breathing.
5. If not breathing, begin CPR if trained.
6. Keep the person warm and comfortable.
7. Do not give food or water.
8. Help is on the way.`,

    fire: `1. Alert everyone nearby immediately.
2. Evacuate the building using nearest exit.
3. Do not use elevators.
4. Stay low if there is smoke.
5. Close doors behind you to slow fire spread.
6. Meet at a designated safe area outside.
7. Do not go back inside for any reason.
8. Help is on the way.`,

    crime: `1. Move to a safe location immediately.
2. Stay out of sight if possible.
3. Do not confront the threat directly.
4. Stay quiet and calm.
5. Help others move to safety if possible.
6. Barricade doors if sheltering in place.
7. Do not use your phone loudly.
8. Help is on the way.`,

    mental_health: `1. Stay calm and speak in a gentle tone.
2. Listen without judgment.
3. Do not leave the person alone.
4. Remove any harmful objects nearby.
5. Reassure them that help is coming.
6. Do not argue or raise your voice.
7. Keep the environment calm and quiet.
8. Help is on the way.`
  };

  return tips[emergency_type] || tips.medical;
};

module.exports = { getFirstAidGuidance, getSeverityScore };