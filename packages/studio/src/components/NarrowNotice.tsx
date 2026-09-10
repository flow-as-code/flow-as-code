/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// What a narrow-window visitor meets instead of a broken layout.
//
// The hosted demo is linked from the landing page and from anywhere the
// project gets announced, and announcement traffic skews mobile. The studio is
// a node-graph editor with a palette, an inspector and a lint panel; it is not
// going to work at 390px and nobody is pretending otherwise. The honest move
// is to say so first, in words, rather than let the visitor conclude the
// project is broken.
//
// Not a wall. Two ways past it, both closing the notice for the rest of the
// visit: the labelled button for a reader who read the sentence and wants to
// look anyway, and the corner dismiss for the reader who did not and just
// wants it gone. Deliberately the same effect, because the canvas has to stay
// reachable; a visitor locked out of the thing they were sent to see is worse
// than a squeezed layout. Once dismissed it does not come back if the window
// is narrowed again, which is why the flag is component state and not derived.
//
// TWO BUILDS READ THIS FILE, and only one of them is the hosted demo. The
// other is the bundle `flow-cli studio` serves over its bridge against a
// person's own .flow.ts files, where "read-only demo" is simply false (that
// studio writes to disk) and "../" is not the project site but whatever
// happens to sit above the bridge's path. So the width advice, which is true
// wherever the shell is squeezed, is unconditional, and the two demo-specific
// parts are gated.
//
// The gate is DEMO_BUILD, not store.readOnly. Both gated parts are claims
// about the ARTIFACT rather than about the document: that this bundle has
// nowhere to save (defaultStore wraps the demo store read-only precisely when
// DEMO_BUILD is set) and that it was built with base "./" and copied to
// /studio/ of the site by scripts/build-site.mjs, which is the only reason
// "../" is the site root. store.readOnly answers the first question and cannot
// answer the second at all: a read-only store says nothing about what is
// mounted one level up. DEMO_BUILD answers both, and being compile-time it
// keeps the sentence and the anchor out of the local bundle entirely rather
// than leaving them one runtime flag away from being shown.
//
// The link back stays relative. An absolute URL is refused anywhere in the
// bundle by tests/demo-bundle.test.ts, and a host-absolute path would break
// the subpath deploy the artifact is built to survive.
//
// It claims role="dialog" and it earns it. The overlay is opaque and covers
// the viewport, and the scroll lock below pins the page under it, so a sighted
// visitor genuinely cannot reach the canvas until the notice is closed.
// Anything reading the accessibility tree gets the same deal: aria-modal hides
// the shell behind it, focus moves in on show, Tab cycles inside, and Escape
// closes it the way the two buttons do. Before that a screen reader could tab
// straight into the canvas this notice had just called unusable.

import { useEffect, useRef, useState } from "react";
import { DEMO_BUILD } from "../demoBuild.js";
import { NARROW_MAX_PX, useViewportWidth } from "../hooks/useViewportWidth.js";

/** The site root, relative to the hosted demo at <site>/studio/. */
export const SITE_ROOT_HREF = "../";

