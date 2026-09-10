/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The one place a command's failure becomes an exit code.
//
// Every action is wrapped, so no command can throw past commander: a CliError
// prints its own message and its own code, anything else prints its message and
// exits 1. Nothing prints a stack trace, because a stack trace is never the
// answer to "which file is wrong".

import type { CommanderError } from "commander";

import { CliError, messageOf } from "./errors.js";

/** Wraps a command body so it reports failures as a message plus an exit code. */
export function action<A extends unknown[]>(
  body: (...args: A) => void | Promise<void>,
): (...args: A) => Promise<void> {
  return async (...args: A): Promise<void> => {
    try {
      await body(...args);
    } catch (error) {
      console.error(messageOf(error));
      process.exitCode = error instanceof CliError ? error.exitCode : 1;
    }
  };
}

/**
 * For a command's `exitOverride`: commander's own usage errors (a required
 * option not given, an unknown option, a missing argument) exit with `code`
 * instead of its default 1, so a command that reserves 1 for a result can
 * keep bad arguments apart from it. Commander has written the message to
 * stderr by the time this runs; help and version exit 0 and are left alone.
 * https://github.com/tj/commander.js#override-exit-and-output-handling
 */
export function usageErrorsExit(code: number): (error: CommanderError) => void {
  return (error) => {
    if (error.exitCode !== 0) process.exit(code);
  };
}
