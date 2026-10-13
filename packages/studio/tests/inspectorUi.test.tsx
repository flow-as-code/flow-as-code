/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// @vitest-environment happy-dom
//
// The inspector seam: the mutations refuse illegal edits (tests/
// modelCorrectness.test.ts), and these check the panel actually routes through
// them instead of writing the parameter itself. Each case is a reproduced
// defect that ended in a saved file.

import type { FlowDoc } from "@flow-as-code/core";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import casesFixture from "../../../conformance/roundtrip/cases/doc.flowdoc.json";
import profilesFixture from "../../../conformance/roundtrip/customer-profiles/doc.flowdoc.json";
import { App } from "../src/App.js";
import { ErrorBoundary } from "../src/components/ErrorBoundary.js";
import { mergeTypedNames, switchForm, type FieldDesc } from "../src/model/inspectorSchema.js";
import { schemaErrorsFor } from "../src/model/validate.js";
import { MemoryStore } from "../src/store/memoryStore.js";
import {
  button,
  click,
  installDomStubs,
  present,
  query,
  render,
  selectOption,
  settleLint,
  testId,
  typeAndBlur,
  unmount,
} from "./appHarness.js";

beforeAll(installDomStubs);
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

const renderApp = () => render(<App />);

describe("inspector number fields", () => {
  it("refuses an emptied Timeout instead of committing 0", async () => {
    await renderApp();
    await click(present('[data-testid="node-look-up-appointment"]'));
    const field = testId<HTMLInputElement>("number-InvocationTimeLimitSeconds");
    expect(field.value).toBe("8");

    await typeAndBlur(field, "");
    // The panel explains the refusal and the parameter keeps its value.
    expect(present('[data-testid="inspector"]').textContent).toContain("Enter a number");
    expect(testId("inspector").textContent).toContain("Timeout (seconds)");

    await typeAndBlur(field, "3.5");
    expect(testId("inspector").textContent).toContain("whole number");

    await typeAndBlur(field, "9");
    expect(testId("inspector").textContent).toContain("at most 8");

    await typeAndBlur(field, "4");
    expect(testId("inspector").textContent).not.toContain("at most 8");
  });
});

describe("inspector message body", () => {
  it("never leaves the block without a body when switching to Prompt", async () => {
    await renderApp();
    await click(present('[data-testid="node-welcome"]'));
    const kind = testId<HTMLSelectElement>("message-body-kind");
    expect(kind.value).toBe("Text");

    // Choosing Prompt shows the picker but writes nothing yet: a PromptId has
    // to be a reference, and no body parameter at all is schema-invalid.
    await selectOption(kind, "PromptId");
    expect(document.querySelector('[data-testid="message-body"]')).toBeNull();
    const pickerOptions = [...testId("inspector").querySelectorAll("option")].map(
      (o) => o.textContent,
    );
    expect(pickerOptions).toContain("new reference…");

    // Switching back to Text restores a body without a save-blocking doc.
    await selectOption(testId<HTMLSelectElement>("message-body-kind"), "SSML");
    const body = testId<HTMLTextAreaElement>("message-body");
    expect(body.value).toBe("Thanks for calling. Let's get you to the right place.");
  });
});

describe("error boundary", () => {
  function Boom(): never {
    throw new Error("kaboom");
  }

  it("keeps a render failure on screen instead of blanking the app", async () => {
    // React logs the caught error; that noise is expected here.
    const consoleError = console.error;
    console.error = () => {};
    try {
      await render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      );
    } finally {
      console.error = consoleError;
    }
    expect(present('[data-testid="error-boundary"]').textContent).toContain("kaboom");
  });
});

