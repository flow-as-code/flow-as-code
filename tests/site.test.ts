/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The published site, as a test rather than as prose (tasks/A14-hosted-demo.md,
// docs/05-hosted-demo.md).
//
// packages/studio/tests/demo-bundle.test.ts already proves the studio artifact
// loads nothing but its own assets. That proof is worth nothing if the pages in
// front of it pull in a font, a script, or a pixel, or if the step that copies
// the artifact under /studio/ rewrote more of it than the one block of
// link-preview tags it is allowed to inject. So this file assembles
// the tree with the real scripts/build-site.mjs into a scratch directory and
// judges the result:
//
//   - no page loads a subresource but its own icon, and the only <script>
//     anywhere is a JSON-LD data block with no src, so the whole site is as
//     inert as the studio it fronts;
//   - every page carries the same icon, the files it names are in the tree at
//     the sizes their readers demand, and every vector one of them was drawn
//     from the mark and wordmark that are in design/ now;
//   - the studio shell still declares no icon, and carries no absolute URL
//     outside the injected card, because the root /favicon.ico covers the icon
//     without an edit to a guarded byte;
//   - every internal link, on every page, resolves to a file in the tree, and a
//     link with a fragment resolves to an id on the page it names;
//   - every indexed page carries a title, a description, and a canonical URL
//     that is its own URL, and no two pages share a title or a description;
//   - the sitemap lists exactly the pages that were published, no more and no
//     fewer, because it is generated from the assembled tree;
//   - robots.txt names the sitemap and disallows nobody, and every site link in
//     llms.txt resolves to a file that exists;
//   - the JSON-LD parses and asserts only schema.org types the pages really are;
//   - CNAME is the apex and nothing else, and every absolute URL on the site
//     points at that apex, the repository, or a license or vocabulary;
//   - the studio is present and identical to packages/studio/dist-demo apart
//     from that one enumerated block of link-preview tags;
//   - the quick start each on-ramp prints, the landing page's and the root
//     README's, installs one package, names only commands the CLI has, and runs
//     them in an order that works;
//   - every markdown file under docs/ reaches a URL, so a doc left off the
//     hand-written page list is a failure rather than a page nobody can find.
//
// Needs `npm run build` (for dist-demo). Without it the assembler exits with
// the command to run and the first test reports that; the rest skip.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const DEMO = join(ROOT, "packages", "studio", "dist-demo");
const APEX = "flow-as-code.dev";
const ORIGIN = `https://${APEX}`;
const REPO = "https://github.com/flow-as-code/flow-as-code";

/** Tags that fetch a subresource. A page with none of them loads nothing. */
const SUBRESOURCE_TAGS = [
  "script",
  "link",
  "img",
  "iframe",
  "embed",
  "object",
  "video",
  "audio",
  "source",
  "track",
] as const;

/**
 * Origins an absolute URL on this site may point at: its own apex, the
 * repository, the license the project is under, and the vocabulary the JSON-LD
 * is written in. Anything else is a third party arriving on the page.
 */
const ALLOWED_ORIGINS = [
  ORIGIN,
  REPO,
  "https://www.apache.org/licenses/",
  "https://schema.org",
  "https://docs.github.com/",
];

const scratch = mkdtempSync(join(tmpdir(), "flow-site-"));
const out = join(scratch, "dist-site");

/** The assembled tree, or the assembler's own error message when it refused. */
const assembled = ((): { ok: true } | { ok: false; why: string } => {
  try {
    execFileSync(process.execPath, [join(ROOT, "scripts", "build-site.mjs"), "--out", out], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true };
  } catch (error) {
    const err = error as { stderr?: string; message?: string };
    return { ok: false, why: (err.stderr ?? err.message ?? "").trim() };
  }
})();
const built = assembled.ok;

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const read = (...parts: string[]): string => readFileSync(join(out, ...parts), "utf8");

/** Every `href`/`src` value in `html`, in document order. */
function references(html: string): string[] {
  return [...html.matchAll(/\b(?:href|src)\s*=\s*"([^"]*)"/g)].map((m) => m[1]!);
}

/**
 * HTML comments are not served to a reader and not fetched by anything, so
 * every rule below reads the document with them removed. The landing page's
 * header comment cites a URL and the 404 page's cites the GitHub Pages doc;
 * neither is a link on the page.
 */
function withoutComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}

/** Every .html file in the tree, as a path relative to the site root. */
function htmlFiles(dir: string = out, found: string[] = []): string[] {
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) htmlFiles(full, found);
    else if (entry.endsWith(".html")) found.push(relative(out, full));
  }
  return found;
}

/** The site path a file is served at: docs/x/index.html is served at docs/x/. */
function servedAt(file: string): string {
  return file.endsWith("index.html") ? file.slice(0, -"index.html".length) : file;
}

/**
 * The pages this site is responsible for: everything except the copied studio,
 * which is a build artifact of another package and is judged as bytes.
 */
const ownPages = (): string[] => htmlFiles().filter((file) => !file.startsWith("studio/"));

/** The indexed pages: own pages minus 404.html, which has no URL of its own. */
const indexedPages = (): string[] => ownPages().filter((file) => file !== "404.html");

/** Every markdown file under docs/, as a path relative to the repository root. */
function docsMarkdown(dir: string = join(ROOT, "docs"), found: string[] = []): string[] {
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) docsMarkdown(full, found);
    else if (entry.endsWith(".md")) found.push(relative(ROOT, full));
  }
  return found;
}

/**
 * The repository file a rendered page was generated from, which every doc page
 * names in a comment in its first line.
 */
function generatedFrom(file: string): string | undefined {
  return /Generated by scripts\/build-site\.mjs from (.+?)\. Do not edit by hand\./.exec(
    read(file),
  )?.[1];
}

/**
 * The declarations a page's inline stylesheet attaches to a selector, as one
 * string per rule that names it. Selectors are compared whole after splitting
 * on commas, so `code` matches the rule for every `<code>` and does not match
 * `pre code` or `.pages code`, which are rules about a subset of them.
 */
function declarationsFor(html: string, selector: string): string[] {
  const found: string[] = [];
  for (const style of html.match(/<style>[\s\S]*?<\/style>/g) ?? []) {
    // Comments first: both stylesheets explain this rule in prose directly
    // above it, and a comment left in place would be read as part of the
    // selector that follows it.
    for (const rule of style.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selectors = rule[1]!.split(",").map((part) => part.trim());
      if (selectors.includes(selector)) found.push(rule[2]!);
    }
  }
  return found;
}

/** The comment scripts/build-site.mjs opens the injected studio card with. */
const CARD_MARKER = "<!-- Link-preview card, injected by scripts/build-site.mjs. -->";

