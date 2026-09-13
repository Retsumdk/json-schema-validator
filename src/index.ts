/** Public API: the `Validator` class, a schema compiler, framework-agnostic
 * middleware, and convenience functions. Zero runtime dependencies. */

import type { JsonSchema, ValidateResult, ValidatorOptions } from "./types";
import { ValidationError } from "./errors";
import { Kernel } from "./core/validator";

/** Reusable validator with per-schema compiled kernels (parse once, validate many). */
export class Validator {
  private readonly options: ValidatorOptions;
  private readonly kernels = new WeakMap<object, Kernel>();

  constructor(options: ValidatorOptions = {}) {
    this.options = options;
  }

  private kernel(schema: JsonSchema): Kernel {
    if (typeof schema !== "object") return new Kernel(schema, this.options);
    const key = schema as object;
    let k = this.kernels.get(key);
    if (!k) {
      k = new Kernel(schema, this.options);
      this.kernels.set(key, k);
    }
    return k;
  }

  /** Validate `data` against `schema`. Always returns, never throws. */
  validate(data: unknown, schema: JsonSchema): ValidateResult {
    const errors = this.kernel(schema).validate(data);
    return { valid: errors.length === 0, errors };
  }

  /** Validate and throw a `ValidationError` carrying all issues on failure. */
  assert(data: unknown, schema: JsonSchema): void {
    const { valid, errors } = this.validate(data, schema);
    if (!valid) throw new ValidationError(errors);
  }

  /** Compile a schema into a reusable predicate: `(data) => boolean`. */
  compile(schema: JsonSchema): (data: unknown) => boolean {
    const kernel = this.kernel(schema);
    return (data) => kernel.validate(data).length === 0;
  }

  /**
   * Express / Connect-compatible request middleware. Validates `req.body`
   * against `schema` and short-circuits with a 400 (configurable) JSON error
   * listing every issue; otherwise calls `next()`.
   */
  middleware(
    schema: JsonSchema,
    opts: { status?: number; pick?: (req: { body?: unknown }) => unknown } = {},
  ): (req: { body?: unknown }, res: { status: (n: number) => unknown; json: (o: unknown) => unknown }, next: () => void) => void {
    const kernel = this.kernel(schema);
    const status = opts.status ?? 400;
    return (req, res, next) => {
      let target: unknown = req.body;
      if (opts.pick) {
        try {
          target = opts.pick(req);
        } catch (e) {
          const err = new ValidationError([{ instancePath: "", schemaPath: "", keyword: "pick", message: `body extractor failed: ${(e as Error).message}` }]);
          res.status(status);
          res.json({ error: ErrorBody(err) });
          return;
        }
      }
      const errors = kernel.validate(target);
      if (errors.length === 0) {
        next();
        return;
      }
      const err = new ValidationError(errors);
      res.status(status);
      res.json({ error: ErrorBody(err) });
    };
  }
}

function ErrorBody(err: ValidationError) {
  return {
    code: "validation_failed",
    message: err.message,
    issues: err.errors,
  };
}

/** Validate `data` against `schema`, returning `{ valid, errors }`. */
export function validate(data: unknown, schema: JsonSchema, options?: ValidatorOptions): ValidateResult {
  return new Validator(options).validate(data, schema);
}

/** Validate and throw on failure (one-shot convenience). */
export function assertValid(data: unknown, schema: JsonSchema, options?: ValidatorOptions): void {
  new Validator(options).assert(data, schema);
}

/** Compile a one-shot validate-predicate. */
export function compile(schema: JsonSchema, options?: ValidatorOptions): (data: unknown) => boolean {
  return new Validator(options).compile(schema);
}

export * from "./types";
export { ValidationError } from "./errors";
