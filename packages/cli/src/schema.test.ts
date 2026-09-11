/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The CLI validates documents and scenarios against copies of the schemas that
// live inside the package, because conformance/ is not published and a
// published CLI cannot reach it. A copy is only safe while it is provably a
// copy: if this fails, re-run `npm run sync:schema` and land the result in the
// same commit as the schema change.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { SCHEMA_PATHS } from "./docs.js";
import { SCENARIO_SCHEMA_PATH } from "./simulate.js";

const conformance = (file: string) =>
  fileURLToPath(new URL(`../../../conformance/schema/${file}`, import.meta.url));

describe("packaged schemas", () => {
  it.each(Object.entries(SCHEMA_PATHS))(
    "FlowDoc %s schema is byte-identical to the conformance schema",
    (version, path) => {
      expect(readFileSync(path, "utf8")).toBe(
        readFileSync(conformance(`flowdoc-${version}.schema.json`), "utf8"),
      );
    },
  );

  it("scenario schema is byte-identical to the conformance schema", () => {
    expect(readFileSync(SCENARIO_SCHEMA_PATH, "utf8")).toBe(
      readFileSync(conformance("scenario-0.1.schema.json"), "utf8"),
    );
  });
});
