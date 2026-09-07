import * as fs from 'fs';
import * as path from 'path';

const src = fs.readFileSync(
  path.join(__dirname, '../../app/(tabs)/(today)/journal.tsx'),
  'utf8',
);

const dismissStart = src.indexOf('<TouchableOpacity accessible={false} activeOpacity={1}');
const dismissEnd = src.lastIndexOf('</TouchableOpacity>');

describe('JA-1 journal composer keyboard-dismiss wrapper', () => {
  it('keeps the full-screen dismiss wrapper out of the accessibility tree', () => {
    expect(dismissStart).toBeGreaterThan(-1);
    expect(src.slice(dismissStart, src.indexOf('>', dismissStart) + 1)).toContain('onPress={Keyboard.dismiss}');
    expect(src.slice(dismissStart, src.indexOf('>', dismissStart) + 1)).not.toContain('accessibilityElementsHidden');
    expect(src.slice(dismissStart, src.indexOf('>', dismissStart) + 1)).not.toContain('importantForAccessibility');
  });

  it('leaves Close, Save, input, mode, voice, and prayer controls independently labeled', () => {
    const composer = src.slice(dismissStart, dismissEnd);
    expect(composer).toContain('accessibilityLabel="Close journal"');
    expect(composer).toContain('accessibilityLabel="Save journal entry"');
    expect(composer).toContain('accessibilityLabel="Journal entry"');
    expect(composer).toContain("label: 'Free Write'");
    expect(composer).toContain("label: 'SOAP'");
    expect(composer).toContain('<VoiceInputBar');
    expect(composer).toContain('accessibilityLabel="Add prayer"');
    expect(composer).not.toContain('accessibilityElementsHidden');
  });
});
