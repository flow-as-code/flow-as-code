#!/usr/bin/env node
/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Assembles the publishable site tree (tasks/A14-hosted-demo.md,
// docs/05-hosted-demo.md):
//
//   dist-site/            <- site/*            (landing page, 404, CNAME, the logo files)
//   dist-site/docs/...    <- the repository's own markdown, rendered (PAGES below)
//   dist-site/studio/     <- packages/studio/dist-demo/*  (the read-only demo)
//   dist-site/sitemap.xml, robots.txt, llms.txt, llms-full.txt   (generated here)
//
// The studio is a copy, and the only thing rewritten in it is the <head> of
// its index.html, which gains the link-preview card the shell is not allowed to
// carry (studioCard below says why). Its assets are copied byte for byte and
// none of its links is rewritten: the artifact is proven relocatable by
// packages/studio/tests/demo-bundle.test.ts (`base: "./"`, so every asset
// reference is `./assets/...`), so rewriting it under a prefix would be both
// unnecessary and unverifiable. tests/site.test.ts holds the copy to being
// identical to the source apart from that one enumerated block.
//
// The docs pages exist so the project is findable. A reader who searches for
// "Amazon Connect FlowDoc" or an agent that fetches the site should reach the
// real spec, not a GitHub blob view of it, and everything published here is the
// markdown that is in the tree at build time, so a correction to a doc is a
// correction to the site with no second copy to update.
//
// Adding a page is one line in PAGES. Nothing is published by accident: the
// list is explicit, and a file not on it is not rendered.
//
// The one thing this script is strict about is publishing a stale studio. A
// missing or out-of-date dist-demo/ is not a warning; it exits non-zero with
// the command to run, because the failure it prevents is a deploy that looks
// successful and serves a months-old canvas.
//
// Usage: node scripts/build-site.mjs [--out <dir>]
// `--out` exists so tests can assemble into a scratch directory.

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { MARK_PATHS } from "../design/mark.mjs";
import { WORDMARK_PATH } from "../design/wordmark.mjs";

import {
  ICONS,
  escapeHtml,
  headingProblems,
  relativeUrl,
  renderMarkdown,
  renderPage,
  stripBanner,
} from "./site/render.mjs";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const SITE = join(ROOT, "site");
const DEMO = join(ROOT, "packages", "studio", "dist-demo");
const BUILD_COMMAND = "npm run build";
const LOGO_COMMAND = "npm run build:logo";
const RASTER_COMMAND = "npm run build:raster";
const GITHUB = "https://github.com/flow-as-code/flow-as-code";

/**
 * The card social platforms and chat clients show for a link to the site. It is
 * a real 1200x630 image in site/, not a promise: a missing file fails the build
 * rather than publishing an og:image tag pointing at a 404.
 */
const OG_IMAGE = {
  file: "og.png",
  width: 1200,
  height: 630,
  alt: "flow-as-code: flow as code for Amazon Connect. A Connect flow is JSON full of ARNs that differ per account and region; here references are tokens, so one document reaches dev and prod through CDK or Terraform.",
};

/**
 * The logo files that sit at the root of the deployed tree.
 *
 * Every one of them is generated (design/build-logo.mjs for the vectors,
 * design/build-raster.mjs for the pixels) and every one of them is checked here
 * rather than trusted, because each is a URL some other system holds: a browser
 * asking the origin for /favicon.ico, an iOS home screen, a chat client fetching
 * the card, and the README on npm and on GitHub, which can only reference an
 * image by absolute URL and therefore points at this site.
 *
 * `contains` is the staleness check, and it is content and not mtimes: a file
 * whose paths are no longer the ones in design/mark.mjs was generated from an
 * older mark, and a checkout gives every file the same timestamp, so a date
 * comparison here would be both flaky and wrong. `png` and `ico` are the
 * completeness check: a truncated or wrongly sized image is a broken card or a
 * blank tab, and the header says which it is in the first twenty-four bytes.
 */
const ROOT_ASSETS = [
  { file: "mark.svg", contains: MARK_PATHS, command: LOGO_COMMAND },
  { file: "favicon.svg", contains: MARK_PATHS, command: LOGO_COMMAND },
  { file: "logo.svg", contains: [...MARK_PATHS, WORDMARK_PATH], command: LOGO_COMMAND },
  { file: "logo-dark.svg", contains: [...MARK_PATHS, WORDMARK_PATH], command: LOGO_COMMAND },
  { file: "favicon.ico", ico: [16, 32], command: RASTER_COMMAND },
  { file: "apple-touch-icon.png", png: [180, 180], command: RASTER_COMMAND },
  { file: "logo.png", png: [480, 88], command: RASTER_COMMAND },
  { file: OG_IMAGE.file, png: [OG_IMAGE.width, OG_IMAGE.height], command: RASTER_COMMAND },
];

/**
 * What is published under /docs/, in the order the index lists it.
 *
 * `source` is a path in this repository and `slug` is the URL it is published
 * at; `title` and `description` are what a search result shows, so each one
 * describes THAT page rather than the project. Everything else on the page is
 * the file's own content.
 *
 * Deliberately not here: tasks/, which is internal sequencing rather than
 * something a reader of the site wants. README.md is not here either:
 * the landing page already says what it says, and two pages competing to be the
 * project's front door helps nobody.
 *
 * The list stays explicit rather than a glob because `title` and `description`
 * are written per page and are what a search result shows, and because the
 * groups here are the order the /docs/ index reads in. What a glob would have
 * bought is bought instead by a test: tests/site.test.ts fails if any markdown
 * file under docs/ is missing from this list, so a doc added to the tree cannot
 * go unpublished by omission the way docs/adr/0004 did.
 */
const PAGES = [
  {
    source: "docs/01-flowdoc-spec.md",
    slug: "docs/flowdoc-spec",
    group: "Format and design",
    title: "FlowDoc, the interchange format",
    description:
      "The JSON document every tool in the set reads and writes: its structure, the ${cdref:type:name} reference tokens, the invariants synth and codegen preserve, and how the format is versioned.",
  },
  {
    source: "docs/02-studio-design.md",
    slug: "docs/studio-design",
    group: "Format and design",
    title: "Studio design",
    description:
      "How the visual editor is put together: the canvas over FlowDoc, the bidirectional sync between canvas and typed TypeScript, the local bridge that flow-cli studio serves, and the in-app export targets.",
  },
  {
    source: "docs/03-tf-emitter.md",
    slug: "docs/terraform-emitter",
    group: "Format and design",
    title: "Terraform emitter design",
    description:
      "What the emitter writes for a set of flows, the rules it holds to (no literal ARNs, no provider or backend blocks), and the corrections that running it against OpenTofu produced.",
  },
  {
    source: "docs/05-hosted-demo.md",
    slug: "docs/hosted-demo",
    group: "Format and design",
    title: "The hosted read-only studio demo",
    description:
      "How the browser demo is built, what the demo build swaps out, how it is deployed, and the static and runtime checks that prove it makes no network request after its own assets load.",
  },
  {
    source: "examples/promote-across-environments/README.md",
    slug: "docs/promote-across-environments",
    group: "Worked example",
    title: "Promote one flow across two environments",
    description:
      "A walkthrough you can run: one FlowDoc reaching a dev and a prod environment down both the Terraform and the CDK path, with no per-environment ARN table, and what the example does not claim.",
  },
  {
    source: "packages/cli/README.md",
    slug: "docs/package-cli",
    group: "Package references",
    title: "flow-cli command reference",
    description:
      "Every flow-cli command with its flags, input and output conventions, and exit codes: lint, render, codegen, synth, emit, diff, export, simulate, and studio.",
  },
  {
    source: "packages/core/README.md",
    slug: "docs/package-core",
    group: "Package references",
    title: "@flow-as-code/core, the engine",
    description:
      "The package the others build on: typed builder and synthesizer, codegen, lint, FlowDoc interchange, export from a live Amazon Connect instance, and the simulate scenario runner and its limits.",
  },
  {
    source: "packages/cdk/README.md",
    slug: "docs/package-cdk",
    group: "Package references",
    title: "@flow-as-code/cdk, the CDK binding",
    description:
      "The TokenBinder interface that maps reference names to construct attributes, the FlowSet construct that turns a directory of FlowDocs into Connect resources, and the peer dependencies both need.",
  },
  {
    source: "packages/tf/README.md",
    slug: "docs/package-tf",
    group: "Package references",
    title: "@flow-as-code/tf, the HCL emitter",
    description:
      "Calling the emitter, the .tf and .tftpl files it writes, how references become template variables, how escaping works, and what an incomplete address map does to the output.",
  },
  {
    source: "packages/studio/README.md",
    slug: "docs/package-studio",
    group: "Package references",
    title: "@flow-as-code/studio, the visual editor",
    description:
      "The save gate every write path runs through, the demotion invariant that stops a canvas gesture from quietly losing typed authoring, the export targets, and the read-only stores.",
  },
  {
    source: "conformance/README.md",
    slug: "docs/conformance",
    group: "Contract and process",
    title: "The conformance suite",
    description:
      "The cross-language contract a second implementation has to reproduce: the fixture families for schema, flow language, lint, roundtrip, materialize, emit, export and simulate.",
  },
  {
    source: "CONTRIBUTING.md",
    slug: "docs/contributing",
    group: "Contract and process",
    title: "Contributing",
    description:
      "How work is done in this repository: getting set up, the rules that are not negotiable, why every test has to be able to fail, and the commit, docs and licensing conventions.",
  },
  {
    source: "docs/adr/0001-defer-jsii.md",
    slug: "docs/adr-defer-jsii",
    group: "Decisions",
    title: "ADR-0001: Defer jsii",
    description:
      "The decision not to publish the CDK package through jsii until the builder API stabilizes, and the type-system features the builder would have to give up to adopt it early.",
  },
  {
    source: "docs/adr/0002-error-branch-enforcement.md",
    slug: "docs/adr-error-branches",
    group: "Decisions",
    title: "ADR-0002: Error branches are required config properties",
    description:
      "Why an unwired error branch is caught as a type error through required config properties rather than a state-threaded fluent builder, and what that keeps codegen output readable.",
  },
  {
    source: "docs/adr/0003-action-ordering.md",
    slug: "docs/adr-action-ordering",
    group: "Decisions",
    title: "ADR-0003: Synth preserves declaration order",
    description:
      "Why synth emits actions in the order the author declared them rather than in graph reachability order, and what that buys the codegen round trip.",
  },
  {
    source: "docs/adr/0004-prior-art-aws-l2-cdk-library.md",
    slug: "docs/adr-prior-art-aws-l2-cdk-library",
    group: "Decisions",
    title: "ADR-0004: Prior art, and why this is not Amazon's L2 CDK library",
    description:
      "The technical difference against the L2 CDK construct library the AWS Contact Center blog described: references that stay ${cdref:type:name} tokens through to deploy time rather than ARNs written in by a centralized mapping table, and a Terraform path alongside the CDK one.",
  },
];

/** The /docs/ index, which is a page of the site like any other. */
const DOCS_INDEX = {
  slug: "docs",
  title: "Documentation",
  description:
    "Every document this project publishes: the FlowDoc format spec, the studio and Terraform emitter designs, the CLI and package references, a runnable promotion example, and the decision records.",
};

/** What each package is, for llms.txt. Kept to one clause each. */
const PACKAGE_ROLES = [
  [
    "@flow-as-code/core",
    "typed builder, synth, codegen, lint engine, FlowDoc interchange, export, simulate client",
  ],
  [
    "@flow-as-code/cli",
    "the flow-cli binary: lint, render, codegen, synth, emit, studio, diff, export, simulate",
  ],
  ["@flow-as-code/studio", "the visual editor over FlowDoc, served locally by flow-cli studio"],
  ["@flow-as-code/cdk", "CDK token binding (TokenBinder) and the FlowSet construct"],
  ["@flow-as-code/tf", "the Terraform and OpenTofu emitter: FlowDoc to .tf and .tftpl files"],
];

function parseArgs(argv) {
  let out = join(ROOT, "dist-site");
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--out") {
      const value = argv[i + 1];
      if (value === undefined) fail("--out needs a directory path.");
      out = resolve(value);
      i += 1;
    } else {
      fail(`Unknown argument ${argv[i]}. Usage: node scripts/build-site.mjs [--out <dir>]`);
    }
  }
  return out;
}

