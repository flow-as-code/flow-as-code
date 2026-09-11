/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The one naming rule between a Flow language key and its HCL attribute name.
//
// A reader should be able to predict the attribute from the AWS page and the
// key from the attribute, so the rule is mechanical and has no exception
// table: `PromptId` is `prompt_id`, `LambdaFunctionARN` is
// `lambda_function_arn`, `LexV2Bot` is `lex_v2_bot`. The catalog
// (conformance/flow-language/catalog.json) writes every attribute name out so a
// second implementation reads names rather than reimplementing this, and
// catalog.test.ts asserts each one equals snakeCaseKey(key).

/**
 * `snake_case` of a Flow language key. An underscore goes between a lowercase
 * letter or digit and an uppercase letter, and between an uppercase letter and
 * an uppercase-then-lowercase pair (the end of an acronym); the result is
 * lowercased.
 */
export function snakeCaseKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();
}
