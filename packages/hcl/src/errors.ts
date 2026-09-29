/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/** A position in a source file, 1-based, counting columns in UTF-16 code units. */
export interface Position {
  line: number;
  column: number;
  offset: number;
}

/**
 * An error reading or writing HCL. `code` is set when the error is one the
 * contract names (conformance/hcl/README.md, "Error codes"); a plain syntax
 * error has none. The message always starts with `file:line:column`.
 */
export class HclError extends Error {
  readonly code: string | undefined;
  readonly file: string;
  readonly position: Position | undefined;
  readonly detail: string;
  /** Where in the resource, as the contract's refuse cases spell it: `action[<id>].<block>.<attr>`. */
  readonly path: string | undefined;

  constructor(
    detail: string,
    options: { file?: string; position?: Position; code?: string; path?: string } = {},
  ) {
    const file = options.file ?? "<input>";
    const where =
      options.position === undefined
        ? file
        : `${file}:${options.position.line}:${options.position.column}`;
    super(`${where}: ${options.code === undefined ? "" : `${options.code}: `}${detail}`);
    this.name = "HclError";
    this.code = options.code;
    this.file = file;
    this.position = options.position;
    this.detail = detail;
    this.path = options.path;
  }
}
