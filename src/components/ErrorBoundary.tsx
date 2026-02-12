import React, { Component, ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { logBugError } from '@/lib/bug-logger';
import { Colors } from '@/constants/colors';
import { FontFamily } from '@/constants/fonts';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary for Unfold app
 * Catches JavaScript errors in child component tree and displays a branded fallback UI
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to bug tracking system
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

            <Pressable
              onPress={this.handleReset}
              style={({ pressed }) => [
                styles.button,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.buttonText}>Try Again</Text>
            </Pressable>
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
    padding: 24,
  },
  content: {
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  logo: {
    fontFamily: FontFamily.display,
    fontSize: 24,
    color: Colors.accent,
    marginBottom: 32,
    letterSpacing: 2,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.inputBackground,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  icon: {
    fontSize: 28,
    color: Colors.textMuted,
  },
  title: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 20,
    color: Colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  errorDetail: {
    fontFamily: FontFamily.mono,
    fontSize: 12,
    color: Colors.textSubtle,
    textAlign: 'center',
    marginBottom: 32,
    paddingHorizontal: 16,
  },
  button: {
    backgroundColor: Colors.buttonBackground,
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  buttonPressed: {
    backgroundColor: Colors.buttonBackgroundPressed,
    borderColor: Colors.borderFocused,
  },
  buttonText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 16,
    color: Colors.text,
  },
});

export default ErrorBoundary;
