/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// A12 acceptance for the three export targets, against the conformance cases
// the emitters are already pinned by. Nothing here goes through the UI: these
// are the functions the buttons call.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { FlowDoc } from "@flow-as-code/core";
import { emitTf } from "@flow-as-code/tf/emit";
import { readTree } from "../../tf/src/__fixtures__/cases.js";
import {
  ExportMapError,
  buildExport,
  exportCdk,
  exportFlowascode,
  exportRaw,
  exportTf,
} from "../src/export/targets.js";
import { unmappedTokens } from "../src/export/refMap.js";
import { newDoc } from "../src/model/newDoc.js";
import { demoDoc } from "./helpers.js";

const CONFORMANCE = new URL("../../../conformance/", import.meta.url);
const TF_CASE = new URL("emit-tf/demo-complete-map/", CONFORMANCE);
const MATERIALIZE_CASE = new URL("materialize/demo-with-map/", CONFORMANCE);

const readJson = <T>(url: URL): T => JSON.parse(readFileSync(url, "utf8")) as T;

const completeAddressMap = (): Record<string, string> =>
  readJson<Record<string, string>>(new URL("address-map.json", TF_CASE));

const resourceMap = (): Record<string, string> =>
  readJson<Record<string, string>>(new URL("map.json", MATERIALIZE_CASE));

describe("terraform export", () => {
  it("is byte-identical to the conformance golden for the demo and a complete map", () => {
    const bundle = exportTf({ target: "tf", docs: [demoDoc()], addressMap: completeAddressMap() });
    expect(bundle.files).toEqual(readTree(new URL("expected/", TF_CASE)));
  });

  it("is byte-identical to calling the emitter directly with the same inputs", () => {
    const addressMap = completeAddressMap();
    const bundle = exportTf({ target: "tf", docs: [demoDoc()], addressMap });
    expect(bundle.files).toEqual(emitTf([demoDoc()], { addressMap }).files);
  });

  it("leaves a loud TODO placeholder for a reference with no address", () => {
    const bundle = exportTf({
      target: "tf",
      docs: [demoDoc()],
      addressMap: { "hours:main-line": "aws_connect_hours_of_operation.main_line.arn" },
    });
    const refs = bundle.files["flow_refs.tf"] ?? "";
    expect(refs).toContain("TODO_MISSING_ADDRESS_queue_appointments");
    expect(refs).toContain("TODO_MISSING_ADDRESS_lambda_appointment_lookup");
  });

  it("refuses a literal ARN as an address, the way the emitter does", () => {
    expect(() =>
      exportTf({
        target: "tf",
        docs: [demoDoc()],
        addressMap: { "queue:appointments": "arn:aws:connect:us-east-1:1234:queue/x" },
      }),
    ).toThrow(/literal ARN/);
  });

  it("is stable across runs", () => {
    const once = exportTf({ target: "tf", docs: [demoDoc()], addressMap: completeAddressMap() });
    const twice = exportTf({ target: "tf", docs: [demoDoc()], addressMap: completeAddressMap() });
    expect(twice.files).toEqual(once.files);
  });
});

