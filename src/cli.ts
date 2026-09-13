#!/usr/bin/env bun
/** CLI for the JSON Schema validator.
 * Validation of a JSON document against a JSON Schema file, with detailed
 * per-issue reporting and exit codes suitable for CI. */

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { Validator } from "./index";

function readJson(path: string, label: string): unknown {
  const raw = readFileSync(path, "utf-8");
  try {
    return JSON.parse(raw);
  } catch (e) {
    process.stderr.write(`[error] ${label} "${path}" is not valid JSON: ${(e as Error).message}\n`);
    process.exit(2);
  }
}

function pretty(v: unknown): string {
  if (typeof v === "string") return `"${v}"`;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function main(): void {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      schema: { type: "string", short: "s" },
      help: { type: "boolean", short: "h" },
      json: { type: "boolean" },
      assertFormat: { type: "string" },
      strictFormats: { type: "string" },
      maxErrors: { type: "string" },
      format: { type: "string" }, // optional comma-separated custom formats ignored by structure
    },
  });

  if (values.help || (!values.schema && positionals.length < 2)) {
    process.stdout.write(
      [
        "json-schema-validator — validate a JSON document against a JSON Schema",
        "",
        "Usage:",
        "  json-schema-validator <schema.json> <data.json> [options]",
        "  json-schema-validator --schema schema.json < data.json",
        "",
        "Options:",
        "  --schema <file>      read the document from stdin (data.json omitted)",
        "  --json               machine-readable output (JSON error list)",
        "  --max-errors <n>     stop after collecting n issues (default 100, 0 = unlimited)",
        "  --strict-formats     error on unknown format keywords",
        "  --no-assert-format   treat format as an annotation, not an assertion",
        "  -h, --help           show this help",
        "",
        "Exit codes: 0 = valid, 1 = validation failed, 2 = usage/IO error",
      ].join("\n") + "\n",
    );
    process.exit(values.help ? 0 : 2);
  }

  let schemaPath: string;
  let data: unknown;
  if (values.schema) {
    schemaPath = values.schema;
    data = JSON.parse(readStdin());
  } else {
    schemaPath = positionals[0];
    data = readJson(positionals[1], "document");
  }

  const schema = readJson(schemaPath, "schema");
  const validator = new Validator({
    assertFormat: values.assertFormat === "false" ? false : true,
    strictFormats: values.strictFormats === "true",
    maxErrors: values.maxErrors ? Number(values.maxErrors) : 100,
  });

  const { valid, errors } = validator.validate(data, schema as never);

  if (valid) {
    process.stdout.write("✔ valid\n");
    process.exit(0);
  }

  if (values.json) {
    process.stdout.write(JSON.stringify({ valid: false, errors }, null, 2) + "\n");
  } else {
    process.stderr.write(`✘ invalid: ${errors.length} issue(s)\n\n`);
    for (const e of errors) {
      const at = e.instancePath === "" ? "(root)" : e.instancePath;
      process.stderr.write(`  at ${at}: ${e.message}`);
      if (e.data !== undefined) process.stderr.write(`  [value: ${pretty(e.data)}]`);
      process.stderr.write("  (" + e.keyword + ")\n");
    }
  }
  process.exit(1);
}

function readStdin(): string {
  try {
    return readFileSync("/dev/stdin", "utf-8");
  } catch {
    return "";
  }
}

main();
