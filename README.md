# JSON Schema Validator

[![CI](https://github.com/Retsumdk/json-schema-validator/workflows/CI/badge.svg)](https://github.com/Retsumdk/json-schema-validator/actions)
[![TypeScript](https://img.shields.io/badge/typescript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/node.js-20-green?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![MIT License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

A fast, **dependency-free** JSON Schema validator for **draft-07**, shipped as a
library, an Express-style middleware, and a CLI — with `$ref` resolution,
built-in format assertions, and detailed, path-aware error reporting.

Zero runtime dependencies. One small, readable codebase you can audit end to end.

---

## Why this exists

Every API that accepts JSON needs an answer to: *"is this request well-formed?"*
Most teams reach for `ajv` — powerful, but a large dependency graph with heavy
compilation machinery. This library is the alternative for projects that want
correct, spec-faithful validation **without** pulling in a framework-sized
package. It implements the core draft-07 keyword set directly against a reusable
validation kernel, so you get:

- **No transitive dependencies.** `npm ls` is empty. No install surprises, no
  supply-chain surface.
- **Path-aware errors.** Every issue reports `instancePath`, `schemaPath`, the
  failing `keyword`, and the offending value — ready to surface in a 400 body.
- **Compile once, validate many.** `Validator` caches parsed schema kernels, so
  hot-path validation never re-parses.
- **One package, three surfaces.** Import it in code, drop it into an Express
  route, or run it from the shell in CI.

## How it works

```
                  ┌───────────────────────────────────────────────┐
   instance ────►  │  Validator (public API)                       │
                  │   ├── schema kernel cache (WeakMap)            │
                  │   └── Kernel (recursive descent walker)        │
                  └──────────────┬────────────────────────────────┘
                                 │ walks keywords + subschemas
                  ┌──────────────▼───────────────┬─────────────────┐
                  │  RefsResolver ($ref / JSON    │  Formats ("date-│
                  │  Pointer, $defs/definitions)  │  time", "uuid", │
                  │                               │  "email", ...)  │
                  └───────────────────────────────┴─────────────────┘
                                 │
                                 ▼
                  ValidationIssue[]  →  { valid, errors }
```

`Validator` resolves to a cached `Kernel` per schema object. `Kernel` walks the
instance recursively, applying `type`, `enum`/`const`, numeric bounds, string
bounds/pattern/format, array & tuple keywords, object keywords, combinators
(`allOf`/`anyOf`/`oneOf`/`not`/`if`-`then`-`else`), and `$ref`. Errors are
collected (bounded by `maxErrors`) and returned as path-aware records.

## Installation

```bash
npm install json-schema-validator
# or
bun add json-schema-validator
```

Node >= 18 or Bun >= 1.0. No native modules, no build step required at runtime.

## Library usage

```ts
import { Validator, ValidationError } from "json-schema-validator";

const schema = {
  type: "object",
  required: ["name", "email"],
  properties: {
    name:  { type: "string", minLength: 1 },
    email: { type: "string", format: "email" },
    age:   { type: "integer", minimum: 18 },
  },
  additionalProperties: false,
};

const validate = new Validator();

const ok = validate.validate(
  { name: "Ada", email: "ada@example.com", age: 37 },
  schema,
);
// { valid: true, errors: [] }

const bad = validate.validate(
  { name: "", email: "nope", age: 16, role: "root" },
  schema,
);
// valid: false, errors: [
//   { instancePath: "/name", keyword: "minLength", message: "must be at least 1 characters (got 0)", ... },
//   { instancePath: "/age",  keyword: "minimum",   message: "must be ≥ 18", ... },
//   { instancePath: "/email",keyword: "format",    message: "must match the \"email\" format", ... },
//   { instancePath: "/role", keyword: "additionalProperties", ... },
// ]

// Throw on failure with all issues attached:
try {
  validate.assert({ email: "x" }, schema);
} catch (e) {
  const err = e as ValidationError;
  err.errors; // ValidationIssue[]
}
```

Helper convenience functions are exported for one-shot use:

```ts
import { validate, assertValid, compile } from "json-schema-validator";

validate(3, { type: "integer" }).valid;              // true
assertValid({ a: 1 }, { required: ["b"] });          // throws ValidationError

const isPositiveInt = compile({ type: "integer", minimum: 1 });
isPositiveInt(5);   // true
isPositiveInt(0);   // false
```

### Options

```ts
new Validator({
  assertFormat: true,        // treat `format` as a hard assertion
  strictFormats: false,      // error on unknown format names
  maxErrors: 100,            // cap issues collected (0 = unlimited)
  lenientRefs: false,        // skip unresolved $refs instead of erroring
  formats: { hex: (s) => /^[0-9a-f]+$/i.test(s) },  // custom formats
});
```

## Express / Connect middleware

```ts
import express from "express";
import { Validator } from "json-schema-validator";

const app = express();
app.use(express.json());

const validateBody = new Validator().middleware(
  { type: "object", required: ["name"], properties: { name: { type: "string" } } },
  { status: 400 },
);

app.post("/users", validateBody, (req, res) => {
  res.json({ ok: true, user: req.body });
});
```

Invalid bodies short-circuit with `{ error: { code: "validation_failed", message, issues } }`
and the supplied status (default 400); valid bodies pass through to your handler.

## CLI

Validate files in CI:

```bash
json-schema-validator schema.json data.json
json-schema-validator --schema schema.json < data.json   # stdin
json-schema-validator schema.json data.json --json        # machine-readable
```

Exit codes: `0` valid, `1` validation failed, `2` usage/IO error.

```bash
$ echo '{"name":"Ada","age":37,"email":"ada@example.com","role":"admin","tags":["ts","node"]}' \
  | bun src/cli.ts --schema schema.json
✔ valid            # exit 0
```

```bash
$ echo '{"name":"","age":16,"email":"not-an-email","role":"root","tags":["ts","ts"]}' \
  | bun src/cli.ts --schema schema.json
✘ invalid: 5 issue(s)                       # exit 1

  at /name: must be at least 1 characters (got 0)  [value: ""]  (minLength)
  at /age: must be ≥ 18                             [value: 16]  (minimum)
  at /email: must match the "email" format          [value: "not-an-email"]  (format)
  at /role: value must be one of the allowed values [value: "root"]  (enum)
  at /tags: items at index 0 and 1 must be unique   [value: ["ts","ts"]]  (uniqueItems)
```

Run it from the source tree with `bun src/cli.ts`, or build with `npm run build`
and use `dist/cli.js`.

## Supported keywords (draft-07)

- **Structural:** `type`, `enum`, `const`, `$ref` (JSON-Pointer, with
  `$defs`/`definitions`)
- **Numbers:** `multipleOf`, `minimum`/`maximum` (boolean and numeric
  exclusive forms)
- **Strings:** `minLength`/`maxLength`, `pattern`, `format`
- **Arrays:** `items` (single & tuple form), `additionalItems`, `minItems`/
  `maxItems`, `uniqueItems`, `contains`
- **Objects:** `required`, `properties`, `patternProperties`,
  `additionalProperties`, `propertyNames`, `minProperties`/`maxProperties`,
  `dependencies` (array & schema form)
- **Combinators:** `allOf`, `anyOf`, `oneOf`, `not`, `if`/`then`/`else`

Built-in formats: `date-time`, `date`, `time`, `duration`, `email`/
`idn-email`, `hostname`/`idn-hostname`, `ipv4`, `ipv6`, `uri`,
`uri-reference`, `uri-template`, `json-pointer`, `relative-json-pointer`,
`uuid`, `regex`, `json-pointer-uri-fragment`.

External (`http(s)://`) references are reported as unresolvable by default —
set `lenientRefs: true` to skip them. Use `$defs`/`definitions` for internal
reuse, including recursive schemas.

## Related repos

- [api-key-manager](https://github.com/Retsumdk/api-key-manager) — API key management with usage tracking
- [ai-response-validator](https://github.com/Retsumdk/ai-response-validator) — AI response validation
- [service-discovery-client](https://github.com/Retsumdk/service-discovery-client) — service discovery + health-based load balancing

## License

MIT — see [LICENSE](LICENSE).