function fail(message) {
  console.error(`build-site: ${message}`);
  process.exit(1);
}

/** The newest mtime at or under `path`, and the file it belongs to. */
function newest(path, found = { at: 0, file: "" }) {
  if (!existsSync(path)) return found;
  const stat = statSync(path);
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) newest(join(path, entry), found);
  } else if (stat.isFile() && stat.mtimeMs > found.at) {
    found.at = stat.mtimeMs;
    found.file = path;
  }
  return found;
}

/**
 * What dist-demo/ is compared against to decide whether it is current: the
 * inputs to `vite build --mode demo`. Core's sources are in the list because
 * the demo bundles core, so a core edit that was never rebuilt leaves the
 * artifact just as stale as a studio edit. Tests and build output are not,
 * because neither changes a byte of the bundle.
 */
const SOURCE_PATHS = [
  join(ROOT, "packages", "studio", "src"),
  join(ROOT, "packages", "studio", "index.html"),
  join(ROOT, "packages", "studio", "vite.config.ts"),
  join(ROOT, "packages", "studio", "package.json"),
  join(ROOT, "packages", "core", "src"),
];

/** Exits with an actionable message unless dist-demo/ exists and is current. */
function requireCurrentDemo() {
  const missing = ["index.html", "assets"].filter((name) => !existsSync(join(DEMO, name)));
  if (!existsSync(DEMO) || missing.length > 0) {
    fail(
      `packages/studio/dist-demo/ is ${existsSync(DEMO) ? `incomplete (no ${missing.join(", ")})` : "missing"}. ` +
        `Run \`${BUILD_COMMAND}\` first; \`npm run build:demo\` alone fails on a clean ` +
        `checkout because the studio resolves @flow-as-code/core to packages/core/dist.`,
    );
  }

  const built = newest(DEMO);
  const stalest = { at: 0, file: "" };
  for (const path of SOURCE_PATHS) newest(path, stalest);
  if (stalest.at > built.at) {
    fail(
      `packages/studio/dist-demo/ is stale: ${relative(ROOT, stalest.file)} is newer than ` +
        `${relative(ROOT, built.file)}. Run \`${BUILD_COMMAND}\` before assembling the site, ` +
        `so the deploy does not publish an old canvas.`,
    );
  }
}