describe("inspector state is scoped to the selected block", () => {
  it("does not carry a rejected number error over to the next selection", async () => {
    await renderApp();
    await click(present('[data-testid="node-look-up-appointment"]'));
    await typeAndBlur(testId<HTMLInputElement>("number-InvocationTimeLimitSeconds"), "");
    expect(testId("inspector").textContent).toContain("Enter a number");

    // numberErrors was keyed by selection but never cleared, so the message
    // reappeared the next time this block was selected.
    await click(present('[data-testid="node-welcome"]'));
    expect(testId("inspector").textContent).not.toContain("Enter a number");
    await click(present('[data-testid="node-look-up-appointment"]'));
    expect(testId("inspector").textContent).not.toContain("Enter a number");
  });

  it("does not carry a pending body switch over to the next MessageParticipant", async () => {
    await renderApp();
    await click(present('[data-testid="node-welcome"]'));
    await selectOption(testId<HTMLSelectElement>("message-body-kind"), "PromptId");
    expect(document.querySelector('[data-testid="message-body"]')).toBeNull();

    await click(present('[data-testid="node-apologize"]'));
    // A different block, so the pending Prompt switch must not apply to it.
    expect(testId<HTMLSelectElement>("message-body-kind").value).toBe("Text");
    expect(document.querySelector('[data-testid="message-body"]')).not.toBeNull();
  });
});

describe("required reference pickers", () => {
  it("do not offer clearing the reference as a selectable option", async () => {
    await renderApp();
    await click(present('[data-testid="node-look-up-appointment"]'));
    const picker = [...testId("inspector").querySelectorAll("select")].find((s) =>
      [...s.options].some((o) => o.textContent === "appointment-lookup"),
    );
    expect(picker).toBeDefined();
    const none = [...picker!.options].find((o) => o.value === "");
    expect(none?.textContent).toBe("(choose a reference)");
    expect(none?.disabled).toBe(true);
  });

  it("refuses to delete a required reference even if the option is chosen anyway", async () => {
    await renderApp();
    await click(present('[data-testid="node-look-up-appointment"]'));
    const picker = [...testId("inspector").querySelectorAll("select")].find((s) =>
      [...s.options].some((o) => o.textContent === "appointment-lookup"),
    );
    await selectOption(picker!, "");
    expect(testId("inspector").textContent).toContain("This reference is required");
    // The parameter is untouched: the picker still shows the token.
    expect([...testId("inspector").querySelectorAll("option")].map((o) => o.textContent)).toContain(
      "appointment-lookup",
    );
  });

  it("still offers (not set) on an optional reference", async () => {
    await renderApp();
    await click(present('[data-testid="node-check-hours"]'));
    const picker = [...testId("inspector").querySelectorAll("select")].find((s) =>
      [...s.options].some((o) => o.textContent === "main-line"),
    );
    const none = [...picker!.options].find((o) => o.value === "");
    expect(none?.textContent).toBe("(not set)");
    expect(none?.disabled).toBe(false);
  });
});

describe("delete block", () => {
  /** Replaces window.confirm and records what it was asked. */
  function stubConfirm(answer: boolean): { asked: string[] } {
    const asked: string[] = [];
    window.confirm = (message?: string) => {
      asked.push(message ?? "");
      return answer;
    };
    return { asked };
  }

  it("does not promise a detach it is about to refuse", async () => {
    // Deleting "hang-up" on the demo flow detaches four MessageParticipants'
    // next transitions, which the demotion invariant refuses. The prompt used
    // to say the transitions "will be detached. Delete?", the user said yes,
    // and nothing happened. There is no prompt now: there is the refusal.
    const { asked } = stubConfirm(true);
    await renderApp();
    await click(present('[data-testid="node-hang-up"]'));
    await click(testId("delete-block"));

    expect(asked).toEqual([]);
    expect(testId("mutation-notice").textContent).toContain("read-only generic block");
    // And the block is still there.
    expect(present('[data-testid="node-hang-up"]')).not.toBeNull();
  });

  it("refuses, without prompting, a delete whose one neighbour is typed", async () => {
    // "welcome" was deletable with a prompt while its only neighbour,
    // enable-logging, was an unmodeled block; since the builder models that
    // block, detaching its next transition would demote it, so the delete is
    // refused before any prompt. The prompt for a delete that will happen is
    // exercised on the detachable document in canvasUi.test.tsx.
    const { asked } = stubConfirm(true);
    await renderApp();
    await click(present('[data-testid="node-welcome"]'));
    await click(testId("delete-block"));

    expect(asked).toEqual([]);
    expect(testId("mutation-notice").textContent).toContain('"enable-logging"');
    expect(present('[data-testid="node-welcome"]')).not.toBeNull();
  });
});

