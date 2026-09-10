/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// @vitest-environment happy-dom
//
// The narrow-viewport notice: what a visitor meets at a squeezed width instead
// of a three-column editor crammed into 390px.
//
// The breakpoint is a VIEWPORT test, not a device test, so these cases set
// innerWidth and fire resize rather than pretending to be a phone: a laptop
// window dragged narrow has to see the same notice, and widening the window
// has to take it away with no reload.
//
// Two builds render this component and they must not say the same thing. The
// hosted demo at <site>/studio/ is read-only and has a site root above it; the
// bundle `flow-cli studio` serves over its bridge writes to the user's own
// files and has neither. DEMO_BUILD is the seam, so it is mocked here and each
// case says which build it is standing in. The demo cases also pin the link
// back to the site, which cannot be an absolute URL because
// tests/demo-bundle.test.ts refuses one anywhere in the bundle.

import { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.js";
import { SITE_ROOT_HREF } from "../src/components/NarrowNotice.js";
import { NARROW_MAX_PX } from "../src/hooks/useViewportWidth.js";
import { createDemoStore } from "../src/store/demoStore.js";
import { readOnly } from "../src/store/readOnlyStore.js";
import type { DocStore } from "../src/store/types.js";
import {
  button,
  click,
  installDomStubs,
  installViewport,
  render,
  setViewport,
  settleLint,
  unmount,
} from "./appHarness.js";

// The flag is `import.meta.env.MODE === "demo"`, inlined by Vite, so under
// vitest it is always false and only a module mock can stand in the other
// build. vi.mock is hoisted above the imports above, so the component picks
// this up; a getter, because the component reads the flag on every render.
const build = vi.hoisted(() => ({ demo: false }));
vi.mock("../src/demoBuild.js", () => ({
  get DEMO_BUILD() {
    return build.demo;
  },
}));

beforeAll(() => {
  installDomStubs();
  installViewport();
});
beforeEach(() => {
  build.demo = false;
});
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

const PHONE = 390;
const LAPTOP = 1280;

const notice = () => document.querySelector('[data-testid="narrow-notice"]');
const canvas = () => document.querySelector(".react-flow");
const home = () => document.querySelector<HTMLAnchorElement>('[data-testid="narrow-notice-home"]');

/**
 * Mounts the app at a width, in one of the two builds.
 *
 * The store matches the build the way `defaultStore` does: the hosted demo
 * boots the demo doc read-only, the local studio boots a store that writes.
 */
async function renderAt(width: number, opts: { demo?: boolean } = {}): Promise<void> {
  build.demo = opts.demo ?? false;
  const inner = createDemoStore();
  const store: DocStore = build.demo ? readOnly(inner) : inner;
  setViewport(width);
  vi.useFakeTimers();
  await render(<App store={store} />);
  await settleLint();
}

/** A keystroke, delivered where the browser would deliver it. */
function press(key: string, init: KeyboardEventInit = {}): Promise<void> {
  return act(async () => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
    );
  });
}

/** A focusable control in the shell, outside the notice when there is one. */
function behindTheNotice(): HTMLElement {
  const el = [...document.querySelectorAll<HTMLElement>("button")].find(
    (candidate) => !(notice()?.contains(candidate) ?? false),
  );
  if (el === undefined) throw new Error("no control behind the notice");
  return el;
}

