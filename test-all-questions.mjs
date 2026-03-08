/**
 * Test all three discovery question types
 * Opening → Depth → Longing
 */

const BACKEND_URL = 'https://oversight-cloning.vibecode.run';

const USER_ANSWERS = [
  { question: "What's your name?", answer: "Sarah" },
  { question: "Tell me about yourself.", answer: "I'm a nurse working night shifts and feeling spiritually drained. I used to pray every morning but now I just collapse into bed." }
];

const STEP_INSTRUCTIONS = {
  opening: `THIS IS THE OPENING QUESTION. The person is just starting to share.

YOUR GOAL: Help them name what's present for them right now. If they chose a specific study type, book, character, or theme — the question MUST center on WHY they chose it and what it stirs in them.

CRITICAL: Reference their specific context (night shift nurse, spiritual drain, lost prayer routine)

RESPOND WITH VALID JSON ONLY: {"question": "...", "subtext": "..."}`,

  depth: `THIS IS THE GOING-DEEPER QUESTION. They've shared what's on the surface — now help them discover what's underneath.

YOUR GOAL: Guide them toward the root feeling, the deeper pattern, or the thing they haven't named yet.

CRITICAL: Pick up the emotional thread from their previous answers. Don't ask generic questions.

RESPOND WITH VALID JSON ONLY: {"question": "...", "subtext": "..."}`,

  longing: `THIS IS THE LONGING/BREAKTHROUGH QUESTION. They've shared what's happening and what's underneath — now help them name what they actually want.

YOUR GOAL: Help them articulate what they're hoping for, longing for, or need from God in this season.

CRITICAL: Connect their struggle to their unique hope — not a generic spiritual outcome.

RESPOND WITH VALID JSON ONLY: {"question": "...", "subtext": "..."}`
};

async function testQuestionType(stepPosition, previousAnswers) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TESTING: ${stepPosition.toUpperCase()} QUESTION`);
  console.log('='.repeat(60));
  
  const contextStr = previousAnswers
    .map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`)
    .join('\n\n');

  console.log('\nContext so far:');
  console.log(contextStr);
  console.log('');

  const baseQuestion = stepPosition === 'opening' 
    ? "What's been on your heart lately?"
    : stepPosition === 'depth'
    ? "And what's underneath that?"
    : "What would feel like a breath of fresh air right now?";

  try {
    const response = await fetch(BACKEND_URL + '/api/generate/adaptive-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        temperature: 0.9,
        system: STEP_INSTRUCTIONS[stepPosition],
        messages: [{
          role: 'user',
          content: `Here's what this person has shared so far:\n\n${contextStr}\n\nGenerate the next ${stepPosition} question. Make it deeply personal and specific to their situation.`
        }],
      }),
    });

    if (!response.ok) {
      console.error('Backend error:', response.status);
      return null;
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;

    // Handle markdown wrapper
    let jsonText = content;
    const markdownMatch = content.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
    if (markdownMatch) {
      jsonText = markdownMatch[1].trim();
    }

    const parsed = JSON.parse(jsonText);
    
    console.log('✅ Generated Question:');
    console.log('   Q:', parsed.question);
    console.log('   Subtext:', parsed.subtext);
    
    // Check if it's unique
    const isGeneric = parsed.question === baseQuestion || 
                      parsed.question.includes(baseQuestion);
    
    if (isGeneric) {
      console.log('❌ WARNING: This appears to be the generic base question!');
    } else {
      console.log('✅ SUCCESS: This is a uniquely generated question!');
    }
    
    return parsed;

  } catch (err) {
    console.error('Test failed:', err.message);
    return null;
  }
}

async function runFullTest() {
  console.log('Testing all three discovery question types...\n');
  console.log('User: Sarah, a night shift nurse feeling spiritually drained');
  
  const answers = [...USER_ANSWERS];
  
  // Test 1: Opening
  const openingResult = await testQuestionType('opening', answers);
  if (openingResult) {
    answers.push({
      question: openingResult.question,
      answer: "I miss feeling close to God. Everything feels dry and routine now."
    });
  }
  
  // Test 2: Depth
  const depthResult = await testQuestionType('depth', answers);
  if (depthResult) {
    answers.push({
      question: depthResult.question,
      answer: "I think I'm afraid that if I stop being 'productive' even for a moment, everything will fall apart."
    });
  }
  
  // Test 3: Longing
  const longingResult = await testQuestionType('longing', answers);
  
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log('Opening:', openingResult ? '✅ Working' : '❌ Failed');
  console.log('Depth:  ', depthResult ? '✅ Working' : '❌ Failed');
  console.log('Longing:', longingResult ? '✅ Working' : '❌ Failed');
}

runFullTest();