describe("cdk export", () => {
  it("writes one scaffold with a TODO per reference type the set uses", () => {
    const bundle = exportCdk({ target: "cdk", docs: [demoDoc()] });
    expect(Object.keys(bundle.files)).toEqual(["flow-stack.ts"]);
    const scaffold = bundle.files["flow-stack.ts"] ?? "";
    for (const type of ["hours", "lambda", "queue"]) {
      expect(scaffold).toContain(`TODO: bind ${type}`);
    }
    for (const type of ["lex", "prompt"]) {
      expect(scaffold).not.toContain(`TODO: bind ${type}`);
      expect(scaffold).toContain(`${type}: (name) => {`);
    }
    expect(scaffold).toContain("new FlowSet(this");
    expect(scaffold).not.toContain("arn:aws:");
  });

  it("points FLOW_DOCS at the documents from wherever it is written", () => {
    expect(exportCdk({ target: "cdk", docs: [demoDoc()] }).files["flow-stack.ts"]).toContain(
      'const FLOW_DOCS = fileURLToPath(new URL(".", import.meta.url));',
    );
    expect(
      exportCdk({ target: "cdk", docs: [demoDoc()], subdir: "infra" }).files["flow-stack.ts"],
    ).toContain('const FLOW_DOCS = fileURLToPath(new URL("..", import.meta.url));');
    expect(
      exportCdk({ target: "cdk", docs: [demoDoc()], subdir: "infra/cdk" }).files["flow-stack.ts"],
    ).toContain('const FLOW_DOCS = fileURLToPath(new URL("../..", import.meta.url));');
  });

  it("refuses a subdirectory that could escape the served directory", () => {
    for (const subdir of ["../evil", "/etc", "a/../../b", "."]) {
      expect(() => exportCdk({ target: "cdk", docs: [demoDoc()], subdir })).toThrow(
        /not a usable subdirectory/,
      );
    }
  });
});

