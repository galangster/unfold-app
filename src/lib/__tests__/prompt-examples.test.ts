import { getPersonaExample, UNIVERSAL_EXAMPLES, getDynamicExampleXml, setCachedDynamicExample } from '@/lib/prompt-examples';
import type { PersonaTrait } from '@/constants/devotional-personas-v2';

// All 27 PersonaTrait values
const ALL_TRAITS: PersonaTrait[] = [
  'gentle', 'challenging', 'poetic', 'scholarly', 'narrative', 'raw', 'warm',
  'prophetic', 'mystical', 'pastoral', 'witty', 'urgent', 'confessional',
  'practical', 'liturgical', 'apophatic', 'monastic', 'prophetic_lament',
  'doxological', 'socratic', 'midwife', 'iconoclast', 'elder', 'pilgrim',
  'artisan', 'comic', 'intercessor',
];

describe('prompt-examples', () => {
  it('UNIVERSAL_EXAMPLES is non-empty and contains XML tags', () => {
    expect(UNIVERSAL_EXAMPLES.length).toBeGreaterThan(100);
    expect(UNIVERSAL_EXAMPLES).toContain('<examples>');
    expect(UNIVERSAL_EXAMPLES).toContain('</examples>');
  });

  it('every PersonaTrait maps to a non-empty example', () => {
    for (const trait of ALL_TRAITS) {
      const example = getPersonaExample(trait);
      expect(example.length).toBeGreaterThan(50);
      expect(example).toContain('<persona_example');
    }
  });

  it('getDynamicExampleXml returns empty when no cache', () => {
    setCachedDynamicExample(null);
    expect(getDynamicExampleXml()).toBe('');
  });

  it('getDynamicExampleXml returns XML when cached', () => {
    setCachedDynamicExample({ rule: 'banned_phrase', badText: 'bad', goodText: 'good' });
    const xml = getDynamicExampleXml();
    expect(xml).toContain('<dynamic_example');
    expect(xml).toContain('bad');
    expect(xml).toContain('good');
    setCachedDynamicExample(null); // cleanup
  });
});
