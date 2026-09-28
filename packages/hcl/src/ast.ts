/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The syntax tree. Every node records the index of its first and last token
// in the file's token array, so a node can be printed as written, located in
// an error, or have its surrounding comments found.
import type { Token } from "./tokens.js";

export interface Span {
  /** Index of the node's first token in HclFile.tokens. */
  first: number;
  /** Index of the node's last token, inclusive. */
  last: number;
}

export interface HclFile {
  file: string;
  source: string;
  tokens: Token[];
  body: Body;
}

export interface Body extends Span {
  items: (Attribute | Block)[];
}

export interface Attribute extends Span {
  kind: "attribute";
  name: string;
  expr: Expr;
}

export interface Block extends Span {
  kind: "block";
  type: string;
  labels: string[];
  body: Body;
}

export type Expr =
  | LiteralExpr
  | TemplateExpr
  | TupleExpr
  | ObjectExpr
  | TraversalExpr
  | CallExpr
  | UnaryExpr
  | BinaryExpr
  | ConditionalExpr
  | ParenExpr
  | ForExpr
  | PostfixExpr;

/** A number, `true`, `false` or `null`. */
export interface LiteralExpr extends Span {
  kind: "literal";
  value: number | boolean | null;
  raw: string;
}

export type TemplatePart =
  | { kind: "text"; raw: string }
  | { kind: "interp"; expr: Expr; strip: [boolean, boolean] }
  | { kind: "directive"; first: number; last: number };

/** A quoted string or a heredoc, as its literal and interpolated parts. */
export interface TemplateExpr extends Span {
  kind: "template";
  quoted: boolean;
  /** For a heredoc: whether it is the flush form, `<<-`. */
  flush: boolean;
  parts: TemplatePart[];
}

export interface TupleExpr extends Span {
  kind: "tuple";
  items: Expr[];
}

export interface ObjectItem {
  key: Expr;
  /** Whether the key was a bare identifier, which reads as its own name. */
  bareKey: boolean;
  value: Expr;
}

export interface ObjectExpr extends Span {
  kind: "object";
  items: ObjectItem[];
}

export type TraversalStep =
  { kind: "attr"; name: string } | { kind: "index"; key: Expr } | { kind: "splat"; full: boolean };

/** A variable and its attribute and index steps: `var.x`, `aws_connect_queue.q.arn`, `local.m["k"]`. */
export interface TraversalExpr extends Span {
  kind: "traversal";
  root: string;
  steps: TraversalStep[];
}

/** A step applied to an expression that is not a bare variable, such as `foo()[0]`. */
export interface PostfixExpr extends Span {
  kind: "postfix";
  target: Expr;
  steps: TraversalStep[];
}

export interface CallExpr extends Span {
  kind: "call";
  name: string;
  args: Expr[];
  expandFinal: boolean;
}

export interface UnaryExpr extends Span {
  kind: "unary";
  op: "!" | "-";
  operand: Expr;
}

export interface BinaryExpr extends Span {
  kind: "binary";
  op: string;
  left: Expr;
  right: Expr;
}

export interface ConditionalExpr extends Span {
  kind: "conditional";
  condition: Expr;
  then: Expr;
  else: Expr;
}

export interface ParenExpr extends Span {
  kind: "paren";
  inner: Expr;
}

export interface ForExpr extends Span {
  kind: "for";
  object: boolean;
  keyVar: string | undefined;
  valueVar: string;
  collection: Expr;
  keyExpr: Expr | undefined;
  valueExpr: Expr;
  group: boolean;
  condition: Expr | undefined;
}
