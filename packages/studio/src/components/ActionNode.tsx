/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Canvas node: label (Identifier), Type, category badge, lint badge. Unmodeled
// actions render visually distinct (dashed border) with a "raw" affordance
// opening the read-only JSON inspector.
//
// Source handles come from BOTH directions, and both are necessary:
//
//   - the action's TYPE, so a palette-inserted block that has no transitions
//     yet still offers a handle to drag from. Keying off Transitions alone
//     made every new block a permanent dead end.
//   - the edges that actually leave this node (data.handles, computed in
//     Canvas.tsx from the edge list). Keying off the type alone dropped a
//     transition on a terminal-typed action: React Flow discards an edge whose
//     sourceHandle is absent, so the transition vanished from the canvas and
//     could not be seen, rewired, or deleted.
//
// A handle is rendered when either says so, which is the only rule under which
// no transition is ever unrenderable.

import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { isTerminalType } from "../model/capabilities.js";
import type { NodeModel } from "../model/graph.js";
import { useStudio } from "../state/studio.js";

/** Which source handles this node must render for its edges to attach. */
export interface SourceHandles {
  primary: boolean;
  error: boolean;
}

export type ActionNodeData = {
  model: NodeModel;
  errorCount: number;
  warningCount: number;
  handles: SourceHandles;
  /** True when codegen would emit this action as a GenericBlock right now. */
  demoted: boolean;
  /**
   * Transitions leaving this block whose target is not in the document. They
   * cannot be drawn as edges, so the count is shown here instead of the block
   * silently looking like it has fewer branches than the file gives it.
   */
  dangling: number;
};

export type ActionFlowNode = Node<ActionNodeData, "action">;

const CATEGORY_STYLES: Record<string, string> = {
  Interact: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
  Set: "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200",
  Branch: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  Integrate: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  Terminate: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200",
  generic: "bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200",
};

export function ActionNode({ data, selected }: NodeProps<ActionFlowNode>) {
  const { dispatch } = useStudio();
  const { model, errorCount, warningCount, handles, demoted, dangling } = data;
  const terminal = isTerminalType(model.action.Type);
  const showPrimary = !terminal || handles.primary;
  const showError = !terminal || handles.error;
  // A modeled type codegen cannot currently express. Never silent: the block
  // is still editable, but the user is told the generator would emit it raw.
  const inexpressible = demoted && !model.isGeneric;

  return (
    <div
      data-testid={`node-${model.id}`}
      className={[
        "w-45 rounded-md border bg-white px-3 py-2 text-left shadow-sm dark:bg-neutral-900",
        model.isGeneric
          ? "border-dashed border-neutral-400 dark:border-neutral-500"
          : "border-neutral-300 dark:border-neutral-600",
        selected ? "ring-2 ring-blue-500" : "",
      ].join(" ")}
    >
      <Handle type="target" position={Position.Left} className="!bg-neutral-400" />
      <div className="flex items-center justify-between gap-2">
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${CATEGORY_STYLES[model.category] ?? CATEGORY_STYLES.generic}`}
        >
          {model.isGeneric ? "unmodeled" : model.category}
        </span>
        <span className="flex items-center gap-1">
          {model.isStart && (
            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
              start
            </span>
          )}
          {errorCount > 0 && (
            <span
              data-testid={`lint-badge-${model.id}`}
              title={`${errorCount} lint error(s)`}
              className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white"
            >
              {errorCount}
            </span>
          )}
          {errorCount === 0 && warningCount > 0 && (
            <span
              data-testid={`lint-badge-${model.id}`}
              title={`${warningCount} lint warning(s)`}
              className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white"
            >
              {warningCount}
            </span>
          )}
        </span>
      </div>
      <div className="mt-1 truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
        {model.id}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs text-neutral-500 dark:text-neutral-400">
          {model.action.Type}
        </span>
        {model.isGeneric && (
          <button
            type="button"
            data-testid={`raw-button-${model.id}`}
            className="nodrag rounded border border-neutral-300 px-1 text-[10px] text-neutral-600 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
            onClick={(e) => {
              e.stopPropagation();
              dispatch({ type: "raw", id: model.id });
            }}
          >
            raw
          </button>
        )}
      </div>
      {dangling > 0 && (
        <p
          data-testid={`dangling-${model.id}`}
          className="mt-1 text-[10px] leading-tight text-amber-600 dark:text-amber-400"
          title="This block has transitions pointing at an Identifier the document does not contain. They are kept in the file but cannot be drawn."
        >
          {dangling} transition(s) point outside this flow
        </p>
      )}
      {inexpressible && (
        <p
          data-testid={`demoted-${model.id}`}
          className="mt-1 text-[10px] leading-tight text-amber-600 dark:text-amber-400"
          title="Generated TypeScript will use GenericBlock for this action until its parameters and transitions match the block class."
        >
          generates as GenericBlock
        </p>
      )}
      {showPrimary && (
        <Handle
          type="source"
          id="primary"
          position={Position.Right}
          style={{ top: "40%" }}
          title="Drag to wire the success path (a branch, on a Compare)"
          className="!bg-neutral-400"
        />
      )}
      {showError && (
        <Handle
          type="source"
          id="error"
          position={Position.Right}
          style={{ top: "75%" }}
          title="Drag to wire the next unwired error branch"
          className="!bg-red-400"
        />
      )}
    </div>
  );
}