describe("schema helper", () => {
  it("is the same validator the write path uses", () => {
    expect(schemaErrorsFor({ flowdoc: "0.3" }).length).toBeGreaterThan(0);
  });
});

describe("Customer Profiles request and response fields (tasks/D03)", () => {
  const addProfileBlock = async (type: string, id: string) => {
    await renderApp();
    await click(present(`button[title="Add ${type}"]`));
    await click(present(`[data-testid="node-${id}"]`));
  };

  it("chooses request fields from the page's list and types a custom attribute", async () => {
    await addProfileBlock("CreateCustomerProfile", "create-profile");
    const add = testId<HTMLSelectElement>("fieldmap-ProfileRequestData-add");
    expect([...add.options].map((o) => o.value)).toContain("FirstName");
    await selectOption(add, "FirstName");
    const value = testId<HTMLInputElement>("fieldmap-ProfileRequestData-FirstName");
    await typeAndBlur(value, "$.Attributes.firstName");
    expect(testId<HTMLInputElement>("fieldmap-ProfileRequestData-FirstName").value).toBe(
      "$.Attributes.firstName",
    );
    // A field already present is not offered again.
    expect(
      [...testId<HTMLSelectElement>("fieldmap-ProfileRequestData-add").options].map((o) => o.value),
    ).not.toContain("FirstName");

    await typeAndBlur(testId<HTMLInputElement>("fieldmap-ProfileRequestData-custom"), "Nickname");
    expect(testId("inspector").textContent).toContain(
      '"Nickname" is not spelled Attributes.<name>',
    );
    expect(query('[data-testid="fieldmap-ProfileRequestData-Nickname"]')).toBeNull();
    await typeAndBlur(
      testId<HTMLInputElement>("fieldmap-ProfileRequestData-custom"),
      "Attributes.loyaltyTier",
    );
    expect(
      query('[data-testid="fieldmap-ProfileRequestData-Attributes.loyaltyTier"]'),
    ).not.toBeNull();

    await click(testId("fieldmap-ProfileRequestData-FirstName-remove"));
    expect(query('[data-testid="fieldmap-ProfileRequestData-FirstName"]')).toBeNull();
  });

  // The wired group fixture, so each profile block is typed and the guard
  // refuses any switch that would leave it generic; the saved document is
  // what the assertions read.
  const fixture = (): FlowDoc => structuredClone(profilesFixture) as unknown as FlowDoc;
  const openFixture = async (edit?: (doc: FlowDoc) => void) => {
    const doc = fixture();
    edit?.(doc);
    const store = new MemoryStore("opened", [doc]);
    vi.useFakeTimers();
    await render(<App store={store} />);
    await settleLint();
    return store;
  };
  const saved = async (store: MemoryStore, id: string) => {
    await settleLint();
    expect(button("save-button").disabled).toBe(false);
    await click(button("save-button"));
    const { doc } = await store.read("customer-profiles");
    return doc.content.Actions.find((a) => a.Identifier === id)!.Parameters;
  };
  const noRefusal = () =>
    expect(query('[data-testid="mutation-notice"]')?.textContent ?? "").not.toContain(
      "generic block",
    );

  it("switches GetCustomerProfile between its two search forms, replacing the other", async () => {
    const store = await openFixture();
    await click(present('[data-testid="node-find-caller"]'));
    const form = testId<HTMLSelectElement>("form-ProfileRequestData");
    expect(form.value).toBe("0");
    expect(testId<HTMLInputElement>("text-ProfileRequestData.IdentifierName").value).toBe("_phone");
    expect(query('[data-testid="select-ProfileRequestData.LogicalOperator"]')).toBeNull();

    await selectOption(form, "1");
    noRefusal();
    expect(query('[data-testid="text-ProfileRequestData.IdentifierName"]')).toBeNull();
    const operator = testId<HTMLSelectElement>("select-ProfileRequestData.LogicalOperator");
    expect(operator.value).toBe("AND");
    await selectOption(operator, "OR");
    noRefusal();
    expect((await saved(store, "find-caller")).ProfileRequestData).toEqual({
      LogicalOperator: "OR",
      SearchCriteria: [{ IdentifierName: "_phone", IdentifierValue: "$.CustomerEndpoint.Address" }],
    });

    await selectOption(testId<HTMLSelectElement>("form-ProfileRequestData"), "0");
    noRefusal();
    expect((await saved(store, "find-caller")).ProfileRequestData).toEqual({
      IdentifierName: "_phone",
      IdentifierValue: "$.CustomerEndpoint.Address",
    });
  });

  it("replaces a named-field search, which codegen leaves generic, with the chosen form", async () => {
    const store = await openFixture((doc) => {
      doc.content.Actions.find(
        (a) => a.Identifier === "find-caller",
      )!.Parameters.ProfileRequestData = { PhoneNumber: "$.CustomerEndpoint.Address" };
    });
    await click(present('[data-testid="node-find-caller"]'));
    const form = testId<HTMLSelectElement>("form-ProfileRequestData");
    expect(form.value).toBe("");
    await selectOption(form, "0");
    expect((await saved(store, "find-caller")).ProfileRequestData).toEqual({
      IdentifierName: "_phone",
      IdentifierValue: "$.CustomerEndpoint.Address",
    });
  });

  it("switches GetCustomerProfileObject between the latest object and a search identifier", async () => {
    const store = await openFixture();
    await click(present('[data-testid="node-latest-order"]'));
    expect(testId<HTMLInputElement>("text-ProfileRequestData.ObjectType").value).toBe("Order");
    expect(testId<HTMLSelectElement>("form-ProfileRequestData").value).toBe("0");
    expect(query('[data-testid="text-ProfileRequestData.IdentifierName"]')).toBeNull();
    await selectOption(testId<HTMLSelectElement>("form-ProfileRequestData"), "1");
    noRefusal();
    expect(testId<HTMLInputElement>("text-ProfileRequestData.IdentifierName").value).toBe(
      "_orderId",
    );
    expect((await saved(store, "latest-order")).ProfileRequestData).toEqual({
      IdentifierName: "_orderId",
      IdentifierValue: "$.Attributes.orderId",
      ObjectType: "Order",
      ProfileId: "$.Customer.ProfileId",
    });
    expect(testId<HTMLInputElement>("names-ProfileResponseData-OrderStatus").checked).toBe(true);
  });

  it("commits nothing when the custom names are blurred unchanged, and keeps their order", async () => {
    const store = await openFixture((doc) => {
      doc.content.Actions.find(
        (a) => a.Identifier === "create-profile",
      )!.Parameters.ProfileResponseData = ["Attributes.loyaltyTier", "FirstName"];
    });
    await click(present('[data-testid="node-create-profile"]'));
    const other = testId<HTMLTextAreaElement>("names-ProfileResponseData-other");
    await typeAndBlur(other, other.value);
    await settleLint();
    // Nothing changed, so the document is not dirty and Save stays off.
    expect(button("save-button").disabled).toBe(true);
    await typeAndBlur(other, "Attributes.loyaltyTier\nAttributes.segment");
    expect((await saved(store, "create-profile")).ProfileResponseData).toEqual([
      "Attributes.loyaltyTier",
      "FirstName",
      "Attributes.segment",
    ]);
  });

  it("ticks a predefined calculated attribute and types the domain's own", async () => {
    await addProfileBlock("GetCalculatedAttributesForCustomerProfile", "calculated-attributes");
    await click(testId("names-ProfileResponseData-CalculatedAttributes._frequent_caller"));
    await typeAndBlur(
      testId<HTMLTextAreaElement>("names-ProfileResponseData-other"),
      "CalculatedAttributes.lifetimeValue",
    );
    expect(testId("inspector").textContent).not.toContain("is not spelled");
    await typeAndBlur(
      testId<HTMLTextAreaElement>("names-ProfileResponseData-other"),
      "lifetimeValue",
    );
    expect(testId("inspector").textContent).toContain(
      '"lifetimeValue" is not spelled CalculatedAttributes.<name>',
    );
  });

  it("ticks response fields from the page's list and holds typed ones to the pattern", async () => {
    await addProfileBlock("CreateCustomerProfile", "create-profile");
    const first = testId<HTMLInputElement>("names-ProfileResponseData-FirstName");
    expect(first.checked).toBe(false);
    await click(first);
    expect(testId<HTMLInputElement>("names-ProfileResponseData-FirstName").checked).toBe(true);

    const other = testId<HTMLTextAreaElement>("names-ProfileResponseData-other");
    await typeAndBlur(other, "Attributes.loyaltyTier\nfirstname");
    expect(testId("inspector").textContent).toContain(
      '"firstname" is not spelled Attributes.<name>',
    );
    await typeAndBlur(other, "Attributes.loyaltyTier");
    expect(testId("inspector").textContent).not.toContain("is not spelled");
    expect(testId<HTMLTextAreaElement>("names-ProfileResponseData-other").value).toBe(
      "Attributes.loyaltyTier",
    );
    expect(testId<HTMLInputElement>("names-ProfileResponseData-FirstName").checked).toBe(true);
  });
});

