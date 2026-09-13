/** Validation kernel: walks a schema against an instance and produces
 * detailed, path-aware `ValidationIssue` records for every draft-07 keyword. */

import type { JsonSchema, JsonType, ValidationIssue, ValidatorOptions } from "../types";
import { FORMATS, type FormatValidator } from "../formats";
import { RefsResolver } from "../resolver";
import { deepEqual, escapeSegment } from "../util";

class Ctx {
  errors: ValidationIssue[] = [];
  maxErrors: number;
  constructor(maxErrors: number) {
    this.maxErrors = maxErrors;
  }
  push(e: ValidationIssue): boolean {
    if (this.maxErrors > 0 && this.errors.length >= this.maxErrors) return false;
    this.errors.push(e);
    return true;
  }
}

export class Kernel {
  private readonly root: JsonSchema;
  private readonly formats: Record<string, FormatValidator>;
  private readonly options: Required<
    Pick<ValidatorOptions, "assertFormat" | "strictFormats" | "maxErrors" | "lenientRefs">
  >;
  private readonly resolver: RefsResolver;

  constructor(root: JsonSchema, options: ValidatorOptions = {}) {
    this.root = root;
    this.resolver = new RefsResolver(root);
    this.options = {
      assertFormat: options.assertFormat ?? true,
      strictFormats: options.strictFormats ?? false,
      maxErrors: options.maxErrors ?? 100,
      lenientRefs: options.lenientRefs ?? false,
    };
    this.formats = { ...FORMATS, ...(options.formats ?? {}) };
  }

  validate(instance: unknown): ValidationIssue[] {
    const ctx = new Ctx(this.options.maxErrors);
    this.core(instance, this.root, ctx, "", "");
    return ctx.errors;
  }

  private err(
    keyword: string,
    ip: string,
    sp: string,
    message: string,
    params?: Record<string, unknown>,
    data?: unknown,
  ): ValidationIssue {
    return { instancePath: ip, schemaPath: sp, keyword, message, params, data };
  }

  /** Recursive entry point. Appends issues to `ctx`. */
  private core(
    value: unknown,
    schema: JsonSchema,
    ctx: Ctx,
    ip: string,
    sp: string,
  ): void {
    if (schema === true) return;
    if (schema === false) {
      ctx.push(this.err("false schema", ip, sp || "#", "value must not validate against the false schema", {}, value));
      return;
    }

    if (typeof schema.$ref === "string") {
      const target = this.resolveRef(schema.$ref, ctx, sp, ip, value);
      if (target) {
        this.core(value, target, ctx, ip, sp + "/$ref");
        const { $ref: _ref, ...siblings } = schema;
        this.applyKeywords(value, siblings, ctx, ip, sp);
      }
      return;
    }

    this.applyKeywords(value, schema, ctx, ip, sp);
  }

  private resolveRef(ref: string, ctx: Ctx, sp: string, ip: string, value: unknown): JsonSchema | undefined {
    try {
      return this.resolver.resolve(ref);
    } catch (e) {
      if (this.options.lenientRefs) return undefined;
      const err = e as Error;
      if (err.name === "ExternalReferenceError" || err.name === "BrokenReferenceError") {
        ctx.push(this.err("$ref", ip, sp + "/$ref", err.message, { ref }, value));
        return undefined;
      }
      throw e;
    }
  }

