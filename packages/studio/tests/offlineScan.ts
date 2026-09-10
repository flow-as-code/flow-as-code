/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The offline scan shared by bundle-offline.test.ts (dist/) and
// demo-bundle.test.ts (dist-demo/): what a built asset may mention and what it
// may never contain.
//
// Both builds are judged by one allow-list so that the two cannot drift, and
// the list is exact-match on purpose: a new URL under an allowed origin has to
// be reviewed and added here rather than pass because its prefix is familiar.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Every entry is the exact string constant a bundled library carries (an XML
 * namespace, a JSON Schema identifier, an error-message doc link, a license
 * banner) or a citation an emitter writes into its own output. None is a
 * resource the page loads; the runtime check in docs/05-hosted-demo.md is
 * where "loads nothing" is proven, this list is where "mentions" are reviewed.
 */
export const ALLOWED_URLS = new Set([
  // XML namespaces React and React Flow pass to createElementNS.
  "http://www.w3.org/1998/Math/MathML",
  "http://www.w3.org/1999/xhtml",
  "http://www.w3.org/1999/xlink",
  "http://www.w3.org/2000/svg",
  "http://www.w3.org/2000/xmlns/",
  "http://www.w3.org/XML/1998/namespace",
  // JSON Schema identifiers ($id/$schema/vocabulary URIs). Ajv resolves these
  // against the meta-schemas bundled inside ajv itself; sync compile() never
  // dereferences a URI over the network.
  "http://json-schema.org/schema",
  "https://json-schema.org/draft/2020-12/meta/applicator",
  "https://json-schema.org/draft/2020-12/meta/content",
  "https://json-schema.org/draft/2020-12/meta/core",
  "https://json-schema.org/draft/2020-12/meta/format-annotation",
  "https://json-schema.org/draft/2020-12/meta/meta-data",
  "https://json-schema.org/draft/2020-12/meta/unevaluated",
  "https://json-schema.org/draft/2020-12/meta/validation",
  "https://json-schema.org/draft/2020-12/schema",
  "https://json-schema.org/draft/2020-12/vocab/applicator",
  "https://json-schema.org/draft/2020-12/vocab/content",
  "https://json-schema.org/draft/2020-12/vocab/core",
  "https://json-schema.org/draft/2020-12/vocab/format-annotation",
  "https://json-schema.org/draft/2020-12/vocab/meta-data",
  "https://json-schema.org/draft/2020-12/vocab/unevaluated",
  "https://json-schema.org/draft/2020-12/vocab/validation",
  "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#",
  // $id of the bundled FlowDoc schema itself (conformance/schema).
  "https://flow-as-code.dev/schema/flowdoc-0.1.schema.json",
  // Citations @flow-as-code/tf WRITES into the HCL it emits, as comments above the
  // resources they document (packages/tf/src/emit.ts). The studio bundles
  // that emitter for its Terraform export target, so these travel as output
  // text; nothing loads them, and the studio is still offline-clean.
  "https://docs.aws.amazon.com/connect/latest/APIReference/API_CreateContactFlowVersion.html",
  "https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/connect_contact_flow",
  "https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/connect_contact_flow_module",
  "https://registry.terraform.io/providers/hashicorp/awscc/latest/docs/resources/connect_contact_flow_module_alias",
  "https://registry.terraform.io/providers/hashicorp/awscc/latest/docs/resources/connect_contact_flow_module_version",
  // Library error-message links and license banners.
  "https://reactflow.dev/",
  "https://reactflow.dev?utm_source=attribution",
  "https://reactjs.org/docs/error-decoder.html?invariant=",
  "https://rolldown.rs/in-depth/bundling-cjs#require-external-modules",
  "https://tailwindcss.com",
]);

export const URL_PATTERN = /https?:\/\/[^\s"'`\\)]+/g;

/** Every absolute URL in `text` that is not on the allow-list. */
export function urlOffenders(text: string): string[] {
  return [...(text.match(URL_PATTERN) ?? [])].filter(
    (url) =>
      !ALLOWED_URLS.has(url) &&
      // Template-literal fragments of library error URLs ("https://${...}").
      !url.startsWith("https://${"),
  );
}

/**
 * The ways a page can talk to a server. A bundle that contains none of these
 * has no code path to a network request, whatever the URLs in it say.
 */
export const NETWORK_PRIMITIVES = [
  "fetch(",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "sendBeacon",
  "importScripts(",
  "serviceWorker",
] as const;

/** Every network primitive `text` mentions. */
export function primitiveOffenders(text: string): string[] {
  return NETWORK_PRIMITIVES.filter((needle) => text.includes(needle));
}

/** A built Vite output directory, or undefined when it has not been built. */
export function builtOutput(dir: string): { html: string; assets: string[] } | undefined {
  if (!existsSync(join(dir, "index.html")) || !existsSync(join(dir, "assets"))) return undefined;
  return {
    html: readFileSync(join(dir, "index.html"), "utf8"),
    assets: readdirSync(join(dir, "assets"))
      .sort()
      .map((name) => join(dir, "assets", name)),
  };
}
