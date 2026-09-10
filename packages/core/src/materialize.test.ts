/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { FlowDoc, RefEntry } from "./index.js";
import {
  MaterializeError,
  materializeWithBinder,
  materializeWithMap,
  serializeContent,
} from "./index.js";

const fixture = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), "utf8");

const demo = (): FlowDoc =>
  JSON.parse(fixture("conformance/materialize/demo-with-map/doc.flowdoc.json")) as FlowDoc;
const demoMap = (): Record<string, string> =>
  JSON.parse(fixture("conformance/materialize/demo-with-map/map.json")) as Record<string, string>;

describe("A05 acceptance: materializeWithBinder", () => {
  it("passes binder output through byte-for-byte", () => {
    const doc = JSON.parse(
      fixture("conformance/materialize/binder-passthrough/doc.flowdoc.json"),
    ) as FlowDoc;
    const content = materializeWithBinder(doc, (ref) =>
      ref.type === "queue" ? "${Token[TOKEN.42]}" : "${Token[TOKEN.719]}",
    );
    const queueAction = content.Actions.find((a) => a.Identifier === "set-working-queue")!;
    expect(queueAction.Parameters.QueueId).toBe("${Token[TOKEN.42]}");
  });

  it("does not validate binder output shape", () => {
    // Binder output may contain CloudFormation intrinsics; nothing here may
    // reject or rewrite it (SPEC.md, Materialization).
    const doc = demo();
    const sentinel = '{"Fn::GetAtt": ["Queue", "Arn"]} arn:aws:not-even-close ${}';
    const content = materializeWithBinder(doc, () => sentinel);
    const queueAction = content.Actions.find((a) => a.Identifier === "set-working-queue")!;
    expect(queueAction.Parameters.QueueId).toBe(sentinel);
  });

  it("receives the parsed ref entry, alias included", () => {
    const seen: RefEntry[] = [];
    materializeWithBinder(demo(), (ref) => {
      seen.push(ref);
      return "x";
    });
    expect(seen.map((r) => r.token).sort()).toEqual([
      "${cdref:hours:main-line}",
      "${cdref:lambda:appointment-lookup}",
      "${cdref:queue:appointments}",
    ]);
    expect(seen.every((r) => r.name.length > 0)).toBe(true);
  });
});

