import { describe, test, expect } from "bun:test";
import { Validator, validate, ValidationError } from "../src/index";
import type { JsonSchema } from "../src/types";

const v = () => new Validator();

function ok(data: unknown, schema: JsonSchema) {
  expect(v().validate(data, schema).valid).toBe(true);
}
function bad(data: unknown, schema: JsonSchema, keyword?: string) {
  const r = v().validate(data, schema);
  expect(r.valid).toBe(false);
  if (keyword) expect(r.errors.map((e) => e.keyword)).toContain(keyword);
  return r;
}

describe("type / enum / const", () => {
  const schema: JsonSchema = { type: "object" };
  test("valid object", () => ok({ a: 1 }, schema));
  test("rejects non-object", () => bad([1], schema, "type"));

  const union: JsonSchema = { type: ["string", "null"] };
  test("string matches union", () => ok("x", union));
  test("null matches union", () => ok(null, union));
  test("number rejected by union", () => bad(5, union, "type"));

  test("integer vs number", () => {
    ok(4, { type: "integer" });
    ok(4, { type: "number" });
    bad(4.5, { type: "integer" }, "type");
    ok(4.5, { type: "number" });
  });

  test("enum accepts a member", () => ok("red", { enum: ["red", "green", "blue"] }));
  test("enum rejects non-member", () => bad("yellow", { enum: ["red", "green"] }, "enum"));
  test("enum supports objects", () => ok({ a: 1 }, { enum: [{ a: 1 }, { b: 2 }] }));

  test("const equality", () => {
    ok(5, { const: 5 });
    ok("hi", { const: "hi" });
    bad(6, { const: 5 }, "const");
    ok([1, 2], { const: [1, 2] });
    bad([1, 3], { const: [1, 2] }, "const");
  });
});

describe("numeric keywords", () => {
  test("minimum / maximum", () => {
    ok(5, { minimum: 0, maximum: 10 });
    bad(-1, { minimum: 0 }, "minimum");
    bad(11, { maximum: 10 }, "maximum");
    ok(0, { minimum: 0 });
  });
  test("exclusive bounds (boolean form)", () => {
    ok(1, { minimum: 0, exclusiveMinimum: true });
    bad(0, { minimum: 0, exclusiveMinimum: true }, "exclusiveMinimum");
    ok(9, { maximum: 10, exclusiveMaximum: true });
    bad(10, { maximum: 10, exclusiveMaximum: true }, "exclusiveMaximum");
  });
  test("exclusive bounds (numeric form)", () => {
    ok(2, { exclusiveMinimum: 1 });
    bad(1, { exclusiveMinimum: 1 }, "exclusiveMinimum");
    ok(2, { exclusiveMaximum: 3 });
    bad(3, { exclusiveMaximum: 3 }, "exclusiveMaximum");
  });
  test("multipleOf", () => {
    ok(10, { multipleOf: 5 });
    ok(0, { multipleOf: 0.1 });
    ok(0.3, { multipleOf: 0.1 });
    bad(7, { multipleOf: 2 }, "multipleOf");
  });
});

describe("string keywords", () => {
  test("length bounds", () => {
    ok("abc", { minLength: 1, maxLength: 5 });
    bad("", { minLength: 1 }, "minLength");
    bad("toolong", { maxLength: 3 }, "maxLength");
  });
  test("pattern", () => {
    ok("abc123", { pattern: "^[a-z0-9]+$" });
    bad("ABC", { pattern: "^[a-z]+$" }, "pattern");
    ok("anything", { pattern: "[a-z]" });
  });
  test("format email / ipv4 / uuid / date-time", () => {
    ok("a@b.com", { format: "email" });
    bad("not-an-email", { format: "email" }, "format");
    ok("192.168.0.1", { format: "ipv4" });
    bad("999.1.1.1", { format: "ipv4" }, "format");
    ok("123e4567-e89b-12d3-a456-426614174000", { format: "uuid" });
    bad("nope", { format: "uuid" }, "format");
    ok("2026-09-13T16:00:00Z", { format: "date-time" });
    bad("2026-13-99T99:99:99Z", { format: "date-time" }, "format");
  });
  test("format assertion can be disabled", () => {
    const val = new Validator({ assertFormat: false });
    expect(val.validate("nope", { format: "email" }).valid).toBe(true);
  });
  test("unknown format ignored unless strict", () => {
    ok("anything", { format: "not-a-real-format" });
    const strict = new Validator({ strictFormats: true });
    expect(strict.validate("x", { format: "not-a-real-format" }).valid).toBe(false);
  });
  test("custom formats", () => {
    const val = new Validator({ formats: { hex: (s) => /^[0-9a-f]+$/i.test(s) } });
    expect(val.validate("deadbeef", { format: "hex" }).valid).toBe(true);
    expect(val.validate("zzz", { format: "hex" }).valid).toBe(false);
  });
});

