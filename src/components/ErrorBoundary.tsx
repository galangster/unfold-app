import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react';
import { Appearance, Pressable, StyleSheet, Text, View, type ColorSchemeName } from 'react-native';
import { logBugError } from '@/lib/bug-logger';
import {
  clearBootCrashCount,
  getConsecutiveBootCrashCount,
  isCrashLoop,
  recordCrash,
} from '@/lib/crash-marker';
import { performFullLocalReset } from '@/lib/full-reset';
import { DarkColors, LightColors, type ColorTheme } from '@/constants/colors';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';

/** Boundary resets that may end in another catch before "Go to Today" is offered. */
export const FAILED_RETRIES_BEFORE_HOME = 2;

interface Props {
  children: ReactNode;
  /**
   * Called before the subtree is remounted when the user chooses "Go to
   * Today". The root layout owns the router; it clears whatever would steer
   * a fresh navigator straight back into the crash.
   */
  onNavigateHome?: () => void;
}

type Mode = 'children' | 'error' | 'recovery';

interface State {
  mode: Mode;
  error: Error | null;
  /**
   * Resets the user asked for that ended in another catch — boundary resets,
   * not render attempts (React replays a failed render once before a
   * boundary sees it).
   */
  retryCount: number;
  /** Bumped on every reset so the whole subtree remounts from scratch. */
  subtreeKey: number;
  showDetails: boolean;
  confirmingReset: boolean;
  resetting: boolean;
  resetFailed: boolean;
}

/** The theme provider lives inside the boundary, so the fallback follows the system scheme. */
export function resolveBoundaryColors(scheme: ColorSchemeName | null | undefined): ColorTheme {
  return scheme === 'light' ? LightColors : DarkColors;
}

/** Pure: whether the fallback should offer the "Go to Today" escape hatch. */
export function shouldOfferHomeEscape(retryCount: number): boolean {
  return retryCount >= FAILED_RETRIES_BEFORE_HOME;
}

function readSystemColorScheme(): ColorSchemeName | null | undefined {
  try {
    return Appearance.getColorScheme();
  } catch {
    return undefined;
  }
}

interface BoundaryButtonProps {
  label: string;
  onPress: () => void;
  colors: ColorTheme;
  testID: string;
  primary?: boolean;
  subtle?: boolean;
  disabled?: boolean;
}

