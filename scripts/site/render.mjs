/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Markdown to a page of the published site.
//
// The repository's own docs are the site's docs: scripts/build-site.mjs names
// the files and the slugs, this module turns one of them into a complete HTML
// document. Nothing here reads a file; the caller supplies the markdown, so the
// pages always carry whatever is in the tree at build time and cannot drift
// from it.
//
// Two things are worth knowing before editing:
//
//   1. A page loads no subresource but its icon. The CSS is inlined into every
//      document, the mark in the header is inline SVG rather than an <img>, and
//      there is no script beyond the JSON-LD data block. That is the same
//      property packages/studio/tests/demo-bundle.test.ts proves for the studio
//      artifact, extended to the pages in front of it, and tests/site.test.ts
//      holds it for every generated page. The icon is the one exception and it
//      is a relative path to a file in this same tree: a browser fetches
//      /favicon.ico on its own whether or not a page asks, so the choice is not
//      between a request and no request, it is between a request that 404s and
//      one that does not.
//   2. Every internal link is relative. The tree therefore serves from the apex
//      and from any subpath. The only absolute URLs a page carries are the ones
//      whose meaning is absolute: rel=canonical, the Open Graph and Twitter
//      tags, the JSON-LD, and links a reader clicks to another site.
//
// Markdown links are rewritten so they resolve where the page is published:
// a link to another rendered doc becomes that page's site URL, and a link to a
// repository file that is not rendered becomes a GitHub URL. A markdown link
// left alone would 404 for every reader.

import { posix } from "node:path";
import { Marked } from "marked";

import { markPaths } from "../../design/mark.mjs";

/** GitHub's anchor slug for a heading, so `#operator-actions` still works. */
export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

/** HTML-escape for a text node or an attribute value. */
export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The site URL of `to` as seen from the page at `from`, both being slugs
 * ("" is the site root, "docs/flowdoc-spec" is a page). Relative on purpose:
 * see the header note.
 */
export function relativeUrl(from, to) {
  const rel = posix.relative(from === "" ? "." : from, to === "" ? "." : to);
  if (rel === "") return "./";
  // Explicitly relative, always: a bare `flowdoc-spec/` is a relative link too,
  // but `./flowdoc-spec/` says so, and the site's one link convention is easier
  // to hold to when it has no exceptions.
  const prefixed = rel.startsWith(".") ? rel : `./${rel}`;
  return prefixed.endsWith("/") ? prefixed : `${prefixed}/`;
}

/** The site URL of a file at the root of the tree, as seen from `slug`. */
export function assetUrl(slug, file) {
  return relativeUrl(slug, "") + file;
}

/**
 * The icon files, at the root of the tree, in the order a browser should
 * consider them.
 *
 * They are at the root and not in an assets directory for a reason worth
 * keeping: a browser asks the ORIGIN for /favicon.ico when a page declares no
 * icon, so a file there is the icon of every page on this site, including the
 * studio, whose HTML is a build artifact of another package that
 * packages/studio/tests/demo-bundle.test.ts forbids an href in. The tags below
 * are for the pages that can carry them; the root file covers the one that
 * cannot.
 */
export const ICONS = [
  { rel: "icon", file: "favicon.ico", attributes: ' sizes="32x32"' },
  { rel: "icon", file: "favicon.svg", attributes: ' type="image/svg+xml"' },
  { rel: "apple-touch-icon", file: "apple-touch-icon.png", attributes: "" },
];

/** The icon <link> tags for the page at `slug`, relative like every other. */
export function iconLinks(slug) {
  return ICONS.map(
    (icon) => `<link rel="${icon.rel}" href="${assetUrl(slug, icon.file)}"${icon.attributes} />`,
  );
}

/**
 * The mark, inline, sized in `em` by the stylesheet and painted in
 * `currentColor` so it is the same ink as the text it sits beside.
 *
 * Inline rather than an <img> because it is four paths: an <img> would be a
 * second request for 400 bytes, would not follow the link colour, and would put
 * a subresource on a page that otherwise has none. `aria-hidden` because the
 * text next to it already says the name, and a screen reader announcing
 * "flow-as-code flow-as-code" is worse than one that does not.
 */
export function inlineMark(indent) {
  return [
    `${indent}<svg class="mark" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true" focusable="false">`,
    markPaths(`${indent}  `),
    `${indent}</svg>`,
  ].join("\n");
}

/**
 * Resolves one markdown link target as written in `sourcePath` into a URL that
 * works from the page at `slug`.
 *
 * - an absolute URL, a mailto:, or a bare fragment is left alone;
 * - a repository path that is a rendered page becomes a relative site URL;
 * - any other repository path becomes a GitHub blob or tree URL.
 */