describe("the profile form switch and typed names, as functions", () => {
  const field: Extract<FieldDesc, { kind: "form" }> = {
    kind: "form",
    key: "ProfileRequestData",
    label: "Retrieve",
    keeps: ["ProfileId", "ObjectType"],
    forms: [
      { label: "latest", keys: ["UseLatest"], defaults: { UseLatest: "true" } },
      {
        label: "identifier",
        keys: ["IdentifierName", "IdentifierValue"],
        defaults: { IdentifierName: "_orderId", IdentifierValue: "$.Attributes.orderId" },
      },
    ],
  };

  it("keeps the kept keys, fills the chosen form, and drops everything else", () => {
    const holder = { ProfileId: "p", ObjectType: "Order", UseLatest: "true", Stray: "x" };
    expect(switchForm(holder, field, 1)).toEqual({
      ProfileId: "p",
      ObjectType: "Order",
      IdentifierName: "_orderId",
      IdentifierValue: "$.Attributes.orderId",
    });
    expect(switchForm({ PhoneNumber: "x" }, { ...field, keeps: [] }, 0)).toEqual({
      UseLatest: "true",
    });
    expect(switchForm(holder, field, 2)).toBeUndefined();
  });

  it("merges typed names in place, appending new ones and dropping removed ones", () => {
    const listed = ["FirstName", "LastName"];
    const stored = ["Attributes.a", "FirstName", "Attributes.b"];
    expect(mergeTypedNames(stored, listed, ["Attributes.a", "Attributes.b"])).toEqual(stored);
    expect(mergeTypedNames(stored, listed, ["Attributes.b", "Attributes.a"])).toEqual(stored);
    expect(mergeTypedNames(stored, listed, ["Attributes.b", "Attributes.c"])).toEqual([
      "FirstName",
      "Attributes.b",
      "Attributes.c",
    ]);
  });
});

