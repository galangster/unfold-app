/**
 * Source-contract tests for a handful of (ask)/index.tsx fixes that are
 * impractical to exercise via a full render (the screen pulls in the whole
 * companion chat + store + drawer dependency graph) — matching this repo's
 * existing convention for screen-embedded logic.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(__dirname, '../../app/(tabs)/(ask)/index.tsx'), 'utf8');
const actionsSource = readFileSync(
  join(__dirname, '../../components/companion/CompanionActions.tsx'),
  'utf8',
);

describe('free quota line shown at full quota too', () => {
  it('no longer gates the quota indicator on some quota being spent', () => {
    expect(source).not.toMatch(/\{!isPremium && dailyRemaining < FREE_COMPANION_DAILY_LIMIT/);
    expect(source).toContain('{!isPremium && dailyRemaining > 0 && (');
  });

  it('shows "N free messages today" at full quota, distinct from the "left today" copy', () => {
    expect(source).toContain('${FREE_COMPANION_DAILY_LIMIT} free messages today');
    expect(source).toContain('free messages left today');
  });

  it('uses FontSize tokens for the quota copy instead of a raw 11-12px', () => {
    const quotaBlock = source.slice(
      source.indexOf('const dailyLimitContent'),
      source.indexOf('Daily limit indicator') + 2200,
    );
    expect(quotaBlock).not.toMatch(/fontSize:\s*1[12],/);
    expect(quotaBlock).toMatch(/fontSize: FontSize\.(xs|sm)/);
  });

  it('exposes upgrade touch semantics only when the quota is exhausted', () => {
    expect(source).toContain('{!isPremium && dailyRemaining === 0 && (');
    expect(source).toContain('{!isPremium && dailyRemaining > 0 && (');
    expect(source).toMatch(/dailyRemaining > 0 && \(\s*<View\s+accessible/);
  });
});

describe('todayTheme wired into the companion empty state', () => {
  it('reads the current devotional the same way the Today screen does', () => {
    expect(source).toContain("import { getCurrentDevotional } from '@/lib/home-devotional-state'");
    expect(source).toMatch(/getCurrentDevotional\(devotionals, currentDevotionalId\)/);
  });

  it('passes todayTheme through to CompanionEmptyState', () => {
    expect(source).toMatch(/<CompanionEmptyState onSelectStarter=\{handleSend\} todayTheme=\{todayTheme\} \/>/);
  });
});

describe('Ask header and retry wiring', () => {
  it('keeps one 64-point live Companion centered in the toolbar', () => {
    expect(source).not.toContain('companionDisplayName ?? \'Companion\'');
    expect(source).toContain('Open conversation history');
    expect(source).toContain('New conversation');
    expect(source).toContain('companion-profile-button');
    expect(source.match(/<CompanionOrb/g)).toHaveLength(1);
    expect(source).toContain('const HEADER_COMPANION_SIZE = 64');
    expect(source).toContain('const TOOLBAR_SIDE_SLOT_WIDTH = 88');
    expect(source.match(/width: TOOLBAR_SIDE_SLOT_WIDTH/g)).toHaveLength(2);
    expect(source).toContain('size={HEADER_COMPANION_SIZE}');
    expect(source).toContain('thinking={isStreaming}');
    expect(source).toContain('active={isFocused && !drawerOpen}');
    expect(source).toContain("accessibilityLabel={isStreaming ? 'Companion is replying' : undefined}");
    expect(source).toContain('accessibilityLiveRegion="polite"');
  });

  it('streams text only into the active request row without row presence plumbing', () => {
    expect(source).toContain('activeRequestCompanionId');
    expect(source).toContain('item.id === activeRequestCompanionId');
    expect(source).toContain("item.status === 'streaming'");
    expect(source).toContain('isStreaming={isThisStreaming}');
    expect(source).toContain('motionActive={isFocused && !drawerOpen}');
    expect(source).not.toContain('showCompanionPresence');
    expect(source).not.toContain('showIcon=');
    expect(source).not.toContain('<TypingIndicator');
    expect(source).not.toContain("from '@/components/companion/TypingIndicator'");
    expect(source).not.toContain('isActive={isStreaming}');
  });

  it('retries error rows in place through regenerateReply, not handleSend', () => {
    expect(source).toContain('regenerateReply({ companionId })');
    expect(source).not.toContain('handleSendRef.current(userText)');
  });
});

describe('Companion response motion', () => {
  it('cancels action fades and skips them while hidden or reduced', () => {
    expect(actionsSource).toContain('cancelAnimation(opacity)');
    expect(actionsSource).toContain('motionActive && !reducedMotion');
    expect(source).toContain('motionActive={isFocused && !drawerOpen}');
  });
});

describe('drawer edge-swipe gesture wired at the screen root', () => {
  it('imports and calls useDrawerGesture with the screen\'s own drawer state', () => {
    expect(source).toContain('useDrawerGesture');
    expect(source).toMatch(
      /useDrawerGesture\(drawerTranslateX, drawerOpen, handleDrawerOpen, handleDrawerClose\)/,
    );
  });

  it('wraps the screen root in a GestureDetector using that gesture', () => {
    expect(source).toMatch(/<GestureDetector gesture=\{drawerPanGesture\}>\s*<KeyboardAvoidingView/);
    expect(source).toMatch(/<\/KeyboardAvoidingView>\s*<\/GestureDetector>/);
  });
});

describe('error banner stays inside the readable column', () => {
  it('subtracts both horizontal margins from readableMaxWidth', () => {
    expect(source).toContain('maxWidth: Math.max(0, adaptiveLayout.readableMaxWidth - Spacing[\'4\'] * 2)');
    expect(source).toContain('marginHorizontal: Spacing[\'4\']');
  });
});

describe('asymmetric safe areas and drawer resize', () => {
  it('pads the header and composer with live left and right insets', () => {
    expect(source).toContain('paddingLeft: Spacing[\'4\'] + insets.left');
    expect(source).toContain('paddingRight: Spacing[\'4\'] + insets.right');
    expect(source).toContain('adaptiveSafeGutterStyle(insets.left, insets.right)');
  });

  it('rewrites the closed drawer translation when drawer width changes', () => {
    expect(source).toContain('companionDrawerClosedTranslate(drawerWidth)');
    expect(source).toMatch(/if \(!drawerOpen\) \{\s*drawerTranslateX\.value = companionDrawerClosedTranslate\(drawerWidth\);/);
  });
});

describe('drawer edge-swipe gesture wired at the screen root', () => {
  it('imports and calls useDrawerGesture with the screen\'s own drawer state', () => {
    expect(source).toContain('useDrawerGesture');
    expect(source).toMatch(
      /useDrawerGesture\(drawerTranslateX, drawerOpen, handleDrawerOpen, handleDrawerClose\)/,
    );
  });

  it('wraps the screen root in a GestureDetector using that gesture', () => {
    expect(source).toMatch(/<GestureDetector gesture=\{drawerPanGesture\}>\s*<KeyboardAvoidingView/);
    expect(source).toMatch(/<\/KeyboardAvoidingView>\s*<\/GestureDetector>/);
  });
});