describe("array keywords", () => {
  test("item schema applies to every element", () => {
    ok([1, 2, 3], { type: "array", items: { type: "integer" } });
    bad([1, "x", 3], { items: { type: "integer" } }, "type");
  });
  test("minItems / maxItems", () => {
    ok([1, 2], { minItems: 1, maxItems: 3 });
    bad([], { minItems: 1 }, "minItems");
    bad([1, 2, 3], { maxItems: 2 }, "maxItems");
  });
  test("uniqueItems", () => {
    ok([1, 2, 3], { uniqueItems: true });
    ok([{ a: 1 }, { a: 2 }], { uniqueItems: true });
    bad([1, 2, 1], { uniqueItems: true }, "uniqueItems");
    bad([{ a: 1 }, { a: 1 }], { uniqueItems: true }, "uniqueItems");
  });
  test("tuple with additionalItems", () => {
    const schema: JsonSchema = { items: [{ type: "string" }, { type: "integer" }], additionalItems: false };
    ok(["a", 1], schema);
    bad(["a", 1, "extra"], schema, "false schema");
    const loose: JsonSchema = { items: [{ type: "string" }], additionalItems: { type: "integer" } };
    ok(["a", 2, 3], loose);
    bad(["a", "b"], loose, "type");
  });
  test("contains", () => {
    ok([1, 2, 3], { contains: { type: "integer" } });
    ok(["a", 1], { contains: { type: "integer" } });
    bad(["a", "b"], { contains: { type: "integer" } }, "contains");
  });
});

describe("object keywords", () => {
  test("required", () => {
    ok({ a: 1, b: 2 }, { required: ["a", "b"] });
    bad({ a: 1 }, { required: ["a", "b"] }, "required");
  });
  test("properties", () => {
    const schema: JsonSchema = { properties: { name: { type: "string" }, age: { type: "integer" } } };
    ok({ name: "x", age: 3 }, schema);
    ok({}, schema);
    bad({ name: 5 }, schema, "type");
  });
  test("additionalProperties false", () => {
    const schema: JsonSchema = { properties: { name: { type: "string" } }, additionalProperties: false };
    ok({ name: "x" }, schema);
    bad({ name: "x", extra: 1 }, schema, "false schema");
  });
  test("patternProperties", () => {
    // without additionalProperties, unmatched keys are allowed
    ok({ S_name: "a", other: 1 }, { patternProperties: { "^S_": { type: "string" } } });
    // with additionalProperties:false, the unmatched key "other" is rejected
    const schema: JsonSchema = { patternProperties: { "^S_": { type: "string" } }, additionalProperties: false };
    ok({ S_name: "a" }, schema);
    bad({ S_name: "a", other: 1 }, schema, "false schema");
    bad({ S_name: 123 }, schema, "type");
  });
  test("propertyNames", () => {
    const schema: JsonSchema = { propertyNames: { pattern: "^[a-z]+$" } };
    ok({ abc: 1 }, schema);
    bad({ "BAD KEY": 1 }, schema, "propertyNames.pattern");
  });
  test("minProperties / maxProperties", () => {
    ok({ a: 1, b: 2 }, { minProperties: 1, maxProperties: 3 });
    bad({}, { minProperties: 1 }, "minProperties");
    bad({ a: 1, b: 2, c: 3 }, { maxProperties: 2 }, "maxProperties");
  });
  test("dependencies (array form)", () => {
    const schema: JsonSchema = { dependencies: { credit_card: ["billing_address"] } };
    ok({ credit_card: "x", billing_address: "y" }, schema);
    bad({ credit_card: "x" }, schema, "dependencies");
  });
  test("dependencies (schema form)", () => {
    const schema: JsonSchema = { dependencies: { foo: { required: ["bar"] } } };
    ok({ foo: 1, bar: 2 }, schema);
    bad({ foo: 1 }, schema, "required");
  });
});

describe("combinators", () => {
  test("allOf", () => {
    const schema: JsonSchema = { allOf: [{ type: "integer" }, { minimum: 5 }] };
    ok(6, schema);
    bad(3, schema, "minimum");
    bad("x", schema, "type");
  });
  test("anyOf", () => {
    const schema: JsonSchema = { anyOf: [{ type: "string" }, { type: "integer" }] };
    ok("a", schema);
    ok(5, schema);
    bad(true, schema, "anyOf");
  });
  test("oneOf", () => {
    const schema: JsonSchema = { oneOf: [{ minimum: 0 }, { maximum: 0 }] };
    ok(1, schema); // matches only minimum:0
    ok(-1, schema); // matches only maximum:0
    bad(0, schema, "oneOf"); // matches both -> violates exactly-one
  });
  test("not", () => {
    const schema: JsonSchema = { not: { type: "string" } };
    ok(5, schema);
    bad("x", schema, "not");
  });
  test("if / then / else", () => {
    const schema: JsonSchema = { if: { required: ["kind"], properties: { kind: { const: "admin" } } }, then: { required: ["token"] }, else: { required: ["name"] } };
    ok({ kind: "admin", token: "t" }, schema);
    bad({ kind: "admin" }, schema, "required");
    ok({ name: "n" }, schema);
    bad({ kind: "user" }, schema, "required");
  });
});

