/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// @vitest-environment happy-dom
//
// The opening frame of the canvas, which is the first thing a visitor to the
// hosted demo sees and the one part of it nothing was holding.
//
// A bare `fitView` scales the whole flow into the pane whatever that costs.
// The demo flow is 2260px wide, so the deployed demo settled at scale 0.4 in a
// 1004px pane and every label was a smudge; that shipped, with the whole suite
// green, because no rule mentioned the fit. Deleting `fitViewOptions` from
// Canvas.tsx today would still leave every other studio test passing.
//
// So the two numbers are asserted at the boundary where they leave this
// codebase: the props handed to React Flow. The floor on the initial fit and
// the floor on the pane are different numbers on purpose, and the second must
// stay below the first, or clamping the fit would also take away the gesture
// that shows the whole graph.

import type { FlowDoc } from "@flow-as-code/core";
import { useEffect, type ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/** Props the last render handed to React Flow. */
const seen: { props: Record<string, unknown> } = { props: {} };

// Only ReactFlow itself is replaced, and by a component that renders nothing:
// its children (Background, Controls) then never mount, so none of them needs
// a stub and nothing here depends on React Flow's own rendering.
vi.mock("@xyflow/react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    ReactFlow: (props: Record<string, unknown>) => {
      seen.props = props;
      return null;
    },
  };
});

const { Canvas } = await import("../src/components/Canvas.js");
const { StudioProvider, useStudio } = await import("../src/state/studio.js");
const { installDomStubs, render, unmount } = await import("./appHarness.js");
const { demoDoc } = await import("./helpers.js");

beforeAll(installDomStubs);
afterEach(() => {
  unmount();
  seen.props = {};
});

const NAME = "fit.flowdoc.json";

function Harness({ doc, children }: { doc: FlowDoc; children: ReactNode }) {
  const { state, dispatch } = useStudio();
  useEffect(() => {
    if (state.docName !== NAME) dispatch({ type: "doc-loaded", name: NAME, doc });
  }, [state.docName, doc, dispatch]);
  if (state.docName !== NAME) return null;
  return <>{children}</>;
}

async function renderCanvas(): Promise<void> {
  await render(
    <StudioProvider>
      <Harness doc={demoDoc()}>
        <Canvas />
      </Harness>
    </StudioProvider>,
  );
}

describe("the canvas opens", () => {
  it("fits the flow but not below a readable zoom", async () => {
    await renderCanvas();
    const options = seen.props["fitViewOptions"] as { minZoom?: number } | undefined;
    expect(seen.props["fitView"], "the canvas no longer fits the flow on open").toBeTruthy();
    expect(options, "the initial fit is unbounded, so a large flow opens as a smear").toBeTruthy();
    expect(options!.minZoom, "the initial fit may not scale below a readable zoom").toBe(0.6);
  });

  it("still lets a reader zoom out to the whole graph", async () => {
    await renderCanvas();
    const pane = seen.props["minZoom"] as number | undefined;
    const fit = (seen.props["fitViewOptions"] as { minZoom?: number }).minZoom!;
    expect(pane, "the pane declares no zoom floor of its own").toBeTypeOf("number");
    expect(pane!, "the pane's floor rose to the fit's, so zooming out is gone").toBeLessThan(fit);
    expect(pane).toBe(0.1);
  });
});
