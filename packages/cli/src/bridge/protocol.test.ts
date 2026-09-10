/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The bridge protocol lives in two places, because @flow-as-code/cli depends on the
// studio (for its built assets) and the reverse import would be a cycle. A
// copy is only safe while it is provably a copy: if this fails, copy
// packages/cli/src/bridge/protocol.ts over
// packages/studio/src/store/bridgeProtocol.ts and land both in the same
// commit. Same arrangement as src/schema.test.ts for the packaged FlowDoc
// schema.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  BRIDGE_GLOBAL,
  BRIDGE_PROTOCOL,
  bridgeBootScript,
  isBridgeDocName,
  isExportPath,
  isExportSubdir,
  readBridgeInfo,
  type BridgeInfo,
} from "./protocol.js";

const CLI_COPY = fileURLToPath(new URL("./protocol.ts", import.meta.url));
const STUDIO_COPY = fileURLToPath(
  new URL("../../../studio/src/store/bridgeProtocol.ts", import.meta.url),
);

const info: BridgeInfo = {
  protocol: BRIDGE_PROTOCOL,
  dir: "/tmp/flows",
  label: "flows",
  token: "test-token",
};

describe("bridge protocol", () => {
  it("is byte-identical in @flow-as-code/cli and @flow-as-code/studio", () => {
    expect(readFileSync(STUDIO_COPY, "utf8")).toBe(readFileSync(CLI_COPY, "utf8"));
  });

  it("accepts @flow-as-code/core slugs as document names and nothing else", () => {
    expect(isBridgeDocName("appointment-line")).toBe(true);
    expect(isBridgeDocName("../../etc/passwd")).toBe(false);
    expect(isBridgeDocName("appointment-line.flowdoc")).toBe(false);
    expect(isBridgeDocName("Appointment")).toBe(false);
    expect(isBridgeDocName("a/b")).toBe(false);
    expect(isBridgeDocName("")).toBe(false);
  });

  it("accepts the paths the export targets emit and refuses traversal", () => {
    // Everything @flow-as-code/tf, the CDK scaffold, and render actually write.
    for (const path of [
      "flows.tf",
      "flow_refs.tf",
      "variables.tf",
      "versions.tf.example",
      "flows/appointment-line.flow.tftpl",
      "flow-stack.ts",
      "appointment-line.json",
    ]) {
      expect(isExportPath(path), path).toBe(true);
    }
    for (const path of [
      "",
      "..",
      "../escaped.tf",
      "a/../../b.tf",
      "/etc/passwd",
      "a\\b.tf",
      ".hidden",
      "a/.hidden/b.tf",
      "a\0b.tf",
      "a/b/c/d/e.tf",
      "x".repeat(201),
    ]) {
      expect(isExportPath(path), path).toBe(false);
    }
  });

  it("accepts a destination subdirectory, including none, and refuses escapes", () => {
    for (const subdir of ["", "infra", "infra/cdk", "a/b/c"]) {
      expect(isExportSubdir(subdir), subdir).toBe(true);
    }
    for (const subdir of ["..", "../out", "/abs", ".", "a/b/c/d", ".hidden"]) {
      expect(isExportSubdir(subdir), subdir).toBe(false);
    }
  });

  it("round-trips the injected description and rejects a foreign one", () => {
    const script = bridgeBootScript(info);
    const scope: Record<string, unknown> = {};
    new Function("window", script.replace("<script>", "").replace("</script>", ""))(scope);
    expect(readBridgeInfo(scope)).toEqual(info);

    expect(readBridgeInfo({})).toBeUndefined();
    expect(readBridgeInfo({ [BRIDGE_GLOBAL]: { protocol: 999, dir: "x", label: "y" } })).toBe(
      undefined,
    );
    expect(readBridgeInfo({ [BRIDGE_GLOBAL]: { protocol: BRIDGE_PROTOCOL } })).toBeUndefined();
    expect(readBridgeInfo(null)).toBeUndefined();
  });

  it("escapes a description that would close its own script tag", () => {
    const hostile = bridgeBootScript({ ...info, dir: "</script><img onerror=alert(1) src=x>" });
    expect(hostile).not.toContain("</script><img");
    expect(hostile.endsWith("</script>")).toBe(true);
  });
});
