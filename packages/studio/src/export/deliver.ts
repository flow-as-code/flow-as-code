/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Where an export goes.
//
// Two destinations, one code path. `runExport` builds the bundle (which is
// where the save gate runs) and hands it to a sink; the sink is the only thing
// that differs between a studio served by `flow-cli studio` and a static build,
// and it receives bytes it cannot change. Nothing in the app may emit files any
// other way, so the two destinations cannot drift into different output.
//
//   bridge    the CLI writes the files, because the browser cannot and the
//             bridge is the only thing here that touches disk (A11). This is
//             the normal case: `flow-cli studio` is how the studio is served.
//   download  no bridge, so the browser saves the files itself. A multi-file
//             export becomes one download per file, with the path separator
//             folded into the name, because a browser cannot write a
//             directory; the dialog lists the relative path each file belongs
//             at so the tree can be rebuilt.
//   preview   a read-only store (the hosted demo, docs/05-hosted-demo.md):
//             nothing leaves the tab, so the files come back as text for the
//             dialog to show. Same bundle, same bytes, no download.

import { downloadFile } from "../store/exportDoc.js";
import { BridgeStore } from "../store/bridgeStore.js";
import type { DocStore } from "../store/types.js";
import { buildExport, type ExportBundle, type ExportInput, type ExportTarget } from "./targets.js";

export type ExportSinkKind = "bridge" | "download" | "preview";

export interface ExportDeliveredFile {
  /** Path inside the export, as the target emitted it. */
  path: string;
  /** Absolute path written, or the name the browser was asked to save. */
  wrote: string;
}

export interface ExportDelivery {
  kind: ExportSinkKind;
  target: ExportTarget;
  /** Where the files went, for the dialog to report. */
  destination: string;
  files: ExportDeliveredFile[];
  /** The file contents, path to text. Only a preview carries them. */
  contents?: Record<string, string>;
}

export interface ExportSink {
  readonly kind: ExportSinkKind;
  /** Where an export would go, shown before it runs. */
  destination(subdir: string): string;
  deliver(bundle: ExportBundle): Promise<ExportDelivery>;
}

/** Joins a subdirectory onto a base for display, without a trailing slash. */
const under = (base: string, subdir: string): string =>
  subdir === "" ? base : `${base.replace(/\/$/, "")}/${subdir}`;

/** The CLI writes the files. See packages/cli/src/bridge/exportFiles.ts. */
export class BridgeExportSink implements ExportSink {
  readonly kind = "bridge";

  constructor(private readonly store: BridgeStore) {}

  destination(subdir: string): string {
    return under(this.store.info.dir, subdir);
  }

  async deliver(bundle: ExportBundle): Promise<ExportDelivery> {
    const result = await this.store.postExport({
      target: bundle.target,
      files: bundle.files,
      subdir: bundle.subdir,
    });
    // The server answers with the absolute paths it wrote, sorted; the bundle's
    // own paths are sorted too, so they line up.
    const paths = Object.keys(bundle.files).sort();
    return {
      kind: "bridge",
      target: bundle.target,
      destination: this.destination(bundle.subdir),
      files: paths.map((path, i) => ({ path, wrote: result.paths[i] ?? path })),
    };
  }
}

/** MIME type by extension, so a saved file opens in something sensible. */
function mimeFor(path: string): string {
  if (path.endsWith(".json")) return "application/json";
  return "text/plain";
}

/** The browser saves the files. Used when no bridge is serving the studio. */
export class DownloadExportSink implements ExportSink {
  readonly kind = "download";

  destination(): string {
    return "your downloads folder";
  }

  deliver(bundle: ExportBundle): Promise<ExportDelivery> {
    const files: ExportDeliveredFile[] = [];
    for (const path of Object.keys(bundle.files).sort()) {
      // A browser download cannot create a directory, and a "/" in the name is
      // dropped or rewritten differently by every browser, so the separator is
      // folded here rather than left to chance.
      const wrote = path.replaceAll("/", "-");
      downloadFile(wrote, bundle.files[path] ?? "", mimeFor(path));
      files.push({ path, wrote });
    }
    return Promise.resolve({
      kind: "download",
      target: bundle.target,
      destination: this.destination(),
      files,
    });
  }
}

/**
 * Nothing leaves the tab. The files are returned as text so the dialog can
 * show them; the bundle is the same one the other sinks receive.
 */
export class PreviewExportSink implements ExportSink {
  readonly kind = "preview";

  destination(): string {
    return "this page (read-only demo: nothing is downloaded or written)";
  }

  deliver(bundle: ExportBundle): Promise<ExportDelivery> {
    const paths = Object.keys(bundle.files).sort();
    return Promise.resolve({
      kind: "preview",
      target: bundle.target,
      destination: this.destination(),
      files: paths.map((path) => ({ path, wrote: path })),
      contents: Object.fromEntries(paths.map((path) => [path, bundle.files[path] ?? ""])),
    });
  }
}

/** The sink for the store the studio booted with. */
export function sinkFor(store: DocStore): ExportSink {
  if (store instanceof BridgeStore) return new BridgeExportSink(store);
  if (store.readOnly) return new PreviewExportSink();
  return new DownloadExportSink();
}

/**
 * The one export entry point. Builds the bundle, which runs the save gate on
 * every document, then delivers it. Every button in the studio goes through
 * this function.
 */
export async function runExport(input: ExportInput, sink: ExportSink): Promise<ExportDelivery> {
  return sink.deliver(buildExport(input));
}
