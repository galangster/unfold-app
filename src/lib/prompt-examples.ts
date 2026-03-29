/**
 * Few-shot examples for AI prompt engineering.
 *
 * Static examples anchor quality. Dynamic examples auto-target
 * the most-violated rule from the self-improving system.
 */

import type { PersonaTrait } from '@/constants/devotional-personas-v2';

// ---------------------------------------------------------------------------
// Universal Core Examples (3 -- injected into every devotional generation)
// ---------------------------------------------------------------------------

export const UNIVERSAL_EXAMPLES = `<examples>
<example type="good" label="natural opening">
{name}, there is a verse you have probably read a dozen times. Romans 8:28, the one about all things working together. Most people stop there.

But the next verse says something that changes the whole picture. God is shaping you into the image of His Son. Not fixing you. Not optimizing you. Shaping you.

That is a slower word. A more patient word.
</example>

<example type="contrast" label="banned patterns vs clean writing">
<bad>
This journey of faith is truly beautiful. Have you ever felt like God was doing something incredible in your life? Here's the thing, that's not weakness, that's courage. Let that sink in. In a world where everyone is searching, God meets you right where you are.
</bad>
<good>
Faith does not always feel like progress. Some mornings you wake up and wonder if anything changed at all. Paul knew that feeling. He called it groaning. The whole creation groans, he said, and so do you. That is honest. And God does not flinch at honest.
</good>
</example>

<example type="good" label="closing">
So here is the question you might carry into tomorrow: What if the thing you are most afraid to say out loud is the exact thing God is waiting to hear from you?
</example>
</examples>`;

// ---------------------------------------------------------------------------
// Persona-specific examples (1 per archetype, ~100 words each)
// ---------------------------------------------------------------------------

const PERSONA_EXAMPLES: Record<string, string> = {
  gentle_guide: `<persona_example voice="gentle_guide">
{name}, you might not feel ready for this. That is okay.

There is a verse in Isaiah where God tells His people to wait. Not the motivational-poster kind of waiting. The kind where your legs are tired and you are not sure the sun is coming up. "Those who wait on the Lord shall renew their strength."

Renew. Not create from scratch. He is not asking you to start over. He is asking you to stay.

What would it look like to stay one more day?
</persona_example>`,

  prophetic_challenger: `<persona_example voice="prophetic_challenger">
{name}, you have been playing it safe. You know it.

James did not mince words: "Faith without works is dead." Not struggling. Not tired. Dead. That is a hard word because James meant it to be hard.

The question is not whether you believe the right things. You do. The question is whether your Tuesday looks any different because of it.

God is not interested in your theology if it never makes it to your calendar. So what are you going to do about this week?
</persona_example>`,

  poetic_mystic: `<persona_example voice="poetic_mystic">
There is a kind of silence that feels like absence. And then there is the silence of someone sitting beside you who does not need to speak.

{name}, the psalmist called it selah. Pause. Breathe. Let the weight of the words settle like dust after a long walk.

God is not always loud. Sometimes He is the space between the notes. The rest in the music that makes the melody make sense.

You do not need to fill the quiet today. Just be in it.
</persona_example>`,

  scholarly_pastor: `<persona_example voice="scholarly_pastor">
{name}, the Greek word Paul uses here is katallage. Most translations say "reconciliation," but that misses something. Katallage means an exchange, a complete reversal of relationship.

In the Roman world, this was a diplomatic term. Two nations at war would undergo katallage, a formal restoration of peace. Paul borrows that word and gives it to a carpenter from Nazareth and a God who refuses to stay angry.

That context matters because reconciliation is not a feeling. It is an accomplished fact. What changes when you stop trying to earn what has already been given?
</persona_example>`,

  storyteller: `<persona_example voice="storyteller">
A woman in the third century named Perpetua kept a diary in prison. She was twenty-two, had a baby, and her father begged her to recant. She wrote that she could no more call herself something other than Christian than a jug could call itself something other than a jug.

{name}, she meant every word. She had lost the ability to pretend.

Most of faith is not dramatic. It is the quiet refusal to be something you are not, even when it would be easier.

What are you pretending about right now?
</persona_example>`,
};

// ---------------------------------------------------------------------------
// Trait-to-archetype mapping (v2 PersonaTraits -> v1 example key)
// ---------------------------------------------------------------------------

const TRAIT_TO_ARCHETYPE: Record<string, string> = {
  gentle: 'gentle_guide',
  warm: 'gentle_guide',
  pastoral: 'gentle_guide',
  midwife: 'gentle_guide',
  intercessor: 'gentle_guide',
  challenging: 'prophetic_challenger',
  prophetic: 'prophetic_challenger',
  urgent: 'prophetic_challenger',
  iconoclast: 'prophetic_challenger',
  prophetic_lament: 'prophetic_challenger',
  poetic: 'poetic_mystic',
  mystical: 'poetic_mystic',
  apophatic: 'poetic_mystic',
  doxological: 'poetic_mystic',
  liturgical: 'poetic_mystic',
  monastic: 'poetic_mystic',
  scholarly: 'scholarly_pastor',
  socratic: 'scholarly_pastor',
  practical: 'scholarly_pastor',
  narrative: 'storyteller',
  raw: 'storyteller',
  confessional: 'storyteller',
  comic: 'storyteller',
  pilgrim: 'storyteller',
  artisan: 'storyteller',
  elder: 'storyteller',
  witty: 'storyteller',
};

export function getPersonaExample(primaryTrait: PersonaTrait): string {
  const archetype = TRAIT_TO_ARCHETYPE[primaryTrait] || 'gentle_guide';
  return PERSONA_EXAMPLES[archetype] || PERSONA_EXAMPLES.gentle_guide;
}

// ---------------------------------------------------------------------------
// Dynamic example cache (from self-improving system)
// ---------------------------------------------------------------------------

let cachedDynamicExample: { rule: string; badText: string; goodText: string } | null = null;

export function setCachedDynamicExample(example: { rule: string; badText: string; goodText: string } | null): void {
  cachedDynamicExample = example;
}

export function getDynamicExampleXml(): string {
  if (!cachedDynamicExample) return '';
  return `
<dynamic_example rule="${cachedDynamicExample.rule}" reason="This rule has a high violation rate, pay extra attention">
<bad>${cachedDynamicExample.badText}</bad>
<good>${cachedDynamicExample.goodText}</good>
</dynamic_example>`;
}
