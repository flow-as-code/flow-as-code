/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The two modules the demo build swaps in (src/demo/) must be drop-in for the
// modules they replace. Vite resolves the swap by path, without a type check
// across it, so a value export missing from a stub would surface as a blank
// page in the deployed demo and nowhere else. This file compares the runtime
// export surfaces and pins what the stubs promise: no request, no bridge, no
// package name.

import { PACKAGE_NAMES, PACKAGE_SCOPE } from "@flow-as-code/core";
import { describe, expect, it } from "vitest";
import * as demoBridge from "../src/demo/bridgeStore.js";
import * as demoNames from "../src/demo/package-names.js";
import * as realBridge from "../src/store/bridgeStore.js";
import {
  BRIDGE_GLOBAL,
  type BridgeConflict,
  type BridgeInfo,
} from "../src/store/bridgeProtocol.js";

const surface = (mod: object): string[] => Object.keys(mod).sort();

const info: BridgeInfo = { protocol: 1, token: "t", label: "demo", dir: "/nowhere" };

describe("demo stub: package names", () => {
  it("exports exactly what @flow-as-code/core's package-names exports", () => {
    expect(surface(demoNames)).toEqual(["PACKAGE_NAMES", "PACKAGE_SCOPE"]);
    expect(Object.keys(demoNames.PACKAGE_NAMES).sort()).toEqual(Object.keys(PACKAGE_NAMES).sort());
  });

  it("uses a placeholder scope and keeps the short names", () => {
    expect(demoNames.PACKAGE_SCOPE).toBe("@example");
    expect(demoNames.PACKAGE_SCOPE).not.toBe(PACKAGE_SCOPE);
    for (const key of Object.keys(PACKAGE_NAMES) as Array<keyof typeof PACKAGE_NAMES>) {
      const real = PACKAGE_NAMES[key];
      const stub = demoNames.PACKAGE_NAMES[key];
      expect(stub).toBe(real.replace(PACKAGE_SCOPE, demoNames.PACKAGE_SCOPE));
      expect(stub).not.toContain(PACKAGE_SCOPE);
    }
  });
});

describe("demo stub: bridge store", () => {
  it("exports exactly what the real bridgeStore exports", () => {
    expect(surface(demoBridge)).toEqual(surface(realBridge));
  });

  it("never finds a bridge, even when one is injected", () => {
    expect(demoBridge.servedByBridge()).toBeUndefined();
    expect(demoBridge.createBridgeStore()).toBeUndefined();
    // The real store would build a client from this global; the stub ignores it.
    const scope = { [BRIDGE_GLOBAL]: info };
    expect(realBridge.createBridgeStore(scope, { fetch: () => Promise.reject() })).toBeDefined();
    expect((demoBridge.createBridgeStore as (scope: unknown) => unknown)(scope)).toBeUndefined();
  });

  it("cannot be constructed, so instanceof is false for every store", () => {
    expect(() => new demoBridge.BridgeStore(info)).toThrow(/no bridge/);
  });

  it("refuses to describe a bridge", async () => {
    await expect(demoBridge.fetchBridgeInfo()).rejects.toThrow(/no bridge/);
  });

  it("keeps the conflict error shape the app narrows on", () => {
    const conflict: BridgeConflict = {
      name: "x",
      reason: "diverged",
      origin: "disk",
      docSide: null,
      codeSide: null,
    };
    const err = new demoBridge.BridgeConflictError(conflict, "conflict");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("BridgeConflictError");
    expect(err.conflict).toBe(conflict);
  });
});
