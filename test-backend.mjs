/**
 * Test script to verify backend is generating unique questions
 * Run this to test if the backend API is actually calling Haiku
 */

const TEST_ANSWERS = [
  { question: "What's your name?", answer: "Test User" },
  { question: "Tell me about yourself.", answer: "I'm a father of three struggling with work-life balance and feeling guilty about not spending enough time with my kids." }
];

const TEST_BASE = {
  question: "What's been on your heart lately?",
  subtext: "The thing that's there when the noise quiets down."
};

async function testBackend() {
  console.log('Testing backend API...\n');
  console.log('Sending answers:', TEST_ANSWERS);
  console.log('');

  const backendUrl = 'https://oversight-cloning.vibecode.run';
  
  const contextStr = TEST_ANSWERS
    .map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`)
    .join('\n\n');

  const adaptiveSystemPrompt = `You generate deeply personal follow-up questions for a Christian devotional app's discovery process.

YOUR ROLE: You're like a wise spiritual director who listens so well that your next question makes the person feel truly heard.

THIS IS THE OPENING QUESTION. The person is just starting to share.

YOUR GOAL: Help them name what's present for them right now.

CRITICAL RULES:
- Generate a COMPLETELY ORIGINAL question — do NOT use templates
- The question MUST feel like it could only be asked to THIS person based on what they've shared
- The question should feel like the natural next beat in a real conversation
- NEVER ask questions that suggest their own answer

RESPOND WITH VALID JSON ONLY: {"question": "...", "subtext": "..."}`;

  const adaptiveUserPrompt = `Here's what this person has shared so far:

${contextStr}

Generate the next question in this conversation. It should feel like it emerges directly from what they just said — not like a generic template.

IMPORTANT: They mentioned being a father struggling with work-life balance and feeling guilty. Your question should directly reference this.

Make them feel heard. Do NOT ask a question that steers them toward a predetermined answer.`;

  try {
    console.log('Calling backend:', backendUrl + '/api/generate/adaptive-question');
    console.log('Model: claude-haiku-4-5-20251001');
    console.log('');

    const response = await fetch(backendUrl + '/api/generate/adaptive-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        temperature: 0.9,
        system: adaptiveSystemPrompt,
        messages: [{ role: 'user', content: adaptiveUserPrompt }],
      }),
    });

    console.log('Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Backend error:', errorText);
      return;
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;

    if (!content) {
      console.error('No content in response:', data);
      return;
    }

    console.log('\nRaw response:', content);
    
    const parsed = JSON.parse(content);
    console.log('\n✅ Parsed result:');
    console.log('Question:', parsed.question);
    console.log('Subtext:', parsed.subtext);
    
    // Check if it's truly unique
    const isGeneric = parsed.question.includes("What's been on your heart") ||
                      parsed.question.includes("underneath that");
    
    if (isGeneric) {
      console.log('\n❌ WARNING: Question appears to be generic/template!');
      console.log('   The backend may not be calling Haiku correctly.');
    } else {
      console.log('\n✅ SUCCESS: Question appears to be uniquely generated!');
    }

  } catch (err) {
    console.error('Test failed:', err);
  }
}

testBackend();
