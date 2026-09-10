/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// What each package would actually publish.
//
// Three defects reached this repo and were only visible by running the dry run:
// no tarball contained the LICENSE, because `files` cannot reach above the
// package directory; the published source maps pointed at a `src` that was not
// published; and the cdk package shipped src/__snapshots__/flow-set.test.ts.snap and
// src/test-helpers.ts, because the `files` negations named *.test.ts but not
// the artefacts around it. All three are the kind of thing nobody notices until
// a consumer hits it, so they are asserted here rather than left to a CI job
// that has never executed.
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

import { afterAll, describe, expect, it } from "vitest";

const PACKAGES = ["core", "cdk", "cli", "tf", "studio"] as const;

/** What every package is, whatever its role in the set. */
const SHARED_KEYWORDS = [
  "amazon-connect",
  "contact-flow",
  "contact-center",
  "ivr",
  "infrastructure-as-code",
  "aws",
  "typescript",
] as const;

/** What one package is that its siblings are not. */
const PACKAGE_KEYWORDS: Readonly<Record<(typeof PACKAGES)[number], readonly string[]>> = {
  core: [],
  cdk: ["aws-cdk"],
  cli: [],
  tf: ["terraform", "opentofu"],
  studio: ["visual-editor"],
};

/**
 * Files a package reads at runtime that are not compiler output, so `files`
 * has to name them and nothing else would notice if it stopped. The CLI's are
 * all of this kind: `init` writes its template, and `lint` and `simulate`
 * validate against their schema copies. Dropping "template" from cli's `files`
 * leaves every other test in the repo green and makes `flow-cli init` throw an
 * ENOENT on the first run of every npm install of it.
 */
const REQUIRED_DATA_FILES: Readonly<Record<(typeof PACKAGES)[number], readonly string[]>> = {
  core: [],
  cdk: [],
  cli: [
    "template/appointment-line.flowdoc.json",
    "schema/flowdoc-0.1.schema.json",
    "schema/scenario-0.1.schema.json",
  ],
  tf: [],
  studio: [],
};

interface PackEntry {
  path: string;
}
interface PackResult {
  name: string;
  files: PackEntry[];
}

/** `npm pack --dry-run --json` reports exactly what would ship. */
function packedFiles(pkg: string): string[] {
  const raw = execFileSync(
    "npm",
    ["pack", "--dry-run", "--json", "--workspace", `@flow-as-code/${pkg}`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], cwd: process.cwd() },
  );
  const parsed = JSON.parse(raw) as PackResult[];
  return (parsed[0]?.files ?? []).map((f) => f.path);
}

