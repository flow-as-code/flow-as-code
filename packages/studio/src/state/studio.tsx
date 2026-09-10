/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// One source of truth: the FlowDoc. Canvas, inspector, palette, and lint all
// derive from it; every mutation flows through the pure functions in
// src/model and lands here as a "mutated" action.

import type { FlowDoc } from "@flow-as-code/core";
import { serialize } from "@flow-as-code/core";
import type { Finding } from "@flow-as-code/core/lint";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";
import { DEMO_BUILD } from "../demoBuild.js";
import { MutationRefused } from "../model/mutations.js";
import { syncErrorText } from "../model/syncError.js";
import type { BridgeConflict, ConflictSide } from "../store/bridgeProtocol.js";
import { BridgeConflictError, BridgeStore, createBridgeStore } from "../store/bridgeStore.js";
import { createDemoStore } from "../store/demoStore.js";
import { readOnly } from "../store/readOnlyStore.js";
import type { DocRef, DocStore } from "../store/types.js";

export interface StudioState {
  store: DocStore;
  docList: DocRef[];
  docName: string | null;
  doc: FlowDoc | null;
  dirty: boolean;
  findings: Finding[];
  /** True while a hard lint rule fails; saving is disabled. */
  blocked: boolean;
  /**
   * True from the moment the doc changes until lint reports on that exact doc.
   * Lint is debounced, so without this the UI would show "clean" for a doc no
   * rule has seen yet. Saving and exporting stay disabled while it is true.
   */
  lintPending: boolean;
  /** Selected node id (inspector target). */
  selected: string | null;
  /** Node id whose raw JSON inspector is open. */
  rawFor: string | null;
  /** Node to center in the canvas; nonce forces re-centering on repeat clicks. */
  focus: { id: string; nonce: number } | null;
  /**
   * A refused gesture, shown transiently. Refusals are common by design now
   * that the demotion invariant is enforced at the mutation layer, and a
   * refusal the UI swallows is indistinguishable from a broken canvas. The
   * nonce re-fires the dismissal timer when the same message repeats.
   */
  notice: { message: string; nonce: number } | null;
  /**
   * An unresolved dirty-both pair for the OPEN document: the FlowDoc on disk
   * and the FlowDoc its builder file synths to have both moved since the last
   * sync. While this is set the studio must not write: the user has to say
   * which side wins, and nothing may merge or pick for them
   * (docs/02-studio-design.md, "No silent merges").
   */
  conflict: BridgeConflict | null;
  /** True while a chosen side is being applied. */
  resolving: boolean;
  /**
   * The bridge could not turn a builder file into a FlowDoc: the file does not
   * compile, or synth threw. It is kept until that document syncs again,
   * because the state it describes lasts that long. It used to be an
   * eight-second toast, after which nothing on screen said the canvas and the
   * .flow.ts on disk had stopped agreeing.
   */
  syncError: { name?: string; path: string; message: string } | null;
  error: string | null;
}

/** Does a synth failure belong to the document that just synced? */
function ownsSyncError(
  syncError: StudioState["syncError"],
  name: string,
): syncError is NonNullable<StudioState["syncError"]> {
  if (syncError === null) return false;
  // A failure the bridge could not attribute to a document clears on any
  // successful sync: the watcher is evidently working again.
  return syncError.name === undefined || syncError.name === name;
}

export type StudioAction =
  | { type: "store-opened"; store: DocStore; docList: DocRef[] }
  | { type: "doc-loaded"; name: string; doc: FlowDoc }
  | { type: "mutated"; doc: FlowDoc }
  | { type: "saved" }
  /**
   * The bridge reported a new version of a document on disk. `force` means the
   * user has already been asked (they resolved a conflict), so the unsaved-work
   * guard below is skipped.
   */
  | { type: "doc-synced"; name: string; doc: FlowDoc; force?: boolean }
  | { type: "conflict"; conflict: BridgeConflict }
  | { type: "resolving"; value: boolean }
  | { type: "lint"; findings: Finding[]; blocked: boolean }
  | { type: "select"; id: string | null }
  | { type: "raw"; id: string | null }
  | { type: "focus"; id: string }
  | { type: "notice"; message: string | null }
  /** A synth failure from the bridge: `message` is already one readable line. */
  | { type: "sync-error"; name?: string; path: string; message: string }
  | { type: "error"; message: string | null };

