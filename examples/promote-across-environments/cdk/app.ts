/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// One FlowDoc set, two stacks, two binders, no resource map and no ARN.
//
// This is the file `flow-cli emit flows/ --target cdk` scaffolds, edited the way
// its own banner sanctions ("then yours to keep"). The scaffold declares one
// `const binder: TokenBinder` at module level because the common case is one
// environment; promoting means moving that constant inside the stack, so each
// stack binds the references to resources of its own.
//
// The two stacks differ in the way real environments differ, not cosmetically:
//
// - dev owns its supporting resources. The binder returns construct attributes
//   (`queue.attrQueueArn`), which synthesize to `Fn::GetAtt` at that stack's own
//   resources.
// - prod does not. A platform team manages the queue, the hours of operation,
//   and the Lambda in another stack and exports their ARNs, so the binder
//   returns `Fn.importValue(...)`, which synthesizes to `Fn::ImportValue`.
//
// The FlowDoc is the same file in both. `materializeWithBinder` inserts whatever
// the binder returns byte for byte, so the flow content around the three
// reference positions is identical in the two templates and only the bound
// values differ. tests/promoteAcrossEnvironments.test.ts asserts exactly that.
//
// Run it: `npx tsx examples/promote-across-environments/cdk/app.ts`, which
// synthesizes both stacks into `cdk.out/`. With the AWS CDK CLI installed this
// is an ordinary CDK app entry point and `cdk deploy` names the stacks.

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { FlowSet, type TokenBinder } from "@flow-as-code/cdk";
import { App, Fn, Stack, type AppProps, type StackProps } from "aws-cdk-lib";
import { CfnHoursOfOperation, CfnQueue } from "aws-cdk-lib/aws-connect";
import { Code, Function as LambdaFunction, Runtime } from "aws-cdk-lib/aws-lambda";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import type { Construct } from "constructs";

/**
 * The one document set, resolved against this file rather than the working
 * directory, so a synth works from the repository root or from here.
 */
const FLOW_DOCS = fileURLToPath(new URL("../flows", import.meta.url));

/** Names the flows in this set reference, per reference type. */
interface BoundResources {
  queue: Record<string, string>;
  hours: Record<string, string>;
  lambda: Record<string, string>;
}

function bindOne(type: string, name: string, table: Record<string, string>): string {
  const value = table[name];
  if (value === undefined) {
    throw new Error(
      `This stack binds no ${type} named "${name}". Add it to the stack's BoundResources.`,
    );
  }
  return value;
}

/**
 * A TokenBinder over a table of already-resolved CloudFormation-token strings.
 * `lex` and `prompt` are required by the interface and unused by this document
 * set, so they throw rather than carry a TODO; `flow` is optional and omitted.
 */
function binderOver(resources: BoundResources): TokenBinder {
  return {
    queue: (name) => bindOne("queue", name, resources.queue),
    hours: (name) => bindOne("hours", name, resources.hours),
    lambda: (name) => bindOne("lambda", name, resources.lambda),
    lex: (name) => {
      throw new Error(`Unexpected lex reference "${name}".`);
    },
    prompt: (name) => {
      throw new Error(`Unexpected prompt reference "${name}".`);
    },
  };
}

/**
 * The instance ARN is per environment and is not committed: it is read at
 * deploy time from an SSM parameter in the target account. `valueForStringParameter`
 * resolves during deployment, so nothing here needs account context at synth.
 * https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ssm.StringParameter.html
 */
const instanceArnParameter = (scope: Construct, stage: string): string =>
  StringParameter.valueForStringParameter(scope, `/flow-as-code/${stage}/connect-instance-arn`);

/** Dev: this stack creates the queue, the hours, and the Lambda it routes to. */
export class DevFlowStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const instanceArn = instanceArnParameter(this, "dev");

    const hours = new CfnHoursOfOperation(this, "MainLineHours", {
      instanceArn,
      name: "main-line",
      timeZone: "America/New_York",
      config: [
        {
          day: "MONDAY",
          startTime: { hours: 8, minutes: 0 },
          endTime: { hours: 17, minutes: 0 },
        },
      ],
    });

    const queue = new CfnQueue(this, "AppointmentsQueue", {
      instanceArn,
      name: "appointments",
      hoursOfOperationArn: hours.attrHoursOfOperationArn,
    });

    const lookup = new LambdaFunction(this, "AppointmentLookup", {
      runtime: Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: Code.fromInline("exports.handler = async () => ({ appointment: null });"),
    });

    new FlowSet(this, "Flows", {
      instanceArn,
      source: FLOW_DOCS,
      binder: binderOver({
        queue: { appointments: queue.attrQueueArn },
        hours: { "main-line": hours.attrHoursOfOperationArn },
        lambda: { "appointment-lookup": lookup.functionArn },
      }),
    });
  }
}

/**
 * Prod: the same three resources exist, managed by another stack, which exports
 * their ARNs. The binder returns the imports. Still no ARN in this repository.
 */
export class ProdFlowStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    new FlowSet(this, "Flows", {
      instanceArn: instanceArnParameter(this, "prod"),
      source: FLOW_DOCS,
      binder: binderOver({
        queue: { appointments: Fn.importValue("connect-platform-appointments-queue-arn") },
        hours: { "main-line": Fn.importValue("connect-platform-main-line-hours-arn") },
        lambda: { "appointment-lookup": Fn.importValue("connect-platform-appointment-lookup-arn") },
      }),
    });
  }
}

/**
 * The app, as a function so a test can synthesize it into a directory of its
 * own. With no `outdir` the CDK writes to a temporary directory, which is what
 * the test wants and not what a reader running this file wants.
 */
export function buildApp(props: AppProps = {}): App {
  const app = new App(props);
  new DevFlowStack(app, "AppointmentLine-dev", { env: { region: "us-east-1" } });
  new ProdFlowStack(app, "AppointmentLine-prod", { env: { region: "us-west-2" } });
  return app;
}

// Only when this file is the entry point, so importing it stays side-effect
// free. argv[1] arrives as typed, which is a relative path when the command
// line gave one, so it is resolved before the comparison.
if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  buildApp({ outdir: process.env.CDK_OUTDIR ?? "cdk.out" }).synth();
}
