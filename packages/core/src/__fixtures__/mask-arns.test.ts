/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// maskArns exists so that a failure in the live sandbox job does not print the
// account id into a public build log. The live tests that use it skip without
// AWS credentials, so this is where the masking itself is proven.

import { describe, expect, it } from "vitest";

import { maskArns } from "./mask-arns.js";

// Not a real account: twelve digits chosen so the assertions below are about
// the shape, not about anything that exists.
const ACCOUNT = "000000000000";

describe("maskArns", () => {
  it("replaces the account segment and keeps everything else", () => {
    expect(maskArns(`arn:aws:connect:us-west-2:${ACCOUNT}:instance/abc-123`)).toBe(
      "arn:aws:connect:us-west-2:<account>:instance/abc-123",
    );
  });

  it("leaves no account digits anywhere in a multi-ARN message", () => {
    const message = [
      "unknown ARNs:",
      `  arn:aws:lambda:us-west-2:${ACCOUNT}:function:appointment-lookup`,
      `  arn:aws:connect:us-west-2:${ACCOUNT}:instance/abc/queue/def`,
      `  arn:aws-us-gov:connect:us-gov-west-1:${ACCOUNT}:instance/xyz`,
    ].join("\n");
    const masked = maskArns(message);
    expect(masked).not.toContain(ACCOUNT);
    expect(masked.split("<account>")).toHaveLength(4);
    // The diagnosable parts survive.
    expect(masked).toContain("arn:aws:lambda:us-west-2:<account>:function:appointment-lookup");
    expect(masked).toContain("arn:aws-us-gov:connect:us-gov-west-1:<account>:instance/xyz");
  });

  it("handles an empty account segment and an AWS-managed literal one", () => {
    // S3 leaves both region and account empty, so the placeholder lands where
    // the account would be and the resource part is untouched.
    expect(maskArns("arn:aws:s3:::flow-as-code-bucket/key")).toBe(
      "arn:aws:s3::<account>:flow-as-code-bucket/key",
    );
    expect(maskArns("arn:aws:connect:us-west-2:aws:view/sample/1")).toBe(
      "arn:aws:connect:us-west-2:<account>:view/sample/1",
    );
  });

  it("leaves text that is not an ARN alone", () => {
    const plain = `Stack flow-as-code-a07-integration does not exist (${ACCOUNT} is not an ARN here)`;
    expect(maskArns(plain)).toBe(plain);
  });
});