/** Why an edit was refused while the conflict dialog is up. */
export const CONFLICT_LOCKED =
  "This document changed on both sides, so editing is paused. Choose which version wins; the " +
  "dialog is showing the two it can write.";

export function initialState(store: DocStore): StudioState {
  return {
    store,
    docList: [],
    docName: null,
    doc: null,
    dirty: false,
    findings: [],
    blocked: false,
    lintPending: false,
    selected: null,
    rawFor: null,
    focus: null,
    notice: null,
    conflict: null,
    resolving: false,
    syncError: null,
    error: null,
  };
}

export function reducer(state: StudioState, action: StudioAction): StudioState {
  switch (action.type) {
    case "store-opened":
      return { ...initialState(action.store), docList: action.docList };
    case "doc-loaded":
      return {
        ...state,
        docName: action.name,
        doc: action.doc,
        dirty: false,
        findings: [],
        blocked: false,
        lintPending: true,
        selected: null,
        rawFor: null,
        focus: null,
        notice: null,
        conflict: null,
        resolving: false,
        error: null,
      };
    case "doc-synced": {
      // A document that synced is a document whose builder file compiles
      // again, whether or not it is the one on screen.
      const syncError = ownsSyncError(state.syncError, action.name) ? null : state.syncError;
      // A builder-file edit reloading the canvas must not feel like a page
      // reload: the viewport belongs to React Flow and survives because the
      // canvas is not remounted, and the selection is kept here whenever the
      // selected block still exists in the new document.
      if (action.name !== state.docName) {
        return syncError === state.syncError ? state : { ...state, syncError };
      }
      // Unsaved canvas work is not silently replaced. If the file changed on
      // disk while this canvas held edits of its own, that IS the dirty-both
      // state, and it gets the same answer as the on-disk one: ask. The two
      // sides here are the in-memory document and the one that just arrived.
      if (
        action.force !== true &&
        state.dirty &&
        state.doc !== null &&
        serialize(state.doc) !== serialize(action.doc)
      ) {
        return {
          ...state,
          conflict: {
            name: action.name,
            reason:
              "the builder file changed on disk while this canvas had unsaved edits, so the " +
              "two no longer describe the same flow",
            origin: "canvas",
            docSide: state.doc,
            codeSide: action.doc,
          },
          resolving: false,
        };
      }
      const ids = new Set(action.doc.content.Actions.map((a) => a.Identifier));
      return {
        ...state,
        doc: action.doc,
        dirty: false,
        lintPending: true,
        selected: state.selected !== null && ids.has(state.selected) ? state.selected : null,
        rawFor: state.rawFor !== null && ids.has(state.rawFor) ? state.rawFor : null,
        // A synced pair is a resolved pair, however it got resolved: the user
        // chose a side, or fixed the two files by hand.
        conflict: null,
        resolving: false,
        syncError,
        error: null,
      };
    }
    case "conflict":
      if (action.conflict.name !== state.docName) return state;
      return { ...state, conflict: action.conflict, resolving: false };
    case "resolving":
      return { ...state, resolving: action.value };
    case "mutated":
      // An open conflict is a question about two specific documents, and the
      // answer writes one of them. An edit landing behind the dialog would
      // belong to neither: "keep the canvas version" writes the snapshot the
      // dialog is showing, so the edit would be discarded without ever being
      // named, and every other answer discards it too. The dialog covers the
      // whole shell, so this is the backstop for anything that reaches the
      // reducer another way, and it says so rather than swallowing the gesture.
      if (state.conflict !== null) {
        return {
          ...state,
          notice: { message: CONFLICT_LOCKED, nonce: (state.notice?.nonce ?? 0) + 1 },
        };
      }

      // A mutation that changed nothing (moveNode on an id that is not an
      // Action returns the same document) must not set lintPending: nothing
      // will lint that doc again, so Save would stay disabled behind
      // "Checking..." for the rest of the session.
      if (action.doc === state.doc) return state;
      // findings and blocked still describe the PREVIOUS doc, so mark the
      // result unchecked until lint catches up. Reporting "clean" here is what
      // let a doc failing a hard rule reach store.write inside the debounce.
      //
      // `error` describes what happened to a document that no longer exists,
      // most often a save this edit may well have repaired. Nothing used to
      // clear it short of opening another document, so one refused save left a
      // red line in the header for the rest of the session.
      return {
        ...state,
        doc: action.doc,
        dirty: true,
        lintPending: true,
        notice: null,
        error: null,
      };
    case "saved":
      return { ...state, dirty: false, error: null };
    case "lint":
      return {
        ...state,
        findings: action.findings,
        blocked: action.blocked,
        lintPending: false,
      };
    case "select":
      return { ...state, selected: action.id, rawFor: null };
    case "raw":
      return { ...state, rawFor: action.id, selected: action.id };
    case "focus":
      return {
        ...state,
        selected: action.id,
        focus: { id: action.id, nonce: (state.focus?.nonce ?? 0) + 1 },
      };
    case "notice":
      return {
        ...state,
        notice:
          action.message === null
            ? null
            : { message: action.message, nonce: (state.notice?.nonce ?? 0) + 1 },
      };
    case "sync-error":
      // Two lifetimes for one event: the toast says it happened, the badge
      // says it is still true. Both name the file rather than its absolute
      // path, which the message repeats and which is the same prefix for every
      // document in the served directory.
      return {
        ...state,
        syncError: { name: action.name, path: action.path, message: action.message },
        notice: {
          message: syncErrorText(action.path, action.message),
          nonce: (state.notice?.nonce ?? 0) + 1,
        },
      };
    case "error":
      return { ...state, error: action.message };
  }
}