/** What Tab may land on inside the notice. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function NarrowNotice() {
  const width = useViewportWidth();
  const [dismissed, setDismissed] = useState(false);
  const showing = !dismissed && width < NARROW_MAX_PX;
  const ref = useRef<HTMLDivElement>(null);

  // The shell under the overlay is 496px of non-shrinking columns, so at a
  // 390px viewport the document scrolls sideways (measured in Chrome on the
  // built demo: documentElement.scrollWidth 496, clientWidth 390) and a swipe
  // slides the notice off to reveal the broken layout it is there to explain.
  //
  // Both elements, which is not belt and braces. Measured in Chrome on the
  // built demo at a real 390px viewport, scrollTo(500, 0) left scrollX at 106,
  // the whole overhang, with only <body> hidden AND with only <html> hidden;
  // it stayed at 0 only with both. Locked while the notice is up and released
  // the moment it goes, so dismissing gives the page its scrolling back.
  useEffect(() => {
    if (!showing) return;
    const locked = [document.documentElement, document.body];
    const previous = locked.map((el) => el.style.overflow);
    for (const el of locked) el.style.overflow = "hidden";
    return () => {
      locked.forEach((el, i) => (el.style.overflow = previous[i] ?? ""));
    };
  }, [showing]);

  // Focus in on show, and back where it came from on close, so closing the
  // notice from the keyboard does not dump the caret at the top of the page.
  useEffect(() => {
    if (!showing) return;
    const returnTo = document.activeElement;
    ref.current?.focus();
    return () => {
      if (returnTo instanceof HTMLElement && returnTo.isConnected) returnTo.focus();
    };
  }, [showing]);

  // Escape closes it, Tab stays inside it. On the document in the capture
  // phase rather than on the element: React Flow installs its own key handling
  // on the canvas, and a Tab that has already escaped the notice (an AT
  // gesture, a browser find bar) has to be pulled back in, which a handler
  // that only sees events inside the notice never gets to see.
  useEffect(() => {
    if (!showing) return;
    const onKey = (event: KeyboardEvent) => {
      const root = ref.current;
      if (root === null) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setDismissed(true);
        return;
      }
      if (event.key !== "Tab") return;
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = items[0];
      const last = items[items.length - 1];
      if (first === undefined || last === undefined) {
        event.preventDefault();
        root.focus();
        return;
      }
      const active = document.activeElement;
      if (!(active instanceof Node) || !root.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      // The container itself is the mount-time focus target and sits before
      // every control, so Tab off it goes to the first and shift-Tab wraps to
      // the last. Both are what a browser would do unaided; doing them here
      // makes the cycle one behaviour rather than two halves.
      if (event.shiftKey && (active === first || active === root)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || active === root)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [showing]);

  if (!showing) return null;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby="narrow-notice-title"
      data-testid="narrow-notice"
      tabIndex={-1}
      className="fixed inset-0 z-50 overflow-y-auto bg-white p-6 text-neutral-900 outline-none dark:bg-neutral-950 dark:text-neutral-100"
    >
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <h2 id="narrow-notice-title" className="text-xl font-semibold">
            Flow Studio is built for a desktop screen
          </h2>
          <button
            type="button"
            aria-label="Dismiss"
            data-testid="narrow-notice-dismiss"
            className="shrink-0 rounded border border-neutral-300 px-2 py-1 text-sm text-neutral-600 dark:border-neutral-600 dark:text-neutral-300"
            onClick={() => setDismissed(true)}
          >
            Dismiss
          </button>
        </div>

        <p className="text-base leading-6">
          It is a node-graph editor: a block palette down the left, an inspector down the right, and
          the flow canvas between them. Those two columns take a fixed 496 pixels, so on this{" "}
          {width}-pixel screen the canvas has almost nothing left. Nodes overlap the panels, the
          lint panel covers what is under it, and dragging does not do what you aim at.
        </p>

        {DEMO_BUILD ? (
          <p className="text-base leading-6" data-testid="narrow-notice-demo-note">
            Open it on a laptop and it works. Even there it is a read-only demo: you can pan the
            flow, open a block, read its parameters and preview the generated CDK and Terraform, but
            nothing you change is saved anywhere.
          </p>
        ) : (
          <p className="text-base leading-6" data-testid="narrow-notice-local-note">
            Widen the window past {NARROW_MAX_PX} pixels, or move it to a larger screen, and the
            three columns fit. Nothing is lost in the meantime.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            data-testid="narrow-notice-anyway"
            className="rounded bg-blue-600 px-4 py-2 text-base font-medium text-white"
            onClick={() => setDismissed(true)}
          >
            Look anyway
          </button>
          {DEMO_BUILD ? (
            <a
              href={SITE_ROOT_HREF}
              data-testid="narrow-notice-home"
              className="rounded border border-neutral-300 px-4 py-2 text-base underline dark:border-neutral-600"
            >
              Back to the project site
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