/** The pixel size a PNG declares in its IHDR chunk, or undefined. */
function pngSize(bytes) {
  if (bytes.length < 24 || bytes.subarray(1, 4).toString("ascii") !== "PNG") return undefined;
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

/**
 * The sizes an ICO holds, from its directory: a 6 byte header whose third field
 * is the image count, then one 16 byte entry each, starting with the width.
 * A zero means 256, which is the format's way of fitting 256 into a byte.
 */
function icoSizes(bytes) {
  if (bytes.length < 6 || bytes.readUInt16LE(0) !== 0 || bytes.readUInt16LE(2) !== 1) return [];
  const count = bytes.readUInt16LE(4);
  if (bytes.length < 6 + count * 16) return [];
  const sizes = [];
  for (let i = 0; i < count; i += 1) {
    const width = bytes.readUInt8(6 + i * 16);
    sizes.push(width === 0 ? 256 : width);
  }
  return sizes;
}

/**
 * Exits unless every logo file is present, whole, and generated from the mark
 * and wordmark that are in the tree now. See ROOT_ASSETS for why each rule.
 */
function requireCurrentLogo() {
  for (const asset of ROOT_ASSETS) {
    const path = join(SITE, asset.file);
    if (!existsSync(path)) fail(`site/${asset.file} is missing. Run \`${asset.command}\`.`);
    const bytes = readFileSync(path);
    if (bytes.length === 0) fail(`site/${asset.file} is empty. Run \`${asset.command}\`.`);

    for (const fragment of asset.contains ?? []) {
      if (!bytes.toString("utf8").includes(fragment)) {
        fail(
          `site/${asset.file} was generated from an older mark or wordmark: it does not ` +
            `carry the path data in design/. Run \`${asset.command}\`.`,
        );
      }
    }
    if (asset.png !== undefined) {
      const size = pngSize(bytes);
      if (size === undefined) fail(`site/${asset.file} is not a PNG. Run \`${asset.command}\`.`);
      if (size[0] !== asset.png[0] || size[1] !== asset.png[1]) {
        fail(
          `site/${asset.file} is ${size.join("x")}, not ${asset.png.join("x")}. ` +
            `Run \`${asset.command}\`.`,
        );
      }
    }
    if (asset.ico !== undefined) {
      const sizes = icoSizes(bytes);
      const missing = asset.ico.filter((size) => !sizes.includes(size));
      if (missing.length > 0) {
        fail(
          `site/${asset.file} holds ${sizes.length === 0 ? "no icon" : sizes.join(", ")} and a ` +
            `browser asks for ${missing.join(", ")}. Run \`${asset.command}\`.`,
        );
      }
    }
  }

  // The landing page is hand-authored and carries the mark inline, so it is the
  // one copy of these coordinates that no generator maintains. Drift here is
  // silent: the page would keep rendering, with last month's mark.
  const landing = readFileSync(join(SITE, "index.html"), "utf8");
  for (const path of MARK_PATHS) {
    if (!landing.includes(path)) {
      fail(
        "site/index.html does not carry the mark in design/mark.mjs. Update the inline " +
          "<svg> in its <h1> to the paths in that file.",
      );
    }
  }
  for (const icon of ICONS) {
    if (!landing.includes(`rel="${icon.rel}" href="./${icon.file}"`)) {
      fail(`site/index.html does not link ./${icon.file} with rel="${icon.rel}".`);
    }
  }
}

/**
 * The origin the site is published at, read from site/CNAME rather than written
 * twice. Every absolute URL the build emits (canonical, Open Graph, JSON-LD,
 * the sitemap, llms.txt) is built from this, so the hostname cannot drift from
 * the one GitHub Pages serves.
 */
function readOrigin() {
  const cname = join(SITE, "CNAME");
  if (!existsSync(cname)) fail("site/CNAME is missing; it is where the origin comes from.");
  const host = readFileSync(cname, "utf8").trim();
  if (!/^[a-z0-9.-]+$/i.test(host))
    fail(`site/CNAME is not a bare hostname: ${JSON.stringify(host)}`);
  return `https://${host}`;
}

/** The site URL of a slug ("" is the root, "docs/x" is a page). */
function pageUrl(origin, slug) {
  return `${origin}/${slug === "" ? "" : `${slug}/`}`;
}

function isDirectory(repoPath) {
  const full = join(ROOT, repoPath);
  return existsSync(full) && statSync(full).isDirectory();
}

/** Home > Docs > this page, as both a nav and a BreadcrumbList. */
function breadcrumbs(origin, page) {
  const trail = [
    { name: "flow-as-code", slug: "" },
    { name: "Docs", slug: "docs" },
    ...(page.slug === "docs" ? [] : [{ name: page.title, slug: page.slug }]),
  ];
  return {
    nav: trail.map((step, i) => ({
      name: step.name,
      href: i === trail.length - 1 ? undefined : relativeUrl(page.slug, step.slug),
    })),
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: trail.map((step, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: step.name,
        item: pageUrl(origin, step.slug),
      })),
    },
  };
}

