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
| `Transitions` | `NextAction`, `Errors: [{ErrorType, NextAction}]`, `Conditions: [{NextAction, Condition}]`. Terminal actions use `{}` and the service refuses a `NextAction` on them; every other modeled type but `MessageParticipantIteratively` must carry one (rule 38). |

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
| Set contact attributes (Flow namespace) | `UpdateFlowAttributes` | flow control | [doc](https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-updateflowattributes.html) |
| Check staffing, Check queue status | `CheckMetricData` | flow control | [doc](https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-checkmetricdata.html) |
| Get queue metrics | `GetMetricData` | flow control | [doc](https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-getmetricdata.html) |
| Contact tags | `TagContact` | contact | [doc](https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-tagcontact.html) |
| Contact tags (remove) | `UntagContact` | contact | [doc](https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-untagcontact.html) |
| Set voice | `UpdateContactTextToSpeechVoice` | contact | [doc](https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontacttexttospeechvoice.html) |
| Set contact attributes (Connect-defined fields) | `UpdateContactData` | contact | [doc](https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactdata.html) |
| Set customer queue flow, Set event flow, Set hold flow, Set whisper flow | `UpdateContactEventHooks` | contact | [doc](https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontacteventhooks.html) |
| Loop prompts | `MessageParticipantIteratively` | participant | [doc](https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-messageparticipantiteratively.html) |
| Get customer input (Amazon Lex) | `ConnectParticipantWithLexBot` | participant | [doc](https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-connectparticipantwithlexbot.html) |
| Show view | `ShowView` | participant | [doc](https://docs.aws.amazon.com/connect/latest/devguide/participant-actions-showview.html) |
| Set recording, analytics, and processing behavior | `UpdateContactRecordingAndAnalyticsBehavior` | contact | [doc](https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactrecordingandanalyticsbehavior.html) |
| Set logging behavior | `UpdateFlowLoggingBehavior` | flow control | [doc](https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-updateflowloggingbehavior.html) |
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
| `CheckMetricData` | `QueueId`, `AgentId` | `queue` |
| `GetMetricData` | `QueueId`, `AgentId` | `queue` |
| `UpdateContactEventHooks` | `EventHooks.*` (every value) | `flow` |
| `MessageParticipantIteratively` | `Messages[].PromptId` (each message) | `prompt` |
| `ConnectParticipantWithLexBot` | `PromptId` | `prompt` |
| `ConnectParticipantWithLexBot` | `LexV2Bot.AliasArn` | `lex` |
| `ShowView` | `ViewResource.Id` | `view` (may carry a version) |
| `CheckHoursOfOperation` | `HoursOfOperationId` | `hours` |
| `InvokeLambdaFunction` | `LambdaFunctionARN` | `lambda` |
| `InvokeFlowModule` | `FlowModuleId` | `module` (carries an alias) |
| `TransferToFlow` | `ContactFlowId` | `flow` |
| `MessageParticipant` | `PromptId` | `prompt` |
| `GetParticipantInput` | `PromptId` | `prompt` |

`GetParticipantInput` has no Lex bot fields. The console's "Get customer
input" block serializes its Amazon Lex configuration as a separate
`ConnectParticipantWithLexBot` action (with `LexV2Bot` or `LexBot`); the V2
form is modeled (rule 33) and its alias ARN is the one `lex` reference. The
V1 `LexBot` names a bot by name, region and alias, which the `lex` reference
type does not bind, so that form round-trips as a GenericBlock.
https://docs.aws.amazon.com/connect/latest/adminguide/get-customer-input.html

`StoreInput` decides the shape of a `GetParticipantInput`, and the service
enforces it at create (sandbox, 2026-09-29): with `"True"` the action needs
`InputValidation` and refuses `Conditions`, `NoMatchingCondition` and
`InputTimeLimitExceeded`; with `"False"` it needs both of those error
branches, with or without conditions. `StoreInput` itself must be present:
the service refused an action without it ("Action is missing required
property. Path: Actions[0].Parameters.StoreInput"). The page says the first
three; the rest was found by deploying. The catalog's `shapes` encode both
forms and the `conditional-shape` lint rule enforces them.

## Constraints worth encoding

Each of these is a lint rule, a type constraint, or both. Sources are the
individual action pages linked above.

1. `TransferContactToQueue` takes **no parameters**. The queue comes from a
   preceding `UpdateContactTargetQueue`. A single "transfer to queue" in the
   builder is therefore two Actions. Its errors are `QueueAtCapacity` and
   `NoMatchingError`, and the service requires both (rule 37).
2. `CheckHoursOfOperation` requires **exactly two** conditions, `Equals True`
   and `Equals False`, and no others.
3. `UpdateContactTargetQueue` accepts `QueueId` or `AgentId`, never both.
4. `InvokeLambdaFunction.InvocationTimeLimitSeconds` must be a static integer,
   greater than 0 and no larger than 8. `InvocationType` is `SYNCHRONOUS` or
   `ASYNCHRONOUS`.
5. `MessageParticipant` accepts exactly one of `PromptId`, `Text`, or `SSML`.
   `PromptId` and `SSML` are voice only; other channels support only `Text`.
6. `Compare` and `DistributeByPercentage` fail with `NoMatchingCondition`,
   not `NoMatchingError` (`CONDITION_CATCH_ALL` in actions.ts). Both also
   need a `NextAction`, which the builder writes as a copy of the
   `NoMatchingCondition` target, as the console does: the service refuses
   either type without one (rule 38). Until 2026-09-30 this entry and the
   catalog said `Compare` carries no `NextAction`, and every `Compare` the
   builder wrote was refused at create.
   `UpdateContactRoutingBehavior`, `UpdateContactCallbackNumber` and
   `UpdateFlowLoggingBehavior` list no catch-all at all (rules 18, 20 and
   36; `TagContact`'s page lists none either, but the service requires one,
   rule 27). The catch-all is optional (`OPTIONAL_CATCH_ALL` in actions.ts)
   on three types for three reasons: `MessageParticipantIteratively`'s page
   lists it without requiring it and the console omits it (rule 32),
   `Loop`'s page lists none while the console sometimes writes one (rule
   21), and `UpdateContactTextToSpeechVoice`'s page requires it while the
   service and the console's exports do not (rule 29).
7. `DisconnectParticipant`, `EndFlowExecution`, `EndFlowModuleExecution` and
   `TransferContactToAgent` have **no** errors and are terminal
   (`Transitions: {}`). The service refuses a `NextAction` on any of them
   ("Action does not support transitions", rule 38).
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
    dequeues the contact and places it in "the specified queue". Both
    `QueueId` and `AgentId` are `[Optional]`, "If AgentId is specified,
    [QueueId] may not be specified" and the reverse, so at most one; the page
    does not say where the contact goes when neither is given, and neither
    does the admin guide, whose queue-to-queue sample sets `QueueId`. The
    builder accepts `{}` because both are optional, without asserting a
    destination. `AgentId` is "an agent ID or agent ARN, representing an
    agent queue", the `queue` reference type as on `UpdateContactTargetQueue`.
    Errors are `QueueAtCapacity` "if the destination queue is at capacity and
    the contact cannot be queued within it" and `NoMatchingError`. "This
    action is only supported in the customer queue flow. It is not supported
    in any other type of flow." The page says nothing about `NextAction`. The
    admin guide is split: under Contact already in a queue it says "There are
    three possible outcomes in this case:" and lists Success, At capacity and
    Error, but its sample for this action carries `"NextAction": ""` with only
    the two error transitions, and its Flow block branches section says the
    transfer to queue configuration "has two branches: At capacity and Error".
    `next` is `required` as a modeling choice matching
    `TransferContactToQueue`, whose admin sample is the same and whose console
    export under `conformance/export/omitted-parameters` writes a `NextAction`
    all the same; a console export of a customer queue flow should confirm it
    for this action. The admin guide adds two limits the page does not:
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
    The same admin guide page's Supported channels table lists Chat, Task and
    Email as "No - Error branch", which contradicts both its own "does not
    have any branches" and the action page's Errors "None"; the action page
    governs, so the block carries no error branch and where a chat, task or
    email contact goes is not documented.
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
    modeled non-terminal action with none. "This is supported only in inbound contact
    flows. It is not supported in transfer flows, whisper flows, customer
    queue flows, or hold flows." The admin guide's flow-type list also names
    customer queue and transfer flows; the action page governs. Timing: "it
    takes at least 60 seconds for a change to take effect for contacts already
    in queue". The page has no JSON example; the console writes both values
    as JSON strings (`"QueuePriority": "1"`, `"QueueTimeAdjustmentSeconds":
    "600"` in its export of the Sample queue configurations flow, which the
    admin guide names as the sample using this block), so the catalog records
    them as `integerString` and the builder writes that spelling.
    https://docs.aws.amazon.com/connect/latest/adminguide/change-routing-priority.html
    https://docs.aws.amazon.com/connect/latest/adminguide/sample-queue-configurations.html
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
    has no JSON example; the console writes the three integers as JSON strings
    (`"InitialCallDelaySeconds": "5"`, `"MaximumConnectionAttempts": "1"`,
    `"RetryDelaySeconds": "600"` in its export of the Sample interruptible
    queue flow with callback), so the catalog records them as `integerString`
    and the builder writes that spelling. That export also shows `NextAction`
    on its own target, apart from the error's.
    https://docs.aws.amazon.com/connect/latest/adminguide/transfer-to-queue.html
    https://docs.aws.amazon.com/connect/latest/adminguide/sample-interruptible-queue-flow-with-callback.html
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
    `dynamic` and the builder takes an integer or a single JSONPath. The page
    shows no encoding for the static form; the console spells every integer
    parameter as a decimal string in each of its twenty exported sample flows
    and in every published console export of a Loop block read for this
    entry, so the catalog records `LoopCount` as an `integerString` and the
    builder writes `"2"`. Errors "None" on the page, but the admin guide's
    block has an Error branch and some of those published exports carry
    `NoMatchingError`, so the catch-all is optional (`OPTIONAL_CATCH_ALL`):
    the builder wires it when asked and error-branches does not report it.
    The page says nothing about `NextAction`; every published export writes
    it as a copy of the `DoneLooping` target, and the builder mirrors it the
    same way. The service (checked live 2026-09-15) accepts the block with
    `NoMatchingError` and accepts `LoopCount` as a JSON number as well as a
    string; the catalog keeps the string, which is what the console writes.
    "This is supported in every type of flow." The admin guide
    adds: "If you enter 0
    for the loop count, the Complete branch is followed the first time this
    block runs", and describes an array-looping mode whose flow-language keys
    the action page does not document.
    https://docs.aws.amazon.com/connect/latest/adminguide/loop.html
22. `Wait` (recorded 2026-09-11) "Pauses the flow for a specified duration,
    or until a specified event happens, whichever happens first."
    `TimeoutSeconds` "can be either statically defined, or a single valid
    JSONPath identifier. If defined statically, this must be a positive
    integer value no greater than 604800 (seven days)". That is the page's
    name; the console writes the parameter as `TimeLimitSeconds` with a
    decimal string value (`"TimeLimitSeconds": "900"` in its export of the
    Sample disconnect flow), and what the console writes is what Connect
    stores, so the catalog, the builder and the schema use `TimeLimitSeconds`
    as an `integerString` and a `TimeoutSeconds` stays a GenericBlock.
    `Events` is "An
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
    say whether the timeout is required; the service refuses the block
    without `TimeLimitSeconds` and refuses the page's `TimeoutSeconds` by
    name (checked live 2026-09-15), and the builder requires it. It
    says nothing about `NextAction`; the console's export of the Sample
    disconnect flow writes it as a copy of the `NoMatchingError` target, and
    the builder mirrors it onto the catch-all the same way. The admin guide's
    block page disagrees with the action page on both counts of the
    restriction: its Flow types section lists only "Inbound flow" and
    "Customer Queue flow", and its Supported channels table marks Chat, Task
    and Email "Yes" and Voice "Yes - but only in Inbound flow when the Keep
    running while waiting option, or the Set event-based wait option is
    selected", properties whose flow-language keys the action page does not
    document. The action page governs, as for the other flow-type lists
    above, so the catalog records `flowTypes` as unrestricted; the one export
    carrying a Wait is an inbound flow, so the exports do not settle it. The
    admin guide's block has more (participant
    type, Lambda, case and external-tool events, a Continue branch) whose
    flow-language keys the action page does not document; those round-trip
    as a GenericBlock.
    https://docs.aws.amazon.com/connect/latest/adminguide/wait.html
    https://docs.aws.amazon.com/connect/latest/adminguide/sample-disconnect.html
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
    percentages and reads it back. The service also accepts number operands
    (checked live 2026-09-15); the schema keeps the console's strings. "This
    action is available in inbound
    flows, transfer flows, and customer queue flows. It is not available to
    hold flows or to whisper flows." The admin guide's flow-type list adds
    the outbound whisper flow; the action page governs.
    https://docs.aws.amazon.com/connect/latest/adminguide/distribute-by-percentage.html
