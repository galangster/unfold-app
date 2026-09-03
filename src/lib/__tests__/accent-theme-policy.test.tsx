import React, { useEffect } from 'react';
import { act, create } from 'react-test-renderer';
import { DEFAULT_ACCENT_THEME_ID, resolveEffectiveAccentThemeId } from '../accent-theme-policy';

type Policy = 'granted' | 'denied' | 'unknown';

let mockPolicy: Policy = 'granted';
const mockState = { user: { themeMode: 'dark', accentTheme: 'rose' } };

const ROSE_DARK = '#D4828F';
const GOLD_DARK = '#C8A55C';

jest.mock('@/lib/store', () => ({
  ACCENT_THEMES: [
    { id: 'gold', name: 'Gold', dark: '#C8A55C', light: '#9A7B3C' },
    { id: 'rose', name: 'Rose', dark: '#D4828F', light: '#A8596A' },
  ],
  useUnfoldStore: (selector: (state: typeof mockState) => unknown) => selector(mockState),
}));

jest.mock('@/hooks/usePremiumAccessPolicy', () => ({
  usePremiumAccessPolicy: () => mockPolicy,
}));

jest.mock('expo-system-ui', () => ({
  setBackgroundColorAsync: jest.fn(() => Promise.resolve()),
}));

// eslint-disable-next-line import/first -- theme import must run after Jest module mocks are registered.
import { ThemeProvider, useTheme } from '../theme';

function Probe({ onAccent }: { onAccent: (accent: string) => void }) {
  const { colors } = useTheme();
  useEffect(() => {
    onAccent(colors.accent);
  }, [colors.accent, onAccent]);
  return null;
}

function renderAccent(): string {
  let accent = '';
  act(() => {
    create(
      <ThemeProvider>
        <Probe
          onAccent={(value) => {
            accent = value;
          }}
        />
      </ThemeProvider>,
    );
  });
  return accent;
}

describe('resolveEffectiveAccentThemeId', () => {
  it('keeps the persisted accent while the policy is granted or still unknown', () => {
    expect(resolveEffectiveAccentThemeId('rose', 'granted')).toBe('rose');
    expect(resolveEffectiveAccentThemeId('rose', 'unknown')).toBe('rose');
  });

  it('reverts to gold when the policy is denied', () => {
    expect(resolveEffectiveAccentThemeId('rose', 'denied')).toBe(DEFAULT_ACCENT_THEME_ID);
  });

  it('defaults to gold when nothing is persisted', () => {
    expect(resolveEffectiveAccentThemeId(undefined, 'granted')).toBe('gold');
    expect(resolveEffectiveAccentThemeId(undefined, 'unknown')).toBe('gold');
  });
});

describe('ThemeProvider accent entitlement', () => {
  it('applies the persisted premium accent while the policy is granted', () => {
    mockPolicy = 'granted';
    expect(renderAccent()).toBe(ROSE_DARK);
  });

  it('keeps the persisted accent while the policy is unknown, so hydration never flashes gold', () => {
    mockPolicy = 'unknown';
    expect(renderAccent()).toBe(ROSE_DARK);
  });

  it('reverts a premium accent to gold once the policy is denied', () => {
    mockPolicy = 'denied';
    expect(renderAccent()).toBe(GOLD_DARK);
  });
});
