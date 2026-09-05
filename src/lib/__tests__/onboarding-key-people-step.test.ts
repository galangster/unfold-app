import fs from 'node:fs';
import path from 'node:path';

// Jordan item 1 (key-people-multi): the step used the relationship label as
// row identity, so a second "Friend" tap deleted the first friend, and at the
// cap the chip only dimmed while still responding. The pure helpers are
// covered in onboarding-step-helpers.test.ts; this file pins the wiring in
// onboarding.tsx that the helper tests cannot see.

const repoRoot = path.join(__dirname, '../../..');
const source = fs.readFileSync(path.join(repoRoot, 'src/app/onboarding.tsx'), 'utf-8');

function sliceBetween(start: string, end: string): string {
  const from = source.indexOf(start);
  expect(from).toBeGreaterThan(-1);
  const to = source.indexOf(end, from);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe('onboarding key-people step wiring', () => {
  const step = sliceBetween("if (step.type === 'keyPeople') {", "if (step.type === 'upcomingEvent') {");

  it('regression: Jordan item 1 — a second tap on the same chip adds a person instead of deleting the first', () => {
    // Every chip press appends through the tested helper; nothing in the step
    // matches, filters, or keys rows by relationship any more.
    expect(step).toContain('const next = addKeyPerson(people, relationship);');
    expect(step).toContain('onPress={() => addPerson(relationship)}');
    expect(step).not.toContain('toggleRelationship');
    expect(step).not.toContain('p.relationship !== relationship');
    expect(step).not.toContain('p.relationship === relationship');
    expect(step).not.toContain('key={person.relationship}');

    // Removal and rename address a row by its id only.
    expect(step).toContain('keyPeople: removeKeyPerson(prev.keyPeople, id)');
    expect(step).toContain('onPress={() => removePerson(person.id)}');
    expect(step).toContain('keyPeople: renameKeyPerson(prev.keyPeople, id, name, INPUT_LIMITS.NAME.max)');
    expect(step).toContain('<View key={person.id}>');
  });

  it('regression: Jordan item 1 — at the 5-person cap the chip is truly disabled with a readable caption', () => {
    const chip = sliceBetween('KEY_PEOPLE_RELATIONSHIP_CHIPS.map((relationship) => {', '{capMessage && (');

    // The chip's disabled state, VoiceOver state, and hint all come from the
    // one tested helper, and `disabled` is a real prop so the press never fires.
    expect(chip).toContain('const chipA11y = keyPersonChipAccessibility(relationship, count, people.length);');
    expect(chip).toContain('disabled={chipA11y.disabled}');
    expect(chip).toContain('accessibilityState={{ disabled: chipA11y.disabled }}');
    expect(chip).toContain('accessibilityHint={chipA11y.hint}');

    // Belt and braces: a stale press at the cap returns before the haptic.
    const addPerson = sliceBetween('const addPerson = (relationship: string) => {', 'const removePerson =');
    expect(addPerson.indexOf('if (maxPeopleReached) return;')).toBeGreaterThan(-1);
    expect(addPerson.indexOf('if (maxPeopleReached) return;')).toBeLessThan(addPerson.indexOf('Haptics.impactAsync'));

    // The caption is the sighted explanation for the locked chips: it is the
    // same sentence VoiceOver reads as the hint, and it renders at readable
    // muted contrast, not hint contrast.
    expect(step).toContain('const capMessage = keyPeopleCapMessage(people.length);');
    const caption = sliceBetween('{capMessage && (', '{capMessage}');
    expect(caption).toContain('color: colors.textMuted');
    expect(caption).not.toContain('colors.textHint');
    expect(caption).toContain('fontSize: FontSize.sm');
  });
});