export function resolveLink(href, { sourcePath, slug, pageBySource, isDirectory, github }) {
  if (href === "" || href.startsWith("#")) return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) return href;

  const hashAt = href.indexOf("#");
  const hash = hashAt === -1 ? "" : href.slice(hashAt);
  const path = hashAt === -1 ? href : href.slice(0, hashAt);
  if (path === "") return hash;

  const target = posix.normalize(posix.join(posix.dirname(sourcePath), path));
  const page = pageBySource.get(target.replace(/\/$/, ""));
  if (page !== undefined) return relativeUrl(slug, page.slug) + hash;

  const kind = path.endsWith("/") || isDirectory(target) ? "tree" : "blob";
  return `${github}/${kind}/main/${target.replace(/\/$/, "")}${hash}`;
}

/**
 * The banner a README opens with, as it is written in the markdown: the logo,
 * linking the site, on the first line.
 *
 * npm and GitHub can only show an image in a README by absolute URL, so the
 * banner points at this site. That is right for those two readers and wrong for
 * this one: the site's own pages carry the mark in their header already, and a
 * remote <img> is the one thing every page here is proven not to have. So the
 * pipeline drops that line, and only that line, on the way in.
 */
export function bannerPattern(origin) {
  return new RegExp(`^\\s*\\[?!\\[[^\\]]*\\]\\(${origin}/logo\\.png\\)(\\]\\([^)]*\\))?\\s*$`);
}

/** `markdown` with the banner line removed, if its first line is the banner. */
export function stripBanner(markdown, origin) {
  const lines = markdown.split("\n");
  const first = lines.findIndex((line) => line.trim() !== "");
  if (first === -1 || !bannerPattern(origin).test(lines[first])) return markdown;
  lines.splice(first, 1);
  while (lines.length > 0 && lines[0].trim() === "") lines.shift();
  return lines.join("\n");
}

/**
 * Markdown to the HTML that goes inside <article>, plus what the caller needs
 * to judge the result: the heading levels in document order, so a page with no
 * <h1>, two of them, or a skipped level fails the build instead of shipping.
 */
export function renderMarkdown(markdown, context) {
  const headings = [];
  const seen = new Map();
  const marked = new Marked({ gfm: true });

  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        const base = slugify(text.replace(/<[^>]*>/g, "")) || `section-${String(headings.length)}`;
        const count = seen.get(base) ?? 0;
        seen.set(base, count + 1);
        const id = count === 0 ? base : `${base}-${String(count)}`;
        headings.push({ depth, id, text });
        return `<h${String(depth)} id="${escapeHtml(id)}">${text}</h${String(depth)}>\n`;
      },
      link({ href, title, tokens }) {
        const resolved = resolveLink(href, context);
        const text = this.parser.parseInline(tokens);
        const titleAttr =
          title === null || title === undefined ? "" : ` title="${escapeHtml(title)}"`;
        return `<a href="${escapeHtml(resolved)}"${titleAttr}>${text}</a>`;
      },
      image({ href, title, text }) {
        const resolved = resolveLink(href, context);
        const titleAttr =
          title === null || title === undefined ? "" : ` title="${escapeHtml(title)}"`;
        // alt is mandatory here: an image with no text alternative is a hole in
        // the page for a screen reader and for a crawler alike.
        return `<img src="${escapeHtml(resolved)}" alt="${escapeHtml(text)}"${titleAttr} />`;
      },
    },
  });

  // A wide table has to scroll inside its own box; the page body must never
  // scroll sideways on a phone. marked's renderer override cannot wrap the
  // default output (a renderer method either replaces it or returns false to
  // fall back), so the wrapper is applied to the finished HTML. Tables do not
  // nest, so the non-greedy match is exact.
  const html = marked
    .parse(markdown)
    .replace(/<table>[\s\S]*?<\/table>/g, (table) => `<div class="scroll">${table}</div>`);

  return { html, headings };
}

/** The heading structure rule: exactly one h1, and no level skipped. */
export function headingProblems(headings) {
  const problems = [];
  const tops = headings.filter((h) => h.depth === 1);
  if (tops.length !== 1) problems.push(`expected exactly one h1, found ${String(tops.length)}`);
  let previous = 0;
  for (const heading of headings) {
    if (previous !== 0 && heading.depth > previous + 1) {
      problems.push(
        `h${String(previous)} is followed by h${String(heading.depth)} ("${heading.text}")`,
      );
    }
    previous = heading.depth;
  }
  return problems;
}

/**
 * One stylesheet, inlined into every page. Colours are the landing page's, and
 * both themes clear 4.5:1 for body text and links against their background.
 */
