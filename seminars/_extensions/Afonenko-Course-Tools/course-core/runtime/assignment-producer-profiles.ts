/** Данные только проверенной поставки. Caller/project metadata не дополняют этот набор. */
export type AssignmentProducerProfile = Readonly<{
  id: string;
  root: string;
  source: {
    files: readonly { path: string; sha256: string }[];
    memberships: Readonly<Record<string, readonly string[]>>;
  };
  runtime: {
    files: readonly { path: string; sha256: string }[];
    directories: readonly { path: string; names: readonly string[] }[];
    absent: readonly string[];
  };
  hostEnvironment: Readonly<Record<string, string | null>>;
  launcher: {
    entrypoint: string;
    executable: string;
    arguments: readonly string[];
    requestedProfiles: readonly string[];
  };
  native: {
    executable: string;
    environment: Readonly<Record<string, string>>;
    // Только точные argv квалифицированных child commands; correlation добавляет Core.
    renders: readonly (readonly string[])[];
    actualProfiles: readonly string[];
    producerEvidence: Readonly<
      Partial<
        Record<"html" | "revealjs", {
          filters: unknown;
          shortcodes: unknown;
          engine: string;
        }>
      >
    >;
    literalShortcodes: readonly ("xref" | "meta")[];
  };
}>;
// Схема данных I3; этот модуль не читает location/capsule и не хранит registry.
// @deno-types="../vendor/zod/v4/index.d.ts"
import { z } from "../vendor/zod/v4/index.js";
const absolute = z.string().min(1).max(4096).refine((p) =>
  p.startsWith("/") && !p.includes("\\") && !p.includes("\0") &&
  !p.split("/").slice(1).some((v) => !v || v === "." || v === "..")
);
const relative = z.string().min(1).max(4096).refine((p) =>
  !p.startsWith("/") && !p.includes("\\") && !p.includes("\0") &&
  p.split("/").every((v) => v && v !== "." && v !== "..")
);
const sha = z.string().regex(/^[a-f0-9]{64}$/),
  names = z.array(
    z.string().min(1).max(255).refine((v) =>
      !v.includes("/") && v !== "." && v !== ".."
    ),
  ).max(65536).refine((v) => new Set(v).size === v.length);
const environment = z.record(
  z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  z.string().max(65536),
);
export const AssignmentProducerProfileSchema = z.strictObject({
  id: z.string().min(1).max(128),
  root: absolute,
  source: z.strictObject({
    files: z.array(z.strictObject({ path: relative, sha256: sha })).min(1).max(
      65536,
    ).refine((v) => new Set(v.map((r) => r.path)).size === v.length),
    memberships: z.record(z.string(), names),
  }),
  runtime: z.strictObject({
    files: z.array(z.strictObject({ path: absolute, sha256: sha })).min(3).max(
      65536,
    ).refine((v) => new Set(v.map((r) => r.path)).size === v.length),
    directories: z.array(z.strictObject({ path: absolute, names })).max(8192),
    absent: z.array(absolute).max(8192),
  }),
  hostEnvironment: z.record(z.string(), z.string().nullable()),
  launcher: z.strictObject({
    entrypoint: z.string().startsWith("file:///"),
    executable: absolute,
    arguments: z.array(z.string()).max(4096),
    requestedProfiles: z.array(z.string().regex(/^[-a-z0-9]+$/)).max(16),
  }),
  native: z.strictObject({
    executable: absolute,
    environment,
    renders: z.array(z.array(z.string()).max(4096)).max(4096),
    actualProfiles: z.array(z.string().regex(/^[-a-z0-9]+$/)).max(16),
    producerEvidence: z.strictObject({
      html: z.strictObject({
        filters: z.unknown(),
        shortcodes: z.unknown(),
        engine: z.string(),
      }).optional(),
      revealjs: z.strictObject({
        filters: z.unknown(),
        shortcodes: z.unknown(),
        engine: z.string(),
      }).optional(),
    }),
    literalShortcodes: z.array(z.enum(["xref", "meta"])).max(2),
  }),
});