/**
 * Runs one mutation and puts the result on screen, whatever it is.
 *
 * Three outcomes, and the UI must distinguish all three. A document means the
 * edit happened. `undefined` means the gesture had no meaning at all (dropping
 * an edge on nothing, a drag the handle cannot express), so the caller's
 * `refused` line explains it. A MutationRefused means the edit was legal to
 * ask for but would have cost a block its typed form, and it already carries a
 * sentence naming the blocks and the way forward.
 *
 * Canvas.tsx used to do `if (next !== undefined) dispatch(...)`, which dropped
 * both refusal kinds on the floor with no feedback at all.
 */
export function commit(
  dispatch: Dispatch<StudioAction>,
  run: () => FlowDoc | undefined,
  refused: string,
): boolean {
  let next: FlowDoc | undefined;
  try {
    next = run();
  } catch (err) {
    if (err instanceof MutationRefused) {
      dispatch({ type: "notice", message: err.message });
      return false;
    }
    dispatch({ type: "error", message: err instanceof Error ? err.message : String(err) });
    return false;
  }
  if (next === undefined) {
    dispatch({ type: "notice", message: refused });
    return false;
  }
  dispatch({ type: "mutated", doc: next });
  return true;
}

interface StudioContextValue {
  state: StudioState;
  dispatch: Dispatch<StudioAction>;
}

const StudioContext = createContext<StudioContextValue | null>(null);

/**
 * The store the app boots with: the serving `flow-cli studio` bridge when
 * there is one, the built-in demo otherwise. The choice is synchronous (the
 * bridge injects its description into the page) so a static build never
 * probes for a server that is not there, and the demo still opens offline.
 *
 * The hosted demo build (`demo` true) wraps the demo store read-only: the
 * canvas edits, nothing saves, a reload restores the pristine flow.
 */
