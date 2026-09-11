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
| TransferToQueue (in a customer queue flow) | `DequeueContactAndTransferToQueue` | contact | [doc](https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-dequeuecontactandtransfertoqueue.html) |
| Transfer to agent (beta) | `TransferContactToAgent` | contact | [doc](https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-transfercontacttoagent.html) |
| Change routing priority / age | `UpdateContactRoutingBehavior` | contact | [doc](https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactroutingbehavior.html) |
| TransferToQueue (Transfer to Callback tab) | `CreateCallbackContact` | interaction | [doc](https://docs.aws.amazon.com/connect/latest/devguide/interactions-createcallbackcontact.html) |
| Set callback number | `UpdateContactCallbackNumber` | contact | [doc](https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactcallbacknumber.html) |
| Loop | `Loop` | flow control | [doc](https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-loop.html) |
| Wait | `Wait` | flow control | [doc](https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-wait.html) |
| Distribute by percentage | `DistributeByPercentage` | flow control | [doc](https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-distributebypercentage.html) |
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
| `UpdateContactTargetQueue` | `QueueId`, `AgentId` | `queue` |
| `DequeueContactAndTransferToQueue` | `QueueId`, `AgentId` | `queue` |
| `CreateCallbackContact` | `QueueId`, `AgentId` | `queue` |
| `CreateCallbackContact` | `ContactFlowId` | `flow` |
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
6. `Compare` and `DistributeByPercentage` fail with `NoMatchingCondition`,
   not `NoMatchingError` (`CONDITION_CATCH_ALL` in actions.ts).
   `UpdateContactRoutingBehavior`, `UpdateContactCallbackNumber` and `Loop`
   list no catch-all at all (rules 18, 20 and 21).
7. `DisconnectParticipant`, `EndFlowExecution`, `EndFlowModuleExecution` and
   `TransferContactToAgent` have **no** errors and are terminal
   (`Transitions: {}`).
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
16. `DequeueContactAndTransferToQueue` (recorded 2026-09-11) is the console's
    Transfer to queue block "but only when used in a Customer queue flow": it
    dequeues the contact and places it in the named queue, or in the contact's
    current target queue when neither `QueueId` nor `AgentId` is given. Both
    are `[Optional]`, "If AgentId is specified, [QueueId] may not be
    specified" and the reverse, so at most one. `AgentId` is "an agent ID or
    agent ARN, representing an agent queue", the `queue` reference type as on
    `UpdateContactTargetQueue`. Errors are `QueueAtCapacity` "if the
    destination queue is at capacity and the contact cannot be queued within
    it" and `NoMatchingError`. "This action is only supported in the customer
    queue flow. It is not supported in any other type of flow." The page says
    nothing about `NextAction`; the admin guide's block has a Success branch
    ("three possible outcomes in this case: Success, At capacity, Error"), so
    the builder wires one. The admin guide adds two limits the page does not:
    "Queue-to-queue transfers can be done only 11 times because there is a
    maximum limit of 12 contacts in a contact chain" and "When you use this
    block in a Customer Queue flow, you must add a Loop prompts block before
    this one."
    https://docs.aws.amazon.com/connect/latest/adminguide/transfer-to-queue.html
17. `TransferContactToAgent` (recorded 2026-09-11) "Ends the current flow and
    transfers the customer to an agent. If the agent is already with someone
    else, the contact is disconnected." "No parameters are expected", results
    and errors "None", and "This action is supported in only transfer to agent
    and transfer to queue flows." "Transfer contact to agent works only for
    voice interactions." Neither page says how the agent is chosen; the admin
    guide marks the block beta, says it "does not have any branches", and
    recommends Set working queue (`UpdateContactTargetQueue` then
    `TransferContactToQueue`) for agent-to-agent transfers on every channel.
    https://docs.aws.amazon.com/connect/latest/adminguide/transfer-to-agent-block.html
18. `UpdateContactRoutingBehavior` (recorded 2026-09-11) "can move the contact
    forward or backward in queue, or specify a queue priority". `QueuePriority`
    "Cannot be specified if QueueTimeAdjustmentSeconds is specified. Must be
    statically defined, must be larger than zero, and a valid integer value";
    the admin guide gives the range "1 (highest) - 9223372036854775807
    (lowest)" and "Default priority: 5". `QueueTimeAdjustmentSeconds` "Cannot
    be specified if QueuePriority is specified. Must be statically defined and
    a valid integer value"; the admin guide says the block can "add or
    subtract" time, so negative values are accepted. Neither page says one of
    the two is required, so the catalog records `neverBoth`; the builder
    requires one, which is the builder's choice. Results and errors are both
    "None", so the block has a success path and no error branch, the first
    modeled action with none. "This is supported only in inbound contact
    flows. It is not supported in transfer flows, whisper flows, customer
    queue flows, or hold flows." The admin guide's flow-type list also names
    customer queue and transfer flows; the action page governs. Timing: "it
    takes at least 60 seconds for a change to take effect for contacts already
    in queue". The page has no JSON example; both values are recorded as JSON
    numbers from "an integer", to be confirmed against a console export.
    https://docs.aws.amazon.com/connect/latest/adminguide/change-routing-priority.html
19. `CreateCallbackContact` (recorded 2026-09-11) "Creates a new callback
    contact. If no customer number is specified, and this is run in context
    of a contact, the contact's CustomerCallbackNumber is used as the customer
    number. If you specify a ContactFlowId, then InitialCallDelaySeconds
    parameter is ignored." `QueueId` and `AgentId` are `[Optional]` and "If
    QueueId is specified, [AgentId] may not be specified"; with neither, "the
    contact's current TargetQueue". `InitialCallDelaySeconds` and
    `RetryDelaySeconds` "Must be larger than 0, no greater than 259,200 (three
    days), and an integer. Must be defined statically."
    `MaximumConnectionAttempts` "Must be larger than zero, and an integer." The
    three carry no `[Optional]` marker and are recorded as required.
    `ContactFlowId` is `[Optional]`, "Callback contact created will execute
    this flow post creation". `CallerId` is `[Optional]`, "Must be a valid
    phone number claimed in your [...] instance", static or a single JSONPath,
    and is not a reference type. Results "None. No conditions are supported";
    the error is `NoMatchingError`. "This action is supported in contact
    flows, transfer flows, and customer queue flows. It is not supported in
    whisper flows or hold flows." The console emits it from the Transfer to
    queue block's Transfer to Callback tab ("If the flow block is used to
    configure callbacks, it is represented as CreateCallbackContact action"),
    even though the action page links the Set callback number block. The page
    has no JSON example; the three integers are recorded as JSON numbers, to be
    confirmed against a console export.
    https://docs.aws.amazon.com/connect/latest/adminguide/transfer-to-queue.html
