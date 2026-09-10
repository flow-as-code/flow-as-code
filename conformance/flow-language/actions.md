# Amazon Connect Flow language: modeled action reference

The contract every other package pivots on. Recorded 2026-08-31 from the Amazon
Connect Developer Guide. Re-verify before changing any builder block, and cite
the URL for anything new.

Root reference: https://docs.aws.amazon.com/connect/latest/devguide/flow-language.html

## Document envelope

https://docs.aws.amazon.com/connect/latest/devguide/flow-language-example.html

| Field | Notes |
|---|---|
| `Version` | `"2019-10-30"`. The only supported version. |
| `StartAction` | Identifier of the first Action. Must match an Action in `Actions`. |
| `Metadata` | Optional. Holds `EntryPointPosition {x,y}` and `ActionMetadata.<id>.Position {x,y}`. |
| `Actions` | List of Action objects. **No more than 250 Actions per flow.** |

## Action envelope

https://docs.aws.amazon.com/connect/latest/devguide/flow-language-actions.html

| Field | Notes |
|---|---|
| `Identifier` | Unique within the flow. Up to 50 characters. Any characters including unicode and spaces, **except** `% : ( \ / ) = $ , ; [ ] { }`. Also forbidden: `__proto__`, `constructor`, `__defineGetter__`, `__defineSetter__`, `toString`, `hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable`, `toLocaleString`, `valueOf`. |
| `Type` | One of the allowable types. See the table below. |
| `Parameters` | Shape differs per Type. |
| `Transitions` | `NextAction`, `Errors: [{ErrorType, NextAction}]`, `Conditions: [{NextAction, Condition}]`. Terminal actions use `{}`. |

`Condition` is `{ Operator, Operands }`. Operators: `Equals`, `TextStartsWith`,
`TextEndsWith`, `TextContains`, `NumberGreaterThan`, `NumberGreaterOrEqualTo`,
`NumberLessThan`, `NumberLessOrEqualTo`. Conditions nest no more than five deep
and a single Condition holds no more than 50 sub-Conditions.

## Action categories

https://docs.aws.amazon.com/connect/latest/devguide/flow-language-concepts.html

Contact actions need a contact. Participant actions need a participant. Flow
control actions have no side effects. Interactions have side effects but need
neither a contact nor a participant.

## Modeled set

Identifier naming below is the flow-language `Type`, not the console block name.
The two differ, and the console name is what task A01 originally listed.

