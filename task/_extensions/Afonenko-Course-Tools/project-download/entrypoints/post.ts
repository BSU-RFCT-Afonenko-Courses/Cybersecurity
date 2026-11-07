import { finish } from "../infrastructure/runtime.ts";
try {
  if (Deno.env.get("COURSE_SITE_DEFER_DOWNLOADS") === "1") Deno.exit(0);
  const count = await finish(await Deno.realPath(Deno.cwd()), {
    native: Deno.args.includes("--native"),
    projection: Deno.args.includes("--author") ? "author" : "student",
  });
  console.log(`Подготовлено архивов материалов: ${count}`);
} catch (error) {
  if (
    error instanceof Error &&
    ["ExtensionDiagnostic", "ExternalToolFailure"].includes(error.name)
  ) {
    console.error(error.message);
    Deno.exit(1);
  }
  throw error;
}