export const STYLE = `:root {
  --bg: #fbfaf7;
  --panel: #ffffff;
  --ink: #16181d;
  --muted: #5a6070;
  --rule: #e3e0d8;
  --accent: #1f5f4b;
  --accent-ink: #ffffff;
  --code-bg: #f3f1ea;
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  --sans: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #101216;
    --panel: #171a20;
    --ink: #e9e7e1;
    --muted: #9aa1ae;
    --rule: #262a33;
    --accent: #6ee7b7;
    --accent-ink: #0c1a15;
    --code-bg: #0b0d11;
  }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 17px;
  line-height: 1.65;
  /* The backstop for the code rule below: these docs also print bare AWS
     documentation URLs as link text, and one of those in a list item pans the
     whole page sideways on a phone exactly as an unbreakable token does. */
  overflow-wrap: break-word;
}
.skip {
  position: absolute;
  left: -9999px;
  top: 0;
  background: var(--accent);
  color: var(--accent-ink);
  padding: 0.6rem 1rem;
  border-radius: 0 0 6px 0;
  z-index: 2;
}
.skip:focus { left: 0; }
header.site {
  border-bottom: 1px solid var(--rule);
  background: var(--panel);
}
header.site nav {
  max-width: 52rem;
  margin: 0 auto;
  padding: 0.75rem 1.25rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1.25rem;
  align-items: baseline;
  font-size: 0.95rem;
}
header.site .brand {
  font-family: var(--mono);
  font-weight: 600;
  margin-right: auto;
  display: inline-flex;
  align-items: center;
  gap: 0.45em;
  text-decoration: none;
}
header.site .brand:hover, header.site .brand:focus-visible { text-decoration: underline; }
/* The mark is drawn on a 16 unit grid and is sharpest at a whole multiple of
   it, so the header asks for 16 pixels rather than for a fraction of the em. */
.mark { width: 16px; height: 16px; flex: none; }
main {
  max-width: 52rem;
  margin: 0 auto;
  padding: 2.5rem 1.25rem 3rem;
}
a { color: var(--accent); }
a:hover, a:focus-visible { text-decoration-thickness: 2px; }
nav.crumbs { font-size: 0.9rem; color: var(--muted); margin-bottom: 1.5rem; }
nav.crumbs ol { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.4rem; }
nav.crumbs li + li::before { content: "/"; margin-right: 0.4rem; color: var(--rule); }
h1 {
  font-size: clamp(1.7rem, 5vw, 2.2rem);
  line-height: 1.2;
  letter-spacing: -0.02em;
  margin: 0 0 1.25rem;
}
h2 { font-size: 1.28rem; margin: 2.5rem 0 0.75rem; line-height: 1.3; }
h3 { font-size: 1.06rem; margin: 2rem 0 0.6rem; line-height: 1.35; }
h4 { font-size: 0.98rem; margin: 1.6rem 0 0.5rem; }
p, ul, ol { margin: 0 0 1rem; }
li { margin: 0.2rem 0; }
blockquote {
  margin: 0 0 1rem;
  padding-left: 1rem;
  border-left: 3px solid var(--accent);
  color: var(--muted);
}
pre {
  background: var(--code-bg);
  border: 1px solid var(--rule);
  border-radius: 6px;
  padding: 0.9rem 1rem;
  overflow-x: auto;
  font-size: 0.83rem;
  line-height: 1.55;
  margin: 0 0 1rem;
}
/* A terraform address, a schema path or a cdref token run inline is one long
   word wider than a phone, and a word that cannot break makes the whole page
   scroll sideways: the failure .scroll below prevents for tables, arriving
   through ordinary body text instead. These pages are full of such words, so
   without this every paragraph on a docs page pans left and right. Breaking is
   only permitted where the word would otherwise overflow, so nothing moves on
   a wide screen, and inside <pre> the white-space rule wins and the block
   scrolls on its own. site/index.html carries the same rule for the same
   reason; tests/site.test.ts holds both. */
code { font-family: var(--mono); font-size: 0.9em; overflow-wrap: break-word; }
pre code { font-size: 1em; }
:not(pre) > code {
  background: var(--code-bg);
  border-radius: 4px;
  padding: 0.1em 0.3em;
}
.scroll { overflow-x: auto; margin: 0 0 1rem; }
table { border-collapse: collapse; font-size: 0.92rem; }
th, td { border: 1px solid var(--rule); padding: 0.4rem 0.6rem; text-align: left; vertical-align: top; }
th { background: var(--code-bg); }
hr { border: 0; border-top: 1px solid var(--rule); margin: 2rem 0; }
img { max-width: 100%; height: auto; }
ul.pages { list-style: none; padding: 0; border-top: 1px solid var(--rule); }
ul.pages li {
  border-bottom: 1px solid var(--rule);
  padding: 0.7rem 0;
  margin: 0;
}
ul.pages a { font-weight: 600; text-decoration: none; }
ul.pages a:hover, ul.pages a:focus-visible { text-decoration: underline; }
ul.pages p { color: var(--muted); font-size: 0.94rem; margin: 0.15rem 0 0; }
footer.site {
  border-top: 1px solid var(--rule);
  padding: 1.25rem;
  color: var(--muted);
  font-size: 0.92rem;
}
footer.site p, footer.site nav { max-width: 52rem; margin: 0 auto 0.75rem; }
footer.site nav { display: flex; flex-wrap: wrap; gap: 0.4rem 1.4rem; margin-bottom: 0; }
`;