/**
 * Exactly what the copied studio shell is allowed to gain, by tag. A card needs
 * absolute URLs and that shell may carry none, so build-site.mjs writes these
 * onto the copy; this list is the whole of the licence for that. A tag that
 * turns up in the block and is not here fails, and so does one here that stops
 * being injected.
 */
const CARD_TAGS = [
  'link rel="canonical"',
  'meta property="og:type"',
  'meta property="og:site_name"',
  'meta property="og:title"',
  'meta property="og:description"',
  'meta property="og:url"',
  'meta property="og:image"',
  'meta property="og:image:width"',
  'meta property="og:image:height"',
  'meta property="og:image:alt"',
  'meta name="twitter:card"',
  'meta name="twitter:title"',
  'meta name="twitter:description"',
  'meta name="twitter:image"',
];

/**
 * The copied studio shell split into the injected block and everything else.
 * The block is the marker comment plus the run of meta and link tags after it,
 * which is how build-site.mjs writes it and where it stops: the next line is
 * the closing </head>.
 */
function splitCard(html: string): { card: string[]; rest: string } {
  const lines = html.split("\n");
  const start = lines.findIndex((line) => line.includes(CARD_MARKER));
  expect(start, "the injected card is marked in the studio shell").toBeGreaterThan(-1);
  let end = start + 1;
  while (end < lines.length && /^\s*<(?:meta|link)\b/.test(lines[end]!)) end += 1;
  return {
    card: lines.slice(start + 1, end).map((line) => line.trim()),
    rest: [...lines.slice(0, start), ...lines.slice(end)].join("\n"),
  };
}