/** Renders one markdown page, failing the build on a broken heading structure. */
function renderDocPage(page, origin, ogImage, pageBySource) {
  const source = join(ROOT, page.source);
  if (!existsSync(source)) fail(`PAGES names ${page.source}, which does not exist.`);
  const markdown = stripBanner(readFileSync(source, "utf8"), origin);
  const { html, headings } = renderMarkdown(markdown, {
    sourcePath: page.source,
    slug: page.slug,
    pageBySource,
    isDirectory,
    github: GITHUB,
  });

  const problems = headingProblems(headings);
  if (problems.length > 0) {
    // A skipped level or a second h1 is a real defect for a screen reader and
    // for a crawler, and it is the source file that has to change, so the build
    // names the file rather than patching the output.
    fail(`${page.source} has a heading structure a page cannot use: ${problems.join("; ")}`);
  }

  const crumbs = breadcrumbs(origin, page);
  return renderPage({
    slug: page.slug,
    title: `${page.title} | flow-as-code`,
    description: page.description,
    origin,
    ogImage,
    jsonLd: [crumbs.jsonLd],
    crumbs: crumbs.nav,
    bodyHtml: html,
    editPath: page.source,
    github: GITHUB,
  });
}

/** The /docs/ index: the same list PAGES holds, grouped, with the descriptions. */
function renderDocsIndex(origin, ogImage) {
  const groups = [];
  for (const page of PAGES) {
    const group = groups.find((g) => g.name === page.group);
    if (group === undefined) groups.push({ name: page.group, pages: [page] });
    else group.pages.push(page);
  }

  const body = [
    "<h1>Documentation</h1>",
    "<p>",
    "  Everything below is a file in the repository, rendered here so it can be read and",
    "  linked without a checkout. Each page links to its source, and a correction is a pull",
    "  request against that file.",
    "</p>",
    ...groups.flatMap((group) => [
      `<h2>${group.name}</h2>`,
      `<ul class="pages">`,
      ...group.pages.flatMap((page) => [
        "  <li>",
        `    <a href="${relativeUrl(DOCS_INDEX.slug, page.slug)}">${escapeHtml(page.title)}</a>`,
        `    <p>${escapeHtml(page.description)}</p>`,
        "  </li>",
      ]),
      "</ul>",
    ]),
  ].join("\n");

  const crumbs = breadcrumbs(origin, DOCS_INDEX);
  return renderPage({
    slug: DOCS_INDEX.slug,
    title: `${DOCS_INDEX.title} | flow-as-code`,
    description: DOCS_INDEX.description,
    origin,
    ogImage,
    jsonLd: [crumbs.jsonLd],
    crumbs: crumbs.nav,
    bodyHtml: body,
    github: GITHUB,
  });
}

