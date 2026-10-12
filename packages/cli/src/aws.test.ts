/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The optional Q in Connect peer (tasks/D05): absent is not an error, present
// is used, and present but broken is reported with the loader's reason.
import { describe, expect, it } from "vitest";

import { CASES_PACKAGE, QCONNECT_PACKAGE, loadCasesSdk, loadQConnectSdk } from "./aws.js";
import { CliError } from "./errors.js";

const notFound = (name: string): Error =>
  Object.assign(new Error(`Cannot find package '${name}' imported from /x/aws.js`), {
    code: "ERR_MODULE_NOT_FOUND",
  });

describe("loadQConnectSdk", () => {
  it("returns the module when the peer is installed", async () => {
    class QConnectClient {
      send() {
        return Promise.resolve({});
      }
    }
    const sdk = await loadQConnectSdk(() => Promise.resolve({ QConnectClient }));
    expect(sdk?.QConnectClient).toBe(QConnectClient);
  });

  it("returns undefined when the peer itself is not installed", async () => {
    await expect(
      loadQConnectSdk(() => Promise.reject(notFound(QCONNECT_PACKAGE))),
    ).resolves.toBeUndefined();
  });

  it("reports a peer that is present but cannot load, naming the missing dependency", async () => {
    const run = loadQConnectSdk(() => Promise.reject(notFound("@smithy/broken")));
    await expect(run).rejects.toBeInstanceOf(CliError);
    await expect(run).rejects.toThrow(
      `${QCONNECT_PACKAGE} could not be loaded: Cannot find package '@smithy/broken'`,
    );
  });

  it("loads the installed peer from the workspace", async () => {
    const sdk = await loadQConnectSdk();
    expect(typeof sdk?.QConnectClient).toBe("function");
  });
});

// The optional Cases peer (tasks/D06), read the same way.
describe("loadCasesSdk", () => {
  it("returns undefined when the peer itself is not installed", async () => {
    await expect(
      loadCasesSdk(() => Promise.reject(notFound(CASES_PACKAGE))),
    ).resolves.toBeUndefined();
  });

  it("reports a peer that is present but cannot load", async () => {
    const run = loadCasesSdk(() => Promise.reject(notFound("@smithy/broken")));
    await expect(run).rejects.toBeInstanceOf(CliError);
    await expect(run).rejects.toThrow(`${CASES_PACKAGE} could not be loaded`);
  });

  it("loads the installed peer from the workspace", async () => {
    const sdk = await loadCasesSdk();
    expect(typeof sdk?.ConnectCasesClient).toBe("function");
  });
});
