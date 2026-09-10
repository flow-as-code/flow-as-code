/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Live-deploy half of the A07 acceptance: a CDK app deploying the demo flow
// (plus a module with version and alias) to a sandbox Connect instance, with
// zero resource-map input - every reference is a CloudFormation token from a
// construct in the same stack.
//
// This test WRITES to the account: it deploys a CloudFormation stack (a Lambda,
// an IAM role, a queue, hours of operation, an integration association, and
// flows on the instance) via the AWS CLI, asserts success, and always tears the
// stack down. So it takes an explicit write opt-in on top of the instance ARN,
// the way the simulate half of the @flow-as-code/core integration test does:
//
//   FLOW_TEST_INSTANCE_ARN=arn:aws:connect:...:instance/... \
//     FLOW_TEST_DEPLOY=1 npm test --workspace @flow-as-code/cdk
//
// Without FLOW_TEST_DEPLOY the suite skips. Naming a sandbox instance is not
// consent to deploy into it: `npm run test:integration` runs every
// integration.test.ts in the workspace, so an operator pointing that at an
// instance to exercise the read-only export half was deploying this stack as a
// side effect. Run it against an empty sandbox only. Normal test runs make no
// AWS calls at all.

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { App, CliCredentialsStackSynthesizer, Stack } from "aws-cdk-lib";
import { CfnHoursOfOperation, CfnIntegrationAssociation, CfnQueue } from "aws-cdk-lib/aws-connect";
import { CfnFunction } from "aws-cdk-lib/aws-lambda";
import { CfnRole } from "aws-cdk-lib/aws-iam";
import { describe, expect, it } from "vitest";

import { FlowSet } from "./index.js";
import { maskArns } from "../../core/src/__fixtures__/mask-arns.js";
import { callbackModule, demoDoc, routerFlow } from "./test-helpers.js";

const instanceArn = process.env.FLOW_TEST_INSTANCE_ARN;
const deployEnabled = process.env.FLOW_TEST_DEPLOY;
const STACK_NAME = "flow-as-code-a07-integration";

function regionOf(arn: string): string {
  const region = arn.split(":")[3];
  if (region === undefined || region.length === 0) {
    throw new Error(`Cannot parse a region out of "${arn}".`);
  }
  return region;
}

function aws(args: string[], region: string): void {
  const result = spawnSync("aws", [...args, "--region", region], {
    encoding: "utf8",
    timeout: 840_000,
  });
  // The CLI's own output, which quotes the resource ARNs it was working on and
  // so carries the account id. This message is what a failure prints into the
  // sandbox integration job's log, and GitHub masks only values that came from
  // the `secrets` context, so mask the account segment here.
  const detail = maskArns(`${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  expect(result.status, `aws ${args.slice(0, 3).join(" ")} failed:\n${detail}`).toBe(0);
}

describe.skipIf(!instanceArn || !deployEnabled)("A07 live deploy (FLOW_TEST_DEPLOY)", () => {
  it("deploys the demo flow and a versioned, aliased module, then tears down", () => {
    const arn = instanceArn as string;
    const region = regionOf(arn);

    const app = new App();
    // The stack is asset-free (the Lambda is inline zipFile code) and deploys
    // with `aws cloudformation deploy` using the caller's own credentials, so
    // it must not reference the CDK bootstrap version SSM parameter that
    // DefaultStackSynthesizer injects. Without this a fresh, never-bootstrapped
    // account fails CreateChangeSet with "Unable to fetch parameters
    // [/cdk-bootstrap/.../version]". A throwaway Connect instance lives in
    // exactly such an account, and the demo deploy should need no bootstrap.
    const stack = new Stack(app, STACK_NAME, {
      synthesizer: new CliCredentialsStackSynthesizer(),
    });

    // Real resources the binder maps references onto. Zero resource-map
    // input: every value below is a CloudFormation token.
    const hours = new CfnHoursOfOperation(stack, "MainLineHours", {
      instanceArn: arn,
      name: "flow-as-code-a07-main-line",
      timeZone: "UTC",
      config: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"].map(
        (day) => ({
          day,
          startTime: { hours: 0, minutes: 0 },
          endTime: { hours: 23, minutes: 59 },
        }),
      ),
    });
    const queue = new CfnQueue(stack, "AppointmentsQueue", {
      instanceArn: arn,
      name: "flow-as-code-a07-appointments",
      hoursOfOperationArn: hours.attrHoursOfOperationArn,
    });
    const role = new CfnRole(stack, "LookupRole", {
      assumeRolePolicyDocument: {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Service: "lambda.amazonaws.com" },
            Action: "sts:AssumeRole",
          },
        ],
      },
    });
    const fn = new CfnFunction(stack, "LookupFn", {
      runtime: "nodejs20.x",
      handler: "index.handler",
      role: role.attrArn,
      code: {
        zipFile: "exports.handler = async () => ({ appointmentFound: 'false' });",
      },
    });
    // Connect can only invoke Lambda functions associated with the instance.
    // https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-connect-integrationassociation.html
    const association = new CfnIntegrationAssociation(stack, "LookupAssociation", {
      instanceId: arn,
      integrationType: "LAMBDA_FUNCTION",
      integrationArn: fn.attrArn,
    });

    const flowSet = new FlowSet(stack, "Flows", {
      instanceArn: arn,
      source: [demoDoc(), routerFlow(), callbackModule()],
      binder: {
        queue: () => queue.attrQueueArn,
        hours: () => hours.attrHoursOfOperationArn,
        lambda: () => fn.attrArn,
        lex: (name) => {
          throw new Error(`No Lex bot named ${name} in the integration stack.`);
        },
        prompt: (name) => {
          throw new Error(`No prompt named ${name} in the integration stack.`);
        },
      },
    });
    for (const flow of flowSet.flows.values()) flow.addResourceDependency(association);

    const template = app.synth().getStackByName(STACK_NAME).template as Record<string, unknown>;
    const outDir = new URL("../.vitest/", import.meta.url).pathname;
    mkdirSync(outDir, { recursive: true });
    const templateFile = join(outDir, "a07-integration.template.json");
    writeFileSync(templateFile, JSON.stringify(template, null, 2));

    try {
      aws(
        [
          "cloudformation",
          "deploy",
          "--stack-name",
          STACK_NAME,
          "--template-file",
          templateFile,
          "--capabilities",
          "CAPABILITY_IAM",
        ],
        region,
      );
    } finally {
      spawnSync(
        "aws",
        ["cloudformation", "delete-stack", "--stack-name", STACK_NAME, "--region", region],
        {
          encoding: "utf8",
          timeout: 120_000,
        },
      );
      spawnSync(
        "aws",
        [
          "cloudformation",
          "wait",
          "stack-delete-complete",
          "--stack-name",
          STACK_NAME,
          "--region",
          region,
        ],
        { encoding: "utf8", timeout: 840_000 },
      );
    }
  }, 1_800_000);
});
