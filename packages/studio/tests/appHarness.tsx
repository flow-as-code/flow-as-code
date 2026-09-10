/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Shared harness for the happy-dom component tests: React Flow's measurement
// polyfills (https://reactflow.dev/learn/advanced-use/testing) plus mounting,
// clicking, typing, and letting the debounced lint settle. Only usable from a
// file with `// @vitest-environment happy-dom`.

import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { expect, vi } from "vitest";
import { LINT_DEBOUNCE_MS } from "../src/hooks/useLintWorker.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

class ResizeObserverStub {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element) {
    // Deferred: a synchronous callback re-enters React mid-render.
    const entry = {
      target,
      contentRect: {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 800,
        bottom: 600,
        width: 800,
        height: 600,
      },
    } as ResizeObserverEntry;
    queueMicrotask(() => this.callback([entry], this as unknown as ResizeObserver));
  }
  unobserve() {}
  disconnect() {}
}

class DOMMatrixReadOnlyStub {
  m22: number;
  constructor(transform?: string) {
    const scale = transform?.match(/scale\(([\d.]+)\)/)?.[1];
    this.m22 = scale !== undefined ? Number(scale) : 1;
  }
}

/** Call from beforeAll. */
export function installDomStubs(): void {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
  (globalThis as Record<string, unknown>).DOMMatrixReadOnly = DOMMatrixReadOnlyStub;
  Object.defineProperties(HTMLElement.prototype, {
    offsetWidth: { configurable: true, get: () => 800 },
    offsetHeight: { configurable: true, get: () => 600 },
  });
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600 }) as DOMRect;
}

/**
 * Makes window.innerWidth writable, so a test can stand at a chosen viewport
 * width. happy-dom's own value is a plain accessor on the window instance;
 * redefining it as a configurable data property is the smallest change that
 * lets setViewport reassign it. Call from beforeAll, next to installDomStubs.
 */
export function installViewport(): void {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: window.innerWidth,
  });
}

/** Sets the viewport width and fires the resize a real browser would fire. */
export function setViewport(width: number): void {
  (window as unknown as { innerWidth: number }).innerWidth = width;
  window.dispatchEvent(new Event("resize"));
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

/** Call from afterEach. */
export function unmount(): void {
  if (root !== null) act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
}

export async function render(element: ReactNode): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container!);
    root.render(element);
  });
  // Flush the async store boot (list + read promises).
  await act(async () => {
    await Promise.resolve();
  });
}

export function query<T extends Element = Element>(selector: string): T | null {
  return document.querySelector<T>(selector);
}

export function testId<T extends Element = Element>(id: string): T {
  const el = document.querySelector<T>(`[data-testid="${id}"]`);
  if (el === null) throw new Error(`no [data-testid="${id}"]`);
  return el;
}

export function button(id: string): HTMLButtonElement {
  return testId<HTMLButtonElement>(id);
}

export function click(el: Element): Promise<void> {
  return act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

const nativeValue = {
  input: Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set,
  textarea: Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set,
};

/**
 * Sets a value the way a keystroke does.
 *
 * Through the prototype setter on purpose: React installs a per-node value
 * tracker whose own setter records what it is given, so a plain `el.value = x`
 * updates the tracker too and React then sees no change and fires no onChange.
 * That is invisible on an uncontrolled field and fatal on a controlled one.
 */
export function setValue(el: HTMLTextAreaElement | HTMLInputElement, value: string): void {
  const setter = el instanceof HTMLTextAreaElement ? nativeValue.textarea : nativeValue.input;
  if (setter === undefined) el.value = value;
  else setter.call(el, value);
}

/** Sets a value and fires the events React turns into onChange plus onBlur. */
export function typeAndBlur(
  el: HTMLTextAreaElement | HTMLInputElement,
  value: string,
): Promise<void> {
  return act(async () => {
    setValue(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    // React maps the bubbling focusout event to onBlur.
    el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
}

/** A focus and blur with no typing at all, which must never commit anything. */
export function blur(el: HTMLTextAreaElement | HTMLInputElement): Promise<void> {
  return act(async () => {
    el.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
}

/** Fires React's onChange for a <select>. */
export function selectOption(el: HTMLSelectElement, value: string): Promise<void> {
  return act(async () => {
    el.value = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

/** Advances past the lint debounce. Requires vi.useFakeTimers(). */
export async function settleLint(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(LINT_DEBOUNCE_MS + 50);
  });
}

/** Asserts an element exists and returns it, for readable one-liners. */
export function present<T extends Element = Element>(selector: string): T {
  const el = query<T>(selector);
  expect(el, `expected ${selector}`).not.toBeNull();
  return el!;
}