export function defaultStore(scope: unknown = globalThis, demo: boolean = DEMO_BUILD): DocStore {
  const bridge = createBridgeStore(scope);
  if (bridge !== undefined) return bridge;
  return demo ? readOnly(createDemoStore()) : createDemoStore();
}

/**
 * `store` overrides the boot store. Production never passes it; tests do, so
 * they can mount the app on a stub bridge without racing the default store's
 * asynchronous open.
 */
export function StudioProvider({ children, store }: { children: ReactNode; store?: DocStore }) {
  const [state, dispatch] = useReducer(reducer, undefined, () =>
    initialState(store ?? defaultStore()),
  );

  // Boot: list the store and open its first doc (runs once).
  useEffect(() => {
    void openStore(dispatch, state.store);
    // The store only changes through openStore itself, so this cannot loop.
  }, []);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio(): StudioContextValue {
  const ctx = useContext(StudioContext);
  if (ctx === null) throw new Error("useStudio outside StudioProvider");
  return ctx;
}

/** Opens a store, lists it, and loads its first document. */
export async function openStore(dispatch: Dispatch<StudioAction>, store: DocStore): Promise<void> {
  try {
    const docList = await store.list();
    dispatch({ type: "store-opened", store, docList });
    const first = docList[0];
    if (first !== undefined) {
      const { doc } = await store.read(first.name);
      dispatch({ type: "doc-loaded", name: first.name, doc });
    }
  } catch (err) {
    dispatch({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
}

export async function loadDoc(
  dispatch: Dispatch<StudioAction>,
  store: DocStore,
  name: string,
): Promise<void> {
  try {
    const { doc } = await store.read(name);
    dispatch({ type: "doc-loaded", name, doc });
  } catch (err) {
    dispatch({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * The one save path. It exists so the conflict case is handled once: the
 * bridge answers a write with 409 when both sides moved, and that has to
 * become the dialog rather than a red error line the user can ignore.
 */
export async function saveDoc(
  dispatch: Dispatch<StudioAction>,
  store: DocStore,
  name: string,
  doc: FlowDoc,
): Promise<boolean> {
  try {
    await store.write(name, doc);
    dispatch({ type: "saved" });
    return true;
  } catch (err) {
    if (err instanceof BridgeConflictError) {
      dispatch({ type: "conflict", conflict: err.conflict });
      return false;
    }
    dispatch({ type: "error", message: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

/**
 * Applies the user's choice of side.
 *
 * "code" is always the same operation: rewrite the FlowDoc from the builder
 * file, which the bridge does. "doc" depends on where the canvas side lives.
 * When both sides are files (origin "disk") the bridge regenerates the source
 * from the document on disk. When the canvas side is the unsaved document in
 * this browser (origin "canvas") only the studio has it, so keeping it is a
 * forced write of that document; nothing else can produce those bytes.
 */
export async function resolveConflict(
  dispatch: Dispatch<StudioAction>,
  store: DocStore,
  conflict: BridgeConflict,
  side: ConflictSide,
): Promise<void> {
  if (!(store instanceof BridgeStore)) {
    dispatch({ type: "error", message: "Only the flow-cli studio bridge can resolve a conflict." });
    return;
  }
  const { name } = conflict;
  dispatch({ type: "resolving", value: true });
  try {
    if (side === "doc" && conflict.origin === "canvas") {
      const canvasSide = conflict.docSide;
      if (canvasSide === null) throw new Error("There is no canvas version to keep.");
      await store.write(name, canvasSide, { force: true });
      dispatch({ type: "doc-synced", name, doc: canvasSide, force: true });
      return;
    }
    const payload = await store.resolve(name, side);
    dispatch({ type: "doc-synced", name, doc: payload.doc, force: true });
  } catch (err) {
    dispatch({ type: "resolving", value: false });
    dispatch({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
}
