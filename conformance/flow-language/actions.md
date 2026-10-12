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
| `Transitions` | `NextAction`, `Errors: [{ErrorType, NextAction}]`, `Conditions: [{NextAction, Condition}]`. Terminal actions use `{}` and the service refuses a `NextAction` on them. The builder writes one on every other modeled type but `MessageParticipantIteratively`; every such type probed was refused without one, and the rest are assumed to be (rule 38). |

`Condition` is `{ Operator, Operands }`. Operators: `Equals`, `TextStartsWith`,
`TextEndsWith`, `TextContains`, `NumberGreaterThan`, `NumberGreaterOrEqualTo`,
`NumberLessThan`, `NumberLessOrEqualTo`. Conditions nest no more than five deep
and a single Condition holds no more than 50 sub-Conditions.

## Action categories

https://docs.aws.amazon.com/connect/latest/devguide/flow-language-concepts.html

Contact actions need a contact. Participant actions need a participant. Flow
control actions have no side effects. Interactions have side effects but need
neither a contact nor a participant.

Those four are the Developer Guide's category pages, and the catalog's first
four categories list exactly what each page lists. A fifth, `other`, holds
the Types no category page lists (added 2026-10-05): an Administrator Guide
block page names them, or only a console export does. Its `doc` is the
admin guide's block list,
https://docs.aws.amazon.com/connect/latest/adminguide/contact-block-definitions.html,
and each entry's own `doc` and `source` say where that Type is documented
(see "Machine-readable form"). The category says nothing about what the
action needs at run time; the Developer Guide has not classified these.

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
| Resume contact | `ResumeContact` | contact | [doc](https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactresumecontact.html) |
| Hold customer or agent | `UpdatePreviousContactParticipantState` | contact | [doc](https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatepreviouscontactparticipantstate.html) |
| Start media streaming, Stop media streaming | `UpdateContactMediaStreamingBehavior` | contact | [doc](https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactmediastreamingbehavior.html) |
| Set recording, analytics and processing behavior (Set message processor) | `UpdateContactMediaProcessing` | contact | [doc](https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactmediaprocessing.html) |
| Create task | `CreateTask` | contact | [doc](https://docs.aws.amazon.com/connect/latest/devguide/createtask.html) |
| Connect assistant (formerly Amazon Q in Connect) | `CreateWisdomSession` | contact | [doc](https://docs.aws.amazon.com/connect/latest/devguide/createwisdomsession.html) |
| Customer profiles (Associate contact to profile) | `AssociateContactToCustomerProfile` | interaction | [doc](https://docs.aws.amazon.com/connect/latest/devguide/interactions-associatecontacttocustomerprofile.html) |
| Customer profiles (Create profile) | `CreateCustomerProfile` | interaction | [doc](https://docs.aws.amazon.com/connect/latest/devguide/interactions-createcustomerprofile.html) |
| Customer profiles (Update profile) | `UpdateCustomerProfile` | interaction | [doc](https://docs.aws.amazon.com/connect/latest/devguide/interactions-updatecustomerprofile.html) |
| Customer profiles (Get profile) | `GetCustomerProfile` | interaction | [doc](https://docs.aws.amazon.com/connect/latest/devguide/interactions-getcustomerprofile.html) |
| Customer profiles (Get profile object) | `GetCustomerProfileObject` | interaction | [doc](https://docs.aws.amazon.com/connect/latest/devguide/interactions-getcustomerprofileobject.html) |
| Customer profiles (Get calculated attributes) | `GetCalculatedAttributesForCustomerProfile` | interaction | [doc](https://docs.aws.amazon.com/connect/latest/devguide/interactions-getcalculatedattributesforcustomerprofile.html) |
| Cases (Create case) | `CreateCase` | contact | [doc](https://docs.aws.amazon.com/connect/latest/devguide/createcase.html) |
| Cases (Get case) | `GetCase` | contact | [doc](https://docs.aws.amazon.com/connect/latest/devguide/getcase.html) |
| Cases (Update case) | `UpdateCase` | contact | [doc](https://docs.aws.amazon.com/connect/latest/devguide/updatecase.html) |
| Set routing criteria | `UpdateRoutingCriteria` | flow control | [doc](https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-updateroutingcriteria.html) |

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
| `UpdateContactMediaProcessing` | `ChatProcessor.LambdaProcessorARN` | `lambda` (static: a token, never a JSONPath) |
| `CreateTask` | `ContactFlowId` | `flow` |
| `CreateTask` | `TaskTemplateId` | `tasktemplate` (static: a token, never a JSONPath) |
| `CreateWisdomSession` | `WisdomAssistantArn` | `assistant` |
| `CreateCase` | `CaseTemplateId` | `casetemplate` |
| `CreateCase` | `CaseRequestFields.*~` (every key) | `casefield` (a system field id stays literal; docs/adr/0008) |
| `GetCase` | `CaseRequestFields.*~` (every key) | `casefield` (as `CreateCase`'s) |
| `GetCase` | `CaseResponseFields[]` (every item) | `casefield` (a system field id stays literal) |
| `UpdateCase` | `CaseRequestFields.*~` (every key) | `casefield` (as `CreateCase`'s) |
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
    `NoMatchingError`, and the builder emits that order on the menu form.
    `NextAction` is required; on the menu form the builder mirrors it to the
    `NoMatchingCondition` target, the way `CheckHoursOfOperation` mirrors
    its out-of-hours path. On the stored form (`StoreInput` `"True"`) the
    builder writes `NextAction` as the success path and the catch-all as the
    only branch, the shape of the service's sample secure input flows (rule
    39), with `InvalidPhoneNumber` before the catch-all when
    `PhoneNumberValidation` is set: the console's convention of the
    catch-all last, as on `TransferContactToQueue`, not an order read from
    an export, which no record here holds.
14. `GetParticipantInput.InputValidation` is "required if and only if StoreInput
    is True" and holds `PhoneNumberValidation` or `CustomValidation`, never
    both. `InputEncryption` "May only be specified if CustomValidation is
    provided". `DTMFConfiguration.InputTerminationSequence` is up to five
    digits and `InterdigitTimeLimitSeconds` "must be a valid integer between 1
    and 20 seconds". The builder models the DTMF menu form (`StoreInput`
    `"False"`, no `InputValidation`) and, since 2026-10-05 (tasks/C04), the
    stored form (`StoreInput` `"True"` with either validation; `CountryCode`
    is "If the number format is "Local", this must be defined", and the
    builder refuses a `Local` number without one). A block carrying
    `InputEncryption`, `DTMFConfiguration` or `Media` round-trips as a
    GenericBlock. `MaximumLength` is "A number" on the page and a decimal
    string in what the service holds (rule 39); the catalog records it as
    `integerString`, as it does `InputTimeLimitSeconds`.
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
    as a GenericBlock. The channel half of the restriction is the catalog's
    `channels: ["CHAT"]` (2026-10-05), which `channel-restricted-action`
    reports as a warning wherever a `Wait` appears; nothing recorded shows
    what the service does with a voice contact that reaches one.
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
    The channel sentence is the catalog's `channels: ["CHAT"]` (2026-10-05),
    which `channel-restricted-action` reports as a warning wherever a
    `ShowView` appears; the live checks of 2026-09-15 created the block in a
    contact flow, which says nothing about the channel a contact brings.
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

Two modeled pages restrict by channel instead of, or as well as, by flow type:
`Wait` (rule 22) and `ShowView` (rule 34), both "only ... the chat channel".
Since 2026-10-12 the contact-state types carry channels too (rule 41), and
so does `CreateWisdomSession` (rule 42).
The catalog records that as `channels` and `channel-restricted-action` (added
2026-10-05) reports it, at severity warning: a document does not record which
channels its flow serves, since that is the contact's to decide, so the rule
cannot tell a chat-only inbound flow from a voice one. Since D01 an unmodeled
entry may carry `channels` too, so a page's restriction is recorded when it
is read rather than when the type is modeled.

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
    The probes' inputs were not kept. `Compare` is not among the refused
    types, although the catalog then wrote it no `NextAction` and the
    service refuses it without one (rule 38), so its probe presumably
    carried one; the record does not show which.
    Two refusals were the fixtures' parameters, not the catalog: the
    `contact-data` fixture's `UpdateContactData` (Voice ID fields on an
    instance without Voice ID) and the `contact-routing` fixture's first
    `CreateCallbackContact` both came back "Invalid Action type", and each
    type was accepted with minimal parameters. A `Wait` with the
    `flow-control` fixture's `Events` and conditions was refused ("Invalid
    Action property value") and stays as the page describes it until a
    console export shows the shape.
38. `NextAction` sweeps (2026-09-30, a development instance, us-west-2).
    The first sweep (19:12 to 19:16 UTC) called `CreateContactFlow` and
    deleted each accepted flow at once; a recheck at 19:20 also read accepted
    flows back with `DescribeContactFlow`, and the sample flows were read at
    19:24 with `DescribeContactFlow`. A second sweep (20:30 to 20:32 UTC)
    covered the non-terminal modeled types the first left out, the same way,
    each accepted flow or module deleted at once and its deletion confirmed
    by a `ResourceNotFoundException` from the matching describe call. The
    sweep's own summary notes a listing at 20:32:42 that found no probe flow
    or module left, but that listing's raw output was not kept. A later
    listing, kept, found none either: `ListContactFlows` at 20:43:22 and
    `ListContactFlowModules` at 20:43:23 returned 30 flows and 2 modules on
    the development instance, none named `hh-probe-*`. Rule 37 removed error
    branches one at a time and never `NextAction`, and nothing recorded
    shows a `Compare` without one accepted before this. Rule 37 does not
    list `Compare` among the types refused on 2026-09-29, which implies its
    probe carried a `NextAction` the catalog did not ask for; that probe's
    inputs were not kept, so the record cannot settle it. That the gap is
    long-standing rather than a service change is an inference (the sample
    flows all carry one, and nothing in the record shows the service
    accepting a `Compare` without one), not something observed.
    - `Compare` without `NextAction` is refused ("Action is missing
      required property. Path: Actions[0].Transitions.NextAction",
      `InvalidContactFlowException`) in a contact flow (19:12 UTC) and a
      customer queue flow (19:13 and 19:20), and mid-flow in a customer
      whisper flow ("Path: Actions[1].Transitions.NextAction", 19:20). The
      `compare-only` roundtrip fixture as it stood was refused the same way
      (19:20) and accepted once it carried `"NextAction": "greet-standard"`,
      its `NoMatchingCondition` target (19:20).
    - The service accepted every target tried: the `NoMatchingCondition`
      target, a condition's target, or an action neither branch names (19:12 to
      19:13, and again at 19:20). `DescribeContactFlow` on the 19:20
      recheck returned the `NextAction` as sent, for the
      `NoMatchingCondition` target, for an action neither branch names, and
      for the `compare-only` fixture's `greet-standard`. A
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
    - Fourteen other non-terminal modeled types were probed in the first
      sweep, and each was refused the same way without `NextAction` (19:12
      to 19:15). What was tried with one differs by type:
      - `DistributeByPercentage`, `CheckHoursOfOperation`,
        `CheckMetricData`, `GetParticipantInput`, `ShowView` and `Loop` were
        accepted both with the builder's mirrored target and with another
        action (an unrelated action for `DistributeByPercentage`, another
        error branch's target for the rest).
      - `MessageParticipant`, `Wait`, `TransferContactToQueue`,
        `DequeueContactAndTransferToQueue`, `TransferToFlow` and
        `CreateCallbackContact` were accepted with `NextAction` set to the
        catch-all's target, the only target tried.
      - `UpdateContactAttributes` and `UpdateFlowLoggingBehavior` were only
        seen refused in the first sweep; the second accepted each with a
        `NextAction` (20:32).
    - The second sweep probed fourteen more, each as the first action of a
      contact flow with minimal parameters (the development instance's own
      queue, flow module, Lambda function and hold flow for references) and
      the builder's error branches (the catalog's required set, plus the
      optional `NoMatchingError` the builder writes on
      `UpdateContactTextToSpeechVoice`) aimed at one action and
      `NextAction`, when present, at another: `InvokeFlowModule`,
      `InvokeLambdaFunction`, `TagContact`, `UntagContact`,
      `UpdateContactCallbackNumber`, `UpdateContactData`,
      `UpdateContactEventHooks`,
      `UpdateContactRecordingAndAnalyticsBehavior`,
      `UpdateContactRecordingBehavior`, `UpdateContactRoutingBehavior`,
      `UpdateContactTargetQueue`, `UpdateContactTextToSpeechVoice`,
      `GetMetricData` and `UpdateFlowAttributes`. Each was refused without
      `NextAction` ("Action is missing required property. Path:
      Actions[0].Transitions.NextAction", `InvalidContactFlowException`) and
      accepted with one (20:30 to 20:31). None was accepted without one, so
      no catalog `next` changed.
    - So 29 of the 31 non-terminal modeled types were seen refused without
      `NextAction`, each only in the flow type it was tried in (a contact
      flow, except `DequeueContactAndTransferToQueue` in a customer queue
      flow and `Compare` in three, above), and `MessageParticipantIteratively`
      was seen accepted either way. `ConnectParticipantWithLexBot` was not
      probed: the development instance has no Lex bot to reference, so no
      legal minimal action could be built. Its catalog `next`
      (`mirrors:error:NoMatchingCondition`) follows the builder, and that the
      service refuses it without one is an unchecked assumption.
    - `MessageParticipantIteratively` in a customer queue flow is accepted
      with and without `NextAction`, with `Errors` and `Conditions` empty
      and with the interrupt condition and catch-all (19:14 to 19:15, and
      again at 19:20), and in a customer hold flow with and without one,
      `Errors` and `Conditions` empty (20:32). Its `none` is the builder's
      choice, matching the console's default flows, which carry none.
    - The terminal types refuse one: `DisconnectParticipant` (contact flow),
      `EndFlowExecution` (customer whisper), `TransferContactToAgent`
      (queue transfer) and `EndFlowModuleExecution` (module) with a
      `NextAction` are each refused ("Action does not support transitions.
      Path: Actions[0]", 19:15 to 19:16); the first three are accepted with
      `Transitions: {}`. The first sweep's module without a `NextAction` was
      refused for its content's missing `Settings` ("JSON field is missing
      or null for field name: settings"). In the second, a module carrying
      `Settings` was accepted with `EndFlowModuleExecution` and
      `Transitions: {}`, and refused with a `NextAction` ("Action does not
      support transitions. Path: Actions[0]",
      `InvalidContactFlowModuleException`, 20:32).
    The `next-action-required` lint rule reports a non-terminal action whose
    catalog `next` is `required` or `mirrors:*` and that carries no
    `NextAction`, on the probed types from the evidence above and on
    `ConnectParticipantWithLexBot` from the catalog alone. It checks
    presence only: where more than one target was tried, the service
    accepted each, and no probe tested a target's effect at run time. No rule
    reports a `NextAction` on a terminal type, which the service refuses;
    that is left unchecked (SPEC.md).
    https://docs.aws.amazon.com/connect/latest/APIReference/API_CreateContactFlow.html
    https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-compare.html
39. Stored-input `GetParticipantInput` as the service holds it (2026-10-05,
    read-only: `DescribeContactFlow` on the sandbox instance, us-west-2, of
    the two sample flows every instance carries, "Sample secure input with
    no agent" and "Sample secure input with agent"). Each holds one
    `GetParticipantInput` with `"StoreInput": "True"`,
    `"InputTimeLimitSeconds": "6"`, a `Text` body,
    `"InputValidation": {"CustomValidation": {"MaximumLength": "20"}}` and
    an `InputEncryption` object, and its transitions are `NextAction` (the
    block that follows on success), `Errors` holding `NoMatchingError`
    alone, and `Conditions` empty. So `MaximumLength`, which the page calls
    "A number", is a decimal string where the service holds it, the spelling
    `InputTimeLimitSeconds` has, and the catalog records it as
    `integerString` (it had said `integer`, from the page). The builder
    writes that shape less `InputEncryption`, and codegen reads it back as
    the typed class; the sample flows themselves, carrying
    `InputEncryption`, stay GenericBlocks. No sample flow carries a
    `PhoneNumberValidation`, so the order of `InvalidPhoneNumber` against
    the catch-all is not observed (rule 13).
    https://docs.aws.amazon.com/connect/latest/APIReference/API_DescribeContactFlow.html
    https://docs.aws.amazon.com/connect/latest/adminguide/sample-secure-input-with-noagent.html

40. Catalog census outside the Developer Guide (2026-10-05, pages read
    that day). Five Types no category page lists are recorded as
    `modeled: false` entries in category `other`, with a `source`. The
    pages were read on 2026-10-05, and each Type was put to the service the
    same day (the create probes, below).
    - `RouteContactToAgent`: "The **Interrupt agent** block is represented
      as the `RouteContactToAgent` action in the Connect Customer Flow
      language." "This block can only be used in a **Customer queue
      flow**." Supported channels: voice, chat, task and email all "Yes".
      Branches Success and Error; "After the **Success** branch is taken,
      the caller remains in the queue flow while the agent decides whether
      to accept or reject the contact." The agent is set manually from the
      user list or dynamically as "User ARN", "User ID" or "Username"; the
      page names no parameter keys.
      https://docs.aws.amazon.com/connect/latest/adminguide/interrupt-agent.html
    - `LoadContactContent`: "You can configure the **Get stored content**
      block by using the Connect Customer admin website or by using the
      `LoadContactContent` in the Connect Customer Flow language." The
      page's Flow language example carries `"ContentType": enum
      "EmailMessage"` and one error, `NoMatchingError`. Contact types:
      voice, chat and task "No", email "Yes". Flow types: inbound, customer
      queue, customer hold, customer whisper, outbound whisper, agent hold,
      agent whisper, transfer to agent, transfer to queue and disconnect.
      "Make sure to Enable email for your Connect Customer instance before
      using this option."
      https://docs.aws.amazon.com/connect/latest/adminguide/get-stored-content.html
    - `AuthenticateParticipant`: "You can configure the **Authenticate
      Customer** block by using the Connect Customer admin website or by
      using the AuthenticateParticipant action in the Connect Customer
      Flow language." The linked action page,
      https://docs.aws.amazon.com/connect/latest/APIReference/participant-actions-authenticateparticipant.html,
      renders only its title (read 2026-10-05). Contact types: chat "Yes";
      voice, task and email "No - **Error** branch". Flow types: inbound
      "Yes", every other listed type "No". Properties: an Amazon Cognito
      user pool and app client, a Customer Profiles default template or
      object type mapping name, and a timeout, "Minimum (default): 3
      minutes", "Maximum: 15 minutes". Branches Success, Timeout, Opted
      out and Error. "The customer authentication capability must be
      enabled for your Connect Customer instance", and "Customer Profiles
      must be enabled".
      https://docs.aws.amazon.com/connect/latest/adminguide/authenticate-customer.html
    - `CheckSegmentMembership`: "You can configure the **Customer
      profiles** block in the admin website or using the
      CheckSegmentMembership action." Properties: "Action: Select check
      segment membership action", "Segment name: Select the segment to
      check." The Customer profiles block page adds, for Check segment
      membership, "A Profile ID is required for this block to function",
      "You must provide a value for segment", set manually or
      dynamically by "the customer segment's identifier", which is the
      "SegmentDefinitionName in the ListSegmentDefinitions operation";
      branches In segment, Not in segment and Error; the block's channels
      are voice, chat, task and email "Yes" and its flow types "All flow
      types". Neither page names a parameter key.
      https://docs.aws.amazon.com/connect/latest/adminguide/journey-flow-block-customer-profiles.html
      https://docs.aws.amazon.com/connect/latest/adminguide/customer-profiles-block.html
    - `TransferParticipantToThirdParty`: no AWS page documents it. The
      API Reference page,
      https://docs.aws.amazon.com/connect/latest/APIReference/participant-actions-transferparticipanttothirdparty.html,
      renders only its title (read 2026-10-05). The Type and its shape
      (`ThirdPartyPhoneNumber`, `ThirdPartyConnectionTimeLimitSeconds`,
      `ContinueFlowExecution`; errors `CallFailed`,
      `ConnectionTimeLimitExceeded`, `NoMatchingError`) come from the
      console export kept as `conformance/roundtrip/unknown-actions`,
      which is the entry's `doc`. The Transfer to phone number block page
      states channels voice "Yes" and chat, task and email "No - Error
      branch"; flow types inbound, customer queue, transfer to agent and
      transfer to queue; branches Success, Call Failed, Timeout and Error;
      and properties Resume flow after disconnect, Send DTMF, Caller ID
      number and Caller ID name, none with a key.
      https://docs.aws.amazon.com/connect/latest/adminguide/transfer-to-phone-number.html
    - The Set Touchtone Buffer Behavior block (read the same day) is not a
      new Type: "The **Set Touchtone Buffer Behavior** block is
      represented as a `GetParticipantInput` action in the Connect
      Customer flow language, using the `EnableDTMFBuffer` parameter."
      Its examples carry `"EnableDTMFBuffer": "true"` alone, and
      `"EnableDTMFBuffer": "false"` with `"StoreInput": "true"` and
      `InputEncryption` (`EncryptionKeyId`, `Key`), each with one error,
      `NoMatchingError`; channels voice "Yes" and chat, task and email
      "No"; flow types inbound, customer queue, outbound whisper, transfer
      to agent and transfer to queue. The catalog records `StoreInput`
      (as `True`/`False`, the capitalisation its own page uses) and
      `InputEncryption` and lacks `EnableDTMFBuffer`; D09 adds it, after
      C04, and settles the `true`/`True` question against the service.
      https://docs.aws.amazon.com/connect/latest/adminguide/set-touchtone-buffer-behavior.html
    - The admin guide's block list (read 2026-10-05) names five blocks
      with no documented Type, listed under "Unmodeled actions"; their
      pages name none either.
      https://docs.aws.amazon.com/connect/latest/adminguide/contact-block-definitions.html
    - The sandbox's 20 default and sample flows, read with
      `DescribeContactFlow` on 2026-10-05 (17:24 UTC, us-west-2), carry
      none of the five Types and none of the console-only blocks, so no
      export was obtained that way.
    - Create probes. One probe input per Type is kept under
      `conformance/flow-language/probes/40/`, each a `CreateContactFlow`
      input with `Content` as JSON rather than a string (the runner
      serializes it), `Status` `PUBLISHED`, the Type as the first action
      aimed at a `DisconnectParticipant`, and placeholders of the form
      `{{INSTANCE_ID}}` for anything the environment supplies (D01's
      `scripts/probe-create.mjs` fills them and deletes what it creates).
      The three Types whose pages name no parameter keys
      (`RouteContactToAgent`, `AuthenticateParticipant`,
      `CheckSegmentMembership`) are probed with `Parameters` empty, so the
      first refusal names the first required property.
    - The five were run on 2026-10-05 (`CreateContactFlow` with
      `--cli-error-format json`, us-east-1, a development instance with
      no Customer Profiles domain, no Cases domain and no Lex bot; flows
      named `hh-probe-40-<Type>`; every accepted flow deleted, with no
      leftovers). The messages, verbatim:
      - `AuthenticateParticipant` (contact flow): refused at 17:34:32Z,
        `InvalidContactFlowException`, with five problems: "Action is
        missing required error. Error: TimeLimitExceeded, Path:
        Actions[0]"; "Invalid Action property value. Path:
        Actions[0].Transitions.Conditions"; "Action is missing required
        property. Path: Actions[0].Parameters.CognitoConfiguration";
        "Action is missing required property. Path:
        Actions[0].Parameters.CustomerProfilesConfiguration"; "Action is
        missing required property. Path:
        Actions[0].Parameters.TimeLimitMinutes". Reading: the Type exists;
        the service names three required parameter keys
        (`CognitoConfiguration`, `CustomerProfilesConfiguration`,
        `TimeLimitMinutes`) and a required `TimeLimitExceeded` branch, and
        expects `Conditions` of a shape the probe's empty list did not
        meet (the page's Opted out branch, presumably; unknown until an
        export).
      - `CheckSegmentMembership` (contact flow): refused at 17:34:34Z,
        `InvalidContactFlowException`, "Invalid Action type. Type:
        CheckSegmentMembership, Path: Actions[0].Type" (twice). Reading:
        either the Type name differs from what the block page says, or the
        instance lacks Customer Profiles; rule 37 saw "Invalid Action type"
        for `UpdateContactData`'s Voice ID fields on an instance without
        Voice ID, so this is not decided. Re-probe on an instance with a
        Customer Profiles domain (D03) before concluding.
      - `LoadContactContent` (contact flow): accepted at 17:34:36Z, with
        `Parameters` `{}` (the kept input carries the page's
        `ContentType`; the run's input was empty). The page says email
        only; the create does not check the channel.
      - `RouteContactToAgent` (customer queue flow): refused at 17:34:40Z,
        `InvalidContactFlowException`, "Invalid Action type. Type:
        RouteContactToAgent, Path: Actions[0].Type" (twice). Reading: the
        same two possibilities as `CheckSegmentMembership` (the name, or a
        feature the instance lacks); not decided.
      - `TransferParticipantToThirdParty` (contact flow): accepted at
        17:34:42Z, consistent with the 2026-09-29 and 2026-09-30 sweeps
        (rules 37 and 38) that created the `unknown-actions` fixture's
        shape.
      So of the five: two accepted, one refused naming its shape, and two
      refused as an unknown Type on that instance. All five stay
      `modeled: false`; the two unknown-Type refusals are recorded here and
      in the census as not decided, not as the service refusing the Type.
      The inputs for `AuthenticateParticipant` are re-authored once an
      export shows the three keys' shapes.
41. Contact state (tasks/D02; the Developer Guide pages read 2026-10-04
    and again 2026-10-12 with the admin guide's block pages). The group's
    types are modeled from their pages. **Probe pending**: the create
    sweep the evidence rule asks for (tasks/README.md, Phase D) has not
    run. On 2026-10-12 the sandbox's AWS credentials had expired, and the
    instance had neither live media streaming nor a Lambda function
    associated as `MESSAGE_PROCESSOR`. Its inputs are kept in
    `probes/41/`, with `PENDING.md` saying what the run needs. Until it
    runs, every required error, `next` and flow-type entry below is the
    pages' reading, and each bullet names the probes that settle it.
    - `ResumeContact` "Resumes a contact from a paused state." "No
      parameters are expected." Results "None."; errors "NoMatchingError -
      if no other Error matches."; Restrictions "None. This action can be
      used everywhere." The catalog records no parameters, the catch-all
      required and wired by the builder, `next` required, and the type
      unrestricted. The admin guide's Resume contact block "Resumes a task
      contact from a paused state", "You can use this block on all flow
      types", and its channel table reads task "Yes" and voice, chat and
      email "No - Error branch"; the action page names no channel, so the
      catalog's `channels: ["TASK"]` is read from the block page, the one
      entry whose channels come from there, and `channel-restricted-action`
      warns wherever the type appears. The configured block has an Error
      branch and the path a resumed task takes, which the class writes as
      `NextAction`. Planned probes: `resume-required` (expected accepted),
      `resume-no-catch-all` and `resume-no-next` (each a removal alone),
      and `resume-module` and `resume-customer-hold` for the page's "used
      everywhere".
      https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactresumecontact.html
      https://docs.aws.amazon.com/connect/latest/adminguide/resume-contact.html
    - `UpdatePreviousContactParticipantState` "is primarily used to prevent
      previous participants on the contact from observing the contact".
      One parameter, `"PreviousContactParticipantState": One of
      ["AgentOnHold", "CustomerOnHold", "OffHold"], which are only
      supported for voice contacts.` Results "None."; errors
      "NoMatchingError - if no other Error matches."; Restrictions "This
      action is supported only in inbound contact flows and transfer
      flows." The admin guide's Hold customer or agent block lists the
      inbound, outbound whisper, transfer to agent and transfer to queue
      flows, routes chat, task and email down its Error branch, names the
      three values Agent on hold ("customer is on the call"), Customer on
      hold ("agent is on the call") and Conference all, and its configured
      block has Success and Error branches. The pages disagree on the
      outbound whisper flow; the catalog follows the action page, as every
      other row does, until the probe settles it (D02 asks that the service
      decide). The catalog records the enum, `channels: ["VOICE"]`, the
      catch-all required, `next` required, and flow types inbound, the two
      transfers and a module. Planned probes: `previous-state-required`,
      `previous-state-no-catch-all`, `previous-state-no-next`, one per
      flow type the two pages name (`-agent-transfer`, `-queue-transfer`,
      `-outbound-whisper`), a module, which the catalog allows and neither
      page names (`-module`), one neither names nor the catalog allows
      (`-customer-queue`), and a
      value outside the enum (`-other-value`, `OnHold`), whose result
      decides whether the 0.3 schema clause may hold the enum (owner
      decision 3).
      https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatepreviouscontactparticipantstate.html
      https://docs.aws.amazon.com/connect/latest/adminguide/hold-customer-agent.html
    - `UpdateContactMediaStreamingBehavior` "Enables or disables contact
      media streaming for a set of participants." `MediaStreamingState`
      "One of "Enabled" or "Disabled". Must be specified statically.";
      `Participants`, "A list of participants to include in the stream if
      enabling the stream, or disable if disabling the stream", each with
      `ParticipantType` ("Currently, only "Customer" is supported. Must be
      defined statically.") and `MediaDirections` ("A list of the
      directions of media to include in the stream - "From" and "To".
      Must be defined statically."); `MediaStreamType` ("Currently, only
      "Audio" is supported. Must be defined statically."). Results
      "None."; errors "NoMatchingError - if no other Error matches.";
      Restrictions "This is supported in contact flows, customer queue
      flows, transfer flows, and whisper flows. It is not supported in hold
      flows." and "This is supported only by the voice channel." The Start
      and Stop media streaming blocks list the same seven flow types,
      voice only, with Success and Error branches; the Stop block "doesn't
      have any properties". Neither page names a module, which the catalog
      allows where a page does not scope an action to modules (the note in
      `actions.ts` above `IN_MODULE`); D02 names "the media streaming module
      case" as one the service decides. The catalog records all three keys
      required on both states (the page shows the same block for each), the
      enums, `channels: ["VOICE"]`, the catch-all required and `next`
      required. The class writes one Customer participant and Audio and
      takes the directions. Planned probes: `stream-required`,
      `stream-no-catch-all`, `stream-no-next`, `stream-stop` (the page's
      shape for Disabled), `stream-stop-bare` (`MediaStreamingState` alone,
      the Stop block's no properties), `stream-module`,
      `stream-customer-hold` (the page excludes it), `stream-agent-whisper`,
      `stream-agent-participant` (a value the page excludes),
      `stream-duplicate-direction` (`From` twice, which the 0.3 schema
      clause does not refuse unless the service does) and
      `stream-from-only`. They need live media streaming enabled on the
      instance (a Kinesis Video Streams prefix, a KMS key and no data
      retention).
      https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactmediastreamingbehavior.html
      https://docs.aws.amazon.com/connect/latest/adminguide/start-media-streaming.html
      https://docs.aws.amazon.com/connect/latest/adminguide/stop-media-streaming.html
    - `UpdateContactMediaProcessing` "Allows customers to configure their
      own Lambda processor, which will be applied to in-flight messages."
      One object, `ChatProcessor`, "Configuration for
      bring-your-own-processor for chat channel": `ProcessingEnabled`
      ("either "True" or "False". Must be set statically."),
      `LambdaProcessorARN` ("The ARN of the Lambda function to process
      chat messages. Must be set statically.") and
      `ChatProcessorSettings.DeliverUnprocessedMessages` ("either "True"
      or "False". Must be set statically. Determines whether to deliver
      messages that fail Lambda processing."). Results "None."; errors
      "NoMatchingError - if no other Error matches. Must always be
      defined." and "ChannelMismatch - if the media channel that initiated
      the contact is not the same as the one defined in the action. As of
      now, only chat is supported in this action."; no Restrictions
      section. The admin guide's Set recording, analytics and processing
      behavior block carries it as the Set message processor action, chat
      "Yes" and email, task and voice "No", "supported for all flow types
      except journey flows", with Success, Error and Channel mismatch
      branches; its Function ARN "should be integrated with custom message
      processing", through `CreateIntegrationAssociation` with the
      `MESSAGE_PROCESSOR` integration type, and its disabled form shows
      the processing switch alone. The catalog records the Lambda as a
      `lambda` reference at `ChatProcessor.LambdaProcessorARN` (static, so
      the schema clause admits a token and not a JSONPath, and
      `no-literal-arn` fails a literal ARN there), `ProcessingEnabled`
      required and the other two optional, `channels: ["CHAT"]`, the type
      unrestricted by flow type, `next` required, the catch-all required
      and `ChannelMismatch` wired by the builder but not required: the page
      requires only the catch-all, and D02 asks that the two be required
      if and only if the service refuses each removed alone. The class
      requires a Lambda when processing is enabled, the console's form.
      Planned probes: `processing-required`, `processing-no-catch-all`,
      `processing-no-channel-mismatch`, `processing-no-next`,
      `processing-unassociated-lambda` (a function the instance has not
      associated, to learn whether the create checks the association),
      `processing-disabled`, `processing-enabled-without-lambda`,
      `processing-lowercase-flag` (a spelling outside the enum),
      `processing-module` and `processing-customer-hold`. They need a
      Lambda function associated as `MESSAGE_PROCESSOR` and one that is
      not.
      https://docs.aws.amazon.com/connect/latest/devguide/contact-actions-updatecontactmediaprocessing.html
      https://docs.aws.amazon.com/connect/latest/adminguide/set-recording-analytics-processing-behavior.html
      https://docs.aws.amazon.com/connect/latest/APIReference/API_CreateIntegrationAssociation.html

42. Tasks and AI agents (tasks/D05; the Developer Guide pages read
    2026-10-04 and again 2026-10-12 with the admin guide's block pages and
    the StartTaskContact API reference). The group's types are modeled from
    their pages. **Probe pending**: the create sweep the evidence rule asks
    for (tasks/README.md, Phase D) has not run. On 2026-10-12 the sandbox's
    AWS credentials had expired, and the instance had no task template.
    Its inputs are kept in `probes/42/`, with `PENDING.md` saying what the
    run needs. No console export of either block has been taken (owner
    decision 8), so nothing under `exports/` records their stored shape
    yet. Until the sweep and an export, every required key, error,
    `next`, spelling and flow-type entry below is the pages' reading, and
    each bullet names the probes that settle it.
    - `CreateTask` "Creates a new task to run an assigned flow." Parameters
      in the page's order: `ContactFlowId` ("A flow ID or flow ARN. Must be
      fully static or a single valid JSONPath identifier"), `Attributes`
      ("[Optional] ... Both the key and value may be defined statically or
      dynamically"), `Name` ("Name of the task that needs to be created.
      This is a string."), `Description` ("[Optional]"), `References`
      ("[Optional] { an Object that holds the references to be set.
      "Type": "Value" ... }"), `DelaySeconds` ("[Optional] ... The integer
      value between 1 and 518400 (6 days). If ScheduledTime is specified,
      this parameter may not be specified."), `ScheduledTime` ("[Optional]
      The date and time at which the task should be created. If
      DelaySeconds is specified, this parameter may not be specified."),
      and `TaskTemplateId` ("[Optional] ID of the task template that will
      be used to create the task. This must be defined statically.").
      Results "None. No conditions are supported."; errors "NoMatchingError
      - if no other Error matches."; Restrictions "This action is supported
      on all channels and in all contact flow types." The admin guide's
      Create task block agrees on channels (voice, chat, task and email
      "Yes") and flow types ("All flows"), offers Create manually and Use
      template ("If the selected template does not include a flow, you
      must specify the flow"), schedules "Using attribute" with "Values for
      date fields ... in Unix timestamp (Epoch seconds)", and has Success
      and Error branches. StartTaskContact, the API the block calls, takes
      `ScheduledTime` as "The timestamp, in Unix Epoch seconds format",
      `References` as a map of Reference objects (`Type`, `Value`) and
      `Name` as required, and says to "include only one of these
      parameters: `ContactFlowID`, `QuickConnectID`, or `TaskTemplateID`
      ... If more than one parameter is specified, or only the
      `TaskTemplateID` is specified but it does not have a flow
      configured, the request returns an error", where the block page
      lets a template and a flow be given together.
      The catalog records `ContactFlowId` as a `flow` reference that is not
      required (the template form may omit it; a reference already admits
      a single JSONPath, so it carries no `dynamic` flag, which the
      vocabulary keeps for scalar kinds), `Name` required, `Description` a
      string, `Attributes` a string map, `References` a `json` value
      because its value shape is unrecorded, `DelaySeconds` an
      `integerString` from 1 to 518400 with `dynamic` (the decimal string
      the console writes for every integer recorded so far, rule 39's
      `MaximumLength` among them), `ScheduledTime` a `stringOrJsonPath`
      whose static format is not recorded, `TaskTemplateId` a `tasktemplate`
      reference that the 0.3 schema clause holds to a token (static), the
      two timing keys `atMostOne`, the type unrestricted and on every
      channel, `next` required and the catch-all required and wired by the
      builder. The schema clause holds the two references' forms and
      nothing else; the bound and the `atMostOne` stay in the catalog until
      the service is seen to refuse them (owner decision 3). The class
      takes a flow, a template or both; the both form follows the admin
      guide against StartTaskContact's one-of clause, is unsettled until
      `task-template-and-flow` runs, and the group fixture's `scheduled`
      task holds it pending that probe. The class writes `DelaySeconds` as a decimal
      string and `ScheduledTime` as a JSONPath only, and writes no
      `References`; codegen leaves a document with `References`, a static
      `ScheduledTime` or a numeric `DelaySeconds` generic. Whether
      `TaskTemplateId` holds an id or an ARN is unsettled: export maps the
      ARN form through D01's inventory and a bare id stays literal.
      Planned probes: `task-required` (expected accepted),
      `task-no-catch-all` and `task-no-next` (each a removal alone),
      `task-no-name` and `task-no-flow` (the two keys the page leaves
      unmarked), `task-template-only` and `task-template-and-flow` (the
      admin guide's two template forms), `task-template-bare-id` and
      `task-flow-bare-id` (id against ARN), `task-template-missing` (a
      template the instance does not have), `task-template-jsonpath`
      (static), `task-flow-jsonpath`, `task-delay-string`,
      `task-delay-number` and `task-delay-out-of-range` (the spelling and
      the bound), `task-delay-and-schedule` (the `atMostOne`, with the
      JSONPath schedule the class writes),
      `task-schedule-epoch-string`, `task-schedule-epoch-number`,
      `task-schedule-iso` and `task-schedule-jsonpath` (the format),
      `task-references-object` and `task-references-flat` (the value
      shape), and `task-module` and `task-customer-hold` ("all contact flow
      types").
      https://docs.aws.amazon.com/connect/latest/devguide/createtask.html
      https://docs.aws.amazon.com/connect/latest/adminguide/create-task-block.html
      https://docs.aws.amazon.com/connect/latest/APIReference/API_StartTaskContact.html
    - `CreateWisdomSession` "Associates a Wisdom domain to a contact that is
      being executed in a Flow to enable real-time recommendations on the
      current contact." One parameter, `WisdomAssistantArn`, "ARN for the
      Wisdom Assistant. May be specified statically or dynamically."
      Results "None. No conditions are supported."; errors
      "NoMatchingError - if no other Error matches."; Restrictions "This
      action is only supported on the voice channel. This action can be
      used in all contact flow types." The admin guide's Connect assistant
      block disagrees on both: its channel table reads voice, chat, task
      and email "Yes" (and "Conversational analytics is not required to
      use AI agents with chats"), and it lists five flow types, inbound,
      customer queue, outbound whisper, transfer to agent and transfer to
      queue. Its Config tab also names "the Orchestration AI agent to use
      for Agent Assistance", whose key no export has recorded, and its
      configured block has Success and Error branches. The catalog follows
      the action page, as every earlier row does where the two disagree:
      `channels: ["VOICE"]`, so `channel-restricted-action` warns wherever
      the type appears, and the type unrestricted by flow type. It records
      `WisdomAssistantArn` as a required `assistant` reference (the ARN is
      a `wisdom` ARN, which export maps through D01's inventory and
      `materialize` resolves back; a JSONPath stays allowed, as a reference
      admits one), `next` required and the catch-all required and wired by
      the builder. The schema clause holds the reference's form and nothing
      else. Codegen leaves a block carrying any other key generic, so an
      Orchestration AI agent setting round-trips verbatim. Planned probes:
      `wisdom-required` (expected accepted; run before an assistant is
      linked, it is also the "no assistant linked" case),
      `wisdom-no-catch-all` and `wisdom-no-next` (each a removal alone),
      `wisdom-jsonpath`, `wisdom-unlinked-assistant` (an assistant the
      instance has not linked), `wisdom-customer-queue` (a flow type both
      pages allow, the control), and `wisdom-customer-hold`,
      `wisdom-agent-hold`, `wisdom-customer-whisper`,
      `wisdom-agent-whisper` and `wisdom-module` (the flow types the action
      page allows and the admin guide does not list). The channel cannot
      be probed at create; a voice-only `channels` stays until a live chat
      contact is seen to take the success branch, and that observation is
      recorded here when the showcase makes it.
      https://docs.aws.amazon.com/connect/latest/devguide/createwisdomsession.html
      https://docs.aws.amazon.com/connect/latest/adminguide/connect-assistant-block.html
      https://docs.aws.amazon.com/connect/latest/adminguide/ai-agent-initial-setup.html

43. Customer Profiles (tasks/D03; the Developer Guide pages read 2026-10-04
    and again 2026-10-12 with the admin guide's Customer profiles block
    page). The group's types are modeled from their pages and from flows AWS
    publishes. **Probe pending**: the create sweep the evidence rule asks
    for (tasks/README.md, Phase D) has not run. On 2026-10-12 the sandbox's
    AWS credentials had expired, and the Customer Profiles domain the sweep
    needs is created by a sandbox root that had not been applied. Its inputs
    are kept in `probes/43/`, with `PENDING.md` saying what the run needs.
    No console export of the block has been taken (owner decision 8), so
    nothing under `exports/` records its stored shape. In its place the
    shape is read from contact flows AWS publishes in its sample
    repositories, listed below at the commits read on 2026-10-12: every one
    writes `ProfileRequestData` as an object of strings and
    `ProfileResponseData` as a list of names, empty when no response field
    is chosen, where the pages write `{ "FirstName", ... }`, which is not
    JSON. The catalog follows the published flows where they and the pages
    differ, and records the pages' form here. Until the sweep and an export,
    every required key, error, `next`, spelling and flow-type entry below is
    that reading, and each bullet names the probes that settle it.
    The action pages have no Restrictions section, and the admin guide's
    block lists "All flow types" and voice, chat, task and email each
    "Yes", so every type here is unrestricted and carries no `channels`.
    No parameter is a reference: the Customer Profiles domain is the
    instance's integration, not a parameter (tasks/D03), and a profile id
    is a run-time value read from `$.Customer.ProfileId`. The admin guide's
    Error branch is taken when Customer Profiles is not enabled, when a
    request value is over 255 characters, and when the API is throttled or
    unavailable, each a run-time condition.
    https://docs.aws.amazon.com/connect/latest/adminguide/customer-profiles-block.html
    https://docs.aws.amazon.com/connect/latest/adminguide/enable-customer-profiles.html
    The published flows:
    https://github.com/aws-samples/amazon-connect-step-by-step-guides-module-library/tree/1d0cf558d024600e6aa05aea3d7d93ffd425b547
    (`modules/Cases/SBSGuides_Modules_Cases.json`,
    `examples/Cards/SBSGuides_Example_Cards_Guide.json`,
    `examples/AgentWorkspace/SBSGuides_Example_AgentWorkspace_Handler.json`,
    `examples/AgentWorkspace/SBSGuides_Example_AgentWorkspace_Guide.json`,
    `examples/BackendIntegration/SBSGuides_Example_Backend_Guide.json`),
    https://github.com/aws-solutions-library-samples/guidance-for-integrating-amazon-connect-with-sap-sales-and-service-cloud-on-aws/blob/bc606393c101d2b185f214a62d2791e77c50f37b/contact-flow/2-ChatFlow-Manual.json,
    https://github.com/aws-samples/sample-agentic-connect-experience/blob/678c66b870392baaa3e25d32fe5037d17cc6e155/assets/connect/contact_flow.json,
    https://github.com/aws-samples/sample-amazon-connect-speed-dial/blob/e87f5e2304ab744d0b499bd97bb69e4353067d2a/templates/cdk-app/flows/get-customer-profile.json,
    https://github.com/aws-samples/sample-aicc-builder-for-amazon-connect-ai-agent/blob/e7d1ab65d505cbdfb0d22e1d9f47c68f963a65b1/knowledge-base-docs/contact-flow/_reference-console-export-all-blocks.json,
    and
    https://github.com/aws-samples/sample-ai-enhanced-email-workflow/blob/90ef631c2452394bbb2ad6220bae34c93224ce30/contact-flows/EmailSuggestedResponseConfidenceScore.json.
    - `AssociateContactToCustomerProfile` "Associate a contact to a
      customer profile." "A ProfileId and ContactId must be present." in
      `ProfileRequestData`; `ProfileResponseData` "None."; Results "None.
      Conditions are not supported."; errors "NoMatchingError - if no other
      Error matches." The admin guide's block reads the profile id from a
      preceding Get profile and the contact id from attributes, and has
      Success and Error branches. No published flow carries the type. The
      catalog records `ProfileRequestData` as a required object of the two
      ids, each a `stringOrJsonPath` and required, and `ProfileResponseData`
      as an optional list of strings with no names; the class writes the
      empty list the console writes for the other five types with no
      response field, and codegen leaves any other response data generic.
      The catch-all is required and wired by the builder, `next` required.
      Planned probes: `assoc-required-set-alone` (the catalog's required
      set alone, without the optional response list; expected accepted),
      `assoc-required` (the class's form; run before the domain is linked,
      it is also the probe of an instance with no Profiles domain), `assoc-no-catch-all` and `assoc-no-next` (each a
      removal alone), `assoc-static-profile` (the admin guide's manual
      Profile ID), `assoc-no-contact-id`, `assoc-no-response-data` and
      `assoc-response-object` (the page's "None." read as absent and as
      braces), and `assoc-module` and `assoc-customer-hold` (all flow
      types).
      https://docs.aws.amazon.com/connect/latest/devguide/interactions-associatecontacttocustomerprofile.html
    - `CreateCustomerProfile` "Create a customer profile."
      `ProfileRequestData` "All of these fields are optional." and lists 55
      fields (`FirstName` to `BillingState`) and `"Attributes.x"`;
      `ProfileResponseData` lists the same and "Newly created profile ID is
      persisted under the Customer -> ProfileID attribute +
      $.Customer.ProfileId"; Results "None. Conditions are not supported.
      If an error does not occur, the response's attributes are available
      dynamically under the $.Customer path"; errors "NoMatchingError - if
      no other Error matches." The published flows create profiles with
      `FirstName`, `LastName`, `PhoneNumber` and `EmailAddress`, static or a
      JSONPath, and store `[]` or a list of names; the admin guide's example
      creates one with a phone number and a custom attribute `Language` and
      stores `Attributes.Language`. The catalog records
      `ProfileRequestData` as an optional `map` whose `keys` are the 55
      fields and whose `keyPatterns` is `^Attributes\.[^.]+$` (a custom
      attribute with no further dot), and `ProfileResponseData` as an
      optional `list` of strings with the same `keys` and `keyPatterns`
      (the vocabulary's first use on a list, below). The class writes both
      containers, empty when nothing is chosen, and refuses a name outside
      the lists, so codegen leaves such a block generic until
      `create-unknown-key` shows whether the service enforces the list. The
      catch-all is required and wired by the builder, `next` required.
      Planned probes: `create-required-set-alone` (the catalog's required
      set alone: no `Parameters` at all, since both containers are
      optional; it settles both `required: false`), `create-required`
      (one field, the class's form; expected accepted),
      `create-no-catch-all` and `create-no-next` (each a removal alone),
      `create-named-and-custom` (the fixture's shape),
      `create-unknown-key` and `create-unknown-response-name` (whether the
      lists are enforced at create), `create-dotted-custom-key` (the
      pattern's dot), `create-empty-request`, `create-no-request-data`,
      `create-no-response-data` and `create-response-object` (the
      containers, and the page's braces), and `create-module` and
      `create-customer-hold`.
      https://docs.aws.amazon.com/connect/latest/devguide/interactions-createcustomerprofile.html
    - `UpdateCustomerProfile` "Update a customer profile that was
      previously created or retrieved in the flow." Its page lists the same
      fields, response, results and errors as `CreateCustomerProfile`'s, and
      no profile id: the action updates the profile at
      `$.Customer.ProfileId` (the admin guide: "Before using an Update
      profile block, use a Get profile block"). No published flow carries
      the type. The catalog records it as `CreateCustomerProfile` is
      recorded, and the class writes it the same way; a `ProfileId` key,
      which the page does not list, keeps a block generic. Planned probes:
      `update-required-set-alone` (the catalog's required set alone: no
      `Parameters` at all; it settles both containers' `required: false`),
      `update-required` (the class's form; expected accepted),
      `update-no-catch-all` and
      `update-no-next` (each a removal alone), `update-unknown-key`,
      `update-profile-id-key`, `update-no-response-data` and
      `update-module`.
      https://docs.aws.amazon.com/connect/latest/devguide/interactions-updatecustomerprofile.html
    - `GetCustomerProfile` "Retrieve a customer profile based any search
      identifier, up to five total." "At least one search identifier must
      be present." `ProfileRequestData` "Requires either IdentiferName and
      IdentifierValue, or SearchCriteria": `"IdentifierName"`,
      `"IdentiferValue"` (so spelled in the example; the prose misspells
      the name key instead), or `"SearchCriteria"`, a list of
      `IdentifierName` and `IdentifierValue`, with `"LogicalOperator": AND
      or OR` "Required when using SearchCriteria"; `ProfileResponseData` as
      `CreateCustomerProfile`'s; errors "MultipleFoundError - if multiple
      profiles were found for the associated profile search key.",
      "NoneFoundError - if no profiles were found for the associated
      profile search key." and the catch-all. The admin guide's block asks
      for "at least one search identifier, up to five total" and an
      operator "If multiple search identifiers are provided", and names
      Success, Error, Multiple Found and None Found branches. The
      published flows hold eleven blocks of the type: every one spells
      `IdentifierName`
      and `IdentifierValue`; six search by one identifier (`_phone` or
      `_email`), four by a named profile field (`{ "PhoneNumber": ... }`,
      AWS's step-by-step guide flows), which is neither of the page's
      forms, and one holds `{}` (an unconfigured block in a console export
      of every block); none uses `SearchCriteria`; and every one wires
      `NoMatchingError`, `MultipleFoundError` and `NoneFoundError` in that
      order. The catalog records `ProfileRequestData` as a required object
      of `IdentifierName` (a `string`), `IdentifierValue` (a
      `stringOrJsonPath`), `SearchCriteria` (a `list` of one to five
      objects of the same two, each required) and `LogicalOperator` (an
      `enum` of `AND` and `OR`), with the first `groups` constraint:
      `exactlyOne` of the pair and of `SearchCriteria` with
      `LogicalOperator`, so half of either group, both, or neither breaks
      it. The 0.3 schema clause does not hold it: the named-field form in
      AWS's own flows would fail it, and no probe has shown the service
      refusing either (owner decision 3); the class refuses both and
      neither, and codegen leaves the named-field form generic. The three
      errors are in the published flows' order, all wired by the builder;
      only the catch-all is required, since the page marks neither of the
      others "Must always be defined" (as `ChannelMismatch` on rule 41's
      message processor), although every published flow wires both.
      Planned probes: `get-required-set-alone` (the catalog's required
      set alone: one identifier, no response list, and the catch-all
      without either lookup branch; it is the probe that settles whether
      `MultipleFoundError` and `NoneFoundError` are optional, and whether
      the response list is), `get-identifier` (the published flows' form,
      every branch wired; expected accepted),
      `get-no-catch-all`, `get-no-multiple-found`, `get-no-none-found` and
      `get-no-next` (each a removal alone), `get-identifer-spelling` (the
      page's spelling, as `UnTagContact`'s was put to the service, rule
      28), `get-search-and` and `get-search-or`, `get-both-forms` and
      `get-neither-form` (the group alternative given both and neither),
      `get-named-key` (the step-by-step flows' form),
      `get-identifier-name-only`, `get-search-without-operator` and
      `get-search-one-without-operator` (half a group, and the admin
      guide's reading of a single criterion), `get-operator-lowercase`,
      `get-six-criteria`, and `get-module` and `get-customer-hold`.
      https://docs.aws.amazon.com/connect/latest/devguide/interactions-getcustomerprofile.html
    - `GetCustomerProfileObject` "Retrieve a customer profile object of the
      desired type, based on recency or any search identifier." "A
      ProfileId and ObjectType must be present. Either UseLatest, or
      IdentifierName and IdentifierValue must be present."; `UseLatest`
      "true / false"; `ProfileResponseData` lists 76 Asset, Order and Case
      fields and `"AssetAttributes.x"`, `"OrderAttributes.x"`,
      `"CaseAttributes.x"` and `"ObjectAttributes.x"`, and the asset, order
      and case ids "always persisted" under `$.Customer.Asset.AssetId` and
      its kin; errors "NoneFoundError - if no profiles were found for the
      associated profile search key." and the catch-all. The admin guide's
      block takes the profile id manually or from an attribute, asks for
      the object type, and offers "Use latest profile object" or "Use
      search identifier", with Success and Error branches. No published
      flow carries the type. The catalog records `ProfileRequestData` as a
      required object of `ProfileId` (a `stringOrJsonPath`) and
      `ObjectType` (a `string`), both required, `IdentifierName`,
      `IdentifierValue` and `UseLatest` (an `enum` of `"true"` and
      `"false"`, the page's words as the strings Connect's flags are
      written in the published flows, `LinkContactToCase` among them), with
      `exactlyOne` over the groups `[UseLatest]` and the pair; and
      `ProfileResponseData` as a list of strings whose `keys` are the 76
      fields and whose `keyPatterns` are the four `*Attributes` forms. The
      class writes `UseLatest` as `"true"` only; a block with `"false"`, the
      JSON boolean or another spelling stays generic until
      `object-latest-boolean`, `object-latest-capitalized` and
      `object-latest-false` are put to the service. The schema clause holds
      the containers only. The two errors are wired by the builder,
      catch-all first as `GetCustomerProfile`'s are written; only the
      catch-all is required. Planned probes:
      `object-required-set-alone` (the catalog's required set alone: no
      response list and the catch-all without `NoneFoundError`),
      `object-latest` (the class's form; expected accepted), `object-no-catch-all`, `object-no-none-found` and
      `object-no-next` (each a removal alone), `object-identifier`,
      `object-both-forms` and `object-neither-form` (the group alternative
      given both and neither), `object-no-object-type` and
      `object-no-profile-id`, `object-unknown-type` (a type the domain does
      not have), `object-response-names`, and `object-module`.
      https://docs.aws.amazon.com/connect/latest/devguide/interactions-getcustomerprofileobject.html
    - `GetCalculatedAttributesForCustomerProfile` "Retrieve calculated
      attributes for a customer profile." "A ProfileId must be present.";
      `ProfileResponseData` lists `"CalculatedAttributes._average_hold_time"`,
      `"CalculatedAttributes._frequent_caller"` and
      `"CalculatedAttributes.x"`; errors "NoneFoundError - if no profiles
      were found for the associated profile search key." and the
      catch-all. The admin guide's block: "The options under Response
      fields are the Calculated Attribute definitions defined for your
      Customer Profiles domain", a threshold makes a value "True/False",
      the branches are Success, Error and None Found, and the instance
      needs `ListCalculatedAttributeDefinitions` and
      `GetCalculatedAttributeForProfile` on the Connect service-linked
      role. No AWS sample carries the type; one third-party repository
      does
      (https://github.com/photosphere/connect-cdk-voice-channel/blob/deed32be0add277319054519bf1c8bb2d28e0cc4/examples/flows/screenpop_message_flow/screenpop_message_flow.json,
      read 2026-10-12, not an AWS publication): a `ProfileId` read from
      `$.Customer.ProfileId`, five predefined names
      (`CalculatedAttributes._last_agent_id`, `._last_channel`,
      `._new_customer`, `._most_frequent_channel` and `._frequent_caller`),
      and the catch-all before `NoneFoundError`. The catalog records
      `ProfileRequestData` as a required object of `ProfileId` (a
      `stringOrJsonPath`, required) and `ProfileResponseData` as a list of
      strings whose `keys` are the page's two names and whose
      `keyPatterns` is `^CalculatedAttributes\.[^.]+$`, which admits the
      other predefined names and a domain's own; the names are the
      domain's strings, not references (tasks/D03: no new ref type). The
      two errors are wired by the builder in that repository's order; only
      the catch-all is required. Planned probes:
      `calc-required-set-alone` (the catalog's required set alone: no
      response list and the catch-all without `NoneFoundError`),
      `calc-required` (the class's form; expected accepted), `calc-no-catch-all`, `calc-no-none-found` and
      `calc-no-next` (each a removal alone), `calc-custom-name` (the
      domain's own definition), `calc-unknown-name` (a name the domain does
      not define), `calc-other-name` (a name without the prefix),
      `calc-no-profile-id`, and `calc-module`.
      https://docs.aws.amazon.com/connect/latest/devguide/interactions-getcalculatedattributesforcustomerprofile.html

44. Cases (tasks/D06; the Developer Guide pages read 2026-10-04 and again
    2026-10-12 with the admin guide's Cases block and case fields pages).
    The group's types are modeled from their pages and from flows AWS
    publishes. **Probe pending**: the create sweep the evidence rule asks
    for (tasks/README.md, Phase D) has not run. On 2026-10-12 the sandbox's
    AWS credentials had expired, and the Cases domain the sweep needs, with
    its template and two fields, is created by a sandbox root that had not
    been applied. Its inputs are kept in `probes/44/`, with `PENDING.md`
    saying what the run needs. No console export of the block has been
    taken in this repository (owner decision 8). In its place the stored
    shape is read from flows AWS publishes, listed below at the commits read
    on 2026-10-12, one of them a console export of every block. Until the
    sweep, every required key, error, `next`, spelling and flow-type entry
    below is that reading, and each bullet names the probes that settle it.
    Each action page says "None. This can be used in any type of flow and
    any channel.", and the admin guide's block lists "All flows" and voice,
    chat, task and email each "Yes", so every type here is unrestricted and
    carries no `channels`. What the flows show, beyond the pages:
    `LinkContactToCase` and `GetLastUpdatedCase` are the strings `"true"`
    and `"false"`; `CaseTemplateId` is a template's id, never its ARN (a
    UUID in the step-by-step guide flows, and a CloudFormation parameter
    described as "ID of the case template" in the Japan starter kit); every
    `CaseRequestFields` key and `CaseResponseFields` item they write is a
    system field id (`assigned_queue`, `assigned_user`, `case_id`,
    `case_reason`, `created_datetime`, `customer_id`, `reference_number`,
    `status`, `summary`, `title`), which the admin guide's case fields page
    lists as the same on every domain, while a domain's own field is "a
    UUID (unique ID)"; values are static, JSONPath, or text holding a
    JSONPath (`"Current intent: $.Attributes.intent"`); `customer_id` is
    read from `$.Customer.ProfileARN` (the admin guide: "the full customer
    profile ARN"); and a linking block wires `ContactNotLinked` first, a
    block that does not link never wires it. The console's export of every
    block writes `ContactToLink: "Current"` beside `LinkContactToCase:
    "true"`, the admin guide's choice of "Current contact" or "Related
    contact", which no page names and the older flows omit. Field ids are
    per domain, so a domain's own field is a `casefield` reference standing
    as the whole key or item (docs/adr/0008-case-field-ids.md); a system
    field id stays literal, and the catalog lists them as `keys`
    (`CASE_SYSTEM_FIELDS` in `packages/core/src/actions.ts`). A literal
    domain field id or template id, which the flows above write and the
    service is expected to accept, still validates and round-trips, and
    codegen leaves such a block generic; no lint reports it unless this
    sweep shows the service validating ids at create (docs/adr/0008).
    https://docs.aws.amazon.com/connect/latest/adminguide/cases-block.html
    https://docs.aws.amazon.com/connect/latest/adminguide/case-fields.html
    The published flows:
    https://github.com/aws-samples/amazon-connect-step-by-step-guides-module-library/tree/1d0cf558d024600e6aa05aea3d7d93ffd425b547
    (`modules/Cases/SBSGuides_Modules_Cases.json`,
    `examples/AgentWorkspace/SBSGuides_Example_AgentWorkspace_Handler.json`,
    `examples/AgentWorkspace/SBSGuides_Example_AgentWorkspace_Guide.json`),
    https://github.com/aws-samples/sample-ai-enhanced-email-workflow/blob/90ef631c2452394bbb2ad6220bae34c93224ce30/contact-flows/EmailSuggestedResponseConfidenceScore.json,
    https://github.com/aws-samples/sample-amazon-connect-customer-starter-kit-japan/blob/8fbd4e22cb056a6b5ced2caffce98a30aa40e751/amazon-connect-project/cfn_template/ac-pkg-phase3-contactflow-stack.yaml,
    and the console export of every block,
    https://github.com/aws-samples/sample-aicc-builder-for-amazon-connect-ai-agent/blob/e7d1ab65d505cbdfb0d22e1d9f47c68f963a65b1/knowledge-base-docs/contact-flow/_reference-console-export-all-blocks.json.
    - `CreateCase` "Creates a new case using an existing case template."
      `"LinkContactToCase": "true" or "false"`, `"CaseTemplateId": A
      templateId aligned with the existing case templateName`,
      `"CaseRequestFields": An optional map of case fields to be set. Keys
      should be fields from Cases domain. Values can be static or
      dynamic.`; Results "None."; errors "ContactNotLinked - If you specify
      to link the contact to case, then this error branch will appear."
      and "NoMatchingError - An error was encountered while trying to find
      the case." The admin guide's block: "You must provide a case
      template", the template's required fields must be given, "You must
      specify the customer to create a case", and the branches are
      Success, Contact not linked and Error. The flows above hold four
      blocks of the type, each with a template id and `customer_id`,
      `status` and `title`, and the console export one with an empty
      template. The catalog records `LinkContactToCase` as a required
      `enum` of `"true"` and `"false"`, `ContactToLink` as an optional
      `enum` of `"Current"` and `"Related"`, `CaseTemplateId` as a required
      `casetemplate` reference, and `CaseRequestFields` as an optional
      `map` whose `keys` are the system field ids and whose keys are a
      `casefield` reference path (`CaseRequestFields.*~`).
      `ContactNotLinked` is the first `requiredWhenValue` in the catalog:
      required when `LinkContactToCase` is `"true"` and not otherwise, and
      wired by the builder on exactly those blocks, before the catch-all,
      as the flows wire it (`conformance/lint/error-branches/`
      `fail-create-case-linking-without-contact-not-linked`,
      `pass-create-case-not-linking`, `pass-create-case-link-from-attribute`).
      The catch-all is required and `next` required. The class writes
      `ContactToLink` only when linking, and a block carrying it without
      linking stays generic. Planned probes: `create-required` (the
      catalog's required set alone, with no request fields, no
      `ContactToLink` and no `ContactNotLinked`; expected accepted, which
      also settles `CaseRequestFields`' `required: false`; run before the
      Cases domain is associated, it is also the probe of an instance with
      no Cases domain), `create-linking`
      (expected accepted), `create-linking-no-contact-not-linked` and
      `create-not-linking-contact-not-linked` (`ContactNotLinked` removed
      with linking `"true"`, and wired with `"false"`),
      `create-no-catch-all` and `create-no-next` (each a removal alone),
      `create-contact-to-link`, `create-contact-to-link-related` and
      `create-contact-to-link-not-linking` (the export's key and its second
      value), `create-fields` (the domain's text and single-select fields
      by id beside system fields), `create-missing-field` and
      `create-missing-template` (whether the create validates either id),
      `create-template-arn` and `create-field-arn` (an ARN in place of the
      id), `create-template-jsonpath`, `create-no-template`,
      `create-no-link-flag` (the required `LinkContactToCase` removed
      alone), `create-link-boolean`, `create-read-only-field` (system fields
      the admin guide says Connect fills, `case_id` and `created_datetime`,
      set by the flow: the catalog lists every system id as a key and
      refuses none), and `create-module` and `create-customer-hold` (all
      flow types).
      https://docs.aws.amazon.com/connect/latest/devguide/createcase.html
    - `GetCase` "Searches all existing cases with the provided customer ID.
      Add request fields to filter by case fields. Specify the case fields
      to be returned in the response to persist in the context."
      `LinkContactToCase`, `"GetLastUpdatedCase": "true" or "false", You
      can specify to get only the last updated case for any search
      criteria.`, `"CustomerId": "Customer's Id", Search all cases for this
      customer Id.`, `CaseRequestFields` ("An optional map of cases request
      fields") and `"CaseResponseFields": [ ] An optional list of field
      names that should be persisted in the case namespace.`; Results
      "None."; errors "NoMatchingError", "ContactNotLinked", "MultipleFound
      - Multiple cases are found with the search criteria." and "NoneFound
      - No cases are found with the search criteria.", spelled without the
      `Error` suffix the Customer Profiles lookups carry. The admin guide's
      block: "You must provide at least one search criteria. Otherwise this
      block will take the Error branch.", "You can specify up to 10
      Response fields on a Cases block. If you specify more than 10 and
      then publish the flow, the following error is displayed: Invalid or
      missing parameter data", and a second action, Get case id, which
      takes a "Contact to search" (current, initial, task, previous or
      related contact) under a key no page or flow records, so a block in
      that form stays generic. The flows above hold four blocks of the
      type, none with `CustomerId`: each searches by `CaseRequestFields`
      (`customer_id`, `case_id`, `title`, `status`), stores system fields,
      and wires `ContactNotLinked` (when linking), `MultipleFound`,
      `NoneFound` and the catch-all, in that order. The catalog records
      `LinkContactToCase` and `ContactToLink` as `CreateCase`'s,
      `GetLastUpdatedCase` as a required `enum` of `"true"` and `"false"`,
      `CustomerId` as an optional `stringOrJsonPath`, `CaseRequestFields`
      as `CreateCase`'s, and `CaseResponseFields` as an optional `list` of
      strings with `max` 10 whose `keys` are the system field ids and whose
      items are a `casefield` reference path (`CaseResponseFields[]`). The
      four errors are wired by the builder in the flows' order;
      `ContactNotLinked` is required when linking, the catch-all always,
      and neither lookup, which the page does not mark "Must always be
      defined" (rule 43's reading of the Customer Profiles lookups), although
      every flow wires both (`pass-get-case-catch-all-only`,
      `fail-get-case-linking-without-contact-not-linked`). The bound of 10
      is in the catalog and the class, not the schema, until
      `get-eleven-response-fields` shows the service refusing an eleventh.
      Planned probes: `get-required-set-alone` (the catalog's required set
      alone, with no search, no response fields and neither lookup branch;
      expected accepted, which also settles each optional parameter and
      branch, and the admin guide's "at least one search criteria" as a
      run-time rule), `get-required` and `get-all-branches` (expected
      accepted), `get-linking` (expected accepted),
      `get-linking-no-contact-not-linked` and
      `get-not-linking-contact-not-linked`, `get-no-catch-all`,
      `get-no-multiple-found`, `get-no-none-found` and `get-no-next` (each a
      removal alone), `get-response-fields`, `get-eleven-response-fields`
      and `get-missing-response-field`, `get-customer-id` (the page's
      parameter, which no flow writes), `get-no-link-flag` and
      `get-no-last-updated-flag` (each required enum removed alone),
      `get-repeated-response-field` (the class refuses a repeat, which no
      page states), `get-reference-id-field` (the system field the admin
      guide lists as "coming later in 2026"), `get-contact-to-link`, `get-error-suffix`
      (the Customer Profiles spellings), and `get-module` and
      `get-customer-hold`.
      https://docs.aws.amazon.com/connect/latest/devguide/getcase.html
    - `UpdateCase` "Updates an existing case by providing the case's id and
      the fields that should be updated." `LinkContactToCase`, `"CaseId":
      the unique identifier of the case` and `"CaseRequestFields": An
      optional map of case fields to be updated`; Results "None."; errors
      `ContactNotLinked` and the catch-all, as `CreateCase`'s. The admin
      guide's block: "Add a Get case block before an Update case", "Case Id
      is the unique identifier of the case and the only field you can
      provide here. Other fields will not work and produce errors.", "You
      must provide an update to at least one Request field. Otherwise, this
      block takes the Error branch.", and the branches Success, Contact not
      linked and Error. The flows above hold four blocks of the type, each
      linking, with `CaseId` read from `$.Case.case_id` or an attribute and
      system fields to update (`status`, `summary`, `assigned_user`,
      `case_reason`), each wiring `ContactNotLinked` and the catch-all in
      that order. The catalog records `LinkContactToCase` and
      `ContactToLink` as `CreateCase`'s, `CaseId` as a required
      `stringOrJsonPath`, and `CaseRequestFields` as `CreateCase`'s, its
      keys a `casefield` reference path; the transitions are `CreateCase`'s
      (`fail-update-case-linking-without-contact-not-linked`). Planned
      probes: `update-required-set-alone` (the catalog's required set
      alone, with no request fields; expected accepted, which also settles
      `CaseRequestFields`' `required: false` and the admin guide's "at
      least one Request field" as a run-time rule), `update-required` and
      `update-linking` (expected accepted),
      `update-linking-no-contact-not-linked` and
      `update-not-linking-contact-not-linked`, `update-no-catch-all` and
      `update-no-next` (each a removal alone), `update-no-link-flag` and
      `update-no-case-id` (each required key removed alone),
      `update-domain-fields` and `update-missing-field`,
      `update-contact-to-link`, and `update-module` and
      `update-customer-hold`.
      https://docs.aws.amazon.com/connect/latest/devguide/updatecase.html

45. Routing criteria (tasks/D07; the Developer Guide page read 2026-10-04
    and again 2026-10-12 with the admin guide's Set routing criteria block
    page). The type is modeled from its page, with the expression a `json`
    value (docs/adr/0009). **Probe pending**: the create sweep the evidence
    rule asks for (tasks/README.md, Phase D) has not run. On 2026-10-12 the
    sandbox's AWS credentials had expired, and the predefined attribute the
    sweep names is created by a sandbox root that had not been applied. Its
    inputs are kept in `probes/45/`, with `PENDING.md` saying what the run
    needs. No console export of the block has been taken (owner decision
    8). Until the sweep and an export, the Type spelling and every required
    key, error, `next`, spelling, limit and flow-type entry below is the
    pages' reading, and each bullet names the probes that settle it.
    - `UpdateRoutingCriteria` "Sets the routing criteria for the contact."
      The page's parameter object: `RoutingCriteria` "Required.
      RoutingCriteria is a JSON object."; `Steps` "Required. List of
      routing steps. ... May be set statically or dynamically"; each step's
      `Expression` "Required. An object to specify the expression of a
      routing step. It is a tagged union", holding an `AttributeCondition`
      (`Name` and `Value` each "a string and has length constraints between
      1-64", `ProficiencyLevel` "a float value. Valid values are: 1.0, 2.0,
      3.0, 4.0 and 5.0", `ComparisonOperator` "Valid values:
      NumberGreaterOrEqualTo") or an `AndExpression` ("List of routing
      expressions (attribute conditions) which will be AND-ed together");
      and each step's `Expiry`, "An object to specify the expiration of a
      routing step", whose `DurationInSeconds` "Can be set only
      statically". Results "None. No conditions are supported."; errors
      "NoMatchingError - if no other Error matches."; Restrictions "This
      action is supported on all channels and in only in Inbound flow,
      Customer Queue flow, Transfer to Agent flow, and Transfer to Queue
      flow types." The admin guide's block agrees on flow types and
      channels (voice, chat, task and email "Yes") and adds: "Up to eight
      attributes using the `AND` condition", "Up to three OR conditions in
      a routing step ... You can only use OR when setting attributes
      dynamically", a `NOT` operator and a proficiency range likewise only
      dynamically, "OR expressions must be at the top level. You can place
      an AND inside an OR, but not the other way around", "Each step of the
      criteria must have a timed expiration timer. The last step of the
      criteria can have a timed or non-expiring expiration timer", and a
      requirement's value may be a JSONPath. Its Lambda examples write
      `OrExpression`, `NotAttributeCondition` with `ComparisonOperator`
      `"Range"` and a `Range` object, `ProficiencyLevel` as the JSON
      integers `4`, `2` and `1`, and `DurationInSeconds` as the number `30`.
    - The Type spelling is in doubt, and it is the first thing the sweep
      settles. An AWS sample
      (https://github.com/aws-samples/sample-apj-sup-sa/blob/1f164c387f4ebc504920e368e664882b6916ea02/connect/multi-tenant-agentic-contact-center/connect-routing/lib/flows.ts,
      read 2026-10-12) writes `Type: "UpdateContactRoutingCriteria"` with
      the comment "Flow-language type is UpdateContactRoutingCriteria (the
      dev guide page is titled "UpdateRoutingCriteria", which Connect
      rejects as an action type)", and writes the whole of
      `RoutingCriteria` as a JSONPath (`"$.External.RoutingCriteria"`). A
      third-party library
      (https://github.com/mgaffigan/pulumi-amazon-connect/blob/05a26ef747118fe685f4ffadfb99ab3d5afd2af2/docs/wire-format-checks.md,
      read 2026-10-12, not an AWS publication) lists `UpdateRoutingCriteria`
      among `CreateContactFlow` rejections ("the action type is
      **`UpdateContactRoutingCriteria`**; the documented name is rejected as
      unknown"), beside `UntagContact` and `Wait`'s `TimeLimitSeconds`,
      which rules 28 and 22 record the same way; its emitter writes
      `ProficiencyLevel` as the string `"4.0"` and `DurationInSeconds` as
      the string `"30"`. Neither is a create recorded here, so the catalog
      keeps the page's Type until `routing-required-set-alone` and
      `routing-contact-type-set-alone` run; if the first is refused as an
      unknown type and the second accepted, the type is renamed in the
      catalog, the builder and every fixture in one commit, and the page's
      spelling is recorded here as refused. That rename also touches D00's
      census (rule 40): the Developer Guide page names a Type the service
      does not take, so the 61-Type denominator and its Developer Guide
      row change with it. Rule 40 is not changed before that evidence.
    - The catalog records `RoutingCriteria` as a required `object` whose
      `Steps` is a required `list` of objects with `dynamic` (a JSONPath
      for the whole list, the first `dynamic` on a list); each step's
      `Expression` a required `json` value and its `Expiry` an optional
      object of `DurationInSeconds`, an `integerString` (the decimal string
      the console writes for every other seconds field recorded so far,
      and the third-party emitter's spelling); the type restricted to
      `CONTACT_FLOW`, `CUSTOMER_QUEUE`, `AGENT_TRANSFER`, `QUEUE_TRANSFER`
      and `MODULE` (a module by the note above `IN_MODULE` in
      `actions.ts`), on every channel, `next` required and the catch-all
      required and wired by the builder. The whole of `RoutingCriteria` as
      a JSONPath has no catalog form (an `object` is never `dynamic`); a
      document holding it is generic in every view, and the schema clause
      admits it. The `Name` and `Value` bounds, the five levels, the one
      operator and the admin guide's limits (eight in an AND, three in an
      OR, OR at the top, an expiry on every step but the last) are not in
      the catalog or the schema, which hold JSON types only, recursively
      through `$defs` (owner decision 3): they are the builder's checks,
      in `attributeCondition`, `and`, `or` and the class, until the sweep
      shows the service enforcing them. The builder writes `ProficiencyLevel`
      as a JSON integer, the one spelling a parsed document keeps
      (docs/adr/0009), and accepts a `Value` that is a JSONPath without the
      length bound. Codegen inverts only what the helpers write and leaves
      a string level, a numeric expiry, a `NotAttributeCondition` or a
      `Range` generic.
    - Planned probes: `routing-required-set-alone` (the catalog's
      required set alone: one step, its `Expression` alone, the accepted-set
      probe) and `routing-required` (the class's form; expected accepted);
      `routing-no-catch-all` and `routing-no-next` (each a removal alone);
      `routing-contact-type` and `routing-contact-type-set-alone` (the Type
      spelling); `routing-or` (a static OR), `routing-or-inside-and`,
      `routing-and-nine` and `routing-or-four` (the admin guide's nesting
      and limits); `routing-level-0-5`, `routing-level-2-5`,
      `routing-level-5-5` and `routing-level-string` (the levels and their
      spelling; every other probe sends the integer spelling, which is the
      integer probe); `routing-unknown-attribute` (a name the instance has
      not predefined) and `routing-unknown-value`; `routing-name-65`,
      `routing-value-65` and `routing-value-jsonpath` (the bounds);
      `routing-operator-range` and `routing-not-condition` (the admin
      guide's dynamic-only forms, written statically);
      `routing-steps-jsonpath` and `routing-criteria-jsonpath` (the two
      dynamic forms); `routing-empty-steps` and `routing-no-expression`
      (the page's Required marks); `routing-expiry-number`,
      `routing-expiry-jsonpath` and `routing-first-step-no-expiry` (the
      expiry's spelling, its static rule and the admin guide's
      every-step-but-the-last); and `routing-customer-queue`,
      `routing-agent-transfer`, `routing-queue-transfer` and
      `routing-module` (allowed) against `routing-customer-whisper` and
      `routing-customer-hold` (forbidden). The step without an `Expiry`
      is the one optional container, and `routing-required-set-alone`
      leaves it out.
      https://docs.aws.amazon.com/connect/latest/devguide/flow-control-actions-updateroutingcriteria.html
      https://docs.aws.amazon.com/connect/latest/adminguide/set-routing-criteria.html

## Per-action parameter shapes

Recorded verbatim from the pages linked above.

```
MessageParticipant       { PromptId? | Text? | SSML?, Media?: { Uri, SourceType: "S3", MediaType: "Audio" } }
GetParticipantInput      { PromptId? | Text? | SSML?, Media?: { Uri, SourceType: "S3", MediaType: "Audio" },
                           InputTimeLimitSeconds,     // static integer > 0; the console writes "5"
                           StoreInput?: "True" | "False",
                           InputValidation?: { PhoneNumberValidation?: { NumberFormat: "Local" | "E164", CountryCode? }
                                             | CustomValidation?: { MaximumLength } },   // the service holds "20" (rule 39)
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
ResumeContact            {}                         // no parameters; channels TASK (the admin guide)
UpdatePreviousContactParticipantState { PreviousContactParticipantState: "AgentOnHold" | "CustomerOnHold" | "OffHold" }   // voice only
UpdateContactMediaStreamingBehavior { MediaStreamingState: "Enabled" | "Disabled",
                           Participants: { ParticipantType: "Customer", MediaDirections: ("From" | "To")[] }[],
                           MediaStreamType: "Audio" }   // each static; voice only
UpdateContactMediaProcessing { ChatProcessor: { ProcessingEnabled: "True" | "False", LambdaProcessorARN?: lambda,
                           ChatProcessorSettings?: { DeliverUnprocessedMessages: "True" | "False" } } }   // static; chat only
CreateTask               { ContactFlowId?: flow, Attributes?: { [key]: string }, Name: string,
                           Description?: string, References?: json, DelaySeconds?: "1".."518400",
                           ScheduledTime?: string, TaskTemplateId?: tasktemplate }   // delay or schedule, not both
CreateWisdomSession      { WisdomAssistantArn: assistant }   // static or JSONPath; voice only (the action page)
AssociateContactToCustomerProfile { ProfileRequestData: { ProfileId, ContactId },   // each static or a JSONPath
                           ProfileResponseData: [] }   // the page's "None."; written as the console's empty list
CreateCustomerProfile    { ProfileRequestData: { [field | Attributes.<name>]: string },   // static or a JSONPath
                           ProfileResponseData: (field | Attributes.<name>)[] }   // field: the page's 55 names
UpdateCustomerProfile    { ProfileRequestData, ProfileResponseData }   // as CreateCustomerProfile; no profile id
GetCustomerProfile       { ProfileRequestData: { IdentifierName, IdentifierValue }   // the page's example: IdentiferValue
                                             | { SearchCriteria: { IdentifierName, IdentifierValue }[],   // 1 to 5
                                                 LogicalOperator: "AND" | "OR" },
                           ProfileResponseData: (field | Attributes.<name>)[] }
GetCustomerProfileObject { ProfileRequestData: { ProfileId, ObjectType,   // each static; ProfileId may be a JSONPath
                                                 UseLatest: "true" | IdentifierName, IdentifierValue },
                           ProfileResponseData: (Asset*, Order*, Case* field | *Attributes.<name>)[] }   // 76 names, 4 patterns
GetCalculatedAttributesForCustomerProfile { ProfileRequestData: { ProfileId },   // static or a JSONPath
                           ProfileResponseData: ("CalculatedAttributes._average_hold_time"
                                                 | "CalculatedAttributes._frequent_caller"
                                                 | CalculatedAttributes.<name>)[] }
CreateCase               { LinkContactToCase: "true" | "false", ContactToLink?: "Current" | "Related",   // the export's key, linking only
                           CaseTemplateId: casetemplate,
                           CaseRequestFields?: { [system field id | casefield]: string } }   // static or a JSONPath
GetCase                  { LinkContactToCase, ContactToLink?, GetLastUpdatedCase: "true" | "false",
                           CustomerId?,   // static or a JSONPath
                           CaseRequestFields?: { [system field id | casefield]: string },   // the search
                           CaseResponseFields?: (system field id | casefield)[] }   // at most 10, stored under $.Case
UpdateCase               { LinkContactToCase, ContactToLink?, CaseId,   // static or a JSONPath ($.Case.case_id)
                           CaseRequestFields?: { [system field id | casefield]: string } }
UpdateRoutingCriteria    { RoutingCriteria: { Steps: { Expression: RoutingExpression,   // json; required
                                                       Expiry?: { DurationInSeconds } }[]   // decimal string, static
                                                     | JSONPath } }
RoutingExpression        { AttributeCondition: { Name, Value,   // 1 to 64 each; Value may be a JSONPath
                                                 ProficiencyLevel: 1 | 2 | 3 | 4 | 5,
                                                 ComparisonOperator: "NumberGreaterOrEqualTo" } }
                         | { AndExpression: AttributeCondition[] }   // 1 to 8
                         | { OrExpression: (AttributeCondition | AndExpression)[] }   // 1 to 3, top only
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
legal in, the channels it is restricted to where its page names any, the
fields that play text, and the errors and conditions it carries. Recorded
2026-09-11. It is the file a second implementation
generates its schema from, and `packages/core/src/catalog.test.ts` holds
every table in `packages/core/src/actions.ts` to it, so the prose here, the
data, and the code cannot disagree. Add a type to both files in the same
commit; the test says which one is behind.

Each modeled entry's `transitions` records what the action's Transitions may
hold: `next` (`required`, `none`, or `mirrors:error:<type>` and
`mirrors:condition:<operand>` when the builder writes NextAction as a copy of
another branch; `required` and `mirrors:*` both mean the builder writes a
NextAction, and every such type probed was refused without one, while for
`ConnectParticipantWithLexBot`, the one rule 38 lists as unprobed, the
refusal is assumed, not checked;
`none` means the builder writes none, which on a terminal type is the only
form the service accepts and on `MessageParticipantIteratively` is one of
two it accepts, rule 38), `conditions` (`none`, `fixed` with `conditionOperands`,
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

`channels` lists the channels an action's page says it supports, in the
service's Channel vocabulary (`VOICE`, `CHAT`, `TASK`, `EMAIL`), when the
page names any: `Wait` and `ShowView`, both `["CHAT"]` (added 2026-10-05,
from the Restrictions sections quoted in rules 22 and 34), and
`ResumeContact`, `["TASK"]`, from its admin guide block page's channel
table because its action page names none, and
`UpdatePreviousContactParticipantState` and
`UpdateContactMediaStreamingBehavior`, each `["VOICE"]`, and
`UpdateContactMediaProcessing`, `["CHAT"]`, read from its ChannelMismatch
error since its page has no Restrictions section (rule 41), and
`CreateWisdomSession`, `["VOICE"]`, from its Restrictions section where the
admin guide's block allows every channel (rule 42). Absent means the
page states no channel restriction; it is never an empty list.
`channel-restricted-action` reads it, and `packages/core/src/actions.ts`
carries the same table as `CHANNEL_RESTRICTIONS`, cited, which
`catalog.test.ts` holds to the catalog.

`source` (added 2026-10-05) says where an entry's `doc` comes from. Absent
means `devguide`: the Type is on one of the four Developer Guide category
pages, and its `doc` is its Developer Guide page. `adminguide` is a Type no
category page lists whose Administrator Guide block page names it in prose
or in a Flow language example; its `doc` is that block page.
`console-export` is a Type no AWS page documents, known from a console
export kept under `conformance/`; its `doc` is the export's repository path
(or the API Reference page, once one renders). Every entry in the four
Developer Guide categories has no `source`, every entry in `other` has one
that is not `devguide`, and `catalog.test.ts` holds each `doc` to the prefix
its source allows (the export's path must exist). `catalog.ts` types it as
`CatalogSource`. The five `other` entries, their sources and pages are the
census under "Unmodeled actions".

A parameter marked `dynamic` also accepts a single JSONPath identifier where
its page says "fully static or fully dynamic"; the kind describes the static
form, and the schema accepts either. On an `integer` or `integerString`, `min` and `max` bound the value; on a
`list` or `map` they bound the entry count, and a `map` may carry `keys`, the keys its page
allows, and `keyPatterns`, anchored regular expressions a key may match
beside them (`^Attributes\.[^.]+$` for the `Attributes.x` keys the Customer
Profiles pages allow); a map with neither admits any key. Since 2026-10-12
(tasks/D03) a `list` whose `of` is a `string` may carry the same two, naming
the strings it may hold: a Customer Profiles action's `ProfileResponseData`
is a list of the field names it stores, from the list its page gives and of
the form `Attributes.<name>` (rule 43). `catalog.test.ts` refuses either on
any other kind, with a mutation for each. Nothing reads them to refuse a
document: the builder holds a name to them and codegen leaves a block whose
names fall outside them generic, until a probe shows the service enforcing
the list. `dynamic` sits on a
scalar kind, or since FlowDoc 0.3 on a `list` whose page lets a JSONPath
stand for the whole list (`UpdateRoutingCriteria.RoutingCriteria.Steps`,
docs/adr/0009); never on an `object`, `map` or `json`, whose provider
attribute has no JSONPath form.

Vocabulary added for Phase D on 2026-10-05 (tasks/D01), before any entry
uses it, each item held by a `catalog.test.ts` mutation that fails on a
malformed use:

- `channels` may sit on an unmodeled entry as on a modeled one, so a page's
  restriction is recorded when it is read rather than when the type is
  modeled; `channel-restricted-action` reads it either way.
- An error's `requiredWhenValue`, `{ "key": <parameter>, "equals": <value> }`,
  makes the branch required when the parameter holds that static value
  (`CreateCase`'s `ContactNotLinked` when `LinkContactToCase` is `"true"`),
  where `requiredWhenKey` keys off presence alone. The value must be one the
  parameter's enum allows when it is an enum, and the error is not also
  `required` or `requiredWhenKey`. `requiredErrorsFor` reads it, so
  error-branches and the provider's port report the branch missing on
  exactly those actions; a JSONPath in the parameter requires nothing, since
  the value is decided at run time. Since 2026-10-12 (tasks/D06)
  `builderErrorsFor` reads it as well: a branch carrying it is the
  builder's, and the studio's to offer, only on an action holding the value,
  so `CreateCase` wires `ContactNotLinked` on a linking block and on no
  other. It is not a `shapes` entry with `forbids`: conditional-shape would
  then report the branch on a block that does not link, which no page and
  no probe says the service refuses (rule 44).
- A constraint's `groups`, in place of `keys`: alternatives that are each
  several keys (`GetCustomerProfile`'s `IdentifierName` and `IdentifierValue`
  pair against `SearchCriteria`; `GetCustomerProfileObject`'s `UseLatest`
  against the pair). A group is present when every key in it is, a group
  with some of its keys present is a violation whatever the rule, and the
  rule then reads over groups as it reads over keys. Chosen over `shapes`
  because a shape keys off a parameter's value and these alternatives key
  off presence, which is what `constraints` already express; a constraint
  carries `keys` or `groups`, never both, with at least two alternatives,
  and no key in two groups. `constraintViolations` in `catalog.ts` is the
  one reading of both forms.
- The path form `A.*~`, every key of the map at `A` (the trailing `~` is
  JSONPath Plus's property-name operator), so a reference-bearing map key
  can be named. No entry uses it yet: D06's `CreateCase` is to name
  `CaseRequestFields.*~` with the `casefield` type (docs/adr/0008). `readPath` returns a hit per key whose
  value is the key string, at the path `A.<key>~`, so export, lint and the
  studio read keys through the table they read values through. A map whose
  keys are a reference path may also carry `keys` (since tasks/D06): a key
  there is one of them, literal (`CaseRequestFields`' Cases system field
  ids, which every domain shares), or a token of the path's type.

Attribute names are the mechanical `snake_case` of the Flow language key
(`packages/core/src/hcl-names.ts`): `PromptId` is `prompt_id`,
`LambdaFunctionARN` is `lambda_function_arn`, `LexV2Bot` is `lex_v2_bot`.
Reference-bearing fields are named by dotted paths (`packages/core/src/paths.ts`),
so a field inside an object (`LexV2Bot.AliasArn`), inside every element of a
list (`Messages[].PromptId`), as every value of a map (`EventHooks.*`), or as
every key of one (`CaseRequestFields.*~`) can be named where a flat key could
not.

## Unmodeled actions

The denominator for "every action" (tasks/D00, census of 2026-10-05) is
61 Types: 56 the Developer Guide's four category pages list (27 contact, 6
participant, 15 flow control, 8 interactions; recounted 2026-09-11, up from
the 49 recorded on 2026-08-31, and rechecked 2026-10-05, matching), plus 4
documented only in the Administrator Guide, plus 1 seen only in a console
export. Beside it, not in it, 5 console blocks have no documented Type at
all and enter the count only when an export names one. The builder models
51 of the 61. Everything not in the modeled set above parses to a
GenericBlock and round-trips verbatim. That is what makes a small modeled
set survivable. The `conformance/roundtrip/unknown-actions` fixture holds
only unmodeled types (with tokens inside their parameters) so passthrough
is exercised by the conformance suite; the demo flow carried an unmodeled
action for that purpose until 2026-09-11, when its logging block was
modeled (rule 36). On 2026-10-12, when D02 modeled `ResumeContact` and
`UpdatePreviousContactParticipantState`, the fixture took
`LoadContactContent` (the admin guide's Flow language example: `ContentType`
`EmailMessage` and the catch-all) and `StartVoiceIdStream` (no parameters)
in their places, beside `CreateTask`, which keeps the flow and queue tokens,
and `TransferParticipantToThirdParty`. Every action is in the console's
shape, the last included: no unmodeled type is terminal, so
`StartVoiceIdStream` takes its `NextAction` and catch-all (the shape the
D08 probe `start-stream` sent) back to `load-content`, a loop rather than an
end. On 2026-10-12, when D05 modeled `CreateTask`, the flow token moved to
`StartOutboundChatContact`'s `ContactFlowArn` (in the page's shape, with its
source number a JSONPath so the document needs no 0.3 token) and the queue
token to an `Attributes.preferredQueue` value of `UpdateCustomerProfile`'s
`ProfileRequestData`, two types D04 and D03 will model; each of those tasks
re-authors the fixture again (owner decision 10). On 2026-10-12, when D03
modeled `UpdateCustomerProfile`, the queue token moved to a `summary` value
in `UpdateCase`'s `CaseRequestFields` (D06's table: `LinkContactToCase`
`"false"`, `CaseId` a JSONPath, and the system field id `summary`, a key the
Cases system defines on every domain and AWS's published flows write
literally, so the document needs no `casefield` token); D06 models that
type and re-authors the fixture again. On 2026-10-12, when D06 modeled
`UpdateCase`, the queue token moved to the `Value` of an attribute
condition in `UpdateRoutingCriteria`'s first routing step (D07's page
shape, with the condition's `Name` and `Value`, the two string keys, and
neither the float `ProficiencyLevel` nor `Expiry`, whose stored forms are
unrecorded); D07 models that type and re-authors the fixture again. On
2026-10-12, when D07 modeled `UpdateRoutingCriteria`, the queue token moved
to the `UserToUserInformation` of `CompleteOutboundCall`'s `VoiceConnector`
form (D04's table: `VoiceConnectorType` `ChimeConnector`, the connector's
ARN, `FromUser` and `ToUser` each a JSONPath, so the document needs no
`voiceconnector` reference, which owner decision 4 does not add). Owner
decision 4 also keeps a block carrying `VoiceConnector` generic once D04
models the type's caller-id form, so the token stays in passthrough until a
task takes that form up.

| Part of the count       | Types | Modeled | Where                                                       |
| ----------------------- | ----- | ------- | ----------------------------------------------------------- |
| Developer Guide pages   | 56    | 51      | the four category lists in `catalog.json`                   |
| Administrator Guide     | 4     | 0       | `catalog.json` category `other`, `source` `adminguide`      |
| Console export          | 1     | 0       | `catalog.json` category `other`, `source` `console-export`  |
| Denominator             | 61    | 51      |                                                             |
| Console-only blocks     | 5     |         | awaiting an export (owner decision 8); listed below, no Type |

Types outside the Developer Guide (rule 40 has the page quotes and the
2026-10-05 create probes; each entry is `modeled: false` until its D09 task.
Of the five, the service accepted `LoadContactContent` and
`TransferParticipantToThirdParty`, refused `AuthenticateParticipant` naming
its required keys and branch, and refused `CheckSegmentMembership` and
`RouteContactToAgent` as "Invalid Action type" on an instance without
Customer Profiles, which rule 40 records as not decided):

| Type                              | Console block                           | Source           | Flow types and channels the page states                                                                                                                                                          | Ref types its parameters need                                                                                                                                                                                                            |
| --------------------------------- | --------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RouteContactToAgent`             | Interrupt agent                         | `adminguide`     | customer queue flow only; voice, chat, task, email                                                                                                                                               | an agent (user ARN, id or username; a new `user` ref type, name for D01 to settle); the parameter key is unknown until an export                                                                                                           |
| `LoadContactContent`              | Get stored content                      | `adminguide`     | inbound, customer queue, customer hold, customer whisper, outbound whisper, agent hold, agent whisper, transfer to agent, transfer to queue, disconnect; email only                                | none (`ContentType` is an enum, `EmailMessage`)                                                                                                                                                                                          |
| `AuthenticateParticipant`         | Authenticate Customer                   | `adminguide`     | inbound flow only; chat only (voice, task and email take the error branch)                                                                                                                       | a Cognito user pool and app client, and a Customer Profiles object type mapping name: none is a Connect resource, so whether D01 adds ref types or leaves them literal is its call; the parameter keys are unknown until an export         |
| `CheckSegmentMembership`          | Customer profiles, Check segment membership | `adminguide` | all flow types; voice, chat, task, email (the Customer profiles block's tables)                                                                                                                   | a Customer Profiles segment (`SegmentDefinitionName`) and a profile id, each static or dynamic; a `segment` ref type is likely but the parameter keys are unknown until an export, so D01 carries the risk of a later bump                 |
| `TransferParticipantToThirdParty` | Transfer to phone number                | `console-export` | inbound, customer queue, transfer to agent, transfer to queue; voice only (chat, task and email take the error branch)                                                                           | none in the exported form (`ThirdPartyPhoneNumber` static or JSONPath, `ThirdPartyConnectionTimeLimitSeconds`, `ContinueFlowExecution`); the caller ID number form the page describes is not in the export, and whether it refers to an instance phone number is unknown until one is |

Console blocks with no documented Type, read from the block list on
2026-10-05. Each needs a console export (owner decision 8) before it can be
named here; no Type is invented for them:

| Console block                         | Admin guide page                                                                                            | What the page states                                                                                                     |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Agentic CX                            | https://docs.aws.amazon.com/connect/latest/adminguide/agentic-cx-block.html                                | Amazon Connect Customer instances only, some Regions; voice and chat; seven flow types; branches Default, Error, Idle chat timeout, Escalation |
| External Tool                         | https://docs.aws.amazon.com/connect/latest/adminguide/external-tool.html                                   | Amazon Connect Customer instances only; all channels; all flows; actions Invoke tool and Load tool result               |
| Data Table                            | https://docs.aws.amazon.com/connect/latest/adminguide/data-table-block.html                                | all channels; all flows; Evaluate, List and Write actions; branches Success and Error                                    |
| Create persistent contact association | https://docs.aws.amazon.com/connect/latest/adminguide/create-persistent-contact-association-block.html     | chat only; nine flow types; branches Success and Error                                                                   |
| Customer profiles, Get profile recommendations | https://docs.aws.amazon.com/connect/latest/adminguide/customer-profiles-block.html#get-profile-recommendations | a Properties section naming the `GetProfileRecommendations` API permission and nothing of the action's shape         |

Forms of modeled types that stay generic, so the count above does not hide
them (tasks/README.md, Phase D, "Considered and not taken"): Lex V1 `LexBot`
on `ConnectParticipantWithLexBot`; `VoiceAnalyticsBehavior` and
`ChatBehavior` on `UpdateContactRecordingAndAnalyticsBehavior`;
`AnalyticsBehavior` on `UpdateContactRecordingBehavior`; `Wait`'s
console-only forms (rule 37's refused `Events` shape); and the Set
Touchtone Buffer Behavior form of `GetParticipantInput`, which the admin
guide writes with `EnableDTMFBuffer` (with `StoreInput` and
`InputEncryption` for Stop and Clear), a parameter the catalog does not
record. D09 types that form after C04 (rule 40 quotes the page).
