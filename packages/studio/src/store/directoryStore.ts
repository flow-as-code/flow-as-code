/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// File System Access API DocStore: edit real *.flowdoc.json files fully
// offline where the browser supports it (feature-detected; Chromium only as
// of 2026). https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker

import type { FlowDoc } from "@flow-as-code/core";
import { serialize } from "@flow-as-code/core";
import { assertSaveable, parseFlowDoc } from "../model/validate.js";
import type { DocRef, DocStore } from "./types.js";

// The async-iteration and picker members are WICG additions not yet in TS's
// lib.dom; declare the minimum used here.
interface DirectoryHandle extends FileSystemDirectoryHandle {
  values(): AsyncIterableIterator<FileSystemHandle>;
}

declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      mode?: "read" | "readwrite";
    }) => Promise<FileSystemDirectoryHandle>;
  }
}

export const FLOWDOC_SUFFIX = ".flowdoc.json";

export function supportsDirectoryStore(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

/** Exported so tests can drive it against a stub directory handle. */
export class DirectoryStore implements DocStore {
  readonly persistent = true;
  readonly readOnly = false;

  constructor(
    readonly label: string,
    private readonly dir: DirectoryHandle,
  ) {}

  async list(): Promise<DocRef[]> {
    const names: string[] = [];
    for await (const handle of this.dir.values()) {
      if (handle.kind === "file" && handle.name.endsWith(FLOWDOC_SUFFIX)) {
        names.push(handle.name.slice(0, -FLOWDOC_SUFFIX.length));
      }
    }
    return names.sort().map((name) => ({ name }));
  }

  async read(name: string): Promise<{ doc: FlowDoc; text: string }> {
    const handle = await this.dir.getFileHandle(`${name}${FLOWDOC_SUFFIX}`);
    const text = await (await handle.getFile()).text();
    // Same guard as the single-file open path: a folder can hold anything.
    try {
      return { doc: parseFlowDoc(text), text };
    } catch (err) {
      throw new Error(
        `${name}${FLOWDOC_SUFFIX}: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }
  }

  async write(name: string, doc: FlowDoc): Promise<void> {
    assertSaveable(doc);
    const handle = await this.dir.getFileHandle(`${name}${FLOWDOC_SUFFIX}`, { create: true });
    const writable = await handle.createWritable();
    await writable.write(serialize(doc));
    await writable.close();
  }
}

/** Prompts for a directory and returns a store over its *.flowdoc.json files. */
export async function openDirectoryStore(): Promise<DocStore> {
  if (!supportsDirectoryStore() || window.showDirectoryPicker === undefined) {
    throw new Error("This browser does not support the File System Access API.");
  }
  const dir = (await window.showDirectoryPicker({ mode: "readwrite" })) as DirectoryHandle;
  return new DirectoryStore(dir.name, dir);
}
