/** Small shared helpers. */

/** Structural deep-equality for `enum`/`const`/`uniqueItems` comparisons. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (typeof a !== "object") return a === b;
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  if (Array.isArray(a)) {
    const aa = a as unknown[];
    const bb = b as unknown[];
    if (aa.length !== bb.length) return false;
    for (let i = 0; i < aa.length; i++) if (!deepEqual(aa[i], bb[i])) return false;
    return true;
  }
  const ka = Object.keys(ra);
  const kb = Object.keys(rb);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(rb, k)) return false;
    if (!deepEqual(ra[k], rb[k])) return false;
  }
  return true;
}

/** Escape a single instance-path segment per JSON Pointer. */
export function escapeSegment(seg: string): string {
  return seg.replace(/~/g, "~0").replace(/\//g, "~1");
}