  private applyKeywords(
    value: unknown,
    schema: Record<string, unknown> & JsonSchema,
    ctx: Ctx,
    ip: string,
    sp: string,
  ): void {
    const t = this.typeOf(value);

    // --- general: type / enum / const ---
    if ("type" in schema && schema.type !== undefined) {
      const expected = Array.isArray(schema.type) ? schema.type : [schema.type];
      const ok = expected.some((ty) => this.matchesType(value, t, ty as JsonType));
      if (!ok) {
        ctx.push(
          this.err(
            "type",
            ip,
            sp + "/type",
            `expected ${(expected as JsonType[]).join(" or ")} but got ${t}`,
            { type: expected },
            value,
          ),
        );
      }
    }
    if ("enum" in schema && Array.isArray(schema.enum)) {
      if (!(schema.enum as unknown[]).some((e) => deepEqual(e, value))) {
        ctx.push(this.err("enum", ip, sp + "/enum", `value must be one of the allowed values`, { allowed: schema.enum }, value));
      }
    }
    if ("const" in schema && schema.const !== undefined && !deepEqual(schema.const, value)) {
      ctx.push(this.err("const", ip, sp + "/const", `value must equal the constant`, { expected: schema.const }, value));
    }

    // --- numeric ---
    if (t === "number" || t === "integer") {
      const n = value as number;
      if (typeof schema.multipleOf === "number" && schema.multipleOf > 0) {
        const q = n / schema.multipleOf;
        if (Math.abs(q - Math.round(q)) > 1e-9) {
          ctx.push(this.err("multipleOf", ip, sp + "/multipleOf", `must be a multiple of ${schema.multipleOf}`, { multipleOf: schema.multipleOf }, n));
        }
      }
      if (typeof schema.minimum === "number") {
        const min = schema.minimum;
        if (schema.exclusiveMinimum === true) {
          if (!(n > min))
            ctx.push(this.err("exclusiveMinimum", ip, sp + "/exclusiveMinimum", `must be greater than ${min}`, { limit: min, exclusiveMinimum: true }, n));
        } else if (!(n >= min)) {
          ctx.push(this.err("minimum", ip, sp + "/minimum", `must be ≥ ${min}`, { limit: min }, n));
        }
      }
      if (typeof schema.exclusiveMinimum === "number" && !(n > schema.exclusiveMinimum)) {
        ctx.push(this.err("exclusiveMinimum", ip, sp + "/exclusiveMinimum", `must be greater than ${schema.exclusiveMinimum}`, { limit: schema.exclusiveMinimum }, n));
      }
      if (typeof schema.maximum === "number") {
        const max = schema.maximum;
        if (schema.exclusiveMaximum === true) {
          if (!(n < max))
            ctx.push(this.err("exclusiveMaximum", ip, sp + "/exclusiveMaximum", `must be less than ${max}`, { limit: max, exclusiveMaximum: true }, n));
        } else if (!(n <= max)) {
          ctx.push(this.err("maximum", ip, sp + "/maximum", `must be ≤ ${max}`, { limit: max }, n));
        }
      }
      if (typeof schema.exclusiveMaximum === "number" && !(n < schema.exclusiveMaximum)) {
        ctx.push(this.err("exclusiveMaximum", ip, sp + "/exclusiveMaximum", `must be less than ${schema.exclusiveMaximum}`, { limit: schema.exclusiveMaximum }, n));
      }
    }

    // --- string ---
    if (t === "string") {
      const s = value as string;
      const len = [...s].length;
      if (typeof schema.minLength === "number" && len < schema.minLength) {
        ctx.push(this.err("minLength", ip, sp + "/minLength", `must be at least ${schema.minLength} characters (got ${len})`, { limit: schema.minLength }, s));
      }
      if (typeof schema.maxLength === "number" && len > schema.maxLength) {
        ctx.push(this.err("maxLength", ip, sp + "/maxLength", `must be at most ${schema.maxLength} characters (got ${len})`, { limit: schema.maxLength }, s));
      }
      if (typeof schema.pattern === "string") {
        const re = safeRe(schema.pattern);
        if (re && !re.test(s)) {
          ctx.push(this.err("pattern", ip, sp + "/pattern", `must match pattern ${schema.pattern}`, { pattern: schema.pattern }, s));
        }
      }
      if (this.options.assertFormat && typeof schema.format === "string") {
        const fmt = this.formats[schema.format];
        if (fmt) {
          if (!fmt(s)) ctx.push(this.err("format", ip, sp + "/format", `must match the "${schema.format}" format`, { format: schema.format }, s));
        } else if (this.options.strictFormats) {
          ctx.push(this.err("format", ip, sp + "/format", `unknown format "${schema.format}"`, { format: schema.format }, s));
        }
      }
    }

    // --- array ---
    if (t === "array") {
      const arr = value as unknown[];
      if (typeof schema.minItems === "number" && arr.length < schema.minItems) {
        ctx.push(this.err("minItems", ip, sp + "/minItems", `must contain at least ${schema.minItems} item(s) (got ${arr.length})`, { limit: schema.minItems }, arr));
      }
      if (typeof schema.maxItems === "number" && arr.length > schema.maxItems) {
        ctx.push(this.err("maxItems", ip, sp + "/maxItems", `must contain at most ${schema.maxItems} item(s) (got ${arr.length})`, { limit: schema.maxItems }, arr));
      }
      if (schema.uniqueItems === true) {
        outer: for (let i = 0; i < arr.length; i++) {
          for (let j = i + 1; j < arr.length; j++) {
            if (deepEqual(arr[i], arr[j])) {
              ctx.push(this.err("uniqueItems", ip, sp + "/uniqueItems", `items at index ${i} and ${j} must be unique`, { duplicate: arr[i] }, arr));
              break outer;
            }
          }
        }
      }
      if (Array.isArray(schema.items)) {
        const tuple = schema.items as JsonSchema[];
        const additional: JsonSchema =
          "additionalItems" in schema && schema.additionalItems !== undefined
            ? (schema.additionalItems as JsonSchema)
            : true;
        for (let i = 0; i < arr.length; i++) {
          if (i < tuple.length) {
            this.core(arr[i], tuple[i], ctx, ip + "/" + i, sp + "/items/" + i);
          } else {
            this.core(arr[i], additional, ctx, ip + "/" + i, sp + "/additionalItems");
          }
        }
      } else if (schema.items !== undefined) {
        for (let i = 0; i < arr.length; i++) {
          this.core(arr[i], schema.items as JsonSchema, ctx, ip + "/" + i, sp + "/items");
        }
      }
      if (schema.contains !== undefined) {
        let matched = false;
        for (let i = 0; i < arr.length && !matched; i++) {
          matched = this.probeValid(arr[i], schema.contains as JsonSchema, ip + "/" + i, sp + "/contains");
        }
        if (!matched) {
          ctx.push(this.err("contains", ip, sp + "/contains", `array must contain at least one item matching the "contains" schema`, { minContains: 1 }, arr));
        }
      }
    }

    // --- object ---
    if (t === "object") {
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj);
      if (typeof schema.minProperties === "number" && keys.length < schema.minProperties) {
        ctx.push(this.err("minProperties", ip, sp + "/minProperties", `must have at least ${schema.minProperties} propertie(s) (got ${keys.length})`, { limit: schema.minProperties }, obj));
      }
      if (typeof schema.maxProperties === "number" && keys.length > schema.maxProperties) {
        ctx.push(this.err("maxProperties", ip, sp + "/maxProperties", `must have at most ${schema.maxProperties} propertie(s) (got ${keys.length})`, { limit: schema.maxProperties }, obj));
      }
      if (Array.isArray(schema.required)) {
        for (const req of schema.required as string[]) {
          if (!Object.prototype.hasOwnProperty.call(obj, req)) {
            ctx.push(this.err("required", ip, sp + "/required", `missing required property "${req}"`, { missingProperty: req }, obj));
          }
        }
      }
      if (schema.properties !== undefined && typeof schema.properties === "object" && !Array.isArray(schema.properties)) {
        for (const [k, sub] of Object.entries(schema.properties as Record<string, JsonSchema>)) {
          if (Object.prototype.hasOwnProperty.call(obj, k)) {
            this.core(obj[k], sub, ctx, ip + "/" + escapeSegment(k), sp + "/properties/" + k);
          }
        }
      }
      const patternProps = schema.patternProperties as Record<string, JsonSchema> | undefined;
      const matchedByPattern = new Set<string>();
      if (patternProps) {
        for (const [reStr, sub] of Object.entries(patternProps)) {
          const re = safeRe(reStr);
          if (!re) continue;
          for (const k of keys) {
            if (re.test(k)) {
              matchedByPattern.add(k);
              this.core(obj[k], sub, ctx, ip + "/" + escapeSegment(k), sp + "/patternProperties/" + reStr);
            }
          }
        }
      }
      const addl: JsonSchema =
        "additionalProperties" in schema && schema.additionalProperties !== undefined
          ? (schema.additionalProperties as JsonSchema)
          : true;
      if (addl !== true) {
        const declared = schema.properties as Record<string, JsonSchema> | undefined;
        for (const k of keys) {
          if (Object.prototype.hasOwnProperty.call(obj, k)) {
            if (declared && declared[k]) continue;
            if (matchedByPattern.has(k)) continue;
            this.core(obj[k], addl, ctx, ip + "/" + escapeSegment(k), sp + "/additionalProperties");
          }
        }
      }
      if (
        schema.propertyNames !== undefined &&
        typeof schema.propertyNames === "object" &&
        (schema.propertyNames as unknown) !== false
      ) {
        for (const k of keys) {
          if (typeof schema.propertyNames === "object") {
            const local = new Ctx(this.options.maxErrors);
            this.core(k as unknown, schema.propertyNames as JsonSchema, local, ip + "/" + escapeSegment(k), sp + "/propertyNames");
            for (const sub of local.errors) ctx.push({ ...sub, instancePath: ip + "/" + escapeSegment(k), keyword: sub.keyword.length ? `propertyNames.${sub.keyword}` : sub.keyword });
          }
        }
      }
      if (schema.dependencies !== undefined && typeof schema.dependencies === "object" && !Array.isArray(schema.dependencies)) {
        for (const [key, dep] of Object.entries(schema.dependencies as Record<string, JsonSchema | string[]>)) {
          if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
          if (Array.isArray(dep)) {
            for (const req of dep) {
              if (!Object.prototype.hasOwnProperty.call(obj, req)) {
                ctx.push(this.err("dependencies", ip, sp + "/dependencies/" + key, `property "${key}" requires property "${req}"`, { property: key, missingProperty: req }, obj));
              }
            }
          } else {
            this.core(value, dep, ctx, ip, sp + "/dependencies/" + key);
          }
        }
      }
    }