describe("the narrow-viewport notice", () => {
  it("is the first thing on the page below the breakpoint, in either build", async () => {
    for (const demo of [false, true]) {
      await renderAt(PHONE, { demo });
      const el = notice();
      expect(el, `expected the notice at ${String(PHONE)}px, demo=${String(demo)}`).not.toBeNull();
      expect(el!.textContent).toContain("built for a desktop screen");
      // Says what is missing. True wherever the shell is squeezed, so it is
      // not gated on the build.
      expect(el!.textContent).toContain("palette");
      expect(el!.textContent).toContain("inspector");
      // First in DOM order inside the shell, so a screen reader and a scroll
      // both reach it before the toolbar.
      const shell = el!.parentElement!;
      expect(shell.firstElementChild).toBe(el);
      unmount();
    }
  });

  it("stays away at and above the breakpoint", async () => {
    await renderAt(NARROW_MAX_PX);
    expect(notice(), `no notice at exactly ${String(NARROW_MAX_PX)}px`).toBeNull();
    unmount();
    await renderAt(NARROW_MAX_PX - 1);
    expect(notice(), `notice one pixel below ${String(NARROW_MAX_PX)}px`).not.toBeNull();
    unmount();
    await renderAt(LAPTOP);
    expect(notice(), `no notice at ${String(LAPTOP)}px`).toBeNull();
  });

  it("lets the visitor look anyway: dismissing reveals the canvas", async () => {
    await renderAt(PHONE);
    expect(canvas(), "the canvas mounts behind the notice").not.toBeNull();
    await click(button("narrow-notice-anyway"));
    expect(notice(), "gone after Look anyway").toBeNull();
    expect(canvas(), "the canvas is reachable").not.toBeNull();
  });

  it("stops the shell scrolling out from under it, and lets go afterwards", async () => {
    await renderAt(PHONE);
    // Otherwise a sideways swipe slides the notice off the 496px-wide shell.
    // Chrome needs both elements, not either one; the measurement is in the
    // component's comment.
    const locked = () => [document.documentElement, document.body].map((el) => el.style.overflow);
    expect(locked(), "both locked while the notice is up").toEqual(["hidden", "hidden"]);
    await click(button("narrow-notice-anyway"));
    expect(locked(), "both released once it is dismissed").not.toContain("hidden");
    await act(async () => setViewport(LAPTOP));
    expect(locked()).not.toContain("hidden");
  });

  it("also closes from the corner dismiss, and stays closed if the window narrows again", async () => {
    await renderAt(PHONE);
    await click(button("narrow-notice-dismiss"));
    expect(notice()).toBeNull();
    await act(async () => setViewport(320));
    expect(notice(), "a dismissed notice does not come back").toBeNull();
  });

  it("follows the viewport with no reload, in both directions", async () => {
    await renderAt(LAPTOP);
    expect(notice()).toBeNull();
    await act(async () => setViewport(PHONE));
    expect(notice(), "appears when the window is dragged narrow").not.toBeNull();
    await act(async () => setViewport(LAPTOP));
    expect(notice(), "disappears when it is dragged wide again").toBeNull();
  });

  describe("in the hosted demo build", () => {
    it("says the editor behind it is a read-only demo", async () => {
      await renderAt(PHONE, { demo: true });
      expect(notice()!.textContent).toContain("read-only demo");
    });

    it("links back to the site root by a relative href", async () => {
      await renderAt(PHONE, { demo: true });
      const link = home();
      expect(link).not.toBeNull();
      const href = link!.getAttribute("href");
      expect(href).toBe(SITE_ROOT_HREF);
      // No absolute URL and no host-absolute path: the bundle guard refuses the
      // first and a subpath deploy breaks on the second.
      expect(href).not.toMatch(/^(?:[a-z]+:)?\/\//i);
      expect(href!.startsWith("/")).toBe(false);
      // One level up from /studio/ is the site root, wherever the tree is mounted.
      expect(new URL(href!, "https://example.test/studio/").href).toBe("https://example.test/");
      expect(new URL(href!, "https://example.test/prefix/studio/").href).toBe(
        "https://example.test/prefix/",
      );
    });
  });

  describe("in the local build the CLI serves", () => {
    it("claims no demo: this studio writes to the user's own files", async () => {
      await renderAt(PHONE, { demo: true });
      const hosted = notice()!.textContent ?? "";
      unmount();

      await renderAt(PHONE, { demo: false });
      const local = notice()!.textContent ?? "";
      expect(local, "the hosted copy must not be what a local user reads").not.toBe(hosted);
      expect(local.toLowerCase()).not.toContain("demo");
      expect(local).not.toContain("read-only");
      expect(local).not.toContain("not saved");
      // What it says instead is true and actionable: get wider.
      expect(local).toContain(`past ${String(NARROW_MAX_PX)} pixels`);
      expect(local).toContain("Nothing is lost in the meantime");
    });

    it("offers no link away, because there is no site above a bridge path", async () => {
      await renderAt(PHONE);
      expect(home(), "no site link in the local build").toBeNull();
      expect(
        notice()!.querySelectorAll("a").length,
        "no anchor at all: every link out of a bridge-served studio is a guess",
      ).toBe(0);
      // The way past it is still there.
      expect(button("narrow-notice-anyway")).not.toBeNull();
      expect(button("narrow-notice-dismiss")).not.toBeNull();
    });
  });

  describe("is as modal as it looks", () => {
    it("moves focus into the notice when it appears", async () => {
      await renderAt(LAPTOP);
      await act(async () => setViewport(PHONE));
      const el = notice()!;
      expect(el.getAttribute("aria-modal"), "the shell behind it is hidden from AT").toBe("true");
      expect(el.getAttribute("role")).toBe("dialog");
      expect(el.contains(document.activeElement), "focus is inside the notice").toBe(true);
    });

    it("gives focus back to the control that had it", async () => {
      // A keyboard user dragging the window narrow was somewhere in the
      // toolbar, and closing the notice has to put them back rather than at
      // the top of the document.
      await renderAt(LAPTOP);
      const before = behindTheNotice();
      await act(async () => before.focus());
      expect(document.activeElement, "the toolbar control really has focus").toBe(before);
      await act(async () => setViewport(PHONE));
      expect(notice()!.contains(document.activeElement), "the notice took it").toBe(true);
      await click(button("narrow-notice-anyway"));
      expect(document.activeElement, "focus goes back where it came from").toBe(before);
    });

    it("closes on Escape, like the two buttons", async () => {
      await renderAt(PHONE);
      await press("Escape");
      expect(notice(), "Escape closes it").toBeNull();
      expect(canvas(), "and the canvas is reachable").not.toBeNull();
      await act(async () => setViewport(320));
      expect(notice(), "and it stays closed").toBeNull();
    });

    it("leaves every other key alone", async () => {
      await renderAt(PHONE);
      const where = document.activeElement;
      await press("Enter");
      await press("a");
      expect(notice(), "still up").not.toBeNull();
      expect(document.activeElement, "and focus was not shuffled by a plain keystroke").toBe(where);
    });

    it("keeps Tab inside itself, forwards and backwards", async () => {
      await renderAt(PHONE);
      const el = notice()!;
      const items = [...el.querySelectorAll<HTMLElement>("button, a[href]")];
      expect(items.length, "the notice has controls to cycle").toBeGreaterThan(1);
      const first = items[0]!;
      const last = items[items.length - 1]!;

      // Tab off the container lands on the first control, not the toolbar.
      await press("Tab");
      expect(document.activeElement).toBe(first);
      // Tab off the last control wraps to the first, rather than the canvas
      // this notice has just called unusable.
      await act(async () => last.focus());
      await press("Tab");
      expect(document.activeElement, "wraps forwards").toBe(first);
      // Shift-Tab off the first wraps to the last.
      await press("Tab", { shiftKey: true });
      expect(document.activeElement, "wraps backwards").toBe(last);
    });

    it("pulls focus back in if something outside took it", async () => {
      await renderAt(PHONE);
      const outside = behindTheNotice();
      await act(async () => outside.focus());
      expect(notice()!.contains(outside), "the control is really outside").toBe(false);
      await press("Tab");
      expect(notice()!.contains(document.activeElement), "focus is back in the notice").toBe(true);
    });
  });
});