describe("Cases link and field picker (tasks/D06)", () => {
  const addCaseBlock = async () => {
    await renderApp();
    await click(present('button[title="Add CreateCase"]'));
    await click(present('[data-testid="node-create-case"]'));
  };

  it("writes the link and its contact from one select", async () => {
    await addCaseBlock();
    const link = testId<HTMLSelectElement>("caselink-LinkContactToCase");
    expect(link.value).toBe("none");
    await selectOption(link, "Related");
    expect(testId<HTMLSelectElement>("caselink-LinkContactToCase").value).toBe("Related");
    await selectOption(testId<HTMLSelectElement>("caselink-LinkContactToCase"), "link");
    expect(testId<HTMLSelectElement>("caselink-LinkContactToCase").value).toBe("link");
    await selectOption(testId<HTMLSelectElement>("caselink-LinkContactToCase"), "none");
    expect(testId<HTMLSelectElement>("caselink-LinkContactToCase").value).toBe("none");
  });

  it("adds a system field from the list and a domain field as a casefield reference", async () => {
    await addCaseBlock();
    const add = testId<HTMLSelectElement>("fieldmap-CaseRequestFields-add");
    expect([...add.options].map((o) => o.value)).toContain("summary");
    await selectOption(add, "summary");
    expect(query('[data-testid="fieldmap-CaseRequestFields-summary"]')).not.toBeNull();

    const picker = testId("fieldmap-CaseRequestFields-ref");
    await selectOption(picker.querySelector("select")!, "__custom__");
    await typeAndBlur(picker.querySelector("input")!, "$.Attributes.field");
    expect(testId("inspector").textContent).toContain("Only a casefield reference can stand here");
    await typeAndBlur(
      testId("fieldmap-CaseRequestFields-ref").querySelector("input")!,
      "${cdref:casefield:priority}",
    );
    expect(
      query('[data-testid="fieldmap-CaseRequestFields-${cdref:casefield:priority}"]'),
    ).not.toBeNull();

    // A literal domain field id is not a key the inspector writes.
    await typeAndBlur(
      testId<HTMLInputElement>("fieldmap-CaseRequestFields-custom"),
      "12345678-aaaa-bbbb-cccc-123456789012",
    );
    expect(testId("inspector").textContent).toContain("is not spelled ${cdref:casefield:<name>}");
  });
  it("ticks GetCase response fields and adds a domain field to them by reference", async () => {
    await renderApp();
    await click(present('button[title="Add GetCase"]'));
    await click(present('[data-testid="node-get-case"]'));
    expect(testId<HTMLInputElement>("names-CaseResponseFields-status").checked).toBe(true);
    await click(testId("names-CaseResponseFields-title"));
    expect(testId<HTMLInputElement>("names-CaseResponseFields-title").checked).toBe(true);
    const picker = testId("names-CaseResponseFields-ref");
    await selectOption(picker.querySelector("select")!, "__custom__");
    await typeAndBlur(picker.querySelector("input")!, "${cdref:casefield:priority}");
    expect(testId<HTMLTextAreaElement>("names-CaseResponseFields-other").value).toBe(
      "${cdref:casefield:priority}",
    );
  });
});

