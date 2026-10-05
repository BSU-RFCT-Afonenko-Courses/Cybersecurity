import { quarto } from "../infrastructure/process.ts";
import { resolve } from "../infrastructure/files.ts";
import { publish } from "../infrastructure/publish.ts";
const root = Deno.cwd();
const profiles = Deno.env.get("QUARTO_PROFILE");
const config = JSON.parse(await quarto(["inspect", root, ...(profiles ? ["--profile", profiles] : [])], root)).config;
const namespace = config["reference-catalog"]?.namespace;
if (typeof namespace !== "string" || !namespace) throw new Error("QRC самостоятельному проекту требуется reference-catalog.namespace");
await publish({ root, stage: resolve(root, Deno.env.get("QUARTO_PROJECT_OUTPUT_DIR") ?? config.project?.["output-dir"] ?? "_site"), quarto: (await quarto(["--version"], root)).trim(), config, members: [{ namespace, format: "html" }] });
