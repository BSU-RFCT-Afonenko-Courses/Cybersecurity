import * as core from "../core/index.d.ts";
import * as schemas from "./schemas.d.ts";
export declare function string<T = unknown>(params?: string | core.$ZodStringParams): schemas.ZodMiniString<T>;
export declare function number<T = unknown>(params?: string | core.$ZodNumberParams): schemas.ZodMiniNumber<T>;
export declare function boolean<T = unknown>(params?: string | core.$ZodBooleanParams): schemas.ZodMiniBoolean<T>;
export declare function bigint<T = unknown>(params?: string | core.$ZodBigIntParams): schemas.ZodMiniBigInt<T>;
export declare function date<T = unknown>(params?: string | core.$ZodDateParams): schemas.ZodMiniDate<T>;