    // --- combinators ---
    if (Array.isArray(schema.allOf)) {
      (schema.allOf as JsonSchema[]).forEach((s, i) => this.core(value, s, ctx, ip, sp + "/allOf/" + i));
    }
    if (Array.isArray(schema.anyOf)) {
      const ok = (schema.anyOf as JsonSchema[]).some((s) => this.probeValid(value, s, ip, sp + "/anyOf"));
      if (!ok) {
        ctx.push(this.err("anyOf", ip, sp + "/anyOf", `value must match at least one of the "anyOf" schemas`, {}, value));
      }
    }
    if (Array.isArray(schema.oneOf)) {
      const arr = schema.oneOf as JsonSchema[];
      let matchCount = 0;
      let firstValid: number | null = null;
      for (let i = 0; i < arr.length; i++) {
        if (this.probeValid(value, arr[i], ip, sp + "/oneOf/" + i)) {
          matchCount++;
          if (firstValid === null) firstValid = i;
        }
      }
      if (matchCount !== 1) {
        ctx.push(this.err("oneOf", ip, sp + "/oneOf", `value must match exactly one of the "oneOf" schemas (matched ${matchCount})`, { passingSchemas: matchCount, matchedIndex: firstValid }, value));
      }
    }
    if (schema.not !== undefined && schema.not !== true && schema.not !== false) {
      if (this.probeValid(value, schema.not as JsonSchema, ip, sp + "/not")) {
        ctx.push(this.err("not", ip, sp + "/not", `value must not match the "not" schema`, {}, value));
      }
    }
    if (schema.if !== undefined) {
      const ifOk = this.probeValid(value, schema.if as JsonSchema, ip, sp + "/if");
      if (ifOk && schema.then !== undefined) this.core(value, schema.then as JsonSchema, ctx, ip, sp + "/then");
      if (!ifOk && schema.else !== undefined) this.core(value, schema.else as JsonSchema, ctx, ip, sp + "/else");
    }
  }

  /** Run a subschema against a value in isolation to learn whether it passes. */
  private probeValid(value: unknown, schema: JsonSchema, ip: string, sp: string): boolean {
    const local = new Ctx(this.options.maxErrors);
    this.core(value, schema, local, ip, sp);
    return local.errors.length === 0;
  }

  private typeOf(v: unknown): JsonType | "undefined" {
    if (v === null) return "null";
    if (Array.isArray(v)) return "array";
    if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
    if (typeof v === "object") return "object";
    return typeof v as JsonType | "undefined";
  }

  private matchesType(value: unknown, t: string, expected: JsonType): boolean {
    if (typeof value === "number" && Number.isInteger(value)) {
      if (expected === "integer") return true;
      if (expected === "number") return true;
    }
    if (t === "integer" && expected === "number") return true;
    return t === expected;
  }
}

/** Compile a regex safely; return undefined on invalid patterns. */
export function safeRe(pattern: string): RegExp | undefined {
  try {
    return new RegExp(pattern);
  } catch {
    return undefined;
  }
}
