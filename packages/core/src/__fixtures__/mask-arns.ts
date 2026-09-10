/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Test-only. The live integration tests build failure messages out of values
// that came back from AWS: the export error lists every unknown ARN at once,
// and the @flow-as-code/cdk deploy test echoes the AWS CLI's own stdout and stderr.
// Those ARNs carry the account id, and GitHub masks only what came from the
// `secrets` context, so on a failure in the sandbox integration job the account
// id lands in a public build log. Mask the account segment before the message
// is built.
//
// Only the account segment goes. The rest of an ARN is what makes a failure
// diagnosable (which service, which region, which resource), and none of it
// identifies the account. ARN grammar:
// https://docs.aws.amazon.com/IAM/latest/UserGuide/reference-arns.html

/**
 * `arn:<partition>:<service>:<region>:` followed by the account segment and the
 * colon that closes it. The account segment is everything up to that colon,
 * which is how an empty one (`arn:aws:s3:::bucket`) and an AWS-managed literal
 * (`arn:aws:connect:us-west-2:aws:view/...`) both match.
 */
const ARN_ACCOUNT = /(arn:[^:\s]*:[^:\s]*:[^:\s]*:)([^:\s]*)(:)/g;

/** The account segment of every ARN in `text`, replaced by `<account>`. */
export function maskArns(text: string): string {
  return text.replace(ARN_ACCOUNT, (_match, prefix: string, _account: string, colon: string) => {
    return `${prefix}<account>${colon}`;
  });
}