24. `UpdateFlowAttributes` (recorded 2026-09-11) "Sets a collection of
    attributes on the current flow. These attributes are not carried over to
    the subsequent flows. With this type of operation, either all attributes
    are set or none are set." The page's parameter block is not valid JSON
    (a doubled quote, a missing quote, prose inside the braces) and says only
    "An Object that holds the attributes to be set. Keys are of type String,
    Values are of type FlowAttribute" without defining FlowAttribute. Console
    exports of the block (the Set contact attributes block with its Flow
    namespace, published in AWS sample repositories) settle both gaps the
    page leaves: every value is written as `{ "Value": "<string>" }`, static
    or a JSONPath, and every export carries a `NoMatchingError` branch
    although the page's Errors section says "None" (the admin guide's block
    "has two branches: Success and Error"). The catalog records
    `FlowAttributes` as a map of `{ Value }` objects and the catch-all as
    required, and the builder writes that shape from a flat string map, as it
    does for `UpdateContactAttributes`; the export governs, and the service
    agrees: it refuses flat string values and accepts the `{ Value }` form
    (checked live 2026-09-15). "This action is supported on all channels and
    in all flow types." The admin guide adds
    that flow
    attributes "aren't passed to modules", "don't appear in the contact
    record" and may not contain `$` or `.` in a key.
    https://docs.aws.amazon.com/connect/latest/adminguide/set-contact-attributes.html
