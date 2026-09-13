/** Error type thrown by `assert` / `assertValid` when validation fails. */

import type { ValidationIssue } from "./types";

export class ValidationError extends Error {
  readonly errors: ValidationIssue[];
  constructor(errors: ValidationIssue[]) {
    const summary = errors.length === 0 ? "validation failed" : errors[0].message;
    super(`validation failed: ${errors.length} issue(s). first: ${summary}`);
    this.name = "ValidationError";
    this.errors = errors;
  }
}
