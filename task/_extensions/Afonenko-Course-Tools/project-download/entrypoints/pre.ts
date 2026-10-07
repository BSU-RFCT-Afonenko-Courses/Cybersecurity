import { prepare } from "../infrastructure/runtime.ts";
try {
  await prepare(await Deno.realPath(Deno.cwd()));
} catch (error) {
  if (error instanceof Error && ["ExtensionDiagnostic", "ExternalToolFailure"].includes(error.name)) {
    console.error(error.message);
    Deno.exit(1);
  }
  throw error;
}
