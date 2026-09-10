/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Typed reference picker: a combo of tokens already in doc.refs of the right
// type, "new reference..." (prompts for a slug), and manual entry that accepts
// a token or JSONPath but rejects literal ARNs inline, same rule as lint.

import type { FlowDoc, RefType } from "@flow-as-code/core";
import { useEffect, useState } from "react";
import { checkRefValue, makeToken, refOptions } from "../model/refValues.js";

// Sentinel <option> values for the two non-token entries. They are ordinary
// printable strings: control characters here made the whole file binary to git
// and invisible to grep. No token can collide with them (every token matches
// TOKEN_PATTERN, which requires the ${cdref:...} form).
const CUSTOM = "__custom__";
const NEW_REF = "__new__";
const NONE = "";

export interface RefPickerProps {
  doc: FlowDoc;
  refType: RefType;
  value: string | undefined;
  optional?: boolean;
  onChange: (value: string | undefined) => void;
}

export function RefPicker({ doc, refType, value, optional, onChange }: RefPickerProps) {
  const options = refOptions(doc, refType);
  const known = value !== undefined && options.some((o) => o.token === value);
  const [custom, setCustom] = useState(!known && value !== undefined);
  const [text, setText] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(value ?? "");
    setCustom(value !== undefined && !options.some((o) => o.token === value));
    setError(null);
    // Re-derive only when the committed value changes; text keeps local edits.
  }, [value]);

  const commitText = (raw: string) => {
    const result = checkRefValue(refType, raw);
    if (result.ok) {
      setError(null);
      onChange(result.value);
    } else {
      setError(result.error);
    }
  };

  const onSelect = (selected: string) => {
    setError(null);
    if (selected === NONE) {
      // "(choose a reference)" is a prompt, not a value. On a required field
      // it used to clear the parameter, which deletes a reference the block
      // cannot do without. The <option> is disabled as well; this is the half
      // that holds when something selects it anyway.
      if (optional !== true) {
        setError("This reference is required. Pick one, or enter a token or JSONPath.");
        return;
      }
      setCustom(false);
      onChange(undefined);
    } else if (selected === CUSTOM) {
      setCustom(true);
    } else if (selected === NEW_REF) {
      const name = window.prompt(`New ${refType} reference name (slug, e.g. front-desk):`);
      if (name === null) return;
      const alias =
        refType === "module"
          ? (window.prompt("Module alias (slug, e.g. prod):") ?? undefined)
          : undefined;
      const result = makeToken(refType, name.trim(), alias?.trim());
      if (result.ok) {
        setCustom(false);
        onChange(result.value);
      } else {
        setError(result.error);
      }
    } else {
      setCustom(false);
      onChange(selected);
    }
  };

  const selectValue = custom ? CUSTOM : known ? value : NONE;

  return (
    <div className="space-y-1">
      <select
        className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-800"
        value={selectValue}
        onChange={(e) => onSelect(e.target.value)}
      >
        <option value={NONE} disabled={optional !== true}>
          {optional === true ? "(not set)" : "(choose a reference)"}
        </option>
        {options.map((o) => (
          <option key={o.token} value={o.token}>
            {o.name}
            {o.alias !== undefined ? `@${o.alias}` : ""}
          </option>
        ))}
        <option value={NEW_REF}>new reference…</option>
        <option value={CUSTOM}>token or JSONPath…</option>
      </select>
      {custom && (
        <input
          type="text"
          className="w-full rounded border border-neutral-300 bg-white px-2 py-1 font-mono text-xs dark:border-neutral-600 dark:bg-neutral-800"
          placeholder={`\${cdref:${refType}:name} or $.Attributes.value`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commitText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitText((e.target as HTMLInputElement).value);
          }}
        />
      )}
      {error !== null && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
