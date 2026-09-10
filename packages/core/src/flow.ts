/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Flow and FlowModule: an ordered set of blocks plus the metadata that says
// what kind of Connect artifact they become.

import { Block, targetId } from "./blocks.js";
import type { ConnectType } from "./flowdoc.js";
import { InvalidFlowDocError, MAX_ACTIONS_PER_FLOW, SLUG_PATTERN } from "./flowdoc.js";
import type { Point } from "./flowdoc.js";

export interface FlowConfig {
  name: string;
  connectType?: ConnectType;
  /** Defaults to the first block added. */
  start?: string | Block;
  /** Hand-placed positions. Anything omitted is auto-laid-out at synth time. */
  layout?: Record<string, Point>;
}

export class Flow {
  readonly name: string;
  readonly connectType: ConnectType;
  readonly kind: "flow" | "module" = "flow";
  readonly layout: Record<string, Point>;
  private readonly blocks: Block[] = [];
  private readonly explicitStart?: string;

  constructor(config: FlowConfig) {
    // Names are slugs (the FlowDoc schema requires it), and they become file
    // names downstream (`<name>.flowdoc.json`), so anything else, including a
    // path fragment, is rejected here rather than at write time.
    if (!SLUG_PATTERN.test(config.name)) {
      throw new Error(
        `Invalid flow name "${config.name}". Names must be lowercase words separated by single hyphens.`,
      );
    }
    this.name = config.name;
    this.connectType = config.connectType ?? "CONTACT_FLOW";
    this.layout = config.layout ?? {};
    if (config.start !== undefined) this.explicitStart = targetId(config.start);
  }

  /** Adds blocks in declaration order. Returns this for chaining. */
  add(...blocks: Block[]): this {
    for (const b of blocks) {
      if (this.blocks.some((existing) => existing.id === b.id)) {
        throw new Error(`Duplicate Identifier "${b.id}" in flow "${this.name}".`);
      }
      this.blocks.push(b);
    }
    if (this.blocks.length > MAX_ACTIONS_PER_FLOW) {
      throw new Error(
        `Flow "${this.name}" has ${this.blocks.length} actions; Connect allows at most ${MAX_ACTIONS_PER_FLOW}.`,
      );
    }
    return this;
  }

  all(): readonly Block[] {
    return this.blocks;
  }

  startId(): string {
    if (this.explicitStart !== undefined) return this.explicitStart;
    const first = this.blocks[0];
    if (first === undefined) throw new Error(`Flow "${this.name}" has no blocks.`);
    return first.id;
  }
}

/**
 * Structural check that a value can be treated as a Flow, run at the entry
 * points that take one. Structural rather than `instanceof` so a Flow built
 * against a second copy of the package (a workspace link, two versions in a
 * dependency tree) is still accepted.
 */
export function assertFlow(value: unknown, context: string): asserts value is Flow {
  const flow = value as Partial<Flow> | null | undefined;
  const ok =
    typeof flow === "object" &&
    flow !== null &&
    typeof flow.all === "function" &&
    typeof flow.startId === "function" &&
    typeof flow.name === "string" &&
    typeof flow.connectType === "string" &&
    typeof flow.layout === "object" &&
    flow.layout !== null;
  if (!ok) {
    const got = value === null ? "null" : Array.isArray(value) ? "an array" : `a ${typeof value}`;
    throw new InvalidFlowDocError(
      `${context} expects a Flow built with new Flow(...) or new FlowModule(...), got ${got}.`,
    );
  }
}

/** A reusable section of a flow. Materializes as a ContactFlowModule. */
export class FlowModule extends Flow {
  override readonly kind = "module" as const;
  /** Module configuration, emitted as content.Settings. Empty by default. */
  readonly settings: Record<string, unknown>;

  constructor(config: Omit<FlowConfig, "connectType"> & { settings?: Record<string, unknown> }) {
    super({ ...config, connectType: "MODULE" });
    this.settings = config.settings ?? {};
  }
}