/** Every HTML page in the assembled tree, as site paths, sorted. */
function publishedPaths(out, dir = out, found = []) {
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) publishedPaths(out, full, found);
    else if (entry === "index.html")
      found.push(`${relative(out, dirname(full))}/`.replace(/^\/$/, ""));
    else if (entry.endsWith(".html") && entry !== "404.html") found.push(relative(out, full));
  }
  return found;
}

/**
 * The sitemap is generated from the tree that was actually assembled, not from
 * PAGES, so it cannot list a page that was not published or miss one that was.
 * 404.html is excluded: it is served for unknown paths and is not a page.
 */
function sitemap(origin, paths) {
  const urls = paths
    .map((path) => `  <url>\n    <loc>${origin}/${path}</loc>\n  </url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function robots(origin) {
  return `# Everything here is public and meant to be read: a landing page, a read-only
# build of the studio, and this repository's own documentation. There is no
# crawl budget to protect and nothing is disallowed to anyone.
User-agent: *
Allow: /

# AI crawlers are covered by the group above. They are named again here so the
# intent is legible rather than inferred: this site is open to them too.
User-agent: GPTBot
User-agent: OAI-SearchBot
User-agent: ChatGPT-User
User-agent: ClaudeBot
User-agent: Claude-User
User-agent: Claude-SearchBot
User-agent: PerplexityBot
User-agent: Google-Extended
User-agent: Applebot-Extended
User-agent: CCBot
Allow: /

# ${origin}/llms.txt is a short, linked map of this site for language models.
Sitemap: ${origin}/sitemap.xml
`;
}

/**
 * llms.txt, per llmstxt.org: an H1, a blockquote summary, a little prose, then
 * H2 sections of links. Generated from PAGES so the link list is the published
 * list, and honest about the state of the project: what is on npm, and
 * saying otherwise would send a reader to an install command that fails.
 */
function llmsTxt(origin) {
  const groups = [];
  for (const page of PAGES) {
    const group = groups.find((g) => g.name === page.group);
    if (group === undefined) groups.push({ name: page.group, pages: [page] });
    else group.pages.push(page);
  }

  return `# flow-as-code

> Open-source tooling that moves an Amazon Connect flow between accounts, regions and instances without a per-environment ARN mapping table: references are held as \`\${cdref:type:name}\` tokens and resolved by AWS CDK or Terraform/OpenTofu at deploy. Typed authoring in TypeScript, a visual editor, lint, simulate-based testing and export from a live instance all round-trip through one interchange format called FlowDoc.

The problem it solves: an Amazon Connect flow is a JSON document full of literal ARNs, and the ARNs differ per account, per region, per instance. Promoting one flow from dev to prod therefore means maintaining a mapping from "the queue I mean" to "the ARN it has in this environment", and something has to rewrite the document before each deployment. flow-as-code makes the flow a typed TypeScript file and a JSON document that hold references as \`\${cdref:type:name}\` tokens instead of ARNs; the deploy path (CDK tokens, or Terraform resource references) resolves them per environment. A literal ARN in authored content fails a hard lint rule. Codegen writes the same document back as TypeScript byte-identically on every run (\`packages/core/src/roundtrip.test.ts\`), so a change to a flow is a diff a reviewer can read rather than a re-exported JSON blob.

Where that claim is held to what the tools do: \`examples/promote-across-environments/\` (published below) is one FlowDoc reaching a dev and a prod environment on both deploy paths, and \`tests/promoteAcrossEnvironments.test.ts\` asserts that the two emitted Terraform trees differ in exactly one file, \`flow_refs.tf\`, and that the CDK path takes no map at all. The Terraform path does take an \`--address-map\`, which is a different object from the ARN table above: its values are Terraform addresses of resources the reader's own configuration manages, and the emitter refuses any value matching \`arn:aws\` outright.

Status: the repository is public and Apache-2.0. The five packages are published to npm under the @flow-as-code scope, versioned together and released as a set, so install them at matching versions. The studio demo below is live and runs entirely in the browser, with no install and no account.

## Start here

- [Landing page](${pageUrl(origin, "")}): the ARN table the tooling exists to delete, the token that replaces it, and the packages.
- [Studio demo](${pageUrl(origin, "studio")}): the visual editor running read-only in the browser on a demo flow, no account, no network calls.
- [Promote one flow across two environments](${pageUrl(origin, "docs/promote-across-environments")}): the runnable version of the thesis, and what it does not claim.
- [Documentation index](${pageUrl(origin, DOCS_INDEX.slug)}): every document listed below, with a one-line summary each.
- [Source on GitHub](${GITHUB}): the monorepo, issues, and the license.

## Packages

Five packages, versioned together and released as a set.

${PACKAGE_ROLES.map(([name, role]) => `- ${name}: ${role}.`).join("\n")}

${groups
  .map(
    (group) =>
      `## ${group.name}\n\n${group.pages
        .map((page) => `- [${page.title}](${pageUrl(origin, page.slug)}): ${page.description}`)
        .join("\n")}`,
  )
  .join("\n\n")}

## Optional

- [llms-full.txt](${origin}/llms-full.txt): every page above as one markdown file, for a model that would rather fetch once than crawl.
- [Conformance fixtures](${GITHUB}/tree/main/conformance): the cross-language contract, as data.
`;
}

