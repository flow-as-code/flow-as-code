# The logo

The sources for the mark, the wordmark and the lockup. Everything published
lives in `site/` and is generated from here; nothing in `site/` is edited by
hand, and `scripts/build-site.mjs` refuses to assemble the site when a published
file no longer matches these sources.

## The mark

`${ }` with the flow passing through it. References in this project stay tokens
and never become literal ARNs, so the token braces are the mark, and the arrow
through them is the flow they carry.

It is drawn on a 16 unit grid, in `design/mark.mjs`, because 16 pixels is where
a favicon lives and a mark designed at 64 and shrunk is mud at that size. Every
edge is on an integer and every stroke is 2 units, so at 16, 32 and 48 pixels
every stroke lands on whole pixels. The arrowhead is the one diagonal, at 45
degrees.

Honest about the limit: at 16 pixels the braces are crisp and the mark reads as
token braces with something passing through them, but the arrowhead is three
pixels wide and antialiases to a soft step, so the direction of the arrow is not
legible until about 20 pixels. Above that it is unambiguous. That trade was
taken deliberately: the alternative was a heavier arrow that reads as a solid
blob at 16 and looks out of weight with the 2 unit braces everywhere else.

## The wordmark

"flow-as-code" set in **JetBrains Mono Bold** and converted to outlines.

Why a real typeface and not drawn letterforms: constructed letters are a
different craft and the last attempt at them produced a reversed `e`. Why
outlines and not `<text>`: an SVG `<text>` element renders in whatever font the
viewer happens to have, so the same file would be JetBrains Mono here, Menlo on
one Mac, DejaVu Sans Mono on a Linux box and Consolas on Windows. A logo that
changes shape per viewer is not a logo. The contexts this has to survive are a
GitHub README, an npm package page, an Open Graph card scraped by a crawler, a
browser tab and a terminal-adjacent audience, and in none of them can the font
be assumed. Outlines are the same bytes everywhere and need no web font, which
also keeps the site's "no external font, no subresource" property intact.

Why that face: the site sets its own name in the system monospace stack
(`ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace`), so the
wordmark has to be a monospace or it stops matching the page it sits on.
JetBrains Mono is a developer's monospace with a tall x-height that holds up
small, and it is close enough to SF Mono that the lockup and the page's own
headings read as one family.

License: JetBrains Mono is under the **SIL Open Font License 1.1**
(https://github.com/JetBrains/JetBrainsMono, `OFL.txt` in that repository). The
OFL permits using the font to produce artwork and distributing that artwork; the
restrictions it carries are on selling or renaming the font software, which
nothing here does. `design/wordmark.mjs` holds outlines for the twelve
characters of the wordmark and no font software, and it repeats the attribution
next to the data.

## The files

Sources, in this directory:

| file                 | what it is                                                          |
| -------------------- | ------------------------------------------------------------------- |
| `mark.mjs`           | the mark's coordinates, the only copy of them in the repository     |
| `wordmark.mjs`       | GENERATED outlines of "flow-as-code", plus its metrics              |
| `lockup.mjs`         | where the mark sits next to the wordmark                            |
| `palette.mjs`        | the colours, which are the landing page's own                       |
| `ttf-outlines.mjs`   | a small TrueType glyph reader, so no font library is a dependency   |
| `build-wordmark.mjs` | the font to `wordmark.mjs` step, run only when the wordmark changes |
| `build-logo.mjs`     | writes the SVGs in `site/`                                          |
| `build-raster.mjs`   | serves `raster.html`, writes the PNGs and the ICO in `site/`        |
| `raster.html`        | draws the rasters in a canvas, from the same modules                |

Published, in `site/`: `mark.svg`, `favicon.svg`, `logo.svg`, `logo-dark.svg`,
`favicon.ico`, `apple-touch-icon.png`, `logo.png`, `og.png`.

## Regenerating

Vectors, after any change to `mark.mjs`, `lockup.mjs` or `palette.mjs`:

```
npm run build:logo
```

Rasters, after any change to the above or to `raster.html`:

```
npm run build:raster      # then open the URL it prints, in any browser
```

It serves the page on localhost, the page draws every image in a canvas from
these same modules and posts the bytes back, and the process writes them into
`site/` and exits. A browser is the rasterizer because this repository has no
image dependency and does not need one to draw four pictures that change once a
year. `favicon.ico` is assembled in Node from the raw pixels the canvas hands
over: an ICO is a header, a directory, and one BMP per size
(https://learn.microsoft.com/en-us/previous-versions/ms997538(v=msdn.10)).

The wordmark, only to change its text or its typeface:

```
node design/build-wordmark.mjs --font <path to JetBrainsMono-Bold.ttf>
```

The font file is not in this repository and does not need to be: the outlines it
produces are committed. Download it from the JetBrains Mono releases if you have
to run this.

## Where the logo is used

- `site/index.html`: the mark inline in the `h1`, and the icon links.
- Every generated page: the mark inline in the header, from `scripts/site/render.mjs`, and the same icon links.
- The root `README.md` and the five `packages/*/README.md`: `logo.png` as a banner, by absolute URL, because npm and GitHub cannot resolve a relative image. `scripts/build-site.mjs` drops that line when it renders those files as pages of this site, since the page already carries the mark in its header and a remote `<img>` is the one thing no page here has.
- The studio demo: nothing. Its HTML is a build artifact whose every `href` is proven to be `./assets/...`, so it carries no icon link and takes the root `/favicon.ico` the browser asks for on its own.
