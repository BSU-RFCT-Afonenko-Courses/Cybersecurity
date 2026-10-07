import { finish } from "../infrastructure/runtime.ts";
try {
  const count = await finish(await Deno.realPath(Deno.cwd()));
  console.log(`Подготовлено архивов материалов: ${count}`);
} catch (error) {
  if (error instanceof Error && ["ExtensionDiagnostic", "ExternalToolFailure"].includes(error.name)) {
    console.error(error.message);
    Deno.exit(1);
  }
  throw error;
}
