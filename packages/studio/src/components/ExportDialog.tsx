/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The export dialog: pick a target, fill in the map it needs, export.
//
// The three targets are not symmetric, because what a user has to supply
// differs (docs/02-studio-design.md, "Export targets"):
//
//   cdk  nothing. The scaffold lists the binder methods the set needs and
//        leaves a TODO on each; the user writes the bindings in their editor.
//   tf   a terraform address per reference the set does not resolve itself.
//        That is the address-map editor below, and it refuses a literal ARN
//        inline exactly as the ref pickers do.
//   raw  a resolved value per reference. This is the one place an ARN belongs.
//
// The buttons here are the visible half of the rule, never the rule itself:
// `runExport` builds the bundle through the save gate, so a document that
// fails a hard lint rule cannot be exported whatever this component does.

import { useEffect, useMemo, useState } from "react";
import type { FlowDoc } from "@flow-as-code/core";
import { PACKAGE_NAMES } from "@flow-as-code/core";
import { EmitTfError } from "@flow-as-code/tf/emit";
import { referencedNames } from "@flow-as-code/cdk/scaffold";
import { runExport, sinkFor, type ExportDelivery } from "../export/deliver.js";
import { exportDocSet } from "../export/docSet.js";
import {
  addressPlaceholder,
  checkAddress,
  checkResourceValue,
  compactMap,
  exportRefs,
  unmappedTokens,
  type ExportRef,
} from "../export/refMap.js";
import { ExportMapError, type ExportInput, type ExportTarget } from "../export/targets.js";
import { useStudio } from "../state/studio.js";

const TARGETS: { id: ExportTarget; label: string; blurb: string }[] = [
  {
    id: "tf",
    label: "Terraform",
    blurb:
      `aws_connect_contact_flow resources plus .tftpl content, from ${PACKAGE_NAMES.tf}. ` +
      "Give every reference a terraform address, never a literal ARN.",
  },
  {
    id: "cdk",
    label: "CDK",
    blurb:
      "A FlowSet stack scaffold with a TODO TokenBinder, one entry per reference type " +
      "this document set uses. Same bytes as `flow-cli emit --target cdk`.",
  },
  {
    id: "raw",
    label: "Raw JSON",
    blurb:
      "Materialized Flow language content for console import or debugging. Values here are " +
      "the resolved resources themselves, so ARNs belong in this map.",
  },
];

/** The message to show for whatever an export threw. */
function describeError(err: unknown): string {
  if (err instanceof ExportMapError) {
    return `${String(err.missingTokens.length)} reference(s) have no resource map entry: ${err.missingTokens.join(", ")}`;
  }
  if (err instanceof EmitTfError) return err.problems.join("; ");
  return err instanceof Error ? err.message : String(err);
}