describe("$ref and definitions", () => {
  const schema: JsonSchema = {
    definitions: {
      positiveInt: { type: "integer", minimum: 1 },
      address: { type: "object", required: ["street", "city"], properties: { street: { type: "string" }, city: { type: "string" } } },
    },
    type: "object",
    required: ["id", "primary"],
    properties: {
      id: { $ref: "#/definitions/positiveInt" },
      primary: { $ref: "#/definitions/address" },
    },
  };
  test("internal $ref resolves", () => {
    ok({ id: 3, primary: { street: "s", city: "c" } }, schema);
    bad({ id: 0, primary: { street: "s", city: "c" } }, schema, "minimum");
    bad({ id: 3, primary: { street: "s" } }, schema, "required");
  });
  test("$defs alias works", () => {
    const s: JsonSchema = { $defs: { id: { type: "integer" } }, type: "object", properties: { id: { $ref: "#/$defs/id" } } };
    ok({ id: 5 }, s);
    bad({ id: "x" }, s, "type");
  });
  test("root $ref resolves against a definition in the root document", () => {
    const s: JsonSchema = { $ref: "#/definitions/posInt", definitions: { posInt: { type: "integer", minimum: 1 } } };
    ok(5, s);
    bad("x", s, "type");
    bad(0, s, "minimum");
  });
  test("external ref is reported as error", () => {
    const s: JsonSchema = { $ref: "https://example.com/other.json#/x" };
    const r = v().validate({}, s);
    expect(r.valid).toBe(false);
    expect(r.errors[0].keyword).toBe("$ref");
  });
  test("lenientRefs skips unresolved refs", () => {
    const val = new Validator({ lenientRefs: true });
    expect(val.validate({}, { $ref: "https://example.com/other.json#/x" }).valid).toBe(true);
  });
});

describe("Validator API", () => {
  test("validate returns valid flag and errors", () => {
    const r = v().validate({ n: 5 }, { properties: { n: { type: "integer" } }, required: ["n"] });
    expect(r.valid).toBe(true);
    expect(r.errors.length).toBe(0);
  });
  test("errors are path-aware", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: { user: { type: "object", properties: { email: { type: "string", format: "email" } } } },
    };
    const r = v().validate({ user: { email: "nope" } }, schema);
    expect(r.errors[0].instancePath).toBe("/user/email");
    expect(r.errors[0].keyword).toBe("format");
  });
  test("assert throws ValidationError with issues", () => {
    const validator = v();
    expect(() => validator.assert("x", { type: "integer" })).toThrow(ValidationError);
    try {
      validator.assert("x", { type: "integer" });
    } catch (e) {
      expect((e as ValidationError).errors[0].keyword).toBe("type");
    }
  });
  test("compile returns reusable predicate", () => {
    const isPositiveInt = v().compile({ type: "integer", minimum: 1 });
    expect(isPositiveInt(5)).toBe(true);
    expect(isPositiveInt(0)).toBe(false);
    expect(isPositiveInt("x")).toBe(false);
  });
  test("maxErrors caps collected issues", () => {
    const val = new Validator({ maxErrors: 2 });
    const schema: JsonSchema = { type: "object", required: ["a", "b", "c", "d"] };
    const r = val.validate({}, schema);
    expect(r.errors.length).toBe(2);
  });
});

describe("standalone helpers", () => {
  test("validate()", () => {
    expect(validate(3, { type: "integer" }).valid).toBe(true);
    expect(validate("x", { type: "integer" }).valid).toBe(false);
  });
});

describe("middleware", () => {
  function fakeReqRes(req: { body?: unknown }) {
    let statusCode = 0;
    let payload: unknown;
    const res = {
      status: (n: number) => {
        statusCode = n;
        return res;
      },
      json: (o: unknown) => {
        payload = o;
      },
      get statusCode() {
        return statusCode;
      },
      get payload() {
        return payload;
      },
    };
    return { req, res };
  }

  test("passes through valid bodies", () => {
    const mw = v().middleware({ type: "object", required: ["name"] });
    let called = false;
    const { req, res } = fakeReqRes({ body: { name: "x" } });
    mw(req, res, () => {
      called = true;
    });
    expect(called).toBe(true);
    expect(res.statusCode).toBe(0);
  });

  test("rejects invalid bodies with detailed errors", () => {
    const mw = v().middleware({ type: "object", required: ["name"], properties: { name: { type: "string" } } });
    let called = false;
    const { req, res } = fakeReqRes({ body: { name: 42 } });
    mw(req, res, () => {
      called = true;
    });
    expect(called).toBe(false);
    expect(res.statusCode).toBe(400);
    const payload = res.payload as { error: { code: string; issues: unknown[] } };
    expect(payload.error.code).toBe("validation_failed");
    expect(payload.error.issues.length).toBe(1);
  });
});
