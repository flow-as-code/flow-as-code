/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// React Flow canvas over the derived graph model. Dragging updates layout
// only; connecting and reconnecting edges rewires transitions through the
// pure mutations in src/model/mutations.ts.
//
// Two rules this file exists to keep:
//
// 1. Every transition in the document is drawn. React Flow silently drops an
//    edge whose sourceHandle does not exist on its node, so the set of source
//    handles a node renders is derived from the very edges leaving it
//    (sourceHandles below), never from the action's Type. Deciding it by type
//    made a transition on a terminal-typed action invisible: it could not be
//    seen, rewired, or deleted, which is content dropped from the canvas.
//
// 2. Every refused gesture is explained. Mutations refuse in two ways, an
//    undefined result and a thrown MutationRefused, and both used to be
//    discarded here by `if (next !== undefined)`. They go through commit() so
//    the user sees why.

import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeMarkerType,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo } from "react";
import { NODE_HEIGHT, NODE_WIDTH } from "@flow-as-code/core";
import { demotedIds } from "../model/demotion.js";
import { docToGraph, type EdgeModel, type GraphModel } from "../model/graph.js";
import { connectNodes, moveNode, rewireEdge, type SourceHandle } from "../model/mutations.js";
import { commit, useStudio } from "../state/studio.js";
import { ActionNode, type ActionFlowNode, type SourceHandles } from "./ActionNode.js";

const nodeTypes = { action: ActionNode };

const arrow: EdgeMarkerType = { type: MarkerType.ArrowClosed, width: 18, height: 18 };

/** Which of a node's two source handles an edge leaves from. */
function sourceHandleFor(kind: EdgeModel["kind"]): SourceHandle {
  return kind === "error" ? "error" : "primary";
}

/**
 * The handles each node must render for the edges leaving it to attach. Read
 * from the same edge list the canvas draws, so a handle can never be missing
 * for an edge that exists, whatever the action's Type says about it.
 */
function sourceHandles(graph: GraphModel): Map<string, SourceHandles> {
  const map = new Map<string, SourceHandles>();
  for (const edge of graph.edges) {
    const entry = map.get(edge.source) ?? { primary: false, error: false };
    entry[sourceHandleFor(edge.kind)] = true;
    map.set(edge.source, entry);
  }
  return map;
}

function toEdge(model: EdgeModel): Edge {
  const base: Edge = {
    id: model.id,
    source: model.source,
    sourceHandle: sourceHandleFor(model.kind),
    target: model.target,
    label: model.label,
    markerEnd: arrow,
    reconnectable: true,
  };
  if (model.kind === "error") {
    // Error edges are clearly distinct: dashed, red, labeled with ErrorType.
    return {
      ...base,
      style: { stroke: "#dc2626", strokeDasharray: "6 3" },
      labelStyle: { fill: "#dc2626", fontSize: 10 },
    };
  }
  if (model.kind === "condition") {
    return {
      ...base,
      style: { stroke: "#d97706" },
      labelStyle: { fill: "#d97706", fontSize: 10 },
    };
  }
  return base;
}

