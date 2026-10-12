/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Where the CLI meets the AWS SDK, and the seam the tests replace.
//
// `export`, `simulate`, and `diff` each reach their instance through one of the
// two factories in LiveClients. The default set builds @flow-as-code/core's SDK adapters
// over a real ConnectClient; a test passes its own set, holding a fixture
// client, and every line of the commands runs offline. Nothing else in this
// package imports the SDK.
//
// Credentials: the SDK's default provider chain (environment variables, the
// shared config and credentials files with their profiles and SSO sessions,
// web identity, the container and instance metadata endpoints). The CLI takes
// no credential flags and reads no secrets of its own.
// https://docs.aws.amazon.com/sdkref/latest/guide/standardized-credentials.html
//
// Region: the one in the instance ARN. A v3 client must be given a Region, and
// an instance ARN spells it (`arn:aws:connect:<region>:<account>:instance/<id>`),
// so nothing is read from AWS_REGION or a profile, and an instance in one
// Region cannot be addressed through a client configured for another.
// https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-region.html
// https://docs.aws.amazon.com/connect/latest/adminguide/find-instance-arn.html
//
// @aws-sdk/client-connect is an optional peer dependency, loaded with a dynamic
// import at the moment a command needs it. A missing SDK is a CliError naming
// the package, not a stack trace from inside a module resolver. Only the
// package itself being unresolvable counts as missing; an SDK that is present
// but cannot be loaded (a dependency of its own missing, a file it cannot
// evaluate) is reported with the loader's reason, because the install command
// is not the fix for that.

import type { AwsCommandSender, ConnectInventoryClient, FlowTestClient } from "@flow-as-code/core";
import {
  createConnectInventoryClient,
  createConnectTestClient,
  parseConnectArn,
} from "@flow-as-code/core";

import { CliError, messageOf } from "./errors.js";

/** An instance, as `--instance` names it. */
export interface InstanceTarget {
  /** The ARN exactly as given. */
  arn: string;
  region: string;
  instanceId: string;
}

/** The clients a live command runs through. Tests supply fixture-backed ones. */
export interface LiveClients {
  /** For `export` and `diff`: the inventory and flow content of an instance. */
  inventory(target: InstanceTarget): Promise<ConnectInventoryClient>;
  /** For `simulate`: the TestCase operations. */
  test(target: InstanceTarget): Promise<FlowTestClient>;
}

/** The peer dependency every live command needs. */
export const SDK_PACKAGE = "@aws-sdk/client-connect";

/**
 * The optional peer that lets `export` and `diff` name AI agents assistants
 * (`CreateWisdomSession`'s `WisdomAssistantArn`, an `assistant` reference
 * since FlowDoc 0.3). Without it the inventory lists no assistant and an
 * assistant ARN in flow content stays literal, which export reports as it
 * reports any ARN it cannot name.
 * https://docs.aws.amazon.com/amazon-q-connect/latest/APIReference/API_ListAssistants.html
 */
export const QCONNECT_PACKAGE = "@aws-sdk/client-qconnect";

/**
 * The optional peer that lets `export` and `diff` name a Cases template and
 * a domain's own fields (`casetemplate` and `casefield` references since
 * FlowDoc 0.3, tasks/D06), read with ListTemplates and ListFields for the
 * domain the instance's CASES_DOMAIN association names. Without it the
 * inventory has no Cases domain, and a template or field id in flow content
 * stays the literal id the service holds.
 * https://docs.aws.amazon.com/connect/latest/APIReference/API_connect-cases_ListFields.html
 */
export const CASES_PACKAGE = "@aws-sdk/client-connectcases";

export const MISSING_SDK_MESSAGE =
  `Connecting to an instance needs the optional peer dependency ${SDK_PACKAGE}. ` +
  `Install it beside flow-cli (npm install ${SDK_PACKAGE}).`;

export const STALE_SDK_MESSAGE =
  `The installed ${SDK_PACKAGE} does not expose the TestCase operations. ` +
  "They are recent; upgrade the SDK (3.1122.0 has them all).";

/**
 * Parses `--instance`. Only an instance ARN will do: a bare id carries no
 * Region, and a resource ARN names the wrong thing. `exitCode` is the code the
 * rejection exits with, because `diff` reserves 1 for "differs".
 */
export function parseInstanceArn(arn: string, exitCode = 1): InstanceTarget {
  const parsed = parseConnectArn(arn);
  if (parsed === undefined || parsed.resourceType !== undefined || parsed.qualifier !== undefined) {
    throw new CliError(
      "--instance must be an Amazon Connect instance ARN " +
        `(arn:<partition>:connect:<region>:<account>:instance/<id>), got "${arn}". ` +
        "The Region is read from it.",
      exitCode,
    );
  }
  if (parsed.region === "") {
    throw new CliError(
      `--instance ARN "${arn}" has no Region; one is needed to connect.`,
      exitCode,
    );
  }
  return { arn, region: parsed.region, instanceId: parsed.instanceId };
}