describe.each(PACKAGES)("%s packages correctly", (pkg) => {
  const files = packedFiles(pkg);

  it("ships a non-trivial file list", () => {
    expect(files.length).toBeGreaterThan(3);
  });

  it("ships the Apache-2.0 licence", () => {
    // npm includes LICENSE from the package directory automatically, so the
    // mechanism this guards is the per-package COPY existing at all, not the
    // `files` entry. Verified by deleting the copy: this test goes red.
    expect(files).toContain("LICENSE");
  });

  it("ships its README", () => {
    expect(files).toContain("README.md");
  });

  it("ships compiled output", () => {
    expect(files.some((f) => f.startsWith("dist/"))).toBe(true);
  });

  it("ships its manifest", () => {
    expect(files).toContain("package.json");
  });

  it("ships no tests, fixtures, snapshots, helpers, or generated scratch", () => {
    // One pattern per class of artefact, so a new one (a .snap beside a test, a
    // helper module a test imports) is named by the failure rather than hidden
    // in a count. Verified by dropping "!**/*.snap" from cdk's `files`:
    // this test goes red naming src/__snapshots__/flow-set.test.ts.snap.
    const leaked = files.filter(
      (f) =>
        /\.test\.[cm]?[jt]sx?$/.test(f) ||
        /\.spec\.[cm]?[jt]sx?$/.test(f) ||
        f.endsWith(".snap") ||
        /(^|\/)__snapshots__\//.test(f) ||
        /(^|\/)__fixtures__\//.test(f) ||
        /(^|\/)__generated__\//.test(f) ||
        /(^|\/)(tests?|__tests__)\//.test(f) ||
        /(^|\/)test-helpers?\.[cm]?[jt]sx?$/.test(f) ||
        f.endsWith(".tsbuildinfo") ||
        f.startsWith("dist-demo/"),
    );
    expect(leaked).toEqual([]);
  });

  it("ships the data files it reads at runtime", () => {
    for (const path of REQUIRED_DATA_FILES[pkg]) {
      expect(files, `${pkg} reads ${path} at runtime and would not ship it`).toContain(path);
    }
  });

  it("ships its changelog", () => {
    // Every package has had one on disk since 0.1.0 and none shipped it, so
    // npm's Versions tab showed 0.1.0 and 0.1.1 two hours apart with nothing
    // saying what changed. `files` is per-version and immutable once published.
    expect(files).toContain("CHANGELOG.md");
  });

  it("declares repository, homepage and bugs", () => {
    const manifest = JSON.parse(readFileSync(`packages/${pkg}/package.json`, "utf8")) as {
      repository?: { directory?: string };
      homepage?: string;
      bugs?: unknown;
      license?: string;
    };
    expect(manifest.repository?.directory).toBe(`packages/${pkg}`);
    // The package's own docs page on the site, not the GitHub subdirectory
    // anchor: npm already puts a Repository link in the sidebar, so pointing
    // homepage at the same place spent the one link that could have gone
    // somewhere else. Exact, because "truthy" is what let the old value stand.
    expect(manifest.homepage).toBe(`https://flow-as-code.dev/docs/package-${pkg}/`);
    expect(manifest.bugs).toBeTruthy();
    expect(manifest.license).toBe("Apache-2.0");
  });

  it("declares the shared keywords plus its own", () => {
    // npm metadata is immutable per version and `keywords` was null on all five
    // at 0.1.1, so none of them appeared in a search for "amazon connect flow".
    const manifest = JSON.parse(readFileSync(`packages/${pkg}/package.json`, "utf8")) as {
      keywords?: string[];
    };
    const keywords = manifest.keywords ?? [];
    expect(keywords).toEqual(expect.arrayContaining([...SHARED_KEYWORDS]));
    for (const own of PACKAGE_KEYWORDS[pkg]) expect(keywords).toContain(own);
    // No duplicates and nothing empty, since npm shows the list verbatim.
    expect(new Set(keywords).size).toBe(keywords.length);
    expect(keywords.every((k) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(k))).toBe(true);
  });

  it("declares the same Node floor as the workspace root", () => {
    // Only the root manifest had `engines`, and the root is never published, so
    // a consumer on Node 18 got a runtime failure (flow-cli registers tsx with
    // `--import`) instead of an install-time warning.
    const root = JSON.parse(readFileSync("package.json", "utf8")) as {
      engines?: { node?: string };
    };
    const manifest = JSON.parse(readFileSync(`packages/${pkg}/package.json`, "utf8")) as {
      engines?: { node?: string };
    };
    expect(root.engines?.node).toBeTruthy();
    expect(manifest.engines?.node).toBe(root.engines?.node);
  });
});

describe("the licence copies stay in sync with the root", () => {
  const root = readFileSync("LICENSE", "utf8");
  it.each(PACKAGES)("%s", (pkg) => {
    // `npm run sync:license` regenerates these; a drift here means it was not run.
    expect(readFileSync(`packages/${pkg}/LICENSE`, "utf8")).toBe(root);
  });
});

describe("the studio package publishes a self-contained bundle", () => {
  // It declared react, react-dom, @xyflow/react, ajv and the three
  // @flow-as-code packages as runtime dependencies, so every
  // `npm install @flow-as-code/cli` (which depends on the studio)
  // fetched React and React Flow that nothing loads. They are build inputs,
  // and the two assertions here are the reason that is true: the tarball is
  // dist alone, and the bundle resolves every import at build time.
  const files = packedFiles("studio");

  it("declares no runtime dependencies", () => {
    const manifest = JSON.parse(readFileSync("packages/studio/package.json", "utf8")) as {
      dependencies?: Record<string, string>;
    };
    expect(manifest.dependencies ?? {}).toEqual({});
  });

  it("imports nothing by bare specifier", () => {
    const scripts = files.filter((f) => f.startsWith("dist/") && f.endsWith(".js"));
    expect(scripts.length).toBeGreaterThan(0);

    // The bundler emits a specifier with no space before the quote
    // (`import{x}from"./y.js"`). A `from "…"` WITH a space is inside one of the
    // template literals the CDK export target carries, which is generated
    // source for the consumer's project, not an import this bundle makes.
    const bare: string[] = [];
    for (const script of scripts) {
      const source = readFileSync(`packages/studio/${script}`, "utf8");
      const specifiers = [
        ...source.matchAll(/\bfrom"([^"]+)"/g),
        ...source.matchAll(/\bimport"([^"]+)"/g),
        ...source.matchAll(/\bimport\("([^"]+)"\)/g),
      ];
      for (const [, specifier] of specifiers) {
        if (!/^[./]/.test(specifier!)) bare.push(`${script}: ${specifier!}`);
      }
    }
    expect(bare).toEqual([]);
  });

  it("ships dist and nothing but dist", () => {
    const unexpected = files.filter(
      (f) =>
        !f.startsWith("dist/") &&
        !["package.json", "README.md", "CHANGELOG.md", "LICENSE"].includes(f),
    );
    expect(unexpected).toEqual([]);
  });
});

