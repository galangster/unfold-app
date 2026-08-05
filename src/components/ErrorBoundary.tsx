import React, { Component, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { logBugError } from '@/lib/bug-logger';
import { Colors } from '@/constants/colors';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  isButtonPressed: boolean;
}

/**
 * Error Boundary for Unfold app
 * Catches JavaScript errors in child component tree and displays a branded fallback UI
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, isButtonPressed: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    void logBugError('error-boundary', error, {
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.content}>
            {/* App Branding */}
            <Text style={styles.logo}>Unfold</Text>
            
            <View style={styles.iconContainer}>
              <Text style={styles.icon}>✦</Text>
            </View>

            <Text style={styles.title}>Something went wrong</Text>
            
            <Text style={styles.message}>
              We encountered an unexpected issue. Please try again, or restart the app if the problem persists.
            </Text>

            {this.state.error && (
              <Text style={styles.errorDetail} numberOfLines={2}>
                {this.state.error.message}
              </Text>
            )}

            <TouchableOpacity activeOpacity={0.7}
              onPress={this.handleReset}
              onPressIn={() => this.setState({ isButtonPressed: true })}
              onPressOut={() => this.setState({ isButtonPressed: false })}
              style={[
                styles.button,
                this.state.isButtonPressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.buttonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
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
    color: Colors.accent,
    marginBottom: Spacing['8'],
    letterSpacing: 2,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.inputBackground,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing['6'],
  },
  icon: {
    fontSize: 28,
    color: Colors.textMuted,
  },
  title: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.xl,
    color: Colors.text,
    marginBottom: Spacing['3'],
    textAlign: 'center',
  },
  message: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing['4'],
  },
  errorDetail: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.xs,
    color: Colors.textSubtle,
    textAlign: 'center',
    marginBottom: Spacing['8'],
    paddingHorizontal: Spacing['4'],
  },
  button: {
    backgroundColor: Colors.buttonBackground,
    paddingVertical: Spacing['4'],
    paddingHorizontal: Spacing['12'],
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  buttonPressed: {
    backgroundColor: Colors.buttonBackgroundPressed,
    borderColor: Colors.borderFocused,
  },
  buttonText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.base,
    color: Colors.text,
  },
});

export default ErrorBoundary;
