export const COMPANION_PERSONALITIES = [
  { value: 'gentle', label: 'Gentle', description: 'Quiet warmth, with room to think.' },
  { value: 'thoughtful', label: 'Thoughtful', description: 'Curious questions and deeper connections.' },
  { value: 'encouraging', label: 'Encouraging', description: 'Hope and a practical next step.' },
] as const;

export type CompanionPersonality = (typeof COMPANION_PERSONALITIES)[number]['value'];

export function resolveCompanionPersonality(value: unknown): CompanionPersonality {
  return value === 'thoughtful' || value === 'encouraging' ? value : 'gentle';
}