20. `UpdateContactCallbackNumber` (recorded 2026-09-11) "Updates the contact
    callback number, which is the number used by the CreateCallbackContact
    action. This value defaults to the customer participant caller ID if this
    action is never used." `CallbackNumber` "Must be a single, valid JSONPath
    reference, and cannot be set statically." Results "None". Errors are
    `InvalidCallbackNumber` "The callback number specified was not a valid
    (e.164) phone number" and `CallbackNumberNotDialable` "The callback number
    specified is not dialable by the instance", in that order, and no
    `NoMatchingError`; the builder wires both and the error-branches rule
    requires both. "This is supported only in contact flows, transfer flows,
    and customer queue flows. This is not supported in whispers or hold
    flows." The admin guide's channel table routes chat, task and email down
    the invalid-number branch, adds "the + country code prefix is
    automatically prepended", and says "The Store customer input block often
    comes before this block."
    https://docs.aws.amazon.com/connect/latest/adminguide/set-callback-number.html
21. `Loop` (recorded 2026-09-11) "returns a result of "NotDone" a number of
    times equal to the specified loop count, then "Done" once, then reset";
    the results section names them `ContinueLooping` and `DoneLooping` and
    that section governs: "there must be a Condition provided for Equals
    ContinueLooping and for Equals DoneLooping, and no other Conditions can be
    specified." `LoopCount` "must be between 0 and 100 (inclusive). Must
    either be fully static or fully dynamic", so the catalog marks it
    `dynamic` and the builder takes an integer or a single JSONPath. Errors
    "None"; the admin guide's block has an Error branch with no documented
    error type, so an exported Loop carrying one stays a GenericBlock. The
    page says nothing about `NextAction`; the builder writes it as a mirror
    of the `DoneLooping` path, the way `CheckHoursOfOperation` mirrors its
    out-of-hours path, to be confirmed against a console export. "This is
    supported in every type of flow." The admin guide adds: "If you enter 0
    for the loop count, the Complete branch is followed the first time this
    block runs", and describes an array-looping mode whose flow-language keys
    the action page does not document.
    https://docs.aws.amazon.com/connect/latest/adminguide/loop.html
22. `Wait` (recorded 2026-09-11) "Pauses the flow for a specified duration,
    or until a specified event happens, whichever happens first."
    `TimeoutSeconds` "can be either statically defined, or a single valid
    JSONPath identifier. If defined statically, this must be a positive
    integer value no greater than 604800 (seven days)"; `Events` is "An
    optional list of all events that can trigger an interrupt. The supported
    events currently are "CustomerReturned" and "BotParticipantDisconnected".
    This must be defined statically." Results: "If an event interrupts the
    wait, the run result is the event that interrupted. If no event
    interrupts the Wait and the time elapses, the run result is
    WaitCompleted." "Conditions are supported, but only the "Equals" operator
    is supported. "WaitCompleted" is always required operand, and every
    specified event is also required to be present as a condition operand."
    Errors: `NoMatchingError`, and `ParticipantNotFound` "The supported event
    currently is "BotParticipantDisconnected"", which the builder wires
    exactly when that event is waited for. "This is supported in every type
    of flow, but is supported only by the chat channel." The page does not
    say whether `TimeoutSeconds` is required; the builder requires it. It
    says nothing about `NextAction`; the builder mirrors it onto the
    catch-all, as the console's exported flows do for other actions, to be
    confirmed against an export. The admin guide's block has more (participant
    type, Lambda, case and external-tool events, a Continue branch) whose
    flow-language keys the action page does not document; those round-trip
    as a GenericBlock.
    https://docs.aws.amazon.com/connect/latest/adminguide/wait.html