const attribute = (tag: string, name: string): string | undefined =>
  new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`).exec(tag)?.[1];

/** The content of `<meta name|property="...">`, or undefined. */
function meta(html: string, key: string): string | undefined {
  for (const tag of html.match(/<meta\b[^>]*>/g) ?? []) {
    if (attribute(tag, "name") === key || attribute(tag, "property") === key) {
      return attribute(tag, "content");
    }
  }
  return undefined;
}

function title(html: string): string | undefined {
  return /<title>([^<]*)<\/title>/.exec(html)?.[1];
}

function canonical(html: string): string | undefined {
  for (const tag of html.match(/<link\b[^>]*>/g) ?? []) {
    if (attribute(tag, "rel") === "canonical") return attribute(tag, "href");
  }
  return undefined;
}

/** Every JSON-LD block on a page, parsed. */
function jsonLd(html: string): unknown[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (m) => JSON.parse(m[1]!) as unknown,
  );
}

/** Every `@type` value anywhere in a parsed JSON-LD document. */
function types(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) for (const item of value) types(item, found);
  else if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key === "@type") found.push(item as string);
      else types(item, found);
    }
  }
  return found;
}

/**
 * Where a link points, as a path in the built tree, or undefined when it leaves
 * the site. Root-relative links resolve against the site root, which only
 * 404.html uses and for a reason it documents.
 */
function target(file: string, href: string): { path: string; fragment: string } | undefined {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//") || href.startsWith("#")) {
    return undefined;
  }
  const [pathPart, fragment = ""] = href.split("#");
  if (pathPart === "") return undefined;
  const base = href.startsWith("/") ? out : join(out, dirname(file));
  const resolved = resolve(base, href.startsWith("/") ? `.${pathPart}` : pathPart);
  return { path: pathPart.endsWith("/") ? join(resolved, "index.html") : resolved, fragment };
}

describe("the published site tree", () => {
  it("assembles", () => {
    expect(built, assembled.ok ? "" : assembled.why).toBe(true);
  });

  it.runIf(built)("publishes the landing page, the docs, the studio, and nothing stray", () => {
    expect(readdirSync(out).sort()).toEqual([
      "404.html",
      "CNAME",
      "apple-touch-icon.png",
      "docs",
      "favicon.ico",
      "favicon.svg",
      "index.html",
      "llms-full.txt",
      "llms.txt",
      "logo-dark.svg",
      "logo.png",
      "logo.svg",
      "mark.svg",
      "og.png",
      "robots.txt",
      "sitemap.xml",
      "studio",
      // Not a page and not a logo: the screenshot the READMEs show. npm and
      // GitHub can only render an image by absolute URL, so it lives here for
      // the same reason logo.png does.
      "studio-screenshot.png",
    ]);
  });

  it.runIf(built)("serves CNAME as the apex and nothing else", () => {
    // GitHub Pages reads this file as a single hostname. A comment, a second
    // host, a scheme, or a path in it is not a stricter CNAME, it is a broken
    // one, so this is an equality check and not a `toContain`.
    expect(read("CNAME")).toBe(`${APEX}\n`);
  });

  it.runIf(built)("renders more than a couple of docs pages", () => {
    // A generator that silently produced nothing would pass every rule below.
    const docs = indexedPages().filter((file) => file.startsWith("docs/"));
    expect(docs.length).toBeGreaterThan(10);
    expect(docs).toContain("docs/index.html");
    expect(docs).toContain("docs/flowdoc-spec/index.html");
  });

  it.runIf(built)("gives every markdown file under docs/ a URL", () => {
    // The page list in scripts/build-site.mjs is written by hand so that each
    // page can carry its own title and description. The cost is that a doc
    // added to the tree and not to the list is published nowhere and the /docs/
    // index does not mention it, with nothing red to say so: that is what
    // happened to docs/adr/0004-prior-art-aws-l2-cdk-library.md, which existed
    // for a day with no URL. This reads the assembled tree rather than the
    // list, so it judges the pages that were actually written out.
    const published = new Set(
      indexedPages()
        .filter((file) => file.startsWith("docs/"))
        .map(generatedFrom)
        .filter((source): source is string => source !== undefined),
    );
    const docs = docsMarkdown();
    expect(docs.length).toBeGreaterThan(5);
    expect(
      docs.filter((source) => !published.has(source)),
      "markdown under docs/ that reaches no URL on the site",
    ).toEqual([]);
  });
});

describe("every page the site publishes", () => {
  it.runIf(built)("loads no subresource, and carries no script but JSON-LD data", () => {
    for (const file of ownPages()) {
      const html = withoutComments(read(file));
      for (const tag of SUBRESOURCE_TAGS) {
        const opens = html.toLowerCase().match(new RegExp(`<${tag}[\\s/>]`, "g")) ?? [];
        if (tag === "script") {
          // A JSON-LD block fetches nothing and executes nothing. Anything
          // else with this tag name does one or the other.
          for (const script of html.match(/<script\b[^>]*>/g) ?? []) {
            expect(attribute(script, "type"), `<script> in ${file}`).toBe("application/ld+json");
            expect(attribute(script, "src"), `<script src> in ${file}`).toBeUndefined();
          }
        } else if (tag === "link") {
          // rel=canonical is a statement about the page, not a fetch. The icon
          // is the one fetch a page here makes, and it is a file at the root of
          // this same tree: a browser asks the origin for /favicon.ico whether
          // or not a page declares one, so the choice is not between a request
          // and no request, it is between a request that 404s and one that does
          // not. Every other rel (stylesheet, preload, prefetch, dns-prefetch)
          // is a third party or a round trip nothing here needs.
          for (const link of html.match(/<link\b[^>]*>/g) ?? []) {
            const rel = attribute(link, "rel");
            expect(["canonical", "icon", "apple-touch-icon"], `<link rel> in ${file}`).toContain(
              rel,
            );
            if (rel === "canonical") continue;
            const href = attribute(link, "href") ?? "";
            expect(href, `${rel!} href in ${file} leaves this origin`).not.toMatch(
              /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i,
            );
            expect(
              existsSync(target(file, href)?.path ?? ""),
              `${rel!} in ${file} points at ${href}, which is not a file in the tree`,
            ).toBe(true);
          }
        } else {
          expect(opens, `<${tag}> in ${file}`).toEqual([]);
        }
      }
      // Inline CSS may not reach out either: a webfont or a background image on
      // a remote origin is the same leak as a <link>, and `url(http` is how it
      // would be spelled. Scoped to the stylesheet, because a docs page whose
      // subject is CSS scanning contains the word @import as prose.
      for (const style of html.match(/<style>[\s\S]*?<\/style>/g) ?? []) {
        expect(style, `@import in the CSS of ${file}`).not.toMatch(/@import/i);
        expect(style, `remote url() in the CSS of ${file}`).not.toMatch(
          /url\(\s*['"]?(?:https?:)?\/\//i,
        );
      }
    }
  });

  it.runIf(built)("lets a long word break instead of widening the page on a phone", () => {
    // These pages are full of words no phone can fit and no browser breaks on
    // its own: terraform addresses, schema paths, cdref tokens, package names
    // inline in <code>, and bare AWS documentation URLs as link text. One of
    // them in a paragraph pans the whole page sideways, which is the failure
    // the .scroll wrapper already prevents for tables and overflow-x prevents
    // for code blocks. Measured in Chrome in a 375px frame before these two
    // declarations existed, documentElement.scrollWidth against a 360px
    // clientWidth: /docs/package-cdk/ 797, /docs/terraform-emitter/ 557,
    // /docs/package-cli/ 524, /docs/flowdoc-spec/ 519, nine pages in all, and
    // the overflowing elements were ordinary <p> and <li>. After: 360 on every
    // page. Held here rather than in the renderer's own tests because it is a
    // property of the published page, and site/index.html carries the same
    // rule on <code> for the same reason.
    for (const file of ownPages()) {
      const html = read(file);
      if (/<code[\s>]/.test(html)) {
        const rules = declarationsFor(html, "code");
        expect(rules.length, `a rule for <code> in ${file}`).toBeGreaterThan(0);
        expect(
          rules.some((body) => /overflow-wrap:\s*(?:break-word|anywhere)\s*;/.test(body)),
          `<code> in ${file} cannot break, so one long token widens the page`,
        ).toBe(true);
      }
      // The backstop, on the rendered docs pages, where the long words also
      // arrive as plain text. The landing page and 404.html are written by
      // hand, are short, and measure clean without it.
      if (!file.startsWith("docs/")) continue;
      expect(
        declarationsFor(html, "body").some((body) =>
          /overflow-wrap:\s*(?:break-word|anywhere)\s*;/.test(body),
        ),
        `body in ${file} cannot break a long word that is not in <code>`,
      ).toBe(true);
    }
  });

  it.runIf(built)("declares its language, its viewport, and exactly one h1", () => {
    for (const file of ownPages()) {
      const html = read(file);
      expect(html, `lang in ${file}`).toMatch(/<html lang="en">/);
      expect(meta(html, "viewport"), `viewport in ${file}`).toContain("width=device-width");
      expect((html.match(/<h1[\s>]/g) ?? []).length, `h1 count in ${file}`).toBe(1);
    }
  });

  it.runIf(built)("carries a title and a description, and shares neither with another page", () => {
    const titles = new Set<string>();
    const descriptions = new Set<string>();
    for (const file of ownPages()) {
      const html = read(file);
      const pageTitle = title(html);
      const description = meta(html, "description");
      expect(pageTitle, `title in ${file}`).toBeTruthy();
      expect(description, `description in ${file}`).toBeTruthy();
      // A description written for a search result, not a slogan and not a
      // keyword list: long enough to be a sentence, short enough to be shown.
      expect(description!.length, `description length in ${file}`).toBeGreaterThan(60);
      expect(description!.length, `description length in ${file}`).toBeLessThan(320);
      titles.add(pageTitle!);
      descriptions.add(description!);
    }
    expect(titles.size, "two pages share a title").toBe(ownPages().length);
    expect(descriptions.size, "two pages share a description").toBe(ownPages().length);
  });

  it.runIf(built)("points its canonical URL at its own address", () => {
    for (const file of indexedPages()) {
      expect(canonical(read(file)), `canonical in ${file}`).toBe(`${ORIGIN}/${servedAt(file)}`);
    }
  });

  it.runIf(built)("keeps 404.html out of the index and gives it no canonical URL", () => {
    // It is served for every unknown path, so it has no URL of its own to be
    // canonical about, and indexing it would put a dead end in results.
    const html = read("404.html");
    expect(meta(html, "robots")).toBe("noindex");
    expect(canonical(html)).toBeUndefined();
  });

  it.runIf(built)("describes itself to a link preview with an image that exists", () => {
    const png = readFileSync(join(out, "og.png"));
    expect(png.subarray(1, 4).toString("ascii"), "og.png is a PNG").toBe("PNG");
    const width = String(png.readUInt32BE(16));
    const height = String(png.readUInt32BE(20));
    for (const file of indexedPages()) {
      const html = read(file);
      expect(meta(html, "og:title"), `og:title in ${file}`).toBeTruthy();
      expect(meta(html, "og:description"), `og:description in ${file}`).toBeTruthy();
      expect(meta(html, "og:url"), `og:url in ${file}`).toBe(`${ORIGIN}/${servedAt(file)}`);
      expect(meta(html, "twitter:card"), `twitter:card in ${file}`).toBe("summary_large_image");
      expect(meta(html, "twitter:title"), `twitter:title in ${file}`).toBeTruthy();
      // The tag must name the real file at its real size: a card that 404s or
      // is cropped is worse than no card.
      expect(meta(html, "og:image"), `og:image in ${file}`).toBe(`${ORIGIN}/og.png`);
      expect(meta(html, "og:image:width"), `og:image:width in ${file}`).toBe(width);
      expect(meta(html, "og:image:height"), `og:image:height in ${file}`).toBe(height);
      expect(meta(html, "og:image:alt"), `og:image:alt in ${file}`).toBeTruthy();
    }
    expect([width, height]).toEqual(["1200", "630"]);
  });

  it.runIf(built)("offers a skip link and a way back to the root and the studio", () => {
    for (const file of ownPages()) {
      const html = withoutComments(read(file));
      expect(html, `skip link in ${file}`).toMatch(/class="skip" href="#content"/);
      // Resolved rather than matched as text, because the same destination is
      // spelled `./studio/` from the root and `../../studio/` from a docs page.
      const reached = new Set(
        references(html)
          .map((href) => target(file, href)?.path)
          .filter((path): path is string => path !== undefined),
      );
      expect([...reached], `studio link in ${file}`).toContain(join(out, "studio", "index.html"));
      expect([...reached], `docs link in ${file}`).toContain(join(out, "docs", "index.html"));
      // Every page but the landing page has a way back to it. The landing page
      // is the way back.
      if (file !== "index.html") {
        expect([...reached], `link home in ${file}`).toContain(join(out, "index.html"));
      }
    }
  });

  it.runIf(built)("links only by relative path, so the tree serves from any prefix", () => {
    for (const file of ownPages()) {
      const internal = references(withoutComments(read(file))).filter(
        (ref) => !/^[a-z]+:/i.test(ref) && !ref.startsWith("#"),
      );
      expect(internal.length, `internal links in ${file}`).toBeGreaterThan(0);
      for (const ref of internal) {
        // 404.html is the exception, and the only one: it is served for an
        // unknown path at any depth, so `./studio/` from /docs/typo/ would be
        // a second dead end. Everywhere else a root-relative link breaks a
        // subpath deploy.
        if (file === "404.html") expect(ref, "404 links from the root").toMatch(/^\//);
        else expect(ref, "a root-relative link breaks a subpath deploy").toMatch(/^\.\.?\//);
      }
    }
  });

  it.runIf(built)("has every internal link resolve to a file in the tree", () => {
    const targets = new Set<string>();
    for (const file of ownPages()) {
      for (const ref of references(withoutComments(read(file)))) {
        const resolved = target(file, ref);
        if (resolved === undefined) continue;
        expect(
          existsSync(resolved.path),
          `${ref} on ${file} resolves to ${resolved.path}, which does not exist`,
        ).toBe(true);
        expect(statSync(resolved.path).isFile()).toBe(true);
        // A link into a page's section has to land on a heading that is there.
        if (resolved.fragment !== "" && resolved.path.endsWith(".html")) {
          expect(
            readFileSync(resolved.path, "utf8").includes(`id="${resolved.fragment}"`),
            `${ref} on ${file} names a fragment the target page does not define`,
          ).toBe(true);
        }
        targets.add(resolved.path);
      }
    }
    // Not just "some link works": the studio demo is the reason the site
    // exists, and a page that links to everything but it has failed.
    expect([...targets]).toContain(join(out, "studio", "index.html"));
    expect([...targets]).toContain(join(out, "docs", "index.html"));
  });

  it.runIf(built)("keeps the head's absolute URLs on the apex, the repo, or a vocabulary", () => {
    // The head is where a page states its own identity: canonical, Open Graph,
    // the JSON-LD. Every URL in it is a claim about this site, so a third-party
    // origin here is either a mistake or a tracker.
    for (const file of ownPages()) {
      const head = /<head>([\s\S]*?)<\/head>/.exec(withoutComments(read(file)))?.[1];
      expect(head, `head of ${file}`).toBeTruthy();
      for (const url of head!.match(/https?:\/\/[^\s"'<>)]+/g) ?? []) {
        expect(
          ALLOWED_ORIGINS.some((origin) => url.startsWith(origin)),
          `${url} in the head of ${file} is a third-party origin`,
        ).toBe(true);
      }
    }
  });

  it.runIf(built)("puts an absolute URL in the body only where a reader clicks it", () => {
    // Docs cite AWS and Terraform documentation, and those citations are the
    // point of the docs, so the rule is not "no third party" here. It is that
    // an absolute URL may only be an <a href>: any other attribute holding a
    // remote URL is something the browser fetches without being asked.
    for (const file of ownPages()) {
      const body = /<body>([\s\S]*)<\/body>/.exec(withoutComments(read(file)))?.[1];
      expect(body, `body of ${file}`).toBeTruthy();
      for (const tag of body!.match(/<[a-z][^>]*>/gi) ?? []) {
        for (const [, name, value] of tag.matchAll(/\b([a-z-]+)\s*=\s*"([^"]*)"/gi)) {
          if (!/^https?:\/\//i.test(value!)) continue;
          expect(
            /^<a[\s>]/i.test(tag) && name!.toLowerCase() === "href",
            `${name!}="${value!}" on ${file} is an absolute URL outside an <a href>`,
          ).toBe(true);
        }
      }
    }
  });
});

describe("the structured data", () => {
  it.runIf(built)("parses, and claims only types the pages are", () => {
    const found: string[] = [];
    for (const file of indexedPages()) {
      const blocks = jsonLd(read(file));
      expect(blocks.length, `JSON-LD blocks on ${file}`).toBeGreaterThan(0);
      for (const block of blocks) {
        const asObject = block as Record<string, unknown>;
        expect(asObject["@context"], `@context on ${file}`).toBe("https://schema.org");
        const declared = types(block);
        expect(declared.length, `@type on ${file}`).toBeGreaterThan(0);
        for (const type of declared) {
          expect(typeof type, `@type on ${file}`).toBe("string");
          expect(type.length, `empty @type on ${file}`).toBeGreaterThan(0);
          // Real schema.org types, and only ones this project can honestly
          // assert: no ratings, no downloads, no organization, no dates.
          expect(
            ["SoftwareSourceCode", "BreadcrumbList", "ListItem"],
            `@type on ${file}`,
          ).toContain(type);
        }
        found.push(...declared);
      }
    }
    expect(found).toContain("SoftwareSourceCode");
    expect(found).toContain("BreadcrumbList");
  });

  it.runIf(built)("describes the project on the landing page with facts that are true", () => {
    const [project] = jsonLd(read("index.html")) as Array<Record<string, string>>;
    expect(project!["@type"]).toBe("SoftwareSourceCode");
    expect(project!.url).toBe(`${ORIGIN}/`);
    expect(project!.codeRepository).toBe(REPO);
    expect(project!.programmingLanguage).toBe("TypeScript");
    expect(project!.license).toBe("https://www.apache.org/licenses/LICENSE-2.0");
    expect(readFileSync(join(ROOT, "LICENSE"), "utf8")).toContain("Apache License");
  });

  it.runIf(built)("ends every docs breadcrumb on the page it is printed on", () => {
    for (const file of indexedPages().filter((f) => f.startsWith("docs/"))) {
      const [crumbs] = jsonLd(read(file)) as Array<{
        itemListElement: Array<{ position: number; name: string; item: string }>;
      }>;
      const trail = crumbs!.itemListElement;
      expect(trail.map((step) => step.position)).toEqual(trail.map((_, i) => i + 1));
      expect(trail[0]!.item).toBe(`${ORIGIN}/`);
      expect(trail.at(-1)!.item, `breadcrumb tail on ${file}`).toBe(`${ORIGIN}/${servedAt(file)}`);
    }
  });
});

describe("what tells a crawler where to look", () => {
  it.runIf(built)("lists in the sitemap exactly the pages that were published", () => {
    const listed = [...read("sitemap.xml").matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]!);
    const published = [
      ...indexedPages(),
      ...htmlFiles().filter((f) => f.startsWith("studio/")),
    ].map((file) => `${ORIGIN}/${servedAt(file)}`);
    expect([...listed].sort()).toEqual([...published].sort());
    // The page that only exists for unknown URLs is not one of them.
    expect(listed).not.toContain(`${ORIGIN}/404.html`);
    expect(read("sitemap.xml")).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
  });

  it.runIf(built)("allows every crawler in robots.txt and names the sitemap", () => {
    const robots = read("robots.txt");
    expect(robots).toMatch(/^User-agent: \*$/m);
    expect(robots).toMatch(/^Allow: \/$/m);
    expect(robots).toMatch(new RegExp(`^Sitemap: ${ORIGIN}/sitemap\\.xml$`, "m"));
    // Nothing is disallowed to anyone: an empty `Disallow:` is the way to say
    // that, a `Disallow: /anything` is the opposite and would be a mistake here.
    for (const line of robots.split("\n")) {
      expect(line.trim(), "robots.txt disallows something").not.toMatch(/^Disallow:\s*\S/);
    }
    // The AI crawlers this site is deliberately open to are named, so the
    // intent survives someone reading only the file.
    for (const agent of ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"]) {
      expect(robots, `${agent} in robots.txt`).toContain(`User-agent: ${agent}`);
    }
  });

  it.runIf(built)("offers llms.txt in the shape llmstxt.org describes", () => {
    const llms = read("llms.txt");
    const lines = llms.split("\n");
    expect(lines[0], "llms.txt starts with an H1 naming the project").toBe("# flow-as-code");
    expect(
      lines.find((line) => line.startsWith("> ")),
      "a blockquote summary",
    ).toBeTruthy();
    expect(llms).toMatch(/^## /m);
    // What it must be honest about is the publish status, in either direction:
    // claiming a release that does not exist sends a reader to an install that
    // 404s, and denying one that does sends them to a checkout they do not
    // need. Tie it to the root README rather than to a literal, so the two
    // cannot drift and neither needs hand-editing at release time.
    const readmeSaysPublished = /published on npm|published .* under the `?@flow-as-code/i.test(
      readFileSync(resolve("README.md"), "utf8"),
    );
    const llmsSaysPublished = /are published to npm/i.test(llms);
    const llmsSaysUnpublished = /not published to npm/i.test(llms);
    expect(llmsSaysPublished || llmsSaysUnpublished, "llms.txt states a publish status").toBe(true);
    expect(llmsSaysPublished, "llms.txt agrees with README.md on publish status").toBe(
      readmeSaysPublished,
    );
    for (const pkg of ["core", "cli", "studio", "cdk", "tf"]) {
      expect(llms, `@flow-as-code/${pkg} in llms.txt`).toContain(`@flow-as-code/${pkg}`);
    }
    expect(llms).toContain(`${ORIGIN}/studio/`);
  });

  it.runIf(built)("has every site link in llms.txt resolve to a file that exists", () => {
    const llms = read("llms.txt");
    const links = [...llms.matchAll(/\]\((https?:\/\/[^)]+)\)/g)].map((m) => m[1]!);
    expect(links.length, "links in llms.txt").toBeGreaterThan(10);
    let checked = 0;
    for (const link of links) {
      expect(
        ALLOWED_ORIGINS.some((origin) => link.startsWith(origin)),
        `${link} in llms.txt is a third-party origin`,
      ).toBe(true);
      if (!link.startsWith(`${ORIGIN}/`)) continue;
      const path = link.slice(`${ORIGIN}/`.length);
      const file =
        path === "" || path.endsWith("/") ? join(out, path, "index.html") : join(out, path);
      expect(
        existsSync(file),
        `${link} in llms.txt resolves to ${file}, which does not exist`,
      ).toBe(true);
      checked += 1;
    }
    expect(checked, "site links in llms.txt").toBeGreaterThan(10);
  });

  it.runIf(built)("concatenates the same documents into llms-full.txt", () => {
    const full = read("llms-full.txt");
    for (const file of indexedPages().filter(
      (f) => f.startsWith("docs/") && f !== "docs/index.html",
    )) {
      expect(full, `${servedAt(file)} in llms-full.txt`).toContain(`${ORIGIN}/${servedAt(file)}`);
    }
    // It is the markdown itself, not a rendering of it.
    expect(full).toContain("# FlowDoc: the interchange format");
    expect(full).not.toContain("<h1");
  });
});

