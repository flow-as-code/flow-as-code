/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Is this the hosted read-only demo build?
//
// `vite build --mode demo` (npm run build:demo) sets import.meta.env.MODE to
// "demo" and Vite inlines it, so the flag is a compile-time constant: in the
// regular build and under vitest it is false and the branch it guards is dead
// code. The demo build also swaps modules through vite.config.ts; this flag
// decides which store the app boots with, and which artifact-specific claims
// the narrow notice makes (src/components/NarrowNotice.tsx). See
// docs/05-hosted-demo.md.

export const DEMO_BUILD: boolean = import.meta.env.MODE === "demo";