/** The slice of the SDK module the CLI touches. */
interface ConnectSdk {
  ConnectClient: new (config: { region: string }) => AwsCommandSender;
  CreateTestCaseCommand?: unknown;
}

/** The slice of @aws-sdk/client-qconnect the CLI touches. */
export interface QConnectSdk {
  QConnectClient: new (config: { region: string }) => AwsCommandSender;
}

/** The slice of @aws-sdk/client-connectcases the CLI touches. */
export interface CasesSdk {
  ConnectCasesClient: new (config: { region: string }) => AwsCommandSender;
}

/**
 * Whether `error` is Node failing to find the package `name` itself: the ESM
 * resolver's ERR_MODULE_NOT_FOUND, whose message quotes the bare specifier it
 * could not resolve (`Cannot find package '<name>' imported from <file>`). A
 * package the SDK depends on being absent raises the same code for a
 * different specifier, or CommonJS's MODULE_NOT_FOUND, and is not this.
 * https://nodejs.org/api/errors.html#err_module_not_found
 */
function isPackageNotFound(error: unknown, name: string): boolean {
  return (
    error instanceof Error &&
    (error as { code?: unknown }).code === "ERR_MODULE_NOT_FOUND" &&
    error.message.includes(`'${name}'`)
  );
}

function isSdkNotFound(error: unknown): boolean {
  return isPackageNotFound(error, SDK_PACKAGE);
}

/**
 * Loads @aws-sdk/client-qconnect if it is installed. The package being absent
 * is not an error: it is an optional peer, and export runs without assistant
 * names. A package that is present but cannot be loaded is reported with the
 * loader's reason, as the Connect SDK is. `load` is the seam the tests use.
 */
export async function loadQConnectSdk(
  load: () => Promise<unknown> = () => import("@aws-sdk/client-qconnect"),
): Promise<QConnectSdk | undefined> {
  try {
    return (await load()) as QConnectSdk;
  } catch (error) {
    if (isPackageNotFound(error, QCONNECT_PACKAGE)) return undefined;
    throw new CliError(`${QCONNECT_PACKAGE} could not be loaded: ${messageOf(error)}`, 1, {
      cause: error,
    });
  }
}

/**
 * Loads @aws-sdk/client-connectcases if it is installed, as loadQConnectSdk
 * loads its peer: absent is not an error, present but broken is.
 */
export async function loadCasesSdk(
  load: () => Promise<unknown> = () => import("@aws-sdk/client-connectcases"),
): Promise<CasesSdk | undefined> {
  try {
    return (await load()) as CasesSdk;
  } catch (error) {
    if (isPackageNotFound(error, CASES_PACKAGE)) return undefined;
    throw new CliError(`${CASES_PACKAGE} could not be loaded: ${messageOf(error)}`, 1, {
      cause: error,
    });
  }
}

async function loadSdk(): Promise<ConnectSdk> {
  try {
    return (await import("@aws-sdk/client-connect")) as unknown as ConnectSdk;
  } catch (error) {
    if (isSdkNotFound(error)) throw new CliError(MISSING_SDK_MESSAGE, 1, { cause: error });
    throw new CliError(`${SDK_PACKAGE} could not be loaded: ${messageOf(error)}`, 1, {
      cause: error,
    });
  }
}

/** Loads the SDK and builds a client for the Region the ARN names. */
async function connectClient(
  target: InstanceTarget,
): Promise<{ sdk: ConnectSdk; connect: AwsCommandSender }> {
  const sdk = await loadSdk();
  return { sdk, connect: new sdk.ConnectClient({ region: target.region }) };
}

/** The default LiveClients: @flow-as-code/core's SDK adapters over a real ConnectClient. */
export const SDK_CLIENTS: LiveClients = {
  async inventory(target) {
    const { connect } = await connectClient(target);
    // FlowDoc 0.3's assistant references (tasks/D05) and Cases template
    // and field references (tasks/D06), each when its optional peer is there.
    const qconnect = await loadQConnectSdk();
    const cases = await loadCasesSdk();
    return createConnectInventoryClient({
      connect,
      instanceId: target.instanceId,
      ...(qconnect === undefined
        ? {}
        : { qconnect: new qconnect.QConnectClient({ region: target.region }) }),
      ...(cases === undefined
        ? {}
        : { cases: new cases.ConnectCasesClient({ region: target.region }) }),
    });
  },
  async test(target) {
    const { sdk, connect } = await connectClient(target);
    // @flow-as-code/core checks the whole TestCase command set on first use. Checking
    // one here turns an SDK too old for `simulate` into a message before any
    // scenario is reported as errored.
    if (typeof sdk.CreateTestCaseCommand !== "function") throw new CliError(STALE_SDK_MESSAGE);
    return createConnectTestClient({ connect, instanceId: target.instanceId });
  },
};
