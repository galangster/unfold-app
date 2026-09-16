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

describe('free quota chrome after a send, not at idle', () => {
  it('hides the idle full-quota line', () => {
    expect(source).toContain('dailyRemaining < FREE_COMPANION_DAILY_LIMIT');
    expect(source).not.toContain('${FREE_COMPANION_DAILY_LIMIT} free messages today');
    expect(source).not.toContain('free messages today');
    expect(source).not.toContain('free messages left today');
  });

  it('shows remaining count only after some quota is spent', () => {
    expect(source).toContain('{dailyRemaining} of {FREE_COMPANION_DAILY_LIMIT} left');
    expect(source).toContain('showDailyLimit && (dailyLimitExhausted ? (');
  });

  it('uses textMuted for quota copy and FontSize tokens', () => {
    const quotaStart = source.indexOf('const showDailyLimit');
    const quotaBlock = source.slice(quotaStart, source.indexOf('return (', quotaStart));
    expect(quotaBlock).toContain('colors.textMuted');
    expect(quotaBlock).not.toContain('colors.textSubtle');
    expect(quotaBlock).not.toContain('colors.textHint');
    expect(quotaBlock).not.toContain('alpha(');
    expect(quotaBlock).not.toMatch(/fontSize:\s*1[12],/);
    expect(quotaBlock).toMatch(/fontSize: FontSize\.(xs|sm)/);
  });

  it('exposes upgrade touch semantics only when the quota is exhausted', () => {
    expect(source).toContain('showDailyLimit && (dailyLimitExhausted ? (');
    expect(source).toMatch(/dailyLimitExhausted \? \(\s*<TouchableOpacity/);
    expect(source).toMatch(/: \(\s*<View\s+accessible/);
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

describe('Companion action row chrome', () => {
  it('keeps only copy and native iOS share', () => {
    expect(actionsSource).toContain('Copy response');
    expect(actionsSource).toContain('Share response');
    expect(actionsSource).toContain('square.and.arrow.up');
    expect(actionsSource).toContain('ios_share');
    expect(actionsSource).not.toContain('ShareNetworkIcon');
    expect(actionsSource).not.toContain('ThumbsUpIcon');
    expect(actionsSource).not.toContain('ThumbsDownIcon');
    expect(actionsSource).not.toContain('NotePencilIcon');
    expect(actionsSource).not.toContain('ArrowsClockwiseIcon');
    expect(actionsSource).not.toContain('What was off?');
    expect(actionsSource).not.toContain('Save to journal');
    expect(actionsSource).not.toContain('Try another reply');
    expect(source).not.toContain('onRegenerate');
    expect(source).not.toContain('onSaveToJournal');
  });

  it('uses skill press, copy swap, and 44pt hit targets', () => {
    expect(actionsSource).toContain('const PRESS_SCALE = 0.96');
    expect(actionsSource).toContain('duration: Duration.fast');
    expect(actionsSource).toContain('easing: Ease.out');
    expect(actionsSource).toContain('duration: 300, dampingRatio: 1');
    expect(actionsSource).toContain('[1, 0.25]');
    expect(actionsSource).toContain('[0.25, 1]');
    expect(actionsSource).toContain('[0, 4]');
    expect(actionsSource).toContain('[4, 0]');
    expect(actionsSource).toContain('BackdropBlur');
    expect(actionsSource).toContain("Platform.OS !== 'ios'");
    expect(actionsSource).toContain('scale.value = reducedMotion');
    expect(actionsSource).toContain('const HIT = 44');
    expect(actionsSource).toMatch(/width: HIT/);
    expect(actionsSource).toMatch(/height: HIT/);
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

describe('errors live on the bubble, not a banner', () => {
  it('does not mount a dismissible error banner', () => {
    expect(source).not.toContain('visibleError');
    expect(source).not.toContain('Dismiss error');
    expect(source).not.toContain('alpha(colors.error');
    expect(source).not.toContain("accessibilityRole=\"alert\"");
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