// The wired cases fixture, so every Cases block is typed and the guard
// refuses any edit that would leave one generic; the saved document is what
// the assertions read (the pattern of the profile form tests above).
describe("the Cases link wires ContactNotLinked in the saved document (tasks/D06)", () => {
  const open = async () => {
    const store = new MemoryStore("opened", [structuredClone(casesFixture) as unknown as FlowDoc]);
    vi.useFakeTimers();
    await render(<App store={store} />);
    await settleLint();
    return store;
  };
  const saved = async (store: MemoryStore, id: string) => {
    await settleLint();
    expect(button("save-button").disabled).toBe(false);
    await click(button("save-button"));
    const { doc } = await store.read("cases");
    return doc.content.Actions.find((a) => a.Identifier === id)!;
  };

  it("adds the branch first when linking is switched on, and removes it when off", async () => {
    const store = await open();
    await click(present('[data-testid="node-log-case"]'));
    expect(testId<HTMLSelectElement>("caselink-LinkContactToCase").value).toBe("none");

    await selectOption(testId<HTMLSelectElement>("caselink-LinkContactToCase"), "Related");
    expect(query('[data-testid="mutation-notice"]')?.textContent ?? "").not.toContain(
      "generic block",
    );
    const linked = await saved(store, "log-case");
    expect(linked.Parameters.LinkContactToCase).toBe("true");
    expect(linked.Parameters.ContactToLink).toBe("Related");
    expect(linked.Transitions.Errors).toEqual([
      { ErrorType: "ContactNotLinked", NextAction: "bye" },
      { ErrorType: "NoMatchingError", NextAction: "bye" },
    ]);

    await selectOption(testId<HTMLSelectElement>("caselink-LinkContactToCase"), "none");
    const unlinked = await saved(store, "log-case");
    expect(unlinked.Parameters.LinkContactToCase).toBe("false");
    expect(unlinked.Parameters.ContactToLink).toBeUndefined();
    expect(unlinked.Transitions.Errors).toEqual([
      { ErrorType: "NoMatchingError", NextAction: "bye" },
    ]);
  });
});