describe("the docs pages", () => {
  it.runIf(built)("each link to the file in the repository they were rendered from", () => {
    const docs = indexedPages().filter((f) => f.startsWith("docs/") && f !== "docs/index.html");
    expect(docs.length).toBeGreaterThan(10);
    for (const file of docs) {
      const html = read(file);
      const source = new RegExp(`${REPO}/blob/main/([^"]+)`).exec(html)?.[1];
      expect(source, `source link on ${file}`).toBeTruthy();
      expect(
        existsSync(join(ROOT, source!)),
        `${file} links to ${source!}, which is not in the repository`,
      ).toBe(true);
    }
  });

  it.runIf(built)("carry the markdown of the file they name, not a copy of it", () => {
    // The site renders what is in the tree at build time. If a doc is edited
    // and the page still shows the old text, the pipeline has a second source
    // of truth in it.
    const spec = readFileSync(join(ROOT, "docs", "01-flowdoc-spec.md"), "utf8");
    const sentence = spec.split("\n").find((line) => line.length > 80 && !line.startsWith("#"));
    const html = read("docs", "flowdoc-spec", "index.html");
    // Compared word by word, because the renderer wraps and escapes.
    for (const word of sentence!.split(/\s+/).filter((w) => /^[a-z]{6,}$/i.test(w))) {
      expect(html, `"${word}" from the spec is missing from its page`).toContain(word);
    }
  });

  it.runIf(built)("rewrite a link to another doc into a link on this site", () => {
    // docs/adr/0001 links to 0002 as a markdown file path. Left alone it would
    // 404 for every reader of the site.
    const html = read("docs", "adr-defer-jsii", "index.html");
    expect(html).toContain('href="../adr-error-branches/"');
    expect(html).not.toContain("0002-error-branch-enforcement.md");
  });
});