/**
 * llms-full.txt: the same documents, concatenated as markdown. It is here
 * because the alternative for an agent is fifteen fetches of HTML it has to
 * strip back to text, and the source of these pages is markdown already, so the
 * file costs one concatenation and no second source of truth.
 */
function llmsFullTxt(origin) {
  const parts = PAGES.map((page) => {
    const markdown = stripBanner(readFileSync(join(ROOT, page.source), "utf8"), origin).trim();
    return `<!-- ${pageUrl(origin, page.slug)} (${page.source}) -->\n\n${markdown}\n`;
  });
  return `<!-- flow-as-code: every published document, concatenated. Generated by scripts/build-site.mjs. -->\n<!-- Index and summaries: ${origin}/llms.txt -->\n\n${parts.join("\n---\n\n")}`;
}

/**
 * The link-preview card for the copied studio, injected into the copy.
 *
 * /studio/ is the link this project leads with: the editor running, no install
 * and no account. Pasted into Slack or anywhere else that unfurls a URL it was
 * a bare line of text, because the studio shell carries a description and
 * nothing else. That is deliberate in the shell and stays deliberate:
 * packages/studio/index.html may hold no href, no src and no absolute URL, and
 * packages/studio/tests/demo-bundle.test.ts proves it, which is what makes
 * "this bundle loads nothing beyond its own origin" a fact rather than a claim
 * and what lets the artifact be relocated under any prefix.
 *
 * A card needs absolute URLs, so it is written HERE, onto the copy, where the
 * origin is known and the published bundle is untouched. Nothing a card
 * declares is fetched by the visitor's browser: og:image is fetched by the
 * scraper's servers from a meta content attribute, and rel=canonical is a
 * statement about the address, not a request. So the copy makes no request the
 * source did not, and the studio's own guard is unchanged.
 *
 * Title and description are read back out of the copied shell rather than
 * written again here, so the card cannot drift from the page it describes.
 */