describe("cdk's CDK peers do not reach a CLI-only install", () => {
  // Same defect as the studio React one above, through a different
  // mechanism. npm auto-installs a peer that is not marked optional, so
  // `npm install @flow-as-code/cli` would have fetched aws-cdk-lib and
  // constructs (166 MB) although the CLI reaches cdk only for the
  // /scaffold subpath, and that subpath loads neither: `aws-cdk-lib` appears
  // in it as a line of the stack source it generates, not as an import.
  // Marking them optional keeps the version floor for anyone who does
  // construct a FlowSet and skips the download for everyone else.
  const manifest = JSON.parse(readFileSync("packages/cdk/package.json", "utf8")) as {
    peerDependencies?: Record<string, string>;
    peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  };

  it("still enforces the version floor for FlowSet users", () => {
    expect(manifest.peerDependencies).toEqual({
      "aws-cdk-lib": "^2.267.0",
      constructs: "^10.8.1",
    });
  });

  it("marks both peers optional", () => {
    for (const peer of ["aws-cdk-lib", "constructs"]) {
      expect(manifest.peerDependenciesMeta?.[peer]?.optional).toBe(true);
    }
  });

  it("loads neither peer from the /scaffold subpath", () => {
    // The claim the optional flag rests on, checked against the built graph
    // rather than the source: walk every relative import reachable from
    // dist/scaffold.js and collect the bare specifiers.
    const bare = new Set<string>();
    const seen = new Set<string>();
    const walk = (file: string): void => {
      if (seen.has(file)) return;
      seen.add(file);
      const source = readFileSync(file, "utf8");
      // Anchored to the start of a line, because the generated stack source
      // this module builds contains `import ... from "aws-cdk-lib";` as a
      // quoted, indented string. tsc emits real imports at column 0.
      const statements = [
        ...source.matchAll(/^import\s[^"']*from\s*["']([^"']+)["']/gm),
        ...source.matchAll(/^import\s*["']([^"']+)["']/gm),
        ...source.matchAll(/^export\s[^"']*from\s*["']([^"']+)["']/gm),
      ];
      for (const [, specifier] of statements) {
        if (/^[./]/.test(specifier!)) walk(resolve(dirname(file), specifier!));
        else bare.add(specifier!);
      }
    };
    walk(resolve("packages/cdk/dist/scaffold.js"));
    // @flow-as-code/core is the one bare specifier, which also says the walker read
    // something: an empty set here would pass a `not.toContain` vacuously.
    expect([...bare].sort()).toEqual(["@flow-as-code/core"]);
  });
});

describe("source maps resolve", () => {
  // A map that points at sources the package does not ship is worse than none:
  // it makes a debugger claim it can show you code it cannot load.
  it.each(["core", "cdk", "cli", "tf"])("%s ships the src its maps name", (pkg) => {
    const files = packedFiles(pkg);
    const maps = files.filter((f) => f.endsWith(".js.map"));
    expect(maps.length).toBeGreaterThan(0);
    expect(files.some((f) => f.startsWith("src/") && f.endsWith(".ts"))).toBe(true);
  });
});

describe("every declared bin survives publish", () => {
  // npm 11's publish-time normalization drops a `bin` entry whose value starts
  // with "./": `npm publish --dry-run` warned `"bin[flow-cli]" script name
  // dist/bin.js was invalid and removed`, so the manifest sent to the registry
  // would carry no bin and an install from the registry would create no
  // node_modules/.bin/flow-cli. The tarball's own package.json keeps it, which
  // is why installing the .tgz by path worked and hid this. Reproduced on two
  // throwaway packages differing only in the prefix: with it, the warning;
  // without it, a clean dry run.
  it.each(PACKAGES)("%s declares no bin path with a leading ./", (pkg) => {
    const manifest = JSON.parse(readFileSync(`packages/${pkg}/package.json`, "utf8")) as {
      bin?: string | Record<string, string>;
    };
    const targets =
      manifest.bin === undefined
        ? []
        : typeof manifest.bin === "string"
          ? [manifest.bin]
          : Object.values(manifest.bin);
    expect(targets.filter((target) => target.startsWith("./"))).toEqual([]);
  });

  it("still declares the one bin this repo ships", () => {
    // So the assertion above cannot pass by there being no bin at all.
    const manifest = JSON.parse(readFileSync("packages/cli/package.json", "utf8")) as {
      bin?: Record<string, string>;
    };
    expect(manifest.bin).toEqual({ "flow-cli": "dist/bin.js" });
  });
});

describe("the flow-cli bin is packed executable", () => {
  // npm's bin-links chmods the file to 0755 when it installs the package, so
  // `npx flow-cli` worked even while the tarball carried 0644. Everything that
  // is not npm's installer reads the tar header instead: a plain `tar -xzf`
  // then `./package/dist/bin.js`, another package manager, a distro packaging
  // step. tsc writes 0644 and dist/ is not tracked, so the mode comes from
  // scripts/chmod-bins.mjs, which the root build and cli's prepack run.
  //
  // The mode is read out of the ustar headers rather than from `tar -tv`
  // output, whose formatting differs between BSD and GNU tar.
  const dir = mkdtempSync(join(tmpdir(), "flow-cli-pack-"));

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** path to mode, from the ustar headers of a gzipped tarball. */
  function modes(tarball: string): Map<string, number> {
    const raw = gunzipSync(readFileSync(tarball));
    const found = new Map<string, number>();
    for (let at = 0; at + 512 <= raw.length; at += 512) {
      const name = raw.toString("utf8", at, at + 100).replace(/\0.*$/, "");
      if (name === "") continue;
      const mode = parseInt(raw.toString("utf8", at + 100, at + 108).replace(/[\0 ]/g, ""), 8);
      const size = parseInt(raw.toString("utf8", at + 124, at + 136).replace(/[\0 ]/g, ""), 8);
      found.set(name, mode & 0o777);
      at += Math.ceil(size / 512) * 512;
    }
    return found;
  }

  it("carries 0755 on dist/bin.js and 0644 on the rest of what it packs", () => {
    // Both modes are put in the wrong state first, so the assertions below read
    // the packing step's work rather than whatever this tree happened to hold.
    //
    // dist/index.js is the case that made this necessary. While `bin` pointed
    // at dist/index.js, npm's bin-links chmodded that file to 0755 at install
    // time; tsc's incremental writes preserve an existing file's mode and
    // dist/ is untracked, so on a developer tree that predates the bin split
    // nothing ever reset it, and only `rm -rf packages/cli/dist
    // packages/cli/tsconfig.tsbuildinfo && npm run build` cleared it.
    // That is why a clean clone never saw it and a long-lived tree did. The
    // answer is not to assert on a file that cannot drift: it is for
    // scripts/chmod-bins.mjs (cli's prepack, which `npm pack` runs) to own
    // the mode of every packed dist file, 0755 on the bin and 0644 on the rest,
    // so the tarball is a function of the manifest and not of tree history.
    //
    // Seeding the wrong modes is also what keeps the pair of assertions honest
    // in both directions: a packing step that marked everything executable
    // fails on dist/index.js, and one that set no modes at all fails on
    // dist/bin.js. The pack leaves both files in their correct modes.
    const distDir = resolve("packages/cli/dist");
    chmodSync(join(distDir, "bin.js"), 0o644);
    chmodSync(join(distDir, "index.js"), 0o755);

    execFileSync("npm", ["pack", "--workspace", "@flow-as-code/cli"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      env: { ...process.env, npm_config_pack_destination: dir },
    });
    // Read the version rather than hardcoding it: a release bump renamed this
    // tarball and turned this test red for a reason that had nothing to do with
    // file modes.
    const cliVersion = JSON.parse(readFileSync(resolve("packages/cli/package.json"), "utf8"))
      .version as string;
    const packed = modes(join(dir, `flow-as-code-cli-${cliVersion}.tgz`));

    expect(packed.get("package/dist/bin.js")).toBe(0o755);
    expect(packed.get("package/dist/index.js")).toBe(0o644);

    // Tracked files, checked in at 100644, that nothing chmods. `npm pack`
    // copies their on-disk mode into the tar header (verified by chmod 0755 on
    // both, repacking, and reading 0755 back out of the headers), so they are a
    // second, independent witness that the 0755 above is a real bit.
    expect(packed.get("package/package.json")).toBe(0o644);
    expect(packed.get("package/README.md")).toBe(0o644);
  });
});
