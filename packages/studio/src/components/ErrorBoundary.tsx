/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// A render error anywhere in the tree used to unmount the whole studio and
// leave a blank page with the user's unsaved edits gone from view. This keeps
// the failure on screen with the message and a reload affordance.

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Local-first: the console is the only sink, nothing is reported anywhere.
    console.error("Flow Studio crashed while rendering", error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;
    return (
      <div
        role="alert"
        data-testid="error-boundary"
        className="flex h-screen flex-col items-center justify-center gap-3 p-6 text-center"
      >
        <h1 className="text-sm font-semibold text-red-700 dark:text-red-300">
          Flow Studio hit an unexpected error
        </h1>
        <p className="max-w-lg font-mono text-xs break-words text-neutral-600 dark:text-neutral-300">
          {error.message}
        </p>
        <button
          type="button"
          className="rounded border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
          onClick={() => this.setState({ error: null })}
        >
          Try again
        </button>
      </div>
    );
  }
}