function studioCard(html, origin, ogImage) {
  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1];
  const description = /<meta name="description" content="([^"]*)"/.exec(html)?.[1];
  if (title === undefined || description === undefined) {
    fail("the copied studio shell has no title or no description to build a card from.");
  }
  const url = `${origin}/studio/`;
  const tags = [
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="flow-as-code" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${ogImage.url}" />`,
    `<meta property="og:image:width" content="${String(ogImage.width)}" />`,
    `<meta property="og:image:height" content="${String(ogImage.height)}" />`,
    `<meta property="og:image:alt" content="${escapeHtml(ogImage.alt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${ogImage.url}" />`,
  ];
  const closing = /\n([ \t]*)<\/head>/;
  const indent = closing.exec(html)?.[1];
  if (indent === undefined) fail("the copied studio shell has no </head> to inject into.");
  // Delimited, so the one edit this script makes to another package's artifact
  // is visible in the served HTML and can be checked as a block.
  const block = [
    "",
    `${indent}  <!-- Link-preview card, injected by scripts/build-site.mjs. -->`,
    ...tags.map((tag) => `${indent}  ${tag}`),
  ].join("\n");
  return html.replace(closing, `${block}\n${indent}</head>`);
}

function main() {
  const OUT = parseArgs(process.argv.slice(2));

  // The first thing main() does to OUT is delete it, so refuse anything that
  // is not a leaf of its own: the repo root, or an ancestor of it.
  if (OUT === ROOT || ROOT.startsWith(OUT + "/")) fail(`refusing to empty ${OUT}.`);
  if (!existsSync(join(SITE, "index.html"))) fail("site/index.html is missing.");
  if (!existsSync(join(SITE, OG_IMAGE.file))) fail(`site/${OG_IMAGE.file} is missing.`);
  if (existsSync(join(SITE, "studio"))) {
    fail("site/studio exists and would collide with the copied demo. Rename or remove it.");
  }
  if (existsSync(join(SITE, "docs"))) {
    fail("site/docs exists and would collide with the rendered docs. Rename or remove it.");
  }
  requireCurrentDemo();
  requireCurrentLogo();

  const origin = readOrigin();
  const ogImage = {
    url: `${origin}/${OG_IMAGE.file}`,
    width: OG_IMAGE.width,
    height: OG_IMAGE.height,
    alt: OG_IMAGE.alt,
  };
  const pageBySource = new Map(PAGES.map((page) => [page.source, page]));
  const slugs = new Set();
  for (const page of PAGES) {
    if (slugs.has(page.slug)) fail(`two pages claim the slug ${page.slug}.`);
    slugs.add(page.slug);
  }

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  cpSync(SITE, OUT, { recursive: true });
  cpSync(DEMO, join(OUT, "studio"), { recursive: true });
  // The one edit made to the copied artifact, and only to its <head>: see
  // studioCard above for why the card cannot live in the shell itself.
  const studioIndex = join(OUT, "studio", "index.html");
  writeFileSync(studioIndex, studioCard(readFileSync(studioIndex, "utf8"), origin, ogImage));

  const write = (path, contents) => {
    const full = join(OUT, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents);
  };

  write(join(DOCS_INDEX.slug, "index.html"), renderDocsIndex(origin, ogImage));
  for (const page of PAGES) {
    write(join(page.slug, "index.html"), renderDocPage(page, origin, ogImage, pageBySource));
  }

  const paths = publishedPaths(OUT).sort();
  write("sitemap.xml", sitemap(origin, paths));
  write("robots.txt", robots(origin));
  write("llms.txt", llmsTxt(origin));
  write("llms-full.txt", llmsFullTxt(origin));

  const roots = readdirSync(OUT).sort().join(", ");
  console.log(
    `build-site: ${relative(ROOT, OUT) || OUT} assembled from site/, docs, and dist-demo/.`,
  );
  console.log(`build-site: ${String(paths.length)} pages at ${origin}/ ; top level: ${roots}`);
}

main();