describe("A05 acceptance: materializeWithMap", () => {
  it("leaves no token behind with a complete map", () => {
    const out = serializeContent(materializeWithMap(demo(), demoMap()));
    expect(out).not.toContain("${cdref:");
  });

  it("lists ALL missing tokens at once, sorted", () => {
    const map = demoMap();
    delete map["${cdref:hours:main-line}"];
    delete map["${cdref:queue:appointments}"];
    let caught: unknown;
    try {
      materializeWithMap(demo(), map);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(MaterializeError);
    const err = caught as MaterializeError;
    expect(err.missingTokens).toEqual(["${cdref:hours:main-line}", "${cdref:queue:appointments}"]);
    expect(err.message).toContain("${cdref:hours:main-line}");
    expect(err.message).toContain("${cdref:queue:appointments}");
  });

  it("substitutes the mapped values verbatim", () => {
    const content = materializeWithMap(demo(), demoMap());
    const queueAction = content.Actions.find((a) => a.Identifier === "set-working-queue")!;
    expect(queueAction.Parameters.QueueId).toBe(
      "arn:aws:connect:us-east-1:111122223333:instance/EXAMPLE/queue/EXAMPLE",
    );
  });
});

describe("A05 acceptance: deployable content shape", () => {
  const doc = demo();
  const content = materializeWithMap(doc, demoMap());
  const serialized = serializeContent(content);

  it("emits content only: no layout, refs, or meta", () => {
    const parsed = JSON.parse(serialized) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(["Version", "StartAction", "Metadata", "Actions"]);
    expect(serialized).not.toContain('"layout"');
    expect(serialized).not.toContain('"refs"');
    expect(serialized).not.toContain('"meta"');
  });

  it("validates loosely as the demo flow", () => {
    expect(content.Version).toBe("2019-10-30");
    const ids = content.Actions.map((a) => a.Identifier);
    expect(ids).toContain(content.StartAction);
    expect(content.Actions).toHaveLength(11);
  });

  // Metadata shape per the Flow language example:
  // https://docs.aws.amazon.com/connect/latest/devguide/flow-language-example.html
  it("projects layout into Metadata covering every action", () => {
    const metadata = content.Metadata as {
      EntryPointPosition: { x: number; y: number };
      ActionMetadata: Record<string, { Position: { x: number; y: number } }>;
    };
    const ids = content.Actions.map((a) => a.Identifier);
    expect(Object.keys(metadata.ActionMetadata).sort()).toEqual([...ids].sort());
    for (const id of ids) {
      expect(metadata.ActionMetadata[id]!.Position).toEqual(doc.layout![id]);
    }
    // The entry point marker sits left of the StartAction block.
    const start = doc.layout![content.StartAction]!;
    expect(metadata.EntryPointPosition.y).toBe(start.y);
    expect(metadata.EntryPointPosition.x).toBeLessThan(start.x);
  });

  it("is deterministic: two runs, identical bytes", () => {
    const again = serializeContent(materializeWithMap(demo(), demoMap()));
    expect(again).toBe(serialized);
  });

  it("does not mutate the input document", () => {
    const pristine = demo();
    const subject = demo();
    materializeWithMap(subject, demoMap());
    expect(subject).toEqual(pristine);
  });

  it("fills auto-layout for actions the layout does not cover", () => {
    const partial = demo();
    delete partial.layout!["hang-up"];
    const metadata = materializeWithMap(partial, demoMap()).Metadata as {
      ActionMetadata: Record<string, { Position: { x: number; y: number } }>;
    };
    expect(metadata.ActionMetadata["hang-up"]).toBeDefined();
    expect(metadata.ActionMetadata["welcome"]!.Position).toEqual(partial.layout!["welcome"]);
  });
});

describe("A05 conformance fixtures", () => {
  it("demo-with-map matches the committed golden byte for byte", () => {
    const doc = JSON.parse(
      fixture("conformance/materialize/demo-with-map/doc.flowdoc.json"),
    ) as FlowDoc;
    const map = JSON.parse(fixture("conformance/materialize/demo-with-map/map.json")) as Record<
      string,
      string
    >;
    expect(serializeContent(materializeWithMap(doc, map))).toBe(
      fixture("conformance/materialize/demo-with-map/expected.content.json"),
    );
  });

  it("binder-passthrough matches the committed golden byte for byte", () => {
    const doc = JSON.parse(
      fixture("conformance/materialize/binder-passthrough/doc.flowdoc.json"),
    ) as FlowDoc;
    const binderMap = JSON.parse(
      fixture("conformance/materialize/binder-passthrough/binder.json"),
    ) as Record<string, string>;
    expect(serializeContent(materializeWithBinder(doc, (ref) => binderMap[ref.token]!))).toBe(
      fixture("conformance/materialize/binder-passthrough/expected.content.json"),
    );
  });

  it("keeps the demo-with-map doc in sync with the canonical demo", () => {
    expect(fixture("conformance/materialize/demo-with-map/doc.flowdoc.json")).toBe(
      fixture("conformance/demo/appointment-line.flowdoc.json"),
    );
  });
});

// ---------------------------------------------------------------------------
// Regressions from adversarial review: the strictness check scans the whole
// content, so substitution must cover the whole content too.
// ---------------------------------------------------------------------------
describe("regression: pre-existing content.Metadata", () => {
  const docWithMetadata = (): FlowDoc => {
    const doc = JSON.parse(JSON.stringify(demo())) as FlowDoc;
    doc.content.Metadata = {
      note: "${cdref:queue:appointments}",
      ActionMetadata: {
        welcome: { Position: { x: 1, y: 1 }, isFriendlyName: true },
        "stale-id-not-in-actions": { Position: { x: 9, y: 9 } },
      },
    };
    return doc;
  };

  it("resolves tokens inside pre-existing Metadata on the map path", () => {
    const content = materializeWithMap(docWithMetadata(), demoMap());
    expect(JSON.stringify(content)).not.toContain("${cdref:");
    expect((content.Metadata as Record<string, unknown>).note).toBe(
      demoMap()["${cdref:queue:appointments}"],
    );
  });

  it("resolves tokens inside pre-existing Metadata on the binder path", () => {
    const content = materializeWithBinder(docWithMetadata(), (ref) => `BOUND(${ref.name})`);
    expect(JSON.stringify(content)).not.toContain("${cdref:");
    expect((content.Metadata as Record<string, unknown>).note).toBe("BOUND(appointments)");
  });

  it("merges ActionMetadata per entry: layout wins on Position, siblings survive", () => {
    const content = materializeWithMap(docWithMetadata(), demoMap());
    const am = (content.Metadata as { ActionMetadata: Record<string, Record<string, unknown>> })
      .ActionMetadata;
    // The stale Position (1,1) is overwritten by the doc's layout for welcome...
    const doc = docWithMetadata();
    expect(am.welcome!.Position).toEqual(doc.layout!.welcome);
    // ...but the sibling key inside the same entry survives (never drop content).
    expect(am.welcome!.isFriendlyName).toBe(true);
    // Entries for ids not present in Actions survive too.
    expect(am["stale-id-not-in-actions"]).toEqual({ Position: { x: 9, y: 9 } });
  });
});

describe("regression: a token must not survive materialization", () => {
  // The completeness check found tokens anywhere in a string while substitution
  // only replaced a whole-value token, so an interpolated token satisfied the
  // check and reached deployable output as text Connect would read aloud.
  const interpolated = (): FlowDoc => {
    const doc = demo();
    doc.content.Actions[1]!.Parameters.Text = "Please hold, ${cdref:prompt:greeting} is next.";
    doc.refs = [
      ...(doc.refs ?? []),
      { token: "${cdref:prompt:greeting}", type: "prompt", name: "greeting" },
    ];
    return doc;
  };

  const fullMap = (doc: FlowDoc): Record<string, string> =>
    Object.fromEntries(
      (doc.refs ?? []).map((r) => [
        r.token,
        `arn:aws:connect:us-east-1:111122223333:instance/E/x/E`,
      ]),
    );

  it("refuses rather than emitting the token as literal text", () => {
    const doc = interpolated();
    expect(() => materializeWithMap(doc, fullMap(doc))).toThrow(MaterializeError);
    expect(() => materializeWithMap(doc, fullMap(doc))).toThrow(/entire field value/);
  });

  it("names the offending token", () => {
    const doc = interpolated();
    try {
      materializeWithMap(doc, fullMap(doc));
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as MaterializeError).missingTokens).toContain("${cdref:prompt:greeting}");
    }
  });

  it("still materializes a well-formed document", () => {
    const doc = demo();
    expect(() => materializeWithMap(doc, demoMap())).not.toThrow();
  });
});
