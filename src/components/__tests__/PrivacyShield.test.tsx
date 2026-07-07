import fs from 'fs';
import path from 'path';
import type { AppStateStatus } from 'react-native';
import { shouldShowPrivacyShield } from '../PrivacyShield';

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      accent: '#C8A55C',
      background: '#0A0A0A',
    },
  }),
}));

describe('PrivacyShield', () => {
  it.each<AppStateStatus>(['inactive', 'background', 'unknown'])(
    'covers private content when AppState is %s',
    (status) => {
      expect(shouldShowPrivacyShield(status)).toBe(true);
    }
  );

  it('does not cover or intercept touches while active', () => {
    expect(shouldShowPrivacyShield('active')).toBe(false);
  });

  it('is mounted at the root layout above the app tree', () => {
    const layoutSource = fs.readFileSync(path.join(__dirname, '../../app/_layout.tsx'), 'utf8');

    expect(layoutSource).toContain("import { PrivacyShield } from '@/components/PrivacyShield';");
    expect(layoutSource).toContain('<PrivacyShield />');
  });
});
