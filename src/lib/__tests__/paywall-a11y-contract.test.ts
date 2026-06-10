import * as fs from 'fs';
import * as path from 'path';

const sourceRoot = path.join(__dirname, '../..');
const src = fs.readFileSync(path.join(sourceRoot, 'app/paywall.tsx'), 'utf-8');

describe('paywall close button (RT-PAYWALL-1)', () => {
  it('renders the close affordance with an RN Pressable (RNGH touchables strand absolute styles off-screen)', () => {
    expect(src).toMatch(/import \{[^}]*Pressable[^}]*\} from 'react-native'/);
    expect(src).toContain('accessibilityLabel="Close"');
  });

  it('removed the never-rendered absolute RNGH close button', () => {
    expect(src).not.toContain('accessibilityLabel="Close paywall"');
    expect(src).not.toContain("position: 'absolute',\n          top: insets.top + 8,");
  });

  it('close button routes through handleClose (completion-nav matrix) and blocks mid-purchase', () => {
    const pressableStart = src.indexOf('<Pressable');
    expect(pressableStart).toBeGreaterThan(-1);
    const pressableBlock = src.slice(pressableStart, src.indexOf('</Pressable>'));
    expect(pressableBlock).toContain('onPress={handleClose}');
    expect(pressableBlock).toContain('disabled={isPurchasing}');
  });
});
