/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Rule registry. Ids are stable and never renamed: the conformance fixtures,
// the CLI, the studio, and the future Go provider all key off them.

import { actionAllowedInFlowType } from "./action-allowed-in-flow-type.js";
import { actionCount } from "./action-count.js";
import { errorBranches } from "./error-branches.js";
import { moduleDepth5 } from "./module-depth-5.js";
import { noLiteralArn } from "./no-literal-arn.js";
import { noUnresolvedToken } from "./no-unresolved-token.js";
import { promptLength3000 } from "./prompt-length-3000.js";
import { reachableBlocks } from "./reachable-blocks.js";
import { recordingConsentBeforeRecord } from "./recording-consent-before-record.js";
import { terminalBlocks } from "./terminal-blocks.js";
import { uniqueNames } from "./unique-names.js";
import type { Rule } from "../types.js";

export const allRules: readonly Rule[] = [
  noLiteralArn,
  noUnresolvedToken,
  reachableBlocks,
  errorBranches,
  terminalBlocks,
  moduleDepth5,
  promptLength3000,
  recordingConsentBeforeRecord,
  uniqueNames,
  actionAllowedInFlowType,
  actionCount,
];

export function ruleById(id: string): Rule | undefined {
  return allRules.find((r) => r.id === id);
}

export { NO_LITERAL_ARN, literalArnMessage, literalArnPaths } from "./no-literal-arn.js";

export {
  actionAllowedInFlowType,
  actionCount,
  errorBranches,
  moduleDepth5,
  noLiteralArn,
  noUnresolvedToken,
  promptLength3000,
  reachableBlocks,
  recordingConsentBeforeRecord,
  terminalBlocks,
  uniqueNames,
};
