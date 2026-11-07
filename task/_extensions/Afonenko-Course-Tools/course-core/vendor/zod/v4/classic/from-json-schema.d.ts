import type * as JSONSchema from "../core/json-schema.d.ts";
import { type $ZodRegistry } from "../core/registries.d.ts";
import type { ZodType } from "./schemas.d.ts";
type JSONSchemaVersion = "draft-2020-12" | "draft-7" | "draft-4" | "openapi-3.0";
interface FromJSONSchemaParams {
    defaultTarget?: JSONSchemaVersion;
    registry?: $ZodRegistry<any>;
}
/**
 * Converts a JSON Schema to a Zod schema. This function should be considered semi-experimental. It's behavior is liable to change. */
export declare function fromJSONSchema(schema: JSONSchema.JSONSchema | boolean, params?: FromJSONSchemaParams): ZodType;
export {};
