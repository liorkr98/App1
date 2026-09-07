import { Component, type ErrorInfo, type ReactNode } from 'react';

import { ErrorState } from '@/core/ui';

import { captureError } from './sentry';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Root error boundary.
 *
 * Without one, a render error unmounts the whole tree and the user is left
 * staring at a blank screen with no way back.
 *
 * Still a class component: React has no hook equivalent of
 * getDerivedStateFromError.
 */
export class RootErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // The message is scrubbed by Sentry's beforeSend, so a stack containing a
    // user's data does not leave the device intact (CLAUDE.md §8).
    captureError(error);

    if (__DEV__) {
      console.error('Uncaught render error', error, info.componentStack);
    }
  }

  private readonly reset = () => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // ErrorState pulls its copy from locales/, so this is in Hebrew.
      // Deliberately does not render the error message: it is untranslated
      // and can contain PII.
      return <ErrorState onRetry={this.reset} />;
    }

    return this.props.children;
  }
}
