import { diagnostic } from "../diagnostics.ts";
import { quarto } from "../infrastructure/process.ts";
import { resolve } from "../infrastructure/files.ts";
import { publish } from "../infrastructure/publish.ts";
async function main(): Promise<void> {
  const root = Deno.cwd();
  const profiles = Deno.env.get("QUARTO_PROFILE");
  const config = JSON.parse(await quarto(["inspect", root, ...(profiles ? ["--profile", profiles] : [])], root)).config;
  const namespace = config["reference-catalog"]?.namespace;
  if (typeof namespace !== "string" || !namespace) throw diagnostic("QRC.CONFIG_INVALID", "самостоятельному проекту требуется reference-catalog.namespace", { source: root, field: "reference-catalog.namespace" });
  const outputListFile = Deno.env.get("QUARTO_USE_FILE_FOR_PROJECT_OUTPUT_FILES");
  const outputList = outputListFile ? await Deno.readTextFile(resolve(root, outputListFile)) : Deno.env.get("QUARTO_PROJECT_OUTPUT_FILES");
  if (outputList === undefined) throw diagnostic("QRC.OUTPUT_INVALID", "post-render требует текущий QUARTO_PROJECT_OUTPUT_FILES", { source: root, field: "QUARTO_PROJECT_OUTPUT_FILES" });
  const outputs = outputList.split(/\r?\n/).filter(path => path.length > 0);
  await publish({ root, stage: resolve(root, Deno.env.get("QUARTO_PROJECT_OUTPUT_DIR") ?? config.project?.["output-dir"] ?? "_site"), quarto: (await quarto(["--version"], root)).trim(), config, members: [{ namespace, format: "html" }], scope: "local", outputs });
}
try { await main(); } catch (error) {
  if (error instanceof Error && ["ExtensionDiagnostic", "ExternalToolFailure"].includes(error.name)) {
    console.error(error.message);
    Deno.exit(1);
  }
  throw error;
}