| Console block (A01 name) | Actual `Type` | Category | Doc |
|---|---|---|---|
| PlayPrompt | `MessageParticipant` | participant | [doc](https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-messageparticipant.html) |
| GetParticipantInput | `GetParticipantInput` | participant | [doc](https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-getparticipantinput.html) |
| Disconnect | `DisconnectParticipant` | participant | [doc](https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-disconnectparticipant.html) |
| CheckHoursOfOperation | `CheckHoursOfOperation` | flow control | [doc](https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-checkhoursofoperation.html) |
| (branch) | `Compare` | flow control | [doc](https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-compare.html) |
| TransferToFlow | `TransferToFlow` | flow control | [doc](https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-transfertoflow.html) |
| (end) | `EndFlowExecution` | flow control | [doc](https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-endflowexecution.html) |
| TransferToQueue | `UpdateContactTargetQueue` **and** `TransferContactToQueue` | contact | [set](https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontacttargetqueue.html), [transfer](https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-transfercontacttoqueue.html) |
| Set (attributes) | `UpdateContactAttributes` | contact | [doc](https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactattributes.html) |
| StartRecording | `UpdateContactRecordingBehavior` | contact | [doc](https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactrecordingbehavior.html) |
| InvokeModule | `InvokeFlowModule` | contact | [doc](https://docs.aws.amazon.com/connect/latest/devguide/flow-language-actions-invoke-flow-module.html) |
| (module return) | `EndFlowModuleExecution` | contact | [doc](https://docs.aws.amazon.com/connect/latest/devguide/endflowmoduleexecution.html) |
| InvokeLambda | `InvokeLambdaFunction` | interaction | [doc](https://docs.aws.amazon.com/connect/latest/devguide/interactions-invokelambdafunction.html) |

## Reference-bearing parameters

These are the only fields in the modeled set that hold a `${cdref:type:name}`
token. Every one is documented as "must be either fully static or a single valid
JSONPath identifier", which is why a token occupies the **whole** field value and
is never interpolated into a longer string.

| `Type` | Field | Ref type |
|---|---|---|
| `UpdateContactTargetQueue` | `QueueId` | `queue` |
| `CheckHoursOfOperation` | `HoursOfOperationId` | `hours` |
| `InvokeLambdaFunction` | `LambdaFunctionARN` | `lambda` |
| `InvokeFlowModule` | `FlowModuleId` | `module` (carries an alias) |
| `TransferToFlow` | `ContactFlowId` | `flow` |
| `MessageParticipant` | `PromptId` | `prompt` |
| `GetParticipantInput` | `PromptId` | `prompt` |

`GetParticipantInput` has no Lex bot fields. The console's "Get customer
input" block serializes its Amazon Lex configuration as a separate
`ConnectParticipantWithLexBot` action (with `LexV2Bot` or `LexBot`), which is
unmodeled, so no `lex` reference appears in the modeled set.
https://docs.aws.amazon.com/connect/latest/adminguide/get-customer-input.html

## Constraints worth encoding

Each of these is a lint rule, a type constraint, or both. Sources are the
individual action pages linked above.

1. `TransferContactToQueue` takes **no parameters**. The queue comes from a
   preceding `UpdateContactTargetQueue`. A single "transfer to queue" in the
   builder is therefore two Actions. Its errors are `QueueAtCapacity` and
   `NoMatchingError`.
2. `CheckHoursOfOperation` requires **exactly two** conditions, `Equals True`
   and `Equals False`, and no others.
3. `UpdateContactTargetQueue` accepts `QueueId` or `AgentId`, never both.
4. `InvokeLambdaFunction.InvocationTimeLimitSeconds` must be a static integer,
   greater than 0 and no larger than 8. `InvocationType` is `SYNCHRONOUS` or
   `ASYNCHRONOUS`.
5. `MessageParticipant` accepts exactly one of `PromptId`, `Text`, or `SSML`.
   `PromptId` and `SSML` are voice only; other channels support only `Text`.
6. `Compare` fails with `NoMatchingCondition`, not `NoMatchingError`. It is the
   only action in the modeled set that does.
7. `DisconnectParticipant`, `EndFlowExecution`, and `EndFlowModuleExecution`
   have **no** errors and are terminal (`Transitions: {}`).
8. `EndFlowExecution` is available only in whisper and customer queue flows.
   `EndFlowModuleExecution` only in modules. `InvokeFlowModule` in inbound
   flows and, since modules can invoke modules ("up to five levels of
   nesting", https://docs.aws.amazon.com/connect/latest/adminguide/contact-flow-modules.html),
   in modules as well; the action page's own Restrictions section predates
   nesting and says inbound only.
9. `UpdateContactAttributes.TargetContact` is `Current` or `Related`, static.
10. `GetParticipantInput` accepts at most one of `PromptId`, `Text`, or `SSML`;
    all three are optional. `Text` carries the same limit as `MessageParticipant`:
    "When you use text, either for text-to-speech or chat, you can use a maximum
    of 3,000 billed characters (6,000 total characters)."
    https://docs.aws.amazon.com/connect/latest/adminguide/get-customer-input.html
11. `GetParticipantInput.InputTimeLimitSeconds` "Must be defined statically, and
    must be a valid integer larger than zero"; the console bounds it to 1 to 180
    seconds. `StoreInput` is `"True"` or `"False"`, static. The Flow language
    example on the admin page writes both as JSON strings
    (`"InputTimeLimitSeconds": "5"`, `"StoreInput": "False"`), and the builder
    emits that spelling.
12. `GetParticipantInput` conditions are supported only when `StoreInput` is
    `"False"` or absent, may use only the `Equals` operator, and each operand
    "must be static and be a single character": `0` to `9`, `*`, or `#`. When
    `StoreInput` is `"True"` there is no run result and conditions are not
    supported.
13. `GetParticipantInput` errors: `NoMatchingCondition` "Must be defined only if
    StoreInput is False"; `NoMatchingError` "Must always be defined";
    `InvalidPhoneNumber` "Must be defined only if StoreInput is true, and
    PhoneNumberValidation is specified"; `InputTimeLimitExceeded` "if there is
    no response before the configured InputTimeLimitSeconds". The admin page's
    example lists them as `InputTimeLimitExceeded`, `NoMatchingCondition`,
    `NoMatchingError`, and the builder emits that order. `NextAction` is
    required; the builder mirrors it to the `NoMatchingCondition` target, the
    way `CheckHoursOfOperation` mirrors its out-of-hours path.
14. `GetParticipantInput.InputValidation` is "required if and only if StoreInput
    is True" and holds `PhoneNumberValidation` or `CustomValidation`, never
    both. `InputEncryption` "May only be specified if CustomValidation is
    provided". `DTMFConfiguration.InputTerminationSequence` is up to five
    digits and `InterdigitTimeLimitSeconds` "must be a valid integer between 1
    and 20 seconds". The builder models the DTMF menu form (`StoreInput`
    `"False"`, no `InputValidation`, `InputEncryption`, `DTMFConfiguration`, or
    `Media`); every other shape round-trips as a GenericBlock.
15. `GetParticipantInput` "is only supported on the voice channel" and "can be
    used in contact flows, transfer flows, and customer queue flows but not in
    whisper flows or hold flows". The admin page's flow-type table also marks
    the outbound whisper flow as supported; the action page is the one cited
    by the `action-allowed-in-flow-type` table, as for every other entry.

### Flow-type restrictions are a rule category, not a rule

Almost every action lists a `Restrictions` section naming the flow types it is
valid in (inbound, transfer, whisper, hold, customer queue, module). When this
reference was recorded on 2026-08-31 the rule set in packages/core/SPEC.md was
nine and none covered this. `action-allowed-in-flow-type` landed the same day
as the tenth, driven by `FLOW_TYPE_RESTRICTIONS` in
`packages/core/src/actions.ts`, which is transcribed from this reference.
SPEC.md lists the current set.

## Per-action parameter shapes

Recorded verbatim from the pages linked above.

```
MessageParticipant       { PromptId? | Text? | SSML?, Media?: { Uri, SourceType: "S3", MediaType: "Audio" } }
GetParticipantInput      { PromptId? | Text? | SSML?, Media?: { Uri, SourceType: "S3", MediaType: "Audio" },
                           InputTimeLimitSeconds,     // static integer > 0; the console writes "5"
                           StoreInput?: "True" | "False",
                           InputValidation?: { PhoneNumberValidation?: { NumberFormat: "Local" | "E164", CountryCode? }
                                             | CustomValidation?: { MaximumLength } },
                           InputEncryption?: { EncryptionKeyId, Key },
                           DTMFConfiguration?: { InputTerminationSequence?, DisableCancelKey?: "True" | "False",
                                                 InterdigitTimeLimitSeconds? } }
DisconnectParticipant    {}
CheckHoursOfOperation    { HoursOfOperationId? }
Compare                  { ComparisonValue }          // single JSONPath identifier
TransferToFlow           { ContactFlowId }
EndFlowExecution         {}
EndFlowModuleExecution   {}
TransferContactToQueue   {}
UpdateContactTargetQueue { QueueId? | AgentId? }
UpdateContactAttributes  { Attributes: { [k]: v }, TargetContact: "Current" | "Related" }
InvokeFlowModule         { FlowModuleId }
InvokeLambdaFunction     { LambdaFunctionARN, InvocationTimeLimitSeconds, InvocationType,
                           LambdaInvocationAttributes?: { [k]: v },
                           ResponseValidation?: { ResponseType: "STRING_MAP" | "JSON" } }
UpdateContactRecordingBehavior {
  RecordingBehavior: { RecordedParticipants: ("Agent"|"Customer")[],
                       ScreenRecordedParticipants?: ("Agent")[],
                       IVRRecordingBehavior?: "Enabled" | "Disabled" },
  AnalyticsBehavior?: { ... }   // large; see the doc page before modeling it
}
```

`GetParticipantInput` was recorded 2026-09-01 from
https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-getparticipantinput.html
and the admin page linked above. The full `AnalyticsBehavior` object is
deliberately not transcribed here. Model it when A01 reaches it and transcribe
then.

## Unmodeled actions

49 action types are documented across the four category pages and the builder
models 14 of them. Everything not in the modeled set above parses to a
GenericBlock and round-trips verbatim. That is
what makes a small modeled set survivable. The demo fixture deliberately
includes one (`UpdateFlowLoggingBehavior`) so passthrough is exercised by
default.
