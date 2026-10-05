/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The offline half of simulate: a scenario held against the flow set it will
// run through, with no instance and no credentials.
//
// `runScenarios` can only say whether a scenario passed once a test case has
// executed on an instance, which costs a deployment, a resource map of ARNs
// and up to five minutes per scenario. Most of what makes a scenario fail is
// visible before any of that: a prompt the flows never say, a key no menu
// takes, a token the set never references. This module reports those from the
// FlowDocs alone, so a scenario suite can be checked in a unit test or a CI
// job that has no AWS account.
//
// What it cannot do, and says so in packages/cli/README.md: it does not execute
// Lambdas, evaluate conditions on attribute values, follow the contact through
// branches, or model the speech-to-text transcript a voice MessageReceived is
// matched against. A scenario this passes can still fail live; a scenario this
// reports will not pass live for the reason given.

import { textBodyPaths } from "./catalog.js";
import type { FlowAction, FlowDoc } from "./flowdoc.js";
import { readPath } from "./paths.js";
import { collectRefs, lookupRefValue, parseToken } from "./refs.js";
import type { Scenario, ScenarioFinding } from "./simulate.js";
import { SUBSTITUTION_PARAMETER } from "./simulate.js";

export interface DryRunOptions {
  /**
   * Tokens resolvable outside the set, keyed in any of the three forms
   * `lookupRefValue` accepts. Values are never read: a `render` resource map
   * and an `emit` address map both serve. A token the set itself references
   * needs no entry, because the deployment that holds the flow holds it.
   */
  resourceMap?: Readonly<Record<string, string>>;
}

/**
 * Action types that take keypad input, and so are the prompts a `send-dtmf`
 * can answer. GetParticipantInput branches on the key through its Conditions
 * (https://docs.aws.amazon.com/connect/latest/adminguide/get-customer-input.html);
 * StoreUserInput stores whatever digits arrive and has no per-key branch
 * (https://docs.aws.amazon.com/connect/latest/adminguide/store-customer-input.html),
 * so any key answers it.
 */
const KEYPAD_BRANCHING = "GetParticipantInput";
const KEYPAD_FREEFORM = "StoreUserInput";