/**
 * A complete HTML document.
 *
 * `canonical`, the Open Graph pair and the JSON-LD are the only absolute URLs
 * this writes, and each is absolute because its meaning is: a canonical URL
 * relative to the reader's current path is not a canonical URL.
 */
export function renderPage({
  slug,
  title,
  description,
  origin,
  ogImage,
  jsonLd = [],
  crumbs = [],
  bodyHtml,
  editPath,
  github,
  noindex = false,
}) {
  const canonical = `${origin}/${slug === "" ? "" : `${slug}/`}`;
  const home = relativeUrl(slug, "");
  const docs = relativeUrl(slug, "docs");
  const studio = relativeUrl(slug, "studio");
  const head = [
    `<meta charset="utf-8" />`,
    `<meta name="viewport" content="width=device-width, initial-scale=1" />`,
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    noindex
      ? `<meta name="robots" content="noindex" />`
      : `<link rel="canonical" href="${canonical}" />`,
    ...iconLinks(slug),
    `<meta property="og:type" content="${slug === "" ? "website" : "article"}" />`,
    `<meta property="og:site_name" content="flow-as-code" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${canonical}" />`,
    ...(ogImage === undefined
      ? []
      : [
          `<meta property="og:image" content="${ogImage.url}" />`,
          `<meta property="og:image:width" content="${String(ogImage.width)}" />`,
          `<meta property="og:image:height" content="${String(ogImage.height)}" />`,
          `<meta property="og:image:alt" content="${escapeHtml(ogImage.alt)}" />`,
        ]),
    `<meta name="twitter:card" content="${ogImage === undefined ? "summary" : "summary_large_image"}" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    ...(ogImage === undefined ? [] : [`<meta name="twitter:image" content="${ogImage.url}" />`]),
    `<style>\n${STYLE}</style>`,
    ...jsonLd.map(
      (data) =>
        // No user input reaches this, but a `</script>` inside a JSON string
        // would still end the block early, so the sequence is escaped.
        `<script type="application/ld+json">\n${JSON.stringify(data, null, 2).replace(/</g, "\\u003c")}\n</script>`,
    ),
  ];

  const crumbHtml =
    crumbs.length === 0
      ? ""
      : `      <nav class="crumbs" aria-label="Breadcrumb">\n        <ol>\n${crumbs
          .map(
            (crumb) =>
              `          <li>${
                crumb.href === undefined
                  ? `<span aria-current="page">${escapeHtml(crumb.name)}</span>`
                  : `<a href="${escapeHtml(crumb.href)}">${escapeHtml(crumb.name)}</a>`
              }</li>`,
          )
          .join("\n")}\n        </ol>\n      </nav>\n`;

  const source =
    editPath === undefined
      ? ""
      : `      <p>\n        This page is\n        <a href="${github}/blob/main/${editPath}">${escapeHtml(editPath)}</a>\n        in the repository. Corrections are welcome as a pull request.\n      </p>\n`;

  return `<!doctype html>
<!-- Generated by scripts/build-site.mjs from ${editPath ?? "the page list in scripts/build-site.mjs"}. Do not edit by hand. -->
<html lang="en">
  <head>
${head.map((line) => `    ${line}`).join("\n")}
  </head>
  <body>
    <a class="skip" href="#content">Skip to content</a>
    <header class="site">
      <nav aria-label="Site">
        <a class="brand" href="${home}">
${inlineMark("          ")}
          <span>flow-as-code</span>
        </a>
        <a href="${docs}">Docs</a>
        <a href="${studio}">Studio demo</a>
        <a href="${github}">GitHub</a>
      </nav>
    </header>
    <main id="content">
${crumbHtml}      <article>
${bodyHtml
  .trimEnd()
  .split("\n")
  .map((line) => (line === "" ? "" : `        ${line}`))
  .join("\n")}
      </article>
    </main>
    <footer class="site">
${source}      <nav aria-label="Site, repeated">
        <a href="${home}">Home</a>
        <a href="${docs}">Docs</a>
        <a href="${studio}">Studio demo</a>
        <a href="${github}">Source on GitHub</a>
        <span>Apache-2.0</span>
      </nav>
    </footer>
  </body>
</html>
`;
}
