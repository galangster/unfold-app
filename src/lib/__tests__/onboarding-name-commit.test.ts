import * as fs from 'fs';
import * as path from 'path';

const src = fs.readFileSync(
  path.join(__dirname, '../../app/onboarding.tsx'),
  'utf-8',
);

describe('onboarding name input commit safety (RT-ONB-1)', () => {
  // Slice the text-step block, then the TextInput JSX inside it, so the
  // assertions cannot accidentally match VoiceInputBar's `value` prop.
  const textStepStart = src.indexOf("if (step.type === 'text') {");
  const textStepEnd = src.indexOf("if (step.type === 'multiline') {", textStepStart);
  const textStepBlock = src.slice(textStepStart, textStepEnd);
  const textInputBlock = textStepBlock.slice(
    textStepBlock.indexOf('<TextInput'),
    textStepBlock.indexOf('<VoiceInputBar'),
  );

  it('does not drive the name field as a controlled input (no value-prop write-back race)', () => {
    expect(textStepStart).toBeGreaterThan(-1);
    expect(textStepEnd).toBeGreaterThan(textStepStart);
    expect(textInputBlock).toContain('defaultValue={data.name}');
    // lowercase-v `value=` prop must be gone (does not match `defaultValue=`)
    expect(textInputBlock).not.toMatch(/\svalue=\{data\.name\}/);
  });

  it('routes every name writer through the single commitName helper', () => {
    expect(src).toContain('const commitName = ');
    expect(src).toContain('onChangeText={commitName}');
    // No inline name writers remain anywhere (both old sites used this exact form)
    const inlineNameWrites =
      src.match(/setData\(\(prev\) => \(\{ \.\.\.prev, name: text \}\)\)/g) ?? [];
    expect(inlineNameWrites.length).toBe(0);
  });

  it('reconciles the committed name from the native field text when editing ends', () => {
    expect(src).toContain('onEndEditing={(e) => commitName(e.nativeEvent.text)}');
  });

  it('remounts the field after a voice-dictation commit so the appended text renders', () => {
    expect(src).toContain('nameInputResetKey');
  });
});