function CanvasInner() {
  const { state, dispatch } = useStudio();
  const { doc, findings, focus } = state;
  const { setCenter } = useReactFlow();

  const graph = useMemo(
    () => (doc === null ? { nodes: [], edges: [], dangling: [] } : docToGraph(doc)),
    [doc],
  );

  const counts = useMemo(() => {
    const map = new Map<string, { errors: number; warnings: number }>();
    for (const f of findings) {
      if (f.blockId === undefined) continue;
      const entry = map.get(f.blockId) ?? { errors: 0, warnings: 0 };
      if (f.severity === "error") entry.errors++;
      else entry.warnings++;
      map.set(f.blockId, entry);
    }
    return map;
  }, [findings]);

  // Which blocks codegen would emit as GenericBlock right now, straight from
  // codegen. The node badge reads from this rather than from isModeled(Type),
  // so the canvas and the generator can never quietly disagree about which
  // blocks are typed.
  const demoted = useMemo(() => (doc === null ? new Set<string>() : demotedIds(doc)), [doc]);

  const handles = useMemo(() => sourceHandles(graph), [graph]);

  // Transitions that have no node to end at cannot be edges, so the count goes
  // on the source node instead of disappearing (see model/graph.ts).
  const danglingCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of graph.dangling) map.set(d.source, (map.get(d.source) ?? 0) + 1);
    return map;
  }, [graph]);

  const derivedNodes = useMemo(
    () =>
      graph.nodes.map((n): ActionFlowNode => {
        const c = counts.get(n.id) ?? { errors: 0, warnings: 0 };
        return {
          id: n.id,
          type: "action",
          position: n.position,
          data: {
            model: n,
            errorCount: c.errors,
            warningCount: c.warnings,
            handles: handles.get(n.id) ?? { primary: false, error: false },
            demoted: demoted.has(n.id),
            dangling: danglingCounts.get(n.id) ?? 0,
          },
          selected: state.selected === n.id,
        };
      }),
    [graph, counts, handles, demoted, danglingCounts, state.selected],
  );

  // The doc is the source of truth; React Flow's node state is a projection
  // that also carries in-progress drag positions until dragStop commits them.
  const [nodes, setNodes, onNodesChange] = useNodesState<ActionFlowNode>(derivedNodes);
  useEffect(() => setNodes(derivedNodes), [derivedNodes, setNodes]);

  const edges: Edge[] = useMemo(() => graph.edges.map(toEdge), [graph]);

  // Lint panel click focuses the node.
  useEffect(() => {
    if (focus === null || doc === null) return;
    const pos = doc.layout?.[focus.id] ?? graph.nodes.find((n) => n.id === focus.id)?.position;
    if (pos !== undefined) {
      void setCenter(pos.x + NODE_WIDTH / 2, pos.y + NODE_HEIGHT / 2, {
        zoom: 1.2,
        duration: 300,
      });
    }
  }, [focus, doc, graph, setCenter]);

  if (doc === null) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">
        No document loaded.
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1" data-testid="canvas">
      <ReactFlow
        colorMode="system"
        nodeTypes={nodeTypes}
        nodes={nodes}
        onNodesChange={onNodesChange}
        edges={edges}
        fitView
        // The opening frame has to be readable. A bare fitView scales the whole
        // flow into the pane whatever that costs: the demo flow is 2260px wide,
        // so a 784px canvas (a 1280px window minus the two sidebars) settles at
        // scale 0.32 and every label is a smudge. Clamping the initial fit to
        // 0.6-1.0 opens on the middle of the flow at a size a reader can read,
        // with the ends off the edges: fitView centres what it cannot fit, so
        // this is a legible frame rather than the first block, and panning is
        // how anyone meets a flow editor anyway. minZoom stays 0.1 on the pane
        // so zooming out to the whole graph is still one gesture away;
        // fitViewOptions bounds only the fit. Both numbers are held by
        // tests/canvasFit.test.tsx, because nothing else notices a fit.
        fitViewOptions={{ minZoom: 0.6, maxZoom: 1, padding: 0.1 }}
        minZoom={0.1}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => dispatch({ type: "select", id: node.id })}
        onPaneClick={() => dispatch({ type: "select", id: null })}
        onNodeDragStop={(_, node) => {
          commit(
            dispatch,
            () => moveNode(doc, node.id, node.position),
            `"${node.id}" is not a block in this flow.`,
          );
        }}
        onConnect={(connection: Connection) => {
          const { source, target } = connection;
          if (source === null || target === null) return;
          // The handle decides what kind of transition to create; the rules
          // live in model/mutations.ts, not here.
          const handle =
            connection.sourceHandle === "error" || connection.sourceHandle === "primary"
              ? connection.sourceHandle
              : undefined;
          commit(
            dispatch,
            () => connectNodes(doc, source, target, handle),
            `There is no ${handle === "error" ? "error branch" : "transition"} "${source}" can still take to "${target}".`,
          );
        }}
        onReconnect={(oldEdge: Edge, connection: Connection) => {
          const { source, target } = connection;
          if (source === null || target === null) return;
          commit(
            dispatch,
            () => rewireEdge(doc, oldEdge.id, source, target),
            `"${source}" cannot take that transition; it would replace one it already has.`,
          );
        }}
      >
        <Background gap={16} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

export function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
