import * as core from "../core/index.d.ts";
import { ZodISODate, ZodISODateTime, ZodISODuration, ZodISOTime } from "./schemas.d.ts";
export { ZodISODate, ZodISODateTime, ZodISODuration, ZodISOTime } from "./schemas.d.ts";
export declare function datetime(params?: string | core.$ZodISODateTimeParams): ZodISODateTime;
export declare function date(params?: string | core.$ZodISODateParams): ZodISODate;
export declare function time(params?: string | core.$ZodISOTimeParams): ZodISOTime;
export declare function duration(params?: string | core.$ZodISODurationParams): ZodISODuration;