describe("raw export", () => {
  it("materializes against a complete map, leaving no token behind", () => {
    const bundle = exportRaw({ target: "raw", docs: [demoDoc()], resourceMap: resourceMap() });
    expect(Object.keys(bundle.files)).toEqual(["appointment-line.json"]);
    const content = bundle.files["appointment-line.json"] ?? "";
    expect(content).not.toContain("${cdref:");
    expect(content).toContain("arn:aws:");
  });

  it("is byte-identical to the materialize conformance golden", () => {
    const bundle = exportRaw({ target: "raw", docs: [demoDoc()], resourceMap: resourceMap() });
    // The golden is the same document @flow-as-code/core's own conformance test pins,
    // so the studio and the library cannot materialize differently.
    const doc = readJson<FlowDoc>(new URL("doc.flowdoc.json", MATERIALIZE_CASE));
    const own = exportRaw({ target: "raw", docs: [doc], resourceMap: resourceMap() });
    expect(own.files[`${doc.name}.json`]).toBe(
      readFileSync(new URL("expected.content.json", MATERIALIZE_CASE), "utf8"),
    );
    expect(bundle.files["appointment-line.json"]).toBe(own.files[`${doc.name}.json`]);
  });

  it("lists every missing map entry, not the first", () => {
    let thrown: unknown;
    try {
      exportRaw({ target: "raw", docs: [demoDoc()], resourceMap: {} });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(ExportMapError);
    expect((thrown as ExportMapError).missingTokens).toEqual([
      "${cdref:hours:main-line}",
      "${cdref:lambda:appointment-lookup}",
      "${cdref:queue:appointments}",
    ]);
    expect((thrown as ExportMapError).message).toContain("${cdref:queue:appointments}");
  });

  it("unions the missing tokens across the whole document set", () => {
    const second = { ...demoDoc(), name: "second-line" };
    const partial = { "${cdref:hours:main-line}": "arn:aws:connect:us-east-1:1:hours/1" };
    const missing = () => {
      try {
        exportRaw({ target: "raw", docs: [demoDoc(), second], resourceMap: partial });
        return [];
      } catch (err) {
        return err instanceof ExportMapError ? [...err.missingTokens] : ["not an ExportMapError"];
      }
    };
    expect(missing()).toEqual([
      "${cdref:lambda:appointment-lookup}",
      "${cdref:queue:appointments}",
    ]);
  });
});

describe("buildExport", () => {
  it("dispatches to the three targets", () => {
    expect(buildExport({ target: "cdk", docs: [demoDoc()] }).target).toBe("cdk");
    expect(buildExport({ target: "tf", docs: [demoDoc()], addressMap: {} }).target).toBe("tf");
    expect(
      buildExport({ target: "raw", docs: [demoDoc()], resourceMap: resourceMap() }).target,
    ).toBe("raw");
  });

  it("refuses an empty document set rather than emitting nothing", () => {
    expect(() => buildExport({ target: "cdk", docs: [] })).toThrow(/nothing to export/);
  });
});

// Guard for the loader path used above: if conformance moves, this says so.
it("reads the conformance cases it compares against", () => {
  expect(fileURLToPath(TF_CASE)).toContain("conformance");
  expect(Object.keys(readTree(new URL("expected/", TF_CASE))).length).toBeGreaterThan(3);
});

describe("flowascode export (B05b)", () => {
  const HCL_EMIT = new URL("hcl/emit/", CONFORMANCE);
  const golden = (name: string, file: string): string =>
    readFileSync(new URL(`${name}/expected/${file}`, HCL_EMIT), "utf8");
  const caseDocs = (name: string): FlowDoc[] =>
    readJson<{ docs: string[] }>(new URL(`${name}/case.json`, HCL_EMIT)).docs.map((p) =>
      readJson<FlowDoc>(new URL(p, new URL(`${name}/`, HCL_EMIT))),
    );
  const caseMap = (name: string): Record<string, string> =>
    readJson(new URL(`${name}/address-map.json`, HCL_EMIT));

  it.each(["demo-complete-map", "demo-incomplete-map", "module-set"])(
    "%s: byte-identical to the conformance golden",
    (name) => {
      const bundle = exportFlowascode({
        target: "flowascode",
        docs: caseDocs(name),
        addressMap: caseMap(name),
      });
      expect(bundle.target).toBe("flowascode");
      for (const [path, text] of Object.entries(bundle.files)) {
        expect(text, path).toBe(golden(name, path));
      }
      expect(Object.keys(bundle.files)).toEqual([
        "flows.tf",
        "outputs.tf",
        "variables.tf",
        "versions.tf.example",
      ]);
    },
  );

  it("goes through the save gate like every other target", () => {
    const doc = demoDoc();
    doc.content.Actions[0]!.Parameters.Text = "arn:aws:connect:us-west-2:111122223333:instance/x";
    expect(() => buildExport({ target: "flowascode", docs: [doc], addressMap: {} })).toThrow(
      /no-literal-arn/,
    );
  });

  it("asks the flowascode emitter which references are unmapped", () => {
    expect(
      unmappedTokens(caseDocs("demo-incomplete-map"), caseMap("demo-incomplete-map"), "flowascode"),
    ).toEqual(
      unmappedTokens(caseDocs("demo-incomplete-map"), caseMap("demo-incomplete-map"), "tf"),
    );
    expect(
      unmappedTokens(caseDocs("demo-incomplete-map"), caseMap("demo-incomplete-map"), "flowascode"),
    ).toHaveLength(2);
    // Only the flowascode emitter resolves an in-set module invoked without an
    // alias, so the two targets disagree here and the scan must ask the right one.
    const invoker: FlowDoc = {
      ...newDoc("invoker", "flow"),
      content: {
        Version: "2019-10-30",
        StartAction: "invoke",
        Actions: [
          {
            Identifier: "invoke",
            Type: "InvokeFlowModule",
            Parameters: { FlowModuleId: "${cdref:module:helper}" },
            Transitions: {
              NextAction: "disconnect",
              Errors: [{ ErrorType: "NoMatchingError", NextAction: "disconnect" }],
              Conditions: [],
            },
          },
          {
            Identifier: "disconnect",
            Type: "DisconnectParticipant",
            Parameters: {},
            Transitions: {},
          },
        ],
      },
    };
    const set = [invoker, newDoc("helper", "module")];
    expect(unmappedTokens(set, {}, "tf")).toEqual(["${cdref:module:helper}"]);
    expect(unmappedTokens(set, {}, "flowascode")).toEqual([]);
    // The set resolves its own modules, so nothing about them is unmapped.
    expect(unmappedTokens(caseDocs("module-set"), {}, "flowascode")).toEqual([
      "${cdref:queue:appointments}",
    ]);
  });
});
