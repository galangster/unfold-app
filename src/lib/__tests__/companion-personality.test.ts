import { resolveCompanionPersonality } from '../companion-personality';

it.each([undefined, null, 'unknown', {}, []])('uses Gentle for a missing or invalid saved value %j', (value) => {
  expect(resolveCompanionPersonality(value)).toBe('gentle');
});

it.each(['gentle', 'thoughtful', 'encouraging'])('retains the selected %s personality', (value) => {
  expect(resolveCompanionPersonality(value)).toBe(value);
});