25. `CheckMetricData` (recorded 2026-09-11) "A shortcut single action to
    avoid using GetMetricData and Compare for a set of simple metrics."
    `MetricType` is "One of [NumberOfAgentsAvailable, NumberOfAgentsStaffed,
    NumberOfAgentsOnline, OldestContactInQueueAgeSeconds,
    NumberOfContactsInQueue]. **Dynamic values are not supported**" (the
    asterisks are the page's own); `QueueId` and `AgentId` are `[Optional]`,
    at most one, "If neither this nor QueueId are specified, the contact
    TargetQueue is used". Results: "If the MetricType is NumberOfAgents* then
    the only supported condition is "NumberGreaterThan 0", otherwise Equals
    and any Number* Operands are allowed." Errors: `NoMatchingError`, and
    `NoMatchingCondition` "only supported if the MetricType is
    OldestContactInQueueAgeSeconds or NumberOfContactsInQueue". The console's
    default queue transfer flow, recorded under
    `conformance/export/omitted-parameters`, contradicts that last clause: it
    wires `NoMatchingCondition` on a `NumberOfAgentsStaffed` check as the
    block's False branch (and the service requires the branch, and at least
    one condition, whatever the metric: rule 37), orders the errors `NoMatchingError` then
    `NoMatchingCondition`, and mirrors `NextAction` onto the `NoMatchingError`
    target; the builder writes that shape for every metric. The console's
    Sample queue configurations flow writes its queue-age check with the two
    errors the other way round, `NoMatchingCondition` first, still mirroring
    `NextAction` onto `NoMatchingError`, so the inverter reads the two by
    type; because the class re-emits the builder's order, an export in the
    other order round-trips as a GenericBlock, as the reversed
    `TransferContactToQueue` does. That export also shows the operand's unit
    for `OldestContactInQueueAgeSeconds`: a 300 second entry in the console is
    the wire operand `"300000"`, so the operand is milliseconds despite the
    metric's name; the builder writes the operand it is given. "This action is
    only usable in flows, queue and agent transfers, and customer queue
    flows. It is not available in any type of whisper or hold flows."
    https://docs.aws.amazon.com/connect/latest/adminguide/check-staffing.html
    https://docs.aws.amazon.com/connect/latest/adminguide/check-queue-status.html
    https://docs.aws.amazon.com/connect/latest/adminguide/sample-queue-configurations.html
26. `GetMetricData` (recorded 2026-09-11) "Loads real time queue metrics for
    the queue specified by queue ID, agent ID (for agent queues), or the
    target queue, and makes them available on the flow run data." `QueueId`
    and `AgentId` are `[Optional]`, "If AgentId is specified, [QueueId] may
    not be specified", "*Dynamic values are supported*" (the asterisks are the
    page's own); `QueueChannel` is `[Optional]`, "Either "Voice" or "Chat".
    Can be set dynamically. Determines the channel for which metrics are
    returned. If not specified, metrics are returned for all channels."
    Results "None. No conditions are supported"; the error is
    `NoMatchingError`. "This action is available in every type of flow." The
    page's parameter block is missing a comma between `AgentId` and
    `QueueChannel`. The admin guide adds a Get contact metrics setting with no
    documented key, the returned attribute names (which the admin guide's
    attribute list spells `$.Metrics.Queue.*` and `$.Metrics.Agents.*` under
    Queue attributes and, with Get contact metrics on, `$.Metrics.Contact.*`;
    the block page itself names only the two Contact ones), a 5 to 10 second
    delay, and "Dynamic attributes can only return metrics for one channel".
    https://docs.aws.amazon.com/connect/latest/adminguide/get-queue-metrics.html
    https://docs.aws.amazon.com/connect/latest/adminguide/connect-attrib-list.html
