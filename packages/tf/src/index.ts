/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Public surface of @flow-as-code/tf. FlowDoc in, Terraform/OpenTofu out, per
// docs/03-tf-emitter.md. One-way in v1: HCL back to FlowDoc is a provider-era
// feature and is not attempted here.

export { EmitTfError, type EmitTfOptions, type EmitTfResult, emitTf } from "./emit.js";
export { escapeTemplateText, renderTemplate } from "./template.js";
export { writeTf } from "./write.js";