// Pressable with a style callback: no state writes during the press. A
// setState in onPressIn/onPressOut re-rendered mid-press and dropped the
// responder on react-native-web, so onPress never fired. Plain RN Pressable
// also needs no GestureHandlerRootView, which lives inside the boundary.
function BoundaryButton({
  label,
  onPress,
  colors,
  testID,
  primary = false,
  subtle = false,
  disabled = false,
}: BoundaryButtonProps) {
  const textColor = subtle ? colors.textMuted : primary ? colors.accent : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      hitSlop={8}
      style={({ pressed }) => [
        styles.button,
        subtle
          ? styles.buttonSubtle
          : {
              backgroundColor: pressed ? colors.buttonBackgroundPressed : colors.buttonBackground,
              borderColor: primary ? colors.accent : pressed ? colors.borderFocused : colors.border,
            },
        disabled ? styles.buttonDisabled : null,
      ]}
    >
      <Text style={[styles.buttonText, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * Error boundary for the Unfold app.
 *
 * Catches JavaScript errors in the child tree and shows a calm fallback.
 * "Try Again" remounts the subtree under a fresh key; after two resets
 * that end in another catch it also offers "Go to Today". Three boot
 * crashes in a row (caught here or recorded as fatal by the global
 * handler) switch the fallback to a recovery screen that can reset local
 * data — the only way out of a persisted value that throws on every launch.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    // A crash loop is detected before the subtree gets another chance to
    // crash, so fatal errors from earlier launches count too.
    const crashLoop = isCrashLoop(getConsecutiveBootCrashCount());
    this.state = {
      mode: crashLoop ? 'recovery' : 'children',
      error: null,
      retryCount: 0,
      subtreeKey: 0,
      showDetails: false,
      confirmingReset: false,
      resetting: false,
      resetFailed: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { mode: 'error', error, showDetails: false };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    void logBugError('error-boundary', error, {
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
    });
    if (isCrashLoop(recordCrash())) {
      this.setState({ mode: 'recovery' });
    }
  }

  private remountSubtree(patch: Partial<State> = {}) {
    this.setState((state) => ({
      ...state,
      mode: 'children',
      error: null,
      showDetails: false,
      confirmingReset: false,
      subtreeKey: state.subtreeKey + 1,
      ...patch,
    }));
  }

  handleRetry = () => {
    this.remountSubtree({ retryCount: this.state.retryCount + 1 });
  };

  handleNavigateHome = () => {
    try {
      this.props.onNavigateHome?.();
    } catch (error) {
      void logBugError('error-boundary', error, { phase: 'navigate-home' });
    }
    this.remountSubtree();
  };

  handleContinue = () => {
    this.remountSubtree();
  };

  handleToggleDetails = () => {
    this.setState((state) => ({ showDetails: !state.showDetails }));
  };

  handleAskReset = () => {
    this.setState({ confirmingReset: true, resetFailed: false });
  };

  handleCancelReset = () => {
    this.setState({ confirmingReset: false });
  };

  handleConfirmReset = () => {
    if (this.state.resetting) return;
    this.setState({ resetting: true, resetFailed: false });
    performFullLocalReset()
      .then(() => {
        clearBootCrashCount();
        this.remountSubtree({ retryCount: 0, resetting: false });
      })
      .catch((error: unknown) => {
        void logBugError('error-boundary', error, { phase: 'reset-local-data' });
        this.setState({ resetting: false, resetFailed: true });
      });
  };

  private renderDetails(colors: ColorTheme) {
    const { error, showDetails } = this.state;
    if (!error) return null;
    return (
      <>
        <BoundaryButton
          label={showDetails ? 'Hide details' : 'Details'}
          onPress={this.handleToggleDetails}
          colors={colors}
          subtle
          testID="error-boundary-details-toggle"
        />
        {showDetails && (
          <Text
            selectable
            style={[styles.errorDetail, { color: colors.textSubtle }]}
            testID="error-boundary-details"
          >
            {`${error.name}: ${error.message}`}
          </Text>
        )}
      </>
    );
  }

  private renderError(colors: ColorTheme) {
    const offerHome = shouldOfferHomeEscape(this.state.retryCount);
    return (
      <>
        <Text style={[styles.title, { color: colors.text }]}>Something went wrong</Text>
        <Text style={[styles.message, { color: colors.textMuted }]}>
          {offerHome
            ? 'This keeps happening here. Starting again from Today usually clears it.'
            : 'This screen ran into a problem. Trying again usually clears it.'}
        </Text>
        {offerHome && (
          <BoundaryButton
            label="Go to Today"
            onPress={this.handleNavigateHome}
            colors={colors}
            primary
            testID="error-boundary-home"
          />
        )}
        <BoundaryButton
          label="Try Again"
          onPress={this.handleRetry}
          colors={colors}
          primary={!offerHome}
          testID="error-boundary-retry"
        />
        {this.renderDetails(colors)}
      </>
    );
  }

  private renderRecovery(colors: ColorTheme) {
    const { confirmingReset, resetting, resetFailed } = this.state;
    return (
      <>
        <Text style={[styles.title, { color: colors.text }]}>Unfold keeps running into a problem</Text>
        <Text style={[styles.message, { color: colors.textMuted }]}>
          The app has had trouble starting several times in a row. Something saved on this
          device may be causing it.
        </Text>
        {confirmingReset ? (
          <View style={styles.confirmBlock} testID="error-boundary-reset-confirm-block">
            <Text style={[styles.confirmTitle, { color: colors.text }]}>
              Reset everything on this device?
            </Text>
            <Text style={[styles.message, { color: colors.textMuted }]}>
              This removes your devotionals, journal, notes and settings from this device,
              disconnects this install from your synced data, and can't be undone. Your
              subscription stays with your App Store or Google account — use Restore
              Purchases afterwards if it doesn't show.
            </Text>
            {resetFailed && (
              <Text style={[styles.message, { color: colors.error }]} testID="error-boundary-reset-failed">
                The reset didn't finish. Please try again, or reinstall Unfold.
              </Text>
            )}
            <BoundaryButton
              label={resetting ? 'Resetting…' : 'Reset and start fresh'}
              onPress={this.handleConfirmReset}
              colors={colors}
              primary
              disabled={resetting}
              testID="error-boundary-reset-confirm"
            />
            <BoundaryButton
              label="Keep my data"
              onPress={this.handleCancelReset}
              colors={colors}
              disabled={resetting}
              testID="error-boundary-reset-cancel"
            />
          </View>
        ) : (
          <>
            <BoundaryButton
              label="Try Again"
              onPress={this.handleContinue}
              colors={colors}
              primary
              testID="error-boundary-recovery-retry"
            />
            <BoundaryButton
              label="Reset local data"
              onPress={this.handleAskReset}
              colors={colors}
              testID="error-boundary-reset"
            />
          </>
        )}
        {this.renderDetails(colors)}
      </>
    );
  }

  render() {
    if (this.state.mode === 'children') {
      return <Fragment key={this.state.subtreeKey}>{this.props.children}</Fragment>;
    }

    const colors = resolveBoundaryColors(readSystemColorScheme());
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]} testID="error-boundary-fallback">
        <View style={styles.content}>
          <Text style={[styles.logo, { color: colors.accent }]}>Unfold</Text>
          <View style={[styles.iconContainer, { backgroundColor: colors.inputBackground }]}>
            <Text style={[styles.icon, { color: colors.textMuted }]}>✦</Text>
          </View>
          {this.state.mode === 'recovery' ? this.renderRecovery(colors) : this.renderError(colors)}
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing['6'],
  },
  content: {
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  logo: {
    fontFamily: FontFamily.display,
    fontSize: 21,
    marginBottom: Spacing['8'],
    letterSpacing: 2,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing['6'],
  },
  icon: {
    fontSize: 28,
  },
  title: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.xl,
    marginBottom: Spacing['3'],
    textAlign: 'center',
  },
  message: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing['4'],
  },
  confirmBlock: {
    width: '100%',
    alignItems: 'center',
  },
  confirmTitle: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.base,
    marginBottom: Spacing['2'],
    textAlign: 'center',
  },
  errorDetail: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.xs,
    textAlign: 'center',
    marginTop: Spacing['2'],
    paddingHorizontal: Spacing['4'],
  },
  button: {
    minWidth: 220,
    alignItems: 'center',
    paddingVertical: Spacing['4'],
    paddingHorizontal: Spacing['8'],
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginTop: Spacing['3'],
  },
  buttonSubtle: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    paddingVertical: Spacing['2'],
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.base,
  },
});

export default ErrorBoundary;
