import { describe, test, expect } from "bun:test";
describe("json-schema-validator", () => {
  test("module loads", async () => { const m = await import("./index"); expect(m).toBeDefined(); });
});