27. `TagContact` (recorded 2026-09-11, checked live 2026-09-15) "Sets a
    collection of tag to the current contact. With this type of operation,
    either all tags are set or none are set." `Tags` is "an Object that holds
    the tags to be set" whose entries are `"Key1":"Value1"`; "Both the key and
    value may be defined statically or dynamically." "A system tag is prefixed
    with aws:. You cannot change it." Results and errors "None" on the page,
    but CreateContactFlow refuses the block without a catch-all ("Action is
    missing required error. Error: NoMatchingError"), the admin guide's block
    "has two branches: Success and Error", and a published console export
    carries `NoMatchingError`, so the catalog records the ordinary required
    catch-all: a block without it stays a GenericBlock and error-branches
    reports it. "None. This can be used in any type of flow and any channel."
    The admin guide adds "You can create up to 6 user-defined tags", which the
    schema and the builder enforce and the service does too ("More than 6 tags
    in Parameters.Tags"); the service accepts an `aws:` key at create time, so
    that refusal is the page's rule rather than the wire's. The granular
    billing page says tags "only function as cost allocations tags" and are
    read back "by using the $.Tags JSONPath Reference". The page does not say
    `Tags` is required or non-empty; the builder requires one tag, which is
    the builder's choice.
    https://docs.aws.amazon.com/connect/latest/adminguide/contact-tags-block.html
    https://docs.aws.amazon.com/connect/latest/adminguide/granular-billing.html
28. `UntagContact` (recorded 2026-09-11, checked live 2026-09-15): the page's
    title and body spell the type `UnTagContact`, which the service refuses
    ("Invalid Action type. Type: UnTagContact"); it accepts `UntagContact`,
    the spelling of the API operation the granular billing page names ("the
    TagContact and UntagContact APIs"), so that is the type the catalog, the
    schema and the builder use. The schema and lint accept any type string,
    so a document spelling it the page's way is not refused here: it
    round-trips unchanged as a GenericBlock and CreateContactFlow refuses it
    at deploy time with the error above. "Removes a collection of tags on
    the current contact. [...] You cannot remove system-defined tags. You can
    only remove already existing user-defined tags from a contact." `TagKeys`
    is "an Object that holds the tag-keys for the tags to be removed", a list
    of keys, and "Key(s) can only be set statically." Results "None"; the
    error is `NoMatchingError`. "This action is supported across all the
    Connect Customer media channels. This action can be used in flows of all
    types." The page does not say `TagKeys` is non-empty, but the service
    refuses an empty list ("Invalid Action property value. Path:
    Actions[0].Parameters.TagKeys"), so the catalog records `min` 1, the
    schema `minItems` 1, and the builder refuses it; the builder and the
    schema also refuse the `aws:` prefix the TagContact page reserves for
    system tags (rule 27).
    https://docs.aws.amazon.com/connect/latest/adminguide/granular-billing.html
29. `UpdateContactTextToSpeechVoice` (recorded 2026-09-11, checked live
    2026-09-15) "Updates the Amazon Polly voice used by text-to-speech for
    voice contacts [...]. This defaults to Joanna if this action is never
    run." `TextToSpeechVoice` is "A string holding the name of an Amazon Polly
    voice. May be defined statically or dynamically."; `TextToSpeechEngine`
    "The engine associated with the Amazon Polly voice", whose values the
    action page never lists: the admin guide's prose names standard, neural
    and generative in lower case, and every published console export of the
    block writes the engine capitalised ("Neural", "Generative"), which is
    the spelling the catalog, the schema and the builder use. The service
    validates none of it at create time (it accepted "neural", "Neural" and an
    invented "Turbo" alike), so the enum is the console's vocabulary, not the
    wire's. `TextToSpeechStyle` "could be None, Coversational, or Newscaster"
    (the page's spelling; the admin guide and the catalog spell
    Conversational). All three "May be defined statically or dynamically", so
    the two enums are `dynamic`. "Results in error if voice or engine are
    invalid, or if the selected voice does not support the selected engine";
    the error is `NoMatchingError`, "Must always be defined" on the page, but
    the service accepts the block with no error branch and published console
    exports omit it on many Set voice blocks, so the catch-all is optional
    (`OPTIONAL_CATCH_ALL`): the builder wires it when asked and error-branches
    does not report it. "None. This action is supported in all flow types, and
    across all channels." The page marks nothing required; the builder
    requires the voice. The admin guide's language code has no key on this
    page.
    https://docs.aws.amazon.com/connect/latest/adminguide/set-voice.html
30. `UpdateContactData` (recorded 2026-09-11, checked live 2026-09-15) "Sets
    a collection of connect defined attributes on specified contact. With this
    type of operation, either all attributes are set or none are set." Every
    field is `[Optional]` except `TargetContact`, "[Required] [...] "Current"
    or "Related" are the only valid values" on the page; the service accepts
    the block without it, and a published console export writes the block with
    `WisdomSessionArn` alone, so the catalog records it optional and the
    builder writes it only when configured. `Name` "May be set statically or
    dynamically"; `Description`, `LanguageCode`, `CustomerId`, `WatchlistId`
    and `WisdomSessionArn` are strings; `References` is "an Object that holds
    the references to be set" whose keys and values "may be defined
    statically or dynamically". The Voice ID fields are each "It is a
    string": `IsVoiceIdStreamingEnabled`, `IsVoiceAuthenticationEnabled` and
    `IsFraudDetectionEnabled` take `"TRUE"` and `"FALSE"`, "the only valid
    values"; `VoiceAuthenticationThreshold` and `FraudDetectionThreshold`
    "must be between 0 and 100"; `VoiceAuthenticationResponseTime` "must be
    between 5 and 10". `WatchlistId` also says "Value must be between 0 and
    100", which reads as copied from the threshold lines and is not enforced;
    the Set Voice ID block's admin guide page gives the real format, "For Set
    manually, the watch list ID must be 22 alphanumeric characters", checked
    at publish, which the fixture's value follows and neither the schema nor
    the builder enforces (a JSONPath is the dynamic form). AWS ended support
    for Voice ID on May 20, 2026 ("After May 20, 2026, you will no longer be
    able to access Voice ID on the Amazon Connect Customer console"); the six
    Voice ID fields are modeled as the action page still documents them, and
    a flow that sets them should not expect them to take effect.
    https://docs.aws.amazon.com/connect/latest/adminguide/set-voice-id.html
    Results "None. No conditions are supported"; the error is
    `NoMatchingError`. "This action is supported on all channels and in all
    flow types." The page has no JSON example; the thresholds are recorded as
    `integerString` from "It is a string". A `WisdomSessionArn` written as a
    literal ARN fails the `no-literal-arn` rule like any other; a JSONPath is
    the expected form.
31. `UpdateContactEventHooks` (recorded 2026-09-11, checked live 2026-09-15)
    "Sets one or more contact event hooks, which are flows associated with
    contact events, such as customer whisper or agent hold." After a
    cross-reference sentence, "The following event hooks are valid:" and a
    list of ten names: AgentHold, AgentWhisper, CustomerHold, CustomerQueue,
    CustomerRemaining, CustomerWhisper, DefaultAgentUI, DisconnectAgentUI,
    PauseContact, ResumeContact. `EventHooks` is "an Object that holds the
    event hooks to be set. Only one entry may be present in this map." whose
    entry is "the event hook to be set where the key is the event type and
    the value is the flow ID or ARN to run when that event occurs. Keys must
    be defined statically." The value is the first map-valued reference path,
    `EventHooks.*`, a `flow`; the admin guide's Set hold flow block shows "the
    dropdown list of namespaces that you can use to set the hold flow
    dynamically", so a JSONPath is accepted too. Results "None"; the error is
    `NoMatchingError`. "This is supported in all types of flows"; the admin
    guide narrows per block (Set hold flow lists inbound and customer queue
    flows among its flow types and routes a chat, task or email contact down
    its Error branch), and the action page governs. The console's exports of
    the Sample inbound flow and the Sample queue configurations flow carry one
    entry each (`CustomerRemaining`, `CustomerQueue`) with a flow ARN,
    `NoMatchingError` and a `NextAction`, which is the shape the builder
    writes. The catalog records the map's entry count as `min` 1, `max` 1 and
    its allowed keys as `keys`: the ceiling is the page's, the floor is the
    block class's (one hook per block), and neither is the service's, which
    accepts an empty map and a two-entry map at create time; the schema
    enforces the ceiling only, so the studio's empty default inserts. A saved
    console export can carry a second parameter, `EventHooksConfiguration: {
    <hook>: { DisableExecution: "true" | "false" } }`, which the action page
    does not document and CreateContactFlow refuses ("Action does not support
    conditions"); an action carrying it stays a GenericBlock.
    https://docs.aws.amazon.com/connect/latest/adminguide/set-hold-flow.html
    https://docs.aws.amazon.com/connect/latest/adminguide/set-customer-queue-flow.html
32. `MessageParticipantIteratively` (recorded 2026-09-11) "Loops a sequence of
    prompts while a customer or agent is on hold or in queue. This block can
    be configured with an interruption timeout when in a Queue flow that
    interrupts the message loop to run other flow logic." `Messages` is "A
    List of messages to be played in a loop", each entry one of `Text`,
    `PromptId`, `SSML` or `Media` (`Uri`, `SourceType` "S3", `MediaType`
    "Audio"); the page shows one key per entry and the console writes one,
    which the catalog records as `exactlyOne`. `InterruptFrequencySeconds` is
    "[Optional] Time to elapse before the action completes with
    "MessagesInterrupted" run result"; "Conditions are supported, but only
    the "Equals" operator is supported. The only supported operand is
    MessagesInterrupted." The error is `NoMatchingError`, listed without
    "must always be defined". "This action is supported in Customer Queue,
    Customer Hold, and Agent Hold flows." The page adds that `PromptId` "is
    supported only for the Voice channel, all other channels support only the
    "Text" option", and that on chat "it immediately takes the error branch.
    If no error branch is available, the flow stop running and the contact
    is routed to next available agent." The console's exports of its default
    hold and queue flows carry `Messages` alone with `Errors` and
    `Conditions` empty and no `NextAction`; its Sample interruptible queue
    flow adds `"InterruptFrequencySeconds": "30"` and the `MessagesInterrupted`
    condition, still with no `NextAction` and no error. So `next` is `none`,
    which here means the builder omits it, not that it is forbidden: the
    service accepts the action with or without a `NextAction` (rule 38),
    where it refuses one on a terminal type. The catch-all is optional (`OPTIONAL_CATCH_ALL` in actions.ts, so
    error-branches does not report it), the seconds are an `integerString`
    paired with the branch (a studio drag that adds the branch writes the
    console's `"30"`, and removing it removes the seconds), and the catalog
    marks the action `waits`: a flow may end in it, as the console's hold
    flows do, and terminal-blocks treats it as an end whenever it has no
    `NextAction`, whatever its catch-all and interrupt branches wire, since a
    hold flow allows no terminal type and the admin guide's configured block
    has an Error branch. An S3 audio message is something the participant
    hears, so `Messages[].Media.Uri` is among the paths recording consent
    reads, as `Media.Uri` is on `MessageParticipant` and `GetParticipantInput`.
    https://docs.aws.amazon.com/connect/latest/adminguide/loop-prompts.html
33. `ConnectParticipantWithLexBot` (recorded 2026-09-11) "Connects the
    participant with the specified Amazon Lex bot. When the interaction is
    over, the Intent and Slots of the bot are available to the flow during
    its run." "Provide either LexBot or LexV2Bot object depending on the
    Amazon Lex version"; `LexV2Bot.AliasArn` is "The alias ARN of the LexV2
    bot to invoke. May be specified statically or dynamically." `PromptId`,
    `Text` and `SSML` are each optional and at most one ("May not be
    specified if PromptId or SSML is also specified" and the like);
    `LexSessionAttributes` is a string map; `LexInitializationData` carries
    `InitialMessage`. `LexTimeoutSeconds` is "A mapping that defines the length
    of Lex timer in second"; its `Text` is "An optional string that defines
    the Lex timer length for chat", although the page's Action syntax spells
    it `"Text": "number"`; the catalog follows the prose and the console's
    other integer spellings and records a decimal string, bounded by the
    console's Chat timeout ("Minimum: 1 minute Maximum: 7 days"), which the
    schema's pattern holds (60 to 604800). Results: "If the Amazon Lex
    interaction succeeds, the result is the Intent of the bot. Conditions
    are supported, but only the Equals operator is supported". Errors, in
    the page's Action syntax order: `InputTimeLimitExceeded` "if there is no
    response before the configured LexTimeoutSeconds", `NoMatchingError`,
    `NoMatchingCondition` "If no specified condition evaluated to True".
    "This action is available only in contact flows, transfer flows, and
    customer queue flows. It is not available in whisper flows or hold
    flows." The page's "Provide either LexBot or LexV2Bot object" is an
    `exactlyOne` in the catalog and a `oneOf` in the schema, so an action
    with no bot is refused. The builder models the V2 form without `Media`;
    `NextAction` mirrors the no-match branch as the same console block's DTMF
    form does (the sample exports put a DTMF menu's `NextAction` on its
    `NoMatchingCondition` target). The only published console JSON of this
    action, the Get customer input page's Flow Language representation when
    Amazon Lex is used, is the sentiment-override form: it carries no
    conditions, `NoMatchingCondition` points at the sentiment `Compare`, and
    `NextAction` copies the `InputTimeLimitExceeded` and `NoMatchingError`
    target, so that form round-trips as a GenericBlock and does not settle
    the plain one; no sample flow carries a Lex bot, so the plain form's
    mirror is to be confirmed against an export.
    https://docs.aws.amazon.com/connect/latest/adminguide/get-customer-input.html
34. `ShowView` (recorded 2026-09-11, checked live 2026-09-15) "Initiates a
    UI-based workflow that can be surfaced to users of front end applications.
    This action can be used to create step-by-step guides for agents".
    `ViewResource` holds the view's `Id` and optional `Version`; the admin
    guide's example writes the id as an AWS-managed view ARN with its version
    (`view/form:1`), which the `view` reference carries in its alias slot
    (`${cdref:view:form@1}`). `InvocationTimeLimitSeconds` is a bare `400` in
    the page's parameter block and `"2"` in the admin guide's JSON, so it is
    recorded as an `integerString`; the page marks none of its fields
    required or optional, and CreateContactFlow refuses the block without it
    ("Action is missing required property"), so it is required. Neither page
    states a bound; the catalog's floor of 1 is the builder's (a zero or
    negative time limit is meaningless) and the live checks did not probe
    it. `ViewData` is "An optional map of
    data that will be passed to the View Resource. Keys and values may be set
    statically or dynamically" and stays opaque;
    `SensitiveDataConfiguration.HideResponseOn` is a list whose only example
    is TRANSCRIPT. Results: "The result that the user selects when interacting
    with the View. The available conditions will be dependent on the View
    resource specified", one Equals each; the service accepts a block with no
    condition. Errors: the page lists `NoMatchingError`, `NoMatchingCondition`
    "if no other Condition matches" and `TimeLimitExceeded` "if there is no
    response before the configured InvocationTimeLimitSeconds" in that order
    and marks none required; the service refuses the block without any one of
    the three, and the admin guide's flow-language JSON writes them
    `NoMatchingCondition`, `NoMatchingError`, `TimeLimitExceeded`, which the
    builder follows (the service accepts either order; the page's order
    round-trips as a GenericBlock). That JSON also writes `NextAction` as a
    copy of the `NoMatchingError` target, and the block's branch list has no
    success path, so `next` mirrors the catch-all
    (`mirrors:error:NoMatchingError`), as a DTMF menu's mirrors its no-match
    branch; the service does not constrain `NextAction`. "This action is only
    supported on the chat channel." "This action can be used in inbound flows
    and customer queue flows"; the same page's UI section says inbound only
    and the admin guide lists inbound alone; the Restrictions section governs.
    https://docs.aws.amazon.com/connect/latest/adminguide/show-view-block.html
35. `UpdateContactRecordingAndAnalyticsBehavior` (recorded 2026-09-11, checked
    live 2026-09-15) "Sets
    contact recording behavior, including analysis behavior and which
    participants of the contact to record." Its parameter block holds one
    channel object ("Only ONE of the following channel behavior objects can be
    defined per configuration": `ChatBehavior` or `VoiceBehavior`) and an
    optional `ScreenRecordingBehavior` that "Can
    be defined independently or alongside any channel behavior". The builder
    models the two recording forms: `VoiceBehavior.VoiceRecordingBehavior`,
    whose `RecordedParticipants` is "a list of participants to record, chosen
    from "Agent" and "Customer". An empty list disables recording. Must be set
    statically" and whose `IVRRecordingBehavior` "Can be either "Enabled" or
    "Disabled". Must be set statically", and
    `ScreenRecordingBehavior.ScreenRecordedParticipants`, which "can only
    include "Agent"" and is static; one or the other, never both:
    CreateContactFlow refuses a block carrying two of the three objects, or
    none ("Invalid Action property value. Path: Actions[0].Parameters"),
    whatever "alongside any channel behavior" means, and the admin guide asks
    for "two separate Set recording, analytics, and processing behavior blocks
    in sequence" to combine screen and channel recording; the catalog records
    an `exactlyOne` constraint over the three objects.
    `VoiceAnalyticsBehavior` ("Can only be set if RecordedParticipants
    contains both Agent and Customer", a cross-field rule the catalog cannot
    spell) and the whole `ChatBehavior` object stay generic, as the older
    action's `AnalyticsBehavior` does. Errors in the page's order:
    `NoMatchingError` and `ChannelMismatch` ("if the media channel that
    initiated the contact is not the same as the one defined in the action"),
    both "Must always be defined" (the service refuses the block without
    `ChannelMismatch` and accepts the two in either order);
    `InFlightRedactionConfigurationFailed` "Must be defined if chat behavior
    is defined in action", which the service enforces ("Action is missing
    required error") and the catalog records as `requiredWhenKey:
    ChatBehavior`, so error-branches reports it missing on a chat-form block
    although the builder never writes that form. The
    page has no Restrictions section, so the catalog records the action as
    unrestricted; the admin guide says "This block is supported for all flow
    types except journey flows" and only recommends a whisper flow for the
    recording portion. The page says nothing about `NextAction`; the admin
    guide's block has a Success branch, and the builder writes it as the
    block's own path, as for `UpdateContactRecordingBehavior`, to be confirmed
    against a console export (no recorded sample flow carries the action). The
    catalog's `recordingEnabler` is the voice list, so
    recording-consent-before-record treats the block as it treats the older
    one; screen recording records the agent and is not an enabler.
    https://docs.aws.amazon.com/connect/latest/adminguide/set-recording-analytics-processing-behavior.html
36. `UpdateFlowLoggingBehavior` (recorded 2026-09-11) "Enables or disables
    flow logging. If this is a flow, this same behavior remains unless it is
    overridden for the rest of the contact segment. It is also automatically
    inherited by new segments in the chain." One parameter,
    `FlowLoggingBehavior`: "One of [Enabled,Disabled]. *Dynamic values are not
    supported*". Errors "None." (so it joins `WITHOUT_CATCH_ALL`), results
    "None. No conditions are supported.", and "This action is available in
    every type of flow." The page says nothing about `NextAction`, and no
    recorded console export carries the type: the `enable-logging` block in
    `conformance/export/demo-instance` is the builder's own materialized demo
    (tasks/A06), so it shows only that the service stores what was written.
    The class writes `NextAction` with empty `Errors` and `Conditions`, the
    shape the console writes for its other error-less blocks in the recorded
    sample flows (`UpdateContactRoutingBehavior`,
    `UpdateContactRecordingBehavior`, `MessageParticipant`) and byte for byte
    what the demo's `GenericBlock` already wrote, so the builder's class
    changed no fixture; the service accepted the block with no errors
    (checked live 2026-09-15), and the `NextAction` spelling is to be
    confirmed against a console export. It was the demo's passthrough exemplar until this entry;
    passthrough now lives in the `unknown-actions` fixture, which holds only
    types the builder does not model and is held to that by test.
    https://docs.aws.amazon.com/connect/latest/adminguide/set-logging-behavior.html

### Flow-type restrictions are a rule category, not a rule

Almost every action lists a `Restrictions` section naming the flow types it is
valid in (inbound, transfer, whisper, hold, customer queue, module). When this
reference was recorded on 2026-08-31 the rule set in packages/core/SPEC.md was
nine and none covered this. `action-allowed-in-flow-type` landed the same day
as the tenth, driven by `FLOW_TYPE_RESTRICTIONS` in
`packages/core/src/actions.ts`, which is transcribed from this reference.
SPEC.md lists the current set.

37. Service validation sweep (2026-09-29, sandbox, us-west-2). Every modeled
    type was created in a minimal flow carrying only the error branches the
    catalog then marked required (Lex, whose sandbox has no bot, was not).
    Four types were refused, each with `InvalidContactFlowException` naming
    the problem, and the catalog now says what the service enforces:
    - `TransferContactToQueue` and `DequeueContactAndTransferToQueue` need
      `QueueAtCapacity` as well as the catch-all ("Action is missing required
      error. Error: QueueAtCapacity"); either branch alone is refused. The
      pages list it without saying it is required.
    - `CheckMetricData` needs `NoMatchingCondition` whatever the metric, and
      at least one condition ("Action is missing required property. Path:
      Transitions.Conditions", with `Conditions` empty or absent). The
      catalog's `minConditions` records the second, and `error-branches`
      reports both.
    - `UpdateContactRecordingBehavior` takes no error branch at all: the
      service refused `NoMatchingError` ("Invalid Action error. Error:
      NoMatchingError") and accepted the action with `Errors` empty. The
      page's Errors section had been read as the usual catch-all.
    - `GetParticipantInput`: see the paragraph above the constraints.
    The converse was checked the same day: each branch the catalog requires
    was removed on its own, and the service refused every such action but
    one. `MessageParticipant` was accepted without its catch-all, and a full
    export of the instance's default and sample flows carries 59
    `MessageParticipant` actions with no error branch at all, so its
    catch-all is optional (`OPTIONAL_CATCH_ALL`). The same export agrees with
    every refusal above: each `TransferContactToQueue` wires
    `QueueAtCapacity`, each `CheckMetricData` wires `NoMatchingCondition`
    and a condition, every `UpdateContactRecordingBehavior` has `Errors`
    empty, and every `GetParticipantInput` carries `StoreInput`.
    Two refusals were the fixtures' parameters, not the catalog: the
    `contact-data` fixture's `UpdateContactData` (Voice ID fields on an
    instance without Voice ID) and the `contact-routing` fixture's first
    `CreateCallbackContact` both came back "Invalid Action type", and each
    type was accepted with minimal parameters. A `Wait` with the
    `flow-control` fixture's `Events` and conditions was refused ("Invalid
    Action property value") and stays as the page describes it until a
    console export shows the shape.
38. `NextAction` sweep (2026-09-30, a development instance, us-west-2,
    `CreateContactFlow` then `DescribeContactFlow`, each accepted flow
    deleted at once). Rule 37 removed error branches one at a time and
    never `NextAction`, and no `Compare` without one had been created live
    before this; the gap is long-standing, not a service change.
    - `Compare` without `NextAction` is refused ("Action is missing
      required property. Path: Actions[0].Transitions.NextAction",
      `InvalidContactFlowException`) in a contact flow (19:12 UTC) and a
      customer queue flow (19:13 and 19:20), and mid-flow in a customer
      whisper flow ("Path: Actions[1].Transitions.NextAction", 19:20). The
      `compare-only` roundtrip fixture as it stood was refused the same way
      (19:20) and accepted once it carried `"NextAction": "greet-standard"`,
      its `NoMatchingCondition` target (19:20).
    - The service accepts any target: the `NoMatchingCondition` target, a
      condition's target, or an action neither branch names (19:12 to
      19:20), and `DescribeContactFlow` returns the `NextAction` as sent. A
      `Compare` with `NextAction` but `Errors` empty is refused for the
      branch alone ("Action is missing required error. Error:
      NoMatchingCondition, Path: Actions[0]", 19:13).
    - Every one of the 14 `Compare` actions in the instance's AWS default
      and sample flows (Sample queue customer, Sample queue configurations
      flow, Sample disconnect flow, Sample inbound flow (first contact
      experience), Sample Lambda integration, Sample recording behavior;
      read 19:24) carries a `NextAction` equal to its `NoMatchingCondition`
      target, as Sample AB test's `DistributeByPercentage` does. So the
      catalog's `next` for `Compare` is `mirrors:error:NoMatchingCondition`,
      and the builder and codegen treat it as they treat
      `DistributeByPercentage`: the class writes the copy, and codegen reads
      back only that shape, leaving any other `NextAction` a GenericBlock.
    - Every other non-terminal modeled type probed is refused the same way
      without `NextAction` and accepted with one, whatever the target:
      `MessageParticipant`, `UpdateContactAttributes`,
      `UpdateFlowLoggingBehavior`, `DistributeByPercentage`,
      `CheckHoursOfOperation`, `CheckMetricData`, `GetParticipantInput`,
      `ShowView`, `Loop`, `Wait`, `TransferContactToQueue`,
      `DequeueContactAndTransferToQueue`, `TransferToFlow` and
      `CreateCallbackContact` (19:12 to 19:15). The builder already wrote
      it for all of them.
    - `MessageParticipantIteratively` in a customer queue flow is accepted
      with and without `NextAction`, with `Errors` and `Conditions` empty
      and with the interrupt condition and catch-all (19:14 to 19:15, and
      again at 19:20). Its `none` is the builder's choice, matching the
      console's default flows, which carry none.
    - The terminal types refuse one: `DisconnectParticipant` (contact flow),
      `EndFlowExecution` (customer whisper), `TransferContactToAgent`
      (queue transfer) and `EndFlowModuleExecution` (module) with a
      `NextAction` are each refused ("Action does not support transitions.
      Path: Actions[0]", 19:15 to 19:16); the first three are accepted with
      `Transitions: {}`.
    https://docs.aws.amazon.com/connect/latest/APIReference/API_CreateContactFlow.html
    https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-compare.html

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
DequeueContactAndTransferToQueue { QueueId? | AgentId? }   // neither: legal, destination not documented
TransferContactToAgent   {}
UpdateContactRoutingBehavior { QueuePriority? | QueueTimeAdjustmentSeconds? }   // integer strings ("1"), never both
CreateCallbackContact    { QueueId? | AgentId?, InitialCallDelaySeconds, MaximumConnectionAttempts,
                           RetryDelaySeconds, ContactFlowId?, CallerId? }   // the three counts are integer strings ("600")
UpdateContactCallbackNumber { CallbackNumber }     // single JSONPath identifier, never static
Loop                     { LoopCount }              // "0" to "100" as a decimal string, or a single JSONPath
Wait                     { TimeLimitSeconds, Events?: ("CustomerReturned" | "BotParticipantDisconnected")[] }   // the console's key; the page says TimeoutSeconds
DistributeByPercentage   {}
UpdateFlowAttributes     { FlowAttributes: { [k]: { Value } } }   // the console's shape; Value static or a JSONPath
CheckMetricData          { MetricType, QueueId? | AgentId? }
GetMetricData            { QueueId? | AgentId?, QueueChannel?: "Voice" | "Chat" }   // channel static or a single JSONPath
TagContact               { Tags: { [k]: v } }        // up to six; no aws: keys
UntagContact             { TagKeys: string[] }        // static keys; no aws: keys; the page spells the type UnTagContact
UpdateContactTextToSpeechVoice { TextToSpeechVoice, TextToSpeechEngine?: "Standard" | "Neural" | "Generative",
                           TextToSpeechStyle?: "None" | "Conversational" | "Newscaster" }   // each static or a JSONPath
UpdateContactData        { Name?, Description?, LanguageCode?, CustomerId?, References?: { [k]: v },
                           IsVoiceIdStreamingEnabled?: "TRUE" | "FALSE", IsVoiceAuthenticationEnabled?: "TRUE" | "FALSE",
                           IsFraudDetectionEnabled?: "TRUE" | "FALSE", VoiceAuthenticationThreshold?,   // "0" to "100"
                           VoiceAuthenticationResponseTime?,   // "5" to "10"
                           FraudDetectionThreshold?,           // "0" to "100"
                           WatchlistId?, WisdomSessionArn?, TargetContact?: "Current" | "Related" }
UpdateContactEventHooks  { EventHooks: { [hook]: flow } }   // exactly one entry; hook is one of the ten names
MessageParticipantIteratively { Messages: ({ Text } | { SSML } | { PromptId } | { Media: { Uri, SourceType: "S3", MediaType: "Audio" } })[],
                           InterruptFrequencySeconds? }   // "30"; no NextAction; the loop holds the participant
ConnectParticipantWithLexBot { PromptId? | Text? | SSML?, Media?, LexV2Bot: { AliasArn } | LexBot: { Name, Region, Alias },
                           LexSessionAttributes?: { [k]: v }, LexInitializationData?: { InitialMessage },
                           LexTimeoutSeconds?: { Text } }   // Text is "300"; the builder models the V2 form
ShowView                 { ViewResource: { Id, Version? }, InvocationTimeLimitSeconds, ViewData?,
                           SensitiveDataConfiguration?: { HideResponseOn: string[] } }   // "300"; ViewData opaque
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
UpdateContactRecordingAndAnalyticsBehavior {                       // exactly one of the two objects (or the chat form)
  VoiceBehavior?: { VoiceRecordingBehavior: { RecordedParticipants: ("Agent"|"Customer")[],
                                              IVRRecordingBehavior?: "Enabled" | "Disabled" } },
  ScreenRecordingBehavior?: { ScreenRecordedParticipants: ("Agent")[] }
  // VoiceBehavior.VoiceAnalyticsBehavior and ChatBehavior: GenericBlock
}
UpdateFlowLoggingBehavior { FlowLoggingBehavior: "Enabled" | "Disabled" }   // static; no errors
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
another branch; `required` and `mirrors:*` both mean the service refuses the
action without a NextAction, and `none` means the builder writes none, which
on a terminal type is the only form the service accepts and on
`MessageParticipantIteratively` is one of two it accepts, rule 38), `conditions` (`none`, `fixed` with `conditionOperands`,
`dtmf`, `enum`, `numeric`, or `custom`), and `errors` in the builder's order,
each marked `required` (the error-branches rule reports it missing) and
`builder` (the builder's modeled form wires it; the studio offers exactly those
when a drag looks for a branch to create), and optionally `requiredWhenKey`,
a top-level parameter whose presence makes the branch required, which the
rule reports on an action that carries the key, and `when`, the page's
words for when an error exists at all, which nothing reads. A type whose page lists no errors
has an empty list, and the studio renders no error handle for it. `waits`
marks an action that holds the participant until something outside the flow
moves them on, so a flow may end in it with nothing wired; terminal-blocks
treats such an action as an end.

Constraints use `exactlyOne` when one of the keys must be present,
`atMostOne` when the keys are alternatives for one role (a queue or an agent
queue) and any may be absent, and `neverBoth` when two independent settings
merely conflict (a priority or a time adjustment). A second implementation
treats the last two the same way; the distinction records what the page said.

A `list` parameter's `of` is its element shape and a `map`'s `of` its value
shape when that is not a string. `textBodies` names the paths whose string
is billed prompt text (prompt-length-3000), `announces` the paths whose
non-blank value means the participant hears something, and
`recordingEnabler` the list whose non-empty value turns recording on
(recording-consent-before-record reads both).

A parameter marked `dynamic` also accepts a single JSONPath identifier where
its page says "fully static or fully dynamic"; the kind describes the static
form, and the schema accepts either. On an `integer` or `integerString`, `min` and `max` bound the value; on a
`list` or `map` they bound the entry count, and a `map` may carry `keys`, the keys its page
allows.

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
the 49 recorded on 2026-08-31) and the builder models 35 of them. Everything
not in the modeled set above parses to a GenericBlock and round-trips
verbatim. That is what makes a small modeled set survivable. The
`conformance/roundtrip/unknown-actions` fixture holds only unmodeled types
(with tokens inside their parameters) so passthrough is exercised by the
conformance suite; the demo flow carried an unmodeled action for that purpose
until 2026-09-11, when its logging block was modeled (rule 36).
