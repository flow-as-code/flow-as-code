/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from "vitest";
import { snakeCaseKey } from "./hcl-names.js";

describe("snakeCaseKey", () => {
  it.each([
    ["PromptId", "prompt_id"],
    ["QueueId", "queue_id"],
    ["SSML", "ssml"],
    ["Text", "text"],
    ["LambdaFunctionARN", "lambda_function_arn"],
    ["IVRRecordingBehavior", "ivr_recording_behavior"],
    ["LexV2Bot", "lex_v2_bot"],
    ["DTMFConfiguration", "dtmf_configuration"],
    ["UnTagContact", "un_tag_contact"],
    ["InvocationTimeLimitSeconds", "invocation_time_limit_seconds"],
    ["TextToSpeechVoice", "text_to_speech_voice"],
    ["MessageParticipant", "message_participant"],
    ["CheckHoursOfOperation", "check_hours_of_operation"],
    [
      "UpdateContactRecordingAndAnalyticsBehavior",
      "update_contact_recording_and_analytics_behavior",
    ],
  ])("%s -> %s", (key, attr) => {
    expect(snakeCaseKey(key)).toBe(attr);
  });

  it("is idempotent on its own output", () => {
    for (const key of ["LambdaFunctionARN", "LexV2Bot", "IVRRecordingBehavior"]) {
      expect(snakeCaseKey(snakeCaseKey(key))).toBe(snakeCaseKey(key));
    }
  });
});
