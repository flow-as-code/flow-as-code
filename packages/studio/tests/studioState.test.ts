/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The reducer and the commit seam. lintPending gates Save, so anything that
// can set it without a lint following is a way to disable Save forever.

import { describe, expect, it } from "vitest";
import { MutationRefused, moveNode, rewireEdge } from "../src/model/mutations.js";
import {
  commit,
  initialState,
  reducer,
  type StudioAction,
  type StudioState,
} from "../src/state/studio.js";
import { createDemoStore } from "../src/store/demoStore.js";
import { demoDoc } from "./helpers.js";

function loaded(): StudioState {
  return reducer(initialState(createDemoStore()), {
    type: "doc-loaded",
    name: "appointment-line",
    doc: demoDoc(),
  });
}

describe("mutated", () => {
  it("ignores a mutation that returned the same document", () => {
    // moveNode on an id that is not an Action returns the doc unchanged. The
    // reducer used to set lintPending anyway, and nothing would ever lint that
    // doc again, so Save stayed disabled behind "Checking..." for good.
    const state = reducer(loaded(), { type: "lint", findings: [], blocked: false });
    expect(state.lintPending).toBe(false);
    const same = moveNode(state.doc!, "not-a-block", { x: 1, y: 2 });
    expect(same).toBe(state.doc);
    const next = reducer(state, { type: "mutated", doc: same });
    expect(next).toBe(state);
    expect(next.lintPending).toBe(false);
  });

  it("marks a real change unchecked until lint reports", () => {
    const state = reducer(loaded(), { type: "lint", findings: [], blocked: false });
    const moved = moveNode(state.doc!, "welcome", { x: 1, y: 2 });
    const next = reducer(state, { type: "mutated", doc: moved });
    expect(next.lintPending).toBe(true);
    expect(next.dirty).toBe(true);
  });
});

describe("notice", () => {
  it("bumps the nonce so a repeated message re-fires the timer", () => {
    let state = reducer(loaded(), { type: "notice", message: "no" });
    expect(state.notice?.nonce).toBe(1);
    state = reducer(state, { type: "notice", message: "no" });
    expect(state.notice?.nonce).toBe(2);
    state = reducer(state, { type: "notice", message: null });
    expect(state.notice).toBeNull();
  });

  it("clears when an edit lands", () => {
    const state = reducer(loaded(), { type: "notice", message: "no" });
    const next = reducer(state, {
      type: "mutated",
      doc: moveNode(state.doc!, "welcome", { x: 9, y: 9 }),
    });
    expect(next.notice).toBeNull();
  });
});

describe("commit", () => {
  const collect = () => {
    const actions: StudioAction[] = [];
    return { actions, dispatch: (a: StudioAction) => actions.push(a) };
  };

  it("dispatches the new document when the mutation succeeds", () => {
    const { actions, dispatch } = collect();
    const doc = demoDoc();
    expect(
      commit(dispatch, () => rewireEdge(doc, "welcome:next", "welcome", "apologize"), "no"),
    ).toBe(true);
    expect(actions[0]?.type).toBe("mutated");
  });

  it("turns a MutationRefused into the notice it carries", () => {
    const { actions, dispatch } = collect();
    const doc = demoDoc();
    expect(
      commit(dispatch, () => rewireEdge(doc, "check-hours:next", "check-hours", "hang-up"), "no"),
    ).toBe(false);
    expect(actions).toHaveLength(1);
    const action = actions[0]!;
    expect(action.type).toBe("notice");
    if (action.type === "notice") expect(action.message).toContain('"check-hours"');
  });

  it("explains an undefined result with the caller's message", () => {
    const { actions, dispatch } = collect();
    expect(commit(dispatch, () => undefined, "nothing to do here")).toBe(false);
    const action = actions[0]!;
    expect(action.type).toBe("notice");
    if (action.type === "notice") expect(action.message).toBe("nothing to do here");
  });

  it("reports a genuine error as an error, not a notice", () => {
    const { actions, dispatch } = collect();
    commit(
      dispatch,
      () => {
        throw new Error("disk on fire");
      },
      "no",
    );
    expect(actions[0]?.type).toBe("error");
  });

  it("does not mistake a MutationRefused for an error", () => {
    const refusal = new MutationRefused("x", ["a"], "because");
    expect(refusal).toBeInstanceOf(Error);
    expect(refusal.blockIds).toEqual(["a"]);
    const { actions, dispatch } = collect();
    commit(
      dispatch,
      () => {
        throw refusal;
      },
      "no",
    );
    expect(actions[0]?.type).toBe("notice");
  });
});