describe("the quick start the on-ramps print", () => {
  // These blocks are scripts a stranger pastes into a terminal, and both
  // on-ramps dead-ended in the same way at different times: they opened
  // `flow-cli studio flows/` with nothing in the tool that could create flows/,
  // so the first thing a visitor who tried it saw was "No such directory". The
  // landing page was fixed for 0.1.2 and the root README was not, which is the
  // reason both are read here now rather than one. The command list comes from
  // packages/cli/README.md, which packages/cli/src/cli.test.ts holds equal to
  // the output of `flow-cli --help`, so a command named here is a command the
  // installed binary really has.
  //
  // Read from the sources rather than from the assembled tree: the copy is the
  // subject, README.md is not published to the site at all, and a rule about
  // whether a command exists should not go quiet because someone has not run
  // `npm run build`.
  const ON_RAMPS = [
    { name: "site/index.html", path: join(ROOT, "site", "index.html") },
    { name: "README.md", path: join(ROOT, "README.md") },
  ];

  /** The commands packages/cli/README.md's opening usage block lists. */
  function cliCommands(): string[] {
    const readme = readFileSync(join(ROOT, "packages", "cli", "README.md"), "utf8");
    const usage = /^```\n([\s\S]*?)^```$/m.exec(readme)?.[1];
    if (usage === undefined) throw new Error("packages/cli/README.md has no usage block");
    return usage.split("\n").flatMap((line) => /^flow-cli (\S+)/.exec(line)?.[1] ?? []);
  }

  /** Every shell block in a piece of copy, whether it is HTML or markdown. */
  function codeBlocks(copy: string): string[] {
    return [
      ...[...copy.matchAll(/<pre>\n([\s\S]*?)<\/pre>/g)].map((m) => m[1]!),
      ...[...copy.matchAll(/^```[a-z]*\n([\s\S]*?)^```$/gm)].map((m) => m[1]!),
    ];
  }

  /** The `flow-cli` command names in the quick-start block, in the order printed. */
  function blockCommands(copy: string, name: string): string[] {
    const block = codeBlocks(copy).find((text) => text.includes("flow-cli init"));
    expect(block, `no block in ${name} runs flow-cli init`).toBeTruthy();
    return block!.split("\n").flatMap((line) => /flow-cli ([a-z][a-z-]*)/.exec(line)?.[1] ?? []);
  }

  it.each(ON_RAMPS)("names only commands the CLI has, everywhere in $name", ({ name, path }) => {
    const named = [...readFileSync(path, "utf8").matchAll(/flow-cli ([a-z][a-z-]*)/g)].map(
      (m) => m[1]!,
    );
    expect(named.length).toBeGreaterThan(3);
    const commands = cliCommands();
    expect(commands.length).toBeGreaterThan(0);
    for (const command of new Set(named)) {
      expect(commands, `${name} tells a reader to run "flow-cli ${command}"`).toContain(command);
    }
  });

  it.each(ON_RAMPS)("creates the directory before it opens it, in $name", ({ name, path }) => {
    // The order is the whole point: every command after the install takes a
    // directory of FlowDocs, so whichever one runs first has to be the one
    // that writes them.
    const ordered = blockCommands(readFileSync(path, "utf8"), name);
    expect(ordered.length).toBeGreaterThan(2);
    expect(ordered[0], `the first flow-cli command in ${name} must create the flows`).toBe("init");
    for (const command of ordered.slice(1)) {
      expect(command, `"flow-cli ${command}" runs before anything has written a FlowDoc`).not.toBe(
        "init",
      );
    }
  });

  it.each(ON_RAMPS)("installs the CLI and nothing else, in $name", ({ name, path }) => {
    // @flow-as-code/cli depends on the other four, so naming all five installs
    // the same 25 MB tree and only gives a reader more to get wrong. Both
    // on-ramps said both things at once before this rule existed.
    const install = codeBlocks(readFileSync(path, "utf8")).find((text) =>
      /npm i(nstall)? .*@flow-as-code\//.test(text),
    );
    expect(install, `no block in ${name} installs a @flow-as-code package`).toBeTruthy();
    const named = [...install!.matchAll(/@flow-as-code\/([a-z]+)/g)].map((m) => m[1]!);
    expect(named, `the install block in ${name}`).toEqual(["cli"]);
  });
});

