/** JSON-Pointer-backed $ref resolution for a single schema document tree. */

import type { JsonSchema } from "./types";

export class BrokenReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrokenReferenceError";
  }
}

export class ExternalReferenceError extends Error {
  constructor(ref: string) {
    super(`external $ref "${ref}" cannot be resolved in a single-schema validator`);
    this.name = "ExternalReferenceError";
  }
}

/** Walk a URI-reference path into a schema (or any) object. */
export class RefsResolver {
  private readonly root: JsonSchema;

  constructor(root: JsonSchema) {
    this.root = root;
  }

  /** Resolve a JSON-Schema $ref (e.g. `#/definitions/x`) against the root. */
  resolve(ref: string): JsonSchema {
    if (ref === "#") return this.root;
    if (ref.startsWith("#/") || ref === "#/") {
      const tokens = decodeTokens(ref.slice(2));
      const node = this.lookup(this.root as unknown, tokens);
      if (node === undefined) {
        throw new BrokenReferenceError(`cannot resolve $ref "${ref}": path not found`);
      }
      return node as JsonSchema;
    }
    // Non-matching scheme#authority → external document.
    if (/^https?:|^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(ref)) {
      throw new ExternalReferenceError(ref);
    }
    // lenient fallback: treat lone identifiers as unresolved-external
    throw new ExternalReferenceError(ref);
  }

  private lookup(node: unknown, tokens: string[]): unknown {
    let cur = node;
    for (const key of tokens) {
      if (typeof cur !== "object" || cur === null) return undefined;
      const obj = cur as Record<string, unknown>;
      if (!Object.prototype.hasOwnProperty.call(obj, key)) return undefined;
      cur = obj[key];
    }
    return cur;
  }
}

function decodeTokens(fragment: string): string[] {
  if (fragment === "") return [];
  return fragment.split("/").map((raw) => raw.replace(/~1/g, "/").replace(/~0/g, "~"));
}
