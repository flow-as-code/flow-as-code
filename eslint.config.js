/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Flat config (ESLint 10). Kept deliberately close to recommended: codegen
// output must pass this config untouched (task A03 acceptance), so stylistic
// opinions live in Prettier, not here.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/dist-demo/**",
      "**/dist-site/**",
      "**/node_modules/**",
      "**/coverage/**",
      // Session worktrees are checkouts of this same repo living inside it;
      // linting them double-reports and confuses tsconfig root resolution.
      ".claude/**",
      // Emitter goldens and fixtures are data, not source.
      "conformance/**",
      // Scratch directories the tests write generated sources into and delete
      // again; an interrupted run must not leave them failing the next lint.
      "**/.vitest/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ["**/*.{ts,tsx,js,mjs}"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // FlowDoc `content` is arbitrary Connect Flow language; GenericBlock
      // passthrough legitimately handles values we do not model.
      "@typescript-eslint/no-explicit-any": "off",
      eqeqeq: ["error", "always"],
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    // Everything outside the studio runs on Node.
    files: [
      "packages/{core,cli,cdk,tf}/**/*.ts",
      "scripts/**/*.mjs",
      "design/**/*.mjs",
      "*.js",
      "*.ts",
    ],
    languageOptions: { globals: globals.node },
  },
  {
    // The studio runs in a browser, including a web worker for lint (A02/A10).
    files: ["packages/studio/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser, ...globals.worker } },
  },
  {
    // The CLI and build scripts are console programs.
    files: ["packages/cli/**/*.ts", "scripts/**/*.mjs", "design/**/*.mjs"],
    rules: { "no-console": "off" },
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    languageOptions: { globals: globals.node },
    rules: { "no-console": "off" },
  },
);