describe("the studio under /studio/", () => {
  it.runIf(built)("is there with its assets", () => {
    expect(existsSync(join(out, "studio", "index.html"))).toBe(true);
    const assets = join(out, "studio", "assets");
    expect(statSync(assets).isDirectory()).toBe(true);
    expect(readdirSync(assets).length).toBeGreaterThan(0);
  });

  it.runIf(built)("is copied byte for byte apart from the card injected into its head", () => {
    // THE RULE CHANGED, deliberately: the copy step used to edit nothing, and
    // now it writes one block of link-preview tags into the shell's <head>.
    // The reason it is here and not in packages/studio/index.html has not
    // changed: that file may carry no href, no src and no absolute URL, which
    // is what makes the artifact relocatable and its "loads nothing beyond its
    // own origin" claim provable, and a card is absolute URLs by definition.
    // What changed is the answer to "then /studio/ gets no card at all", which
    // for the project's most shareable link was the wrong trade.
    //
    // So: every asset still byte for byte, no link rewritten under the prefix,
    // and the shell identical to the source once the enumerated block is cut
    // back out. Anything else the copy step did to it fails here.
    for (const name of readdirSync(DEMO)) {
      const source = join(DEMO, name);
      if (statSync(source).isDirectory()) {
        for (const asset of readdirSync(source)) {
          expect(
            readFileSync(join(source, asset)).equals(
              readFileSync(join(out, "studio", name, asset)),
            ),
            `${name}/${asset} differs from dist-demo`,
          ).toBe(true);
        }
      } else if (name === "index.html") {
        // The one file with an exception, checked below by cutting the block
        // out rather than by comparing bytes.
        continue;
      } else {
        expect(
          readFileSync(source).equals(readFileSync(join(out, "studio", name))),
          `${name} differs from dist-demo`,
        ).toBe(true);
      }
    }
    const { card, rest } = splitCard(read("studio", "index.html"));
    expect(rest, "the studio shell differs from dist-demo outside the injected card").toBe(
      readFileSync(join(DEMO, "index.html"), "utf8"),
    );
    expect(
      card.map((tag) => /^<([a-z]+ (?:rel|name|property)="[^"]*")/.exec(tag)?.[1]),
      "the injected block is not the enumerated set of card tags",
    ).toEqual(CARD_TAGS);
  });

  it.runIf(built)("unfurls as a card, and carries no absolute URL outside it", () => {
    // THE RULE CHANGED HERE TOO. This used to say the shell is described by a
    // title and a description alone, because a canonical or an Open Graph tag
    // is an absolute URL and the artifact may hold none. The artifact still may
    // hold none; the site build writes the card onto the copy instead, so the
    // page a visitor is sent gets the same treatment as every docs page while
    // the published bundle keeps the property that made the old rule right.
    //
    // The narrowing, not the dropping, of the old assertion: every absolute URL
    // in the served shell is inside the injected block and points at this site,
    // and every href and src outside it is still ./assets/... So the copy makes
    // no request the artifact did not, which is the thing the old rule was
    // protecting. og:image is fetched by a scraper's servers from a content
    // attribute; nothing here is fetched by the visitor's browser.
    const html = read("studio", "index.html");
    const { card, rest } = splitCard(html);
    const description = meta(html, "description");
    expect(description, "description in the studio shell").toBeTruthy();
    expect(description!.length).toBeGreaterThan(60);
    expect(title(html)).toContain("read-only demo");

    // The card says what the page is, and says it in the page's own words: the
    // title and description are read back out of the shell by build-site.mjs,
    // so a card that disagrees with the page it describes cannot ship.
    expect(meta(html, "og:title"), "og:title").toBe(title(html));
    expect(meta(html, "og:description"), "og:description").toBe(description);
    expect(meta(html, "og:url"), "og:url").toBe(`${ORIGIN}/studio/`);
    expect(canonical(html), "canonical").toBe(`${ORIGIN}/studio/`);
    expect(meta(html, "twitter:card"), "twitter:card").toBe("summary_large_image");
    // The image is the site's card image, at the size it really is, checked as
    // a file rather than trusted: a card that 404s is worse than no card.
    const png = readFileSync(join(out, "og.png"));
    expect(meta(html, "og:image"), "og:image").toBe(`${ORIGIN}/og.png`);
    expect(meta(html, "og:image:width"), "og:image:width").toBe(String(png.readUInt32BE(16)));
    expect(meta(html, "og:image:height"), "og:image:height").toBe(String(png.readUInt32BE(20)));
    expect(meta(html, "og:image:alt"), "og:image:alt").toBeTruthy();

    expect(rest.match(/https?:\/\//g) ?? [], "absolute URL outside the injected card").toEqual([]);
    for (const url of card.flatMap((tag) => tag.match(/https?:\/\/[^"]*/g) ?? [])) {
      expect(url, "the card points somewhere other than this site").toMatch(`${ORIGIN}/`);
    }
    for (const ref of references(rest)) expect(ref).toMatch(/^\.\/assets\//);
  });
});

describe("the logo at the root of the tree", () => {
  // The mark and the wordmark are generated (design/build-logo.mjs and
  // design/build-raster.mjs) from design/mark.mjs and design/wordmark.mjs.
  // These files are checked as bytes rather than trusted, because each one is a
  // URL something else holds and none of them is rendered by a page of this
  // site: a browser asking the origin for /favicon.ico, an iOS home screen, a
  // chat client fetching the card, and the READMEs on npm and on GitHub, which
  // can only show an image by absolute URL and so point here.

  /** The mark's path data, read out of the module that defines it. */
  const markPaths = (): string[] =>
    [...readFileSync(join(ROOT, "design", "mark.mjs"), "utf8").matchAll(/"(M[^"]+)"/g)].map(
      (m) => m[1]!,
    );

  /** The size a PNG declares in its header, so the filename cannot lie. */
  const pngSize = (file: string): [number, number] => {
    const bytes = readFileSync(join(out, file));
    expect(bytes.subarray(1, 4).toString("ascii"), `${file} is a PNG`).toBe("PNG");
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  };

  it.runIf(built)("ships every logo file, non-empty, at the root", () => {
    for (const file of [
      "favicon.ico",
      "favicon.svg",
      "apple-touch-icon.png",
      "logo.png",
      "logo.svg",
      "logo-dark.svg",
      "mark.svg",
      "og.png",
    ]) {
      const path = join(out, file);
      expect(existsSync(path), `${file} is missing from the assembled tree`).toBe(true);
      expect(statSync(path).isFile(), `${file} is not a file`).toBe(true);
      expect(statSync(path).size, `${file} is empty`).toBeGreaterThan(0);
    }
  });

  it.runIf(built)("gives every page of the site the same icon", () => {
    // Not "some page has an icon": a docs page whose tab is blank while the
    // landing page's is not is the failure this catches, and the path to the
    // icon differs with depth, so every page has to be read.
    for (const file of ownPages()) {
      const links = withoutComments(read(file)).match(/<link\b[^>]*>/g) ?? [];
      const icons = links.filter((link) => attribute(link, "rel") !== "canonical");
      expect(
        icons.map((link) => attribute(link, "rel")),
        `icon links on ${file}`,
      ).toEqual(["icon", "icon", "apple-touch-icon"]);
      for (const link of icons) {
        const href = attribute(link, "href")!;
        const resolved = target(file, href)!;
        expect(existsSync(resolved.path), `${href} on ${file} is not in the tree`).toBe(true);
        expect(
          relative(out, resolved.path),
          `${href} on ${file} does not resolve to the root of the site`,
        ).toBe(href.replace(/^[./]*/, ""));
      }
    }
  });

  it.runIf(built)("holds 16 and 32 pixel images in favicon.ico", () => {
    // A .ico is a header, a directory of entries, then the images. Byte 0 of an
    // entry is its width, where 0 means 256. A single-size icon is the one a
    // browser downsamples badly into a tab strip, which is the whole reason
    // this file is not simply a PNG.
    const bytes = readFileSync(join(out, "favicon.ico"));
    expect(bytes.readUInt16LE(0), "favicon.ico reserved field").toBe(0);
    expect(bytes.readUInt16LE(2), "favicon.ico is an icon, not a cursor").toBe(1);
    const count = bytes.readUInt16LE(4);
    expect(count, "images in favicon.ico").toBeGreaterThan(1);
    const sizes = Array.from({ length: count }, (_, i) => {
      const width = bytes.readUInt8(6 + i * 16);
      return width === 0 ? 256 : width;
    });
    expect(sizes, "the sizes in favicon.ico").toContain(16);
    expect(sizes, "the sizes in favicon.ico").toContain(32);
    // Every entry has to point at bytes that are really in the file.
    for (let i = 0; i < count; i += 1) {
      const length = bytes.readUInt32LE(6 + i * 16 + 8);
      const offset = bytes.readUInt32LE(6 + i * 16 + 12);
      expect(length, `image ${String(i)} in favicon.ico is empty`).toBeGreaterThan(0);
      expect(
        offset + length,
        `image ${String(i)} runs past the end of favicon.ico`,
      ).toBeLessThanOrEqual(bytes.length);
    }
  });

  it.runIf(built)("draws the raster files at the sizes their readers demand", () => {
    // Read from the PNG header rather than from the filename or from the meta
    // tag: a card at the wrong size is cropped by every platform that shows it,
    // and the tag would go on claiming 1200x630 either way.
    expect(pngSize("og.png"), "og.png").toEqual([1200, 630]);
    expect(pngSize("apple-touch-icon.png"), "apple-touch-icon.png").toEqual([180, 180]);
    const [width, height] = pngSize("logo.png");
    expect(height, "logo.png is a banner, not a wall").toBeLessThan(width / 3);
    // GitHub and npm show a README image at its own pixel size, so a banner
    // wider than the column pushes the first paragraph off the screen.
    expect(width, "logo.png is wider than a README column").toBeLessThan(700);
  });

  it.runIf(built)("ships the studio screenshot the README shows", () => {
    // Not a logo, but here for the logo's reason: a README on GitHub or npm can
    // only show an image by absolute URL, so it points at this tree. A rename
    // here, or a typo there, is a broken image at the top of the project's
    // front page, so the file and the reference to it are checked against each
    // other rather than separately. pngSize reads the header, so a truncated or
    // half-copied file fails too.
    const [width, height] = pngSize("studio-screenshot.png");
    expect(width, "the screenshot is too small to read the canvas in").toBeGreaterThan(1000);
    expect(height, "the screenshot is not the shape of a window").toBeGreaterThan(400);
    expect(
      readFileSync(join(ROOT, "README.md"), "utf8"),
      "the README does not show the screenshot",
    ).toContain(`](${ORIGIN}/studio-screenshot.png)`);
  });

  it.runIf(built)("draws every vector file from the mark that is in the tree", () => {
    // Content, not timestamps: a checkout gives every file the same mtime, so a
    // date comparison would be flaky here and would still miss a hand edit.
    const paths = markPaths();
    expect(paths.length, "paths in design/mark.mjs").toBeGreaterThan(2);
    for (const file of ["mark.svg", "favicon.svg", "logo.svg", "logo-dark.svg", "index.html"]) {
      const contents = read(file);
      for (const path of paths) {
        expect(contents, `${file} was drawn from an older mark`).toContain(path);
      }
    }
    // The lockups carry the wordmark as outlines, which is the point of them:
    // an SVG <text> element renders in whatever font the reader happens to
    // have, and a logo that changes shape per reader is not a logo.
    const source = readFileSync(join(ROOT, "design", "wordmark.mjs"), "utf8");
    const wordmark = /"(M[^"]{500,})"/.exec(source)?.[1];
    expect(wordmark, "the wordmark outlines in design/wordmark.mjs").toBeTruthy();
    for (const file of ["logo.svg", "logo-dark.svg"]) {
      expect(read(file), `${file} was drawn from an older wordmark`).toContain(wordmark!);
      expect(read(file), `${file} sets the wordmark as text rather than outlines`).not.toMatch(
        /<text[\s>]/,
      );
    }
  });

  it.runIf(built)("leaves the studio shell without an icon link of its own", () => {
    // packages/studio/tests/demo-bundle.test.ts forbids an href in that HTML
    // that is not ./assets/..., so the studio page cannot declare an icon at
    // all. It does not need one: the browser asks the origin for /favicon.ico,
    // which is the file the tests above checked. This is here so that giving
    // the demo an icon by editing its shell fails on this side too, and not
    // only in the studio's own suite.
    //
    // THE RULE CHANGED for one tag and not for this one. The site build now
    // injects a link-preview card into the copy, and rel=canonical comes with
    // it, so the shell has one <link> that is not the bundler's. An icon would
    // still be a fetch the visitor's browser makes to a path that has to exist
    // wherever the artifact is mounted, which is exactly what the studio's own
    // guard is for, and the card does not need one: nothing in it is a link
    // rel the browser resolves.
    const html = read("studio", "index.html");
    const { card, rest } = splitCard(html);
    // Outside the card, its <link> tags are the bundler's own preloads and
    // stylesheets, all of them ./assets/... An icon would be neither.
    for (const link of rest.match(/<link\b[^>]*>/g) ?? []) {
      expect(["modulepreload", "stylesheet"], `<link rel> in the studio shell`).toContain(
        attribute(link, "rel"),
      );
    }
    // Inside it, the one <link> is the canonical URL, which is a statement
    // about the address and not a request.
    expect(
      card.filter((tag) => tag.startsWith("<link")),
      "a <link> in the injected card that is not the canonical URL",
    ).toEqual([`<link rel="canonical" href="${ORIGIN}/studio/" />`]);
    expect(html, "an icon in the studio shell").not.toMatch(/rel="(?:shortcut )?icon"/i);
    expect(html, "an apple-touch-icon in the studio shell").not.toContain("apple-touch-icon");
    expect(rest.match(/https?:\/\//g) ?? [], "an absolute URL outside the card").toEqual([]);
    for (const ref of references(rest)) expect(ref).toMatch(/^\.\/assets\//);
  });
});

describe("the site sources", () => {
  it("keep the published files in site/, next to nothing that needs building", () => {
    // The assembler copies site/ wholesale to the root of the deploy, so
    // anything that lands here is published. Keeping the list closed means a
    // stray file cannot become a public URL by being dropped in the directory.
    expect(readdirSync(join(ROOT, "site")).sort()).toEqual([
      "404.html",
      "CNAME",
      "apple-touch-icon.png",
      "favicon.ico",
      "favicon.svg",
      "index.html",
      "logo-dark.svg",
      "logo.png",
      "logo.svg",
      "mark.svg",
      "og.png",
      "studio-screenshot.png",
    ]);
    // Every entry is a plain file. A directory named index.html would satisfy
    // the listing above and then be copied as a directory into the deploy.
    for (const entry of readdirSync(join(ROOT, "site"))) {
      expect(statSync(join(ROOT, "site", entry)).isFile(), `${entry} is not a file`).toBe(true);
    }
  });
});
