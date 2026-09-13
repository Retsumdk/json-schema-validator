/** Shared type definitions for the validator. */

export type JsonType = "object" | "array" | "string" | "number" | "integer" | "boolean" | "null";

export type FormatValidator = (value: string) => boolean;

export type JsonSchema =
  | boolean
  | {
      $ref?: string;
      $defs?: Record<string, JsonSchema>;
      definitions?: Record<string, JsonSchema>;
      $id?: string;
      $schema?: string;

      type?: JsonType | JsonType[];
      enum?: unknown[];
      const?: unknown;

      multipleOf?: number;
      maximum?: number;
      exclusiveMaximum?: number | boolean;
      minimum?: number;
      exclusiveMinimum?: number | boolean;

      maxLength?: number;
      minLength?: number;
      pattern?: string;
      format?: string;

      items?: JsonSchema | JsonSchema[];
      additionalItems?: JsonSchema;
      maxItems?: number;
      minItems?: number;
      uniqueItems?: boolean;
      contains?: JsonSchema;

      maxProperties?: number;
      minProperties?: number;
      required?: string[];
      properties?: Record<string, JsonSchema>;
      patternProperties?: Record<string, JsonSchema>;
      additionalProperties?: JsonSchema;
      propertyNames?: JsonSchema;
      dependencies?: Record<string, JsonSchema | string[]>;

      allOf?: JsonSchema[];
      anyOf?: JsonSchema[];
      oneOf?: JsonSchema[];
      not?: JsonSchema;
      if?: JsonSchema;
      then?: JsonSchema;
      else?: JsonSchema;

      [keyword: string]: unknown;
    };

export interface ValidationIssue {
  instancePath: string;
  schemaPath: string;
  keyword: string;
  message: string;
  params?: Record<string, unknown>;
  data?: unknown;
}

export interface ValidateResult {
  valid: boolean;
  errors: ValidationIssue[];
}

export interface ValidatorOptions {
  /** Treat `format` as an assertion (default true). When false, it is ignored. */
  assertFormat?: boolean;
  /** Error on unknown `format` values (default false; unknown formats are ignored). */
  strictFormats?: boolean;
  /** Maximum issues to collect before stopping (default 100; 0 = unlimited). */
  maxErrors?: number;
  /** When true, unresolved `$ref`s are skipped instead of reported (default false). */
  lenientRefs?: boolean;
  /** Map of custom format validators keyed by format name. */
  formats?: Record<string, FormatValidator>;
}
