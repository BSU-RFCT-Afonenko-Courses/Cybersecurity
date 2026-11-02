// @deno-types="../vendor/zod/v4/index.d.ts"
import { z } from "../vendor/zod/v4/index.js";
/** Exact public native targets qualified by the runtime transport. */
export const NativeWebFormatSchema = z.enum(["html", "revealjs"]);