function RefRow({
  refEntry,
  mapKey,
  value,
  error,
  missing,
  missingNote,
  testIdPrefix,
  placeholder,
  onChange,
}: {
  refEntry: ExportRef;
  /** The key this row edits: the address-map key, or the token for raw. */
  mapKey: string;
  value: string;
  error: string | null;
  missing: boolean;
  missingNote: string;
  testIdPrefix: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <tr className="align-top">
      <td className="py-1 pr-2 text-xs whitespace-nowrap text-neutral-500">{refEntry.type}</td>
      <td className="py-1 pr-2 font-mono text-xs break-all">
        {refEntry.name}
        {refEntry.alias === undefined ? "" : `@${refEntry.alias}`}
      </td>
      <td className="py-1">
        <input
          type="text"
          data-testid={`${testIdPrefix}-${mapKey}`}
          aria-label={`Value for ${refEntry.token}`}
          className="w-full rounded border border-neutral-300 bg-white px-2 py-1 font-mono text-xs dark:border-neutral-600 dark:bg-neutral-800"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {error !== null && (
          <p
            data-testid={`${testIdPrefix}-error-${mapKey}`}
            className="mt-1 text-xs text-red-600 dark:text-red-400"
          >
            {error}
          </p>
        )}
        {error === null && missing && (
          <p
            data-testid={`${testIdPrefix}-missing-${mapKey}`}
            className="mt-1 text-xs text-amber-600 dark:text-amber-400"
          >
            {missingNote}
          </p>
        )}
      </td>
    </tr>
  );
}

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const { state } = useStudio();
  const [target, setTarget] = useState<ExportTarget>("tf");
  const [subdir, setSubdir] = useState("");
  const [docs, setDocs] = useState<FlowDoc[] | null>(null);
  const [addresses, setAddresses] = useState<Record<string, string>>({});
  const [resources, setResources] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [delivery, setDelivery] = useState<ExportDelivery | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { store, docName, doc } = state;
  useEffect(() => {
    let live = true;
    exportDocSet(store, docName, doc)
      .then((set) => {
        if (live) setDocs(set);
      })
      .catch((err: unknown) => {
        if (live) setError(describeError(err));
      });
    return () => {
      live = false;
    };
  }, [store, docName, doc]);

  const refs = useMemo(() => (docs === null ? [] : exportRefs(docs)), [docs]);
  const addressMap = useMemo(() => compactMap(addresses), [addresses]);
  const resourceMap = useMemo(() => compactMap(resources), [resources]);

  const addressErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    for (const [key, value] of Object.entries(addresses)) {
      if (value.trim() === "") continue;
      const check = checkAddress(value);
      if (!check.ok) errors[key] = check.error;
    }
    return errors;
  }, [addresses]);

  const resourceErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    for (const [key, value] of Object.entries(resources)) {
      if (value === "") continue;
      const check = checkResourceValue(value);
      if (!check.ok) errors[key] = check.error;
    }
    return errors;
  }, [resources]);

  // Asked of the emitter, not restated here: @flow-as-code/tf resolves references to
  // documents in the set itself, and those need no address at all.
  //
  // A throw is NOT "nothing is missing". Swallowing it into an empty list told
  // the user every reference had an address and left the Export button live,
  // which is the exact opposite of what the emitter had just said. The failure
  // is carried out of here instead and blocks the export like any other
  // unusable map, and the dialog says what the emitter said.
  const addressScan = useMemo<{ missing: string[]; error: string | null }>(() => {
    if (docs === null || target !== "tf" || Object.keys(addressErrors).length > 0) {
      return { missing: [], error: null };
    }
    try {
      return { missing: unmappedTokens(docs, addressMap), error: null };
    } catch (err) {
      return { missing: [], error: describeError(err) };
    }
  }, [docs, target, addressMap, addressErrors]);
  const missingAddresses = addressScan.missing;

  const missingResources = refs.filter((r) => resourceMap[r.token] === undefined);
  const binderTypes = useMemo(
    () =>
      docs === null
        ? []
        : [...referencedNames(docs)]
            .filter(([, names]) => names.length > 0)
            .map(([type, names]) => `${type} (${names.join(", ")})`),
    [docs],
  );

  const sink = useMemo(() => sinkFor(store), [store]);
  // Scoped to the target being exported. The address map is read only for tf
  // and the resource map only for raw (see onExport), so a half-typed entry in
  // the map the current target does not use is not a reason to refuse: ORing
  // the two blocked a valid CDK or Terraform export because of a row the user
  // had touched under a different radio button.
  const blockedByFields =
    target === "tf"
      ? Object.keys(addressErrors).length > 0 || addressScan.error !== null
      : target === "raw"
        ? Object.keys(resourceErrors).length > 0
        : false;

  const onExport = async () => {
    if (docs === null) return;
    setBusy(true);
    setError(null);
    setDelivery(null);
    try {
      const input: ExportInput =
        target === "tf"
          ? { target: "tf", docs, subdir, addressMap }
          : target === "raw"
            ? { target: "raw", docs, subdir, resourceMap }
            : { target: "cdk", docs, subdir };
      setDelivery(await runExport(input, sink));
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const active = TARGETS.find((t) => t.id === target);

  return (
    <div
      className="fixed inset-0 z-30 flex items-start justify-center bg-neutral-900/50 p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Export"
      data-testid="export-dialog"
    >
      <div className="flex max-h-full w-[46rem] flex-col overflow-auto rounded border border-neutral-300 bg-white p-4 shadow-lg dark:border-neutral-600 dark:bg-neutral-900">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">Export</h2>
          <span className="flex-1" />
          <button
            type="button"
            data-testid="export-close"
            className="rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-600"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="mt-3 flex gap-2">
          {TARGETS.map((t) => (
            <label
              key={t.id}
              className={`cursor-pointer rounded border px-2 py-1 text-xs ${
                target === t.id
                  ? "border-blue-600 bg-blue-50 dark:bg-blue-950"
                  : "border-neutral-300 dark:border-neutral-600"
              }`}
            >
              <input
                type="radio"
                name="export-target"
                className="mr-1"
                data-testid={`export-target-${t.id}`}
                checked={target === t.id}
                onChange={() => {
                  setTarget(t.id);
                  setDelivery(null);
                  setError(null);
                }}
              />
              {t.label}
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-neutral-500">{active?.blurb}</p>

        <label className="mt-3 block text-xs text-neutral-500">
          Subdirectory (optional)
          <input
            type="text"
            data-testid="export-subdir"
            className="mt-1 w-full rounded border border-neutral-300 bg-white px-2 py-1 font-mono text-xs dark:border-neutral-600 dark:bg-neutral-800"
            placeholder="infra"
            value={subdir}
            onChange={(e) => setSubdir(e.target.value)}
          />
        </label>
        <p className="mt-1 text-xs text-neutral-500" data-testid="export-destination">
          {sink.kind === "bridge"
            ? "Writes to "
            : sink.kind === "preview"
              ? "Shows in "
              : "Downloads to "}
          <span className="font-mono">{sink.destination(subdir)}</span>
        </p>

        {docs === null ? (
          <p className="mt-4 text-xs text-neutral-500">Loading documents…</p>
        ) : (
          <div className="mt-4">
            {target === "cdk" && (
              <div data-testid="export-binder-types" className="text-xs text-neutral-500">
                {binderTypes.length === 0
                  ? "These documents contain no references, so the binder is a stub."
                  : `TODO binder entries for: ${binderTypes.join(", ")}.`}
              </div>
            )}

            {target === "tf" && (
              <>
                <table className="w-full table-auto">
                  <tbody>
                    {refs.map((r) => (
                      <RefRow
                        key={r.token}
                        refEntry={r}
                        mapKey={r.key}
                        value={addresses[r.key] ?? ""}
                        error={addressErrors[r.key] ?? null}
                        missing={missingAddresses.includes(r.token)}
                        missingNote="No address yet: this becomes a TODO placeholder that fails validate."
                        testIdPrefix="export-address"
                        placeholder={addressPlaceholder(r)}
                        onChange={(value) => {
                          setAddresses((m) => ({ ...m, [r.key]: value }));
                          // The standing error names the tokens a previous
                          // attempt found unmapped. Editing the map is what
                          // makes that list wrong, so it goes then rather than
                          // surviving until the next Export.
                          setError(null);
                        }}
                      />
                    ))}
                  </tbody>
                </table>
                {addressScan.error === null ? (
                  <p className="mt-2 text-xs" data-testid="export-missing">
                    {missingAddresses.length === 0
                      ? `All ${String(refs.length)} reference(s) have an address.`
                      : `${String(missingAddresses.length)} of ${String(refs.length)} reference(s) still unmapped: ${missingAddresses.join(", ")}`}
                  </p>
                ) : (
                  <p
                    className="mt-2 text-xs text-red-600 dark:text-red-400"
                    data-testid="export-scan-error"
                  >
                    These documents cannot be emitted as they stand: {addressScan.error}
                  </p>
                )}
              </>
            )}

            {target === "raw" && (
              <>
                <table className="w-full table-auto">
                  <tbody>
                    {refs.map((r) => (
                      <RefRow
                        key={r.token}
                        refEntry={r}
                        mapKey={r.token}
                        value={resources[r.token] ?? ""}
                        error={resourceErrors[r.token] ?? null}
                        missing={resourceMap[r.token] === undefined}
                        missingNote="No value yet: the export refuses an incomplete resource map."
                        testIdPrefix="export-resource"
                        placeholder="arn:aws:connect:…"
                        onChange={(value) => {
                          setResources((m) => ({ ...m, [r.token]: value }));
                          setError(null);
                        }}
                      />
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-xs" data-testid="export-missing">
                  {missingResources.length === 0
                    ? `All ${String(refs.length)} reference(s) are mapped.`
                    : `${String(missingResources.length)} of ${String(refs.length)} reference(s) unmapped: ${missingResources.map((r) => r.token).join(", ")}`}
                </p>
              </>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            data-testid="export-run"
            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={docs === null || busy || blockedByFields}
            onClick={() => void onExport()}
          >
            Export
          </button>
          {blockedByFields && (
            <span data-testid="export-blocked" className="text-xs text-red-600 dark:text-red-400">
              {addressScan.error === null
                ? "Fix the highlighted map entries first."
                : "Fix what the emitter reported above first."}
            </span>
          )}
        </div>

        {error !== null && (
          <p
            role="alert"
            data-testid="export-error"
            className="mt-3 text-xs text-red-600 dark:text-red-400"
          >
            {error}
          </p>
        )}
        {delivery !== null && (
          <div
            data-testid="export-result"
            className="mt-3 text-xs text-neutral-600 dark:text-neutral-300"
          >
            <p>
              {delivery.kind === "bridge"
                ? "Wrote"
                : delivery.kind === "preview"
                  ? "Generated"
                  : "Downloaded"}{" "}
              {delivery.files.length} file(s) to {delivery.destination}:
            </p>
            <ul className="mt-1 font-mono">
              {delivery.files.map((f) => (
                <li key={f.path}>
                  {f.path}
                  {f.path === f.wrote ? "" : ` → ${f.wrote}`}
                </li>
              ))}
            </ul>
            {delivery.contents !== undefined &&
              Object.entries(delivery.contents).map(([path, text]) => (
                <details key={path} className="mt-2" open={delivery.files.length === 1}>
                  <summary className="cursor-pointer font-mono">{path}</summary>
                  <pre
                    data-testid={`export-preview-${path}`}
                    className="mt-1 max-h-80 overflow-auto rounded border border-neutral-200 bg-neutral-50 p-2 font-mono text-xs whitespace-pre dark:border-neutral-700 dark:bg-neutral-950"
                  >
                    {text}
                  </pre>
                </details>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
