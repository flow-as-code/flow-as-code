/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// CDK binding for @flow-as-code/core. See README.md.
//
// TokenBinder maps FlowDoc references to CloudFormation-token strings;
// FlowSet turns a set of FlowDocs into AWS::Connect resources with module
// version publishing and alias repointing.
//
// aws-cdk-lib and constructs are OPTIONAL peers, so that installing @flow-as-code/cli
// (which only reaches this package through the ./scaffold subpath, and that
// subpath imports no CDK) does not drag 168 MB of CDK in. The cost is that npm
// no longer warns at install time, so a consumer who forgets them used to meet
// a bare ERR_MODULE_NOT_FOUND for aws-cdk-lib raised from flow-set.js. ESM
// resolves the whole graph before any module body runs, so the only way to
// front-run that is to keep flow-set.js off the static import graph: this
// module checks the peer itself and then loads flow-set through a dynamic
// import. The type-only imports below are erased and pull in nothing.

import { createRequire } from "node:module";

import { PACKAGE_NAMES } from "@flow-as-code/core";

import type { FlowSet as FlowSetClass, FlowSetProps } from "./flow-set.js";

export { bindRef, type TokenBinder } from "./binder.js";
export type { FlowSetProps };

/** Peer floor, kept in step with peerDependencies in package.json. */
const CDK_PEERS = "aws-cdk-lib@^2.267.0 constructs@^10.8.1";

function assertCdkPeersInstalled(): void {
  try {
    createRequire(import.meta.url).resolve("aws-cdk-lib");
  } catch {
    throw new Error(
      `${PACKAGE_NAMES.cdk} needs the CDK at runtime, but aws-cdk-lib is not installed. ` +
        "It and constructs are optional peers so that a CLI-only install stays small, " +
        `which means npm does not warn about them at install time. Install them with: npm install ${CDK_PEERS}`,
    );
  }
}

assertCdkPeersInstalled();

const flowSet = await import("./flow-set.js");

export const DEFAULT_MODULE_ALIAS: string = flowSet.DEFAULT_MODULE_ALIAS;
export const FlowSet: typeof FlowSetClass = flowSet.FlowSet;
export type FlowSet = FlowSetClass;
