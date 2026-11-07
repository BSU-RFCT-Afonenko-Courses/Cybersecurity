// @deno-types="../vendor/zod/v4/index.d.ts"
import { z } from "../vendor/zod/v4/index.js";

/** Версия программы: SemVer >=1.11.5. Не меняет технический native ABI. */
export const SupportedQuartoVersionSchema = z.string().refine((value) => {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
      .exec(value);
  if (!match || match[0] !== value) return false;
  const parts = match.slice(1, 4).map(Number);
  if (!parts.every(Number.isSafeInteger)) return false;
  if (
    match[4]?.split(".").some((part) =>
      /^\d+$/.test(part) && part.length > 1 && part.startsWith("0")
    )
  ) return false;
  const order = parts[0] - 1 || parts[1] - 11 || parts[2] - 5;
  return order > 0 || (order === 0 && !match[4]);
}, "Требуется версия Quarto >=1.11.5");