/** A contact attribute read inside prompt text: the piece the scenario can supply. */
const ATTRIBUTE_READ = /\$\.Attributes\.([A-Za-z0-9_-]+)/g;
/** Any other JSONPath read inside prompt text: unknowable offline. */
const DYNAMIC_READ = /\$\.[A-Za-z0-9_$.[\]'-]+/g;

/** One text the set plays, with the block that plays it. */
interface Said {
  doc: string;
  action: FlowAction;
  text: string;
}

/** Case-folded with runs of whitespace collapsed, so layout in JSON does not matter. */
function fold(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/** The words of a text, for the loose `similarTo` comparison. */
function words(text: string): string[] {
  return fold(text)
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(" ")
    .filter((w) => w !== "");
}

/**
 * The spoken words of an SSML body: what is outside its tags. One linear pass,
 * each `<` skipping to the next `>`; an unterminated `<` is kept as written.
 * This is not sanitization and nothing here renders HTML: the result is only
 * compared against a scenario's expectation and quoted in a finding, so
 * `<scr<script>ipt>` becoming `ipt>` is the intended reading of a malformed
 * body, not a hole. A backtracking regex was refused by code scanning for
 * exactly the strings this pass handles in linear time.
 */
export function spokenText(ssml: string): string {
  let out = "";
  let i = 0;
  while (i < ssml.length) {
    const open = ssml.indexOf("<", i);
    if (open === -1) {
      out += ssml.slice(i);
      break;
    }
    out += ssml.slice(i, open);
    const close = ssml.indexOf(">", open + 1);
    if (close === -1) {
      out += ssml.slice(open);
      break;
    }
    i = close + 1;
  }
  return out;
}

/**
 * Every text the set plays. The catalog says where a modeled type keeps its
 * body (`Text`, `SSML`, `Messages[].Text`); an unmodeled type that carries a
 * top-level `Text` or `SSML` is read too, so a GenericBlock still counts.
 * SSML is read as its spoken text. A `PromptId` plays recorded audio whose
 * words are not in the document, so it contributes nothing here and is
 * counted separately for the message a miss gets.
 */
function textsOf(docs: readonly FlowDoc[]): { said: Said[]; recorded: number } {
  const said: Said[] = [];
  let recorded = 0;
  for (const doc of docs) {
    for (const action of doc.content.Actions) {
      const catalogPaths = textBodyPaths(action.Type);
      const paths = catalogPaths.length > 0 ? catalogPaths : ["Text", "SSML"];
      for (const path of paths) {
        for (const hit of readPath(action.Parameters, path)) {
          if (typeof hit.value !== "string" || hit.value.trim() === "") continue;
          const text = path.split(".").pop() === "SSML" ? spokenText(hit.value) : hit.value;
          said.push({ doc: doc.name, action, text });
        }
      }
      for (const path of ["PromptId", "Messages[].PromptId"]) {
        for (const hit of readPath(action.Parameters, path)) {
          if (typeof hit.value === "string" && parseToken(hit.value) !== undefined) recorded += 1;
        }
      }
    }
  }
  return { said, recorded };
}

/**
 * The attribute values a scenario makes known: what it starts the contact
 * with, overridden by what it asserts with `Equals`. A prompt that reads
 * `$.Attributes.callerName` is heard with that value, so the expectation
 * "Welcome back, Mrs. Alder" is held against the rendered text.
 */
function knownAttributes(scenario: Scenario): Map<string, string> {
  const values = new Map<string, string>(Object.entries(scenario.attributes ?? {}));
  for (const step of scenario.steps) {
    if (step.kind !== "assert" || step.operator !== "Equals") continue;
    const name = /^\$\.Attributes\.([A-Za-z0-9_-]+)$/.exec(step.path)?.[1];
    if (name !== undefined) values.set(name, step.value);
  }
  return values;
}

/**
 * A text as the participant hears it, as far as the scenario can say: known
 * attribute reads filled in, and the rest of the text split around any read
 * that stays unknown. An expectation then has to fit inside one literal piece,
 * which is what a reader of the flow would have written it from.
 */
function render(text: string, values: ReadonlyMap<string, string>): string[] {
  const filled = text.replace(ATTRIBUTE_READ, (whole, name: string) => values.get(name) ?? whole);
  const pieces = filled.split(DYNAMIC_READ).map(fold);
  return pieces.length > 1 ? [fold(filled), ...pieces] : [fold(filled)];
}

function contains(said: Said, needle: string, values: ReadonlyMap<string, string>): boolean {
  const target = fold(needle);
  return render(said.text, values).some((piece) => piece.includes(target));
}

/**
 * The offline stand-in for the service's Similarity matcher, whose threshold
 * is not published: at least half of the expectation's words appear in one
 * text. Loose on purpose; the live run decides, and this only catches an
 * expectation written for a prompt the set does not have.
 */
function resembles(said: Said, expectation: string, values: ReadonlyMap<string, string>): boolean {
  const wanted = words(expectation);
  if (wanted.length === 0) return false;
  const have = new Set(render(said.text, values).flatMap(words));
  const shared = wanted.filter((w) => have.has(w)).length;
  return shared * 2 >= wanted.length;
}

function matches(
  said: Said,
  step: { contains?: string; similarTo?: string },
  values: ReadonlyMap<string, string>,
): boolean {
  return step.contains === undefined
    ? resembles(said, step.similarTo ?? "", values)
    : contains(said, step.contains, values);
}

function describe(step: { contains?: string; similarTo?: string }): string {
  return step.contains === undefined
    ? `resembles ${JSON.stringify(step.similarTo ?? "")}`
    : `contains ${JSON.stringify(step.contains)}`;
}

/** The keys a GetParticipantInput branches on: every Equals operand of its Conditions. */
function acceptedKeys(action: FlowAction): string[] {
  const keys: string[] = [];
  for (const condition of action.Transitions.Conditions ?? []) {
    for (const operand of condition.Condition.Operands) keys.push(operand);
  }
  return keys;
}

function storesInput(action: FlowAction): boolean {
  return action.Type === KEYPAD_FREEFORM || action.Parameters.StoreInput === "True";
}

/**
 * Checks a scenario against the FlowDocs it will run through, with no
 * instance: the entry flow is in the set, every token resolves (an event's
 * resource is one the set references, anything else is referenced or mapped),
 * every `expect-prompt` is a text some block plays, and every `send-dtmf`
 * answers a keypad prompt with a key it takes. Findings use the same
 * `{ path, message }` shape as `validateScenario`, and the scenario is
 * assumed to have passed that already: a scenario it rejects is not checked
 * further here. Empty means nothing offline says the scenario cannot pass.
 */
export function dryRunScenario(
  scenario: Scenario,
  docs: readonly FlowDoc[],
  options: DryRunOptions = {},
): ScenarioFinding[] {
  const findings: ScenarioFinding[] = [];
  const bad = (path: string, message: string) => findings.push({ path, message });

  const flowNames = new Set(docs.filter((d) => d.kind === "flow").map((d) => d.name));
  const moduleNames = new Set(docs.filter((d) => d.kind === "module").map((d) => d.name));
  const referenced = new Set(docs.flatMap((d) => collectRefs(d.content).map((r) => r.token)));
  const map = options.resourceMap;

  /** Mapped, referenced by the set, or a document in the set. */
  const resolves = (token: string): boolean => {
    const entry = parseToken(token);
    if (entry === undefined) return false;
    if (map !== undefined && lookupRefValue(map, entry) !== undefined) return true;
    if (referenced.has(token)) return true;
    if (entry.type === "flow") return flowNames.has(entry.name);
    if (entry.type === "module") return moduleNames.has(entry.name);
    return false;
  };
  const unresolved = (token: string): string =>
    `${token} resolves nowhere: not in the resource map and referenced by no document in the set` +
    (map === undefined ? " (no resource map given)" : "");
  const unreferenced = (token: string, consequence: string): string =>
    `${token} is referenced by no document in the set, so ${consequence}`;

  const flow = parseToken(scenario.entryPoint.flow);
  if (flow === undefined || !flowNames.has(flow.name)) {
    const have = [...flowNames].sort();
    bad(
      "entryPoint.flow",
      `${scenario.entryPoint.flow} names no flow in the set` +
        (have.length === 0 ? " (the set holds no flow documents)" : ` (flows: ${have.join(", ")})`),
    );
  }

  (scenario.substitutions ?? []).forEach((substitution, i) => {
    const at = `substitutions[${String(i)}]`;
    const { key } = SUBSTITUTION_PARAMETER[substitution.actionType];
    const production = substitution.actionParameters[key];
    if (production !== undefined && !referenced.has(production)) {
      bad(
        `${at}.actionParameters.${key}`,
        unreferenced(production, "there is nothing to substitute"),
      );
    }
    if (!resolves(substitution.substitute))
      bad(`${at}.substitute`, unresolved(substitution.substitute));
  });

  const { said, recorded } = textsOf(docs);
  const values = knownAttributes(scenario);
  const recordedNote =
    recorded === 0
      ? ""
      : `; ${String(recorded)} prompt(s) play recorded audio the dry run cannot read`;

  scenario.steps.forEach((step, i) => {
    const at = `steps[${String(i)}]`;
    switch (step.kind) {
      case "expect-lambda":
        if (!referenced.has(step.lambda)) {
          bad(`${at}.lambda`, unreferenced(step.lambda, "the event cannot be observed"));
        }
        break;
      case "expect-transfer":
        if (!referenced.has(step.queue)) {
          bad(`${at}.queue`, unreferenced(step.queue, "the event cannot be observed"));
        }
        break;
      case "expect-hours-check":
        if (!referenced.has(step.hours)) {
          bad(`${at}.hours`, unreferenced(step.hours, "the event cannot be observed"));
        }
        break;
      case "expect-lex":
        if (!referenced.has(step.lex)) {
          bad(`${at}.lex`, unreferenced(step.lex, "the event cannot be observed"));
        }
        break;
      case "expect-queue":
        if (step.queue !== undefined && !resolves(step.queue)) {
          bad(`${at}.queue`, unresolved(step.queue));
        }
        break;
      case "expect-prompt":
        if (!said.some((s) => matches(s, step, values))) {
          bad(at, `no prompt in the set ${describe(step)}${recordedNote}`);
        }
        break;
      case "send-dtmf": {
        const prompt = scenario.steps
          .slice(0, i)
          .reverse()
          .find((s) => s.kind === "expect-prompt");
        if (prompt === undefined) {
          bad(
            at,
            `send-dtmf ${JSON.stringify(step.value)} follows no expect-prompt, so the dry run cannot tell which keypad prompt it answers`,
          );
          break;
        }
        const answered = said.filter((s) => matches(s, prompt, values));
        const keypad = answered.filter(
          (s) => s.action.Type === KEYPAD_BRANCHING || s.action.Type === KEYPAD_FREEFORM,
        );
        if (keypad.length === 0) {
          bad(
            at,
            `send-dtmf ${JSON.stringify(step.value)} answers the prompt that ${describe(prompt)}, which no ${KEYPAD_BRANCHING} or ${KEYPAD_FREEFORM} in the set plays` +
              (answered.length === 0
                ? ""
                : ` (played by ${answered.map((s) => `${s.doc}/${s.action.Identifier}`).join(", ")})`),
          );
          break;
        }
        if (keypad.some((s) => storesInput(s.action))) break;
        const accepted = [...new Set(keypad.flatMap((s) => acceptedKeys(s.action)))];
        if (!accepted.includes(step.value)) {
          bad(
            `${at}.value`,
            `${JSON.stringify(step.value)} is not a key ${keypad.map((s) => `${s.doc}/${s.action.Identifier}`).join(", ")} accepts (${accepted.join(", ")})`,
          );
        }
        break;
      }
      default:
        break;
    }
  });

  return findings;
}