23. `DistributeByPercentage` (recorded 2026-09-11) "Returns a random number
    between 1 and 100 (inclusive) as its result, allowing comparisons against
    it." No parameters. "Comparisons are supported, but they must be a chain
    of NumericLessThan comparisons, with each subsequent comparison checking
    the previous value, plus the percentage that is desired to go down this
    next action, and no Comparison comparing a value larger than 100."
    `NoMatchingCondition` "if no Condition matches. This is the default
    option in the flow editor." The console's Sample AB test flow, recorded
    under `conformance/export/omitted-parameters`, writes the operator as
    `NumberLessThan` (the schema's spelling), the operands as strings, each
    threshold as 1 plus the percentages so far (3%, 6%, 8% are `"4"`, `"10"`,
    `"18"`), omits `Parameters` entirely, and mirrors `NextAction` onto the
    `NoMatchingCondition` target; the builder writes the same shape from
    percentages and reads it back. "This action is available in inbound
    flows, transfer flows, and customer queue flows. It is not available to
    hold flows or to whisper flows." The admin guide's flow-type list adds
    the outbound whisper flow; the action page governs.
    https://docs.aws.amazon.com/connect/latest/adminguide/distribute-by-percentage.html

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
DequeueContactAndTransferToQueue { QueueId? | AgentId? }   // neither: the contact's current target queue
TransferContactToAgent   {}
UpdateContactRoutingBehavior { QueuePriority? | QueueTimeAdjustmentSeconds? }   // integers, never both
CreateCallbackContact    { QueueId? | AgentId?, InitialCallDelaySeconds, MaximumConnectionAttempts,
                           RetryDelaySeconds, ContactFlowId?, CallerId? }
UpdateContactCallbackNumber { CallbackNumber }     // single JSONPath identifier, never static
Loop                     { LoopCount }              // 0 to 100, static or a single JSONPath
Wait                     { TimeoutSeconds, Events?: ("CustomerReturned" | "BotParticipantDisconnected")[] }
DistributeByPercentage   {}
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

## Machine-readable form

`catalog.json`, beside this file, carries the same facts as data: every
documented action type with its category and page URL, and for each modeled
type its HCL block name, its parameters with their attribute names and kinds,
its reference-bearing paths, whether it is terminal, the flow types it is
legal in, the fields that play text, and the errors and conditions it
carries. Recorded 2026-09-11. It is the file a second implementation
generates its schema from, and `packages/core/src/catalog.test.ts` holds
every table in `packages/core/src/actions.ts` to it, so the prose here, the
data, and the code cannot disagree. Add a type to both files in the same
commit; the test says which one is behind.

Each modeled entry's `transitions` records what the action's Transitions may
hold: `next` (`required`, `none`, or `mirrors:error:<type>` and
`mirrors:condition:<operand>` when the builder writes NextAction as a copy of
another branch), `conditions` (`none`, `fixed` with `conditionOperands`,
`dtmf`, `enum`, `numeric`, or `custom`), and `errors` in the builder's order,
each marked `required` (the error-branches rule reports it missing) and
`builder` (the builder's modeled form wires it; the studio offers exactly those
when a drag looks for a branch to create). A type whose page lists no errors
has an empty list, and the studio renders no error handle for it.

Constraints use `exactlyOne` when one of the keys must be present,
`atMostOne` when the keys are alternatives for one role (a queue or an agent
queue) and any may be absent, and `neverBoth` when two independent settings
merely conflict (a priority or a time adjustment). A second implementation
treats the last two the same way; the distinction records what the page said.

A parameter marked `dynamic` also accepts a single JSONPath identifier where
its page says "fully static or fully dynamic"; the kind describes the static
form, and the schema accepts either.

Attribute names are the mechanical `snake_case` of the Flow language key
(`packages/core/src/hcl-names.ts`): `PromptId` is `prompt_id`,
`LambdaFunctionARN` is `lambda_function_arn`, `LexV2Bot` is `lex_v2_bot`.
Reference-bearing fields are named by dotted paths (`packages/core/src/paths.ts`),
so a field inside an object (`LexV2Bot.AliasArn`), inside every element of a
list (`Messages[].PromptId`), or as every value of a map (`EventHooks.*`) can
be named where a flat key could not.

## Unmodeled actions

56 action types are documented across the four category pages (27 contact, 6
participant, 15 flow control, 8 interactions; recounted 2026-09-11, up from
the 49 recorded on 2026-08-31) and the builder models 22 of them. Everything
not in the modeled set above parses to a GenericBlock and round-trips
verbatim. That is what makes a small modeled set survivable. The demo fixture
deliberately includes one (`UpdateFlowLoggingBehavior`) so passthrough is
exercised by default.
