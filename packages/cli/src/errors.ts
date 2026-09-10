/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Terminal-facing errors. Every command surfaces failures as a CliError whose
// message is already written for a human: the offending path, the offending
// token, or the flag that was wrong, on stderr, with nothing else added.

/**
 * A failure with a message meant for the terminal, and the exit code to use.
 * `cause` carries the error it was written from, for callers of the command
 * functions; the terminal only ever sees the message.
 */
export class CliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1, options?: ErrorOptions) {
    super(message, options);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

/** Message of an unknown thrown value, without a stack trace. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
