/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// @vitest-environment happy-dom
//
// New flow and the companion badge (task B05a). A document is created with
// the companion it is paired with on disk, chosen once in the dialog; the
// badge then says which one the open document has. Both exist only on the
// flow-cli studio bridge, the one store that pairs documents with source.

import type { FlowDoc } from "@flow-as-code/core";
import { serialize } from "@flow-as-code/core";
import { lint } from "@flow-as-code/core/lint";
import { act } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Toolbar } from "../src/components/Toolbar.js";
import { newDoc, newDocNameProblem } from "../src/model/newDoc.js";
import { schemaErrorsFor } from "../src/model/validate.js";
import { StudioProvider } from "../src/state/studio.js";
import type { BridgeInfo, SourceKind } from "../src/store/bridgeProtocol.js";
import { BRIDGE_PROTOCOL } from "../src/store/bridgeProtocol.js";
import { BridgeStore, type BridgeFetch } from "../src/store/bridgeStore.js";
import { MemoryStore } from "../src/store/memoryStore.js";
import {
  button,
  click,
  installDomStubs,
  query,
  render,
  setValue,
  testId,
  unmount,
} from "./appHarness.js";
import { demoDoc } from "./helpers.js";

const NAME = "appointment-line";
const INFO: BridgeInfo = {
  protocol: BRIDGE_PROTOCOL,
  dir: "/tmp/flows",
  label: "flows",
  token: "t",
};

beforeAll(installDomStubs);
afterEach(() => {
  unmount();
  vi.restoreAllMocks();
});

interface Posted {
  url: string;
  body: { doc: FlowDoc; sourceKind: SourceKind };
}

/** A bridge holding the demo with a .flow.ts, answering creates as the CLI does. */
function bridge(posted: Posted[], refuse = false): BridgeStore {
  const fetchImpl: BridgeFetch = (url, init) => {
    const method = init?.method ?? "GET";
    let status = 200;
    let reply: unknown;
    if (method === "POST" && url.endsWith("/bridge/docs")) {
      const body = JSON.parse(init!.body!) as Posted["body"];
      posted.push({ url, body });
      if (refuse) {
        status = 409;
        reply = { error: `Refusing to create "${body.doc.name}": it already exists.` };
      } else {
        status = 201;
        const doc = { ...body.doc, meta: { sourceKind: body.sourceKind } };
        reply = { name: body.doc.name, doc, text: serialize(doc), sourceKind: body.sourceKind };
      }
    } else if (url.endsWith("/bridge/docs")) {
      reply = { docs: [{ name: NAME, sourceKind: "ts" }] };
    } else {
      reply = { name: NAME, doc: demoDoc(), text: serialize(demoDoc()), sourceKind: "ts" };
    }
    return Promise.resolve({
      ok: status < 300,
      status,
      text: () => Promise.resolve(JSON.stringify(reply)),
    });
  };
  return new BridgeStore(INFO, { base: "", fetch: fetchImpl, idleMs: 10_000 });
}

async function mount(store: BridgeStore | MemoryStore): Promise<void> {
  await render(
    <StudioProvider store={store}>
      <Toolbar />
    </StudioProvider>,
  );
  await act(async () => {
    await vi.waitFor(() =>
      expect(query<HTMLSelectElement>('select[aria-label="Document"]')?.value).toBe(NAME),
    );
  });
}

async function typeName(value: string): Promise<void> {
  const input = testId<HTMLInputElement>("new-flow-name");
  await act(async () => {
    setValue(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("the documents New flow creates", () => {
  it.each(["flow", "module"] as const)("a new %s passes the schema and every lint rule", (kind) => {
    const doc = newDoc("new-line", kind);
    expect(schemaErrorsFor(doc)).toEqual([]);
    expect(lint(doc)).toEqual([]);
  });

  it("names what is wrong with a name", () => {
    expect(newDocNameProblem("", [])).toBe("Name the flow.");
    expect(newDocNameProblem("New Line", [])).toContain("lowercase");
    expect(newDocNameProblem(NAME, [NAME])).toContain("already exists");
    expect(newDocNameProblem("new-line", [NAME])).toBeUndefined();
  });
});

describe("New flow on the bridge", () => {
  it("creates a flow with a .flow.tf, lists it, opens it, and badges its companion", async () => {
    const posted: Posted[] = [];
    await mount(bridge(posted));
    expect(testId("companion-badge").textContent).toBe(`${NAME}.flow.ts`);

    await click(button("new-flow-button"));
    await typeName("new-line");
    await click(testId("new-flow-companion-tf"));
    await click(button("new-flow-create"));

    expect(posted).toHaveLength(1);
    expect(posted[0]!.url).toBe("/bridge/docs");
    expect(posted[0]!.body).toEqual({ doc: newDoc("new-line", "flow"), sourceKind: "tf" });
    await act(async () => {
      await vi.waitFor(() => expect(query('[data-testid="new-flow-dialog"]')).toBeNull());
    });
    const select = query<HTMLSelectElement>('select[aria-label="Document"]')!;
    expect([...select.options].map((o) => o.value)).toEqual([NAME, "new-line"]);
    expect(select.value).toBe("new-line");
    expect(testId("companion-badge").textContent).toBe("new-line.flow.tf");
  });

  it("creates a module with the default companion", async () => {
    const posted: Posted[] = [];
    await mount(bridge(posted));
    await click(button("new-flow-button"));
    await typeName("survey");
    await click(testId("new-flow-kind-module"));
    await click(button("new-flow-create"));
    expect(posted[0]!.body).toEqual({ doc: newDoc("survey", "module"), sourceKind: "ts" });
  });

  it("will not create a name that is taken or not a slug", async () => {
    const posted: Posted[] = [];
    await mount(bridge(posted));
    await click(button("new-flow-button"));
    expect(button("new-flow-create").disabled).toBe(true);
    await typeName(NAME);
    expect(testId("new-flow-problem").textContent).toContain("already exists");
    expect(button("new-flow-create").disabled).toBe(true);
    await typeName("Not A Slug");
    expect(button("new-flow-create").disabled).toBe(true);
    expect(posted).toEqual([]);
  });

  it("keeps the dialog open and says why when the bridge refuses", async () => {
    await mount(bridge([], true));
    await click(button("new-flow-button"));
    await typeName("new-line");
    await click(button("new-flow-create"));
    await act(async () => {
      await vi.waitFor(() => expect(query('[data-testid="new-flow-error"]')).not.toBeNull());
    });
    expect(testId("new-flow-error").textContent).toContain("already exists");
    expect(query('[data-testid="new-flow-dialog"]')).not.toBeNull();
  });
});

describe("off the bridge", () => {
  it("offers no New flow and no companion badge", async () => {
    await mount(new MemoryStore("demo", [demoDoc()]));
    expect(query('[data-testid="new-flow-button"]')).toBeNull();
    expect(query('[data-testid="companion-badge"]')).toBeNull();
  });
});
