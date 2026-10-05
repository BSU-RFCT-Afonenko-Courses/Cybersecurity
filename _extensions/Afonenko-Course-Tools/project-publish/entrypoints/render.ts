import { workspace } from "../infrastructure/config.ts";
import {
  activeProfiles,
  profileArguments,
} from "../infrastructure/profiles.ts";
import { quarto } from "../infrastructure/process.ts";

/** Проверка CLI до stock Quarto, который очищает output раньше pre-render. */
export async function safeRender(
  root: string,
  profiles: string[],
): Promise<void> {
  const prior = Deno.env.get("QUARTO_PROFILE");
  Deno.env.set("QUARTO_PROFILE", profiles.join(","));
  let w;
  try {
    w = await workspace(root);
  } finally {
    if (prior === undefined) Deno.env.delete("QUARTO_PROFILE");
    else Deno.env.set("QUARTO_PROFILE", prior);
  }
  if (!w.portal) {
    throw new Error(
      "Публикация безопасный render.ts предназначен для managed portal",
    );
  }
  await quarto(
    ["render", ".", "--fail-if-warnings", ...profileArguments(profiles)],
    root,
    { QUARTO_PROJECT_OUTPUT_DIR: "", QUARTO_PROFILE: "" },
    "forward",
  );
}
if (import.meta.main) {
  if (
    Deno.args.length !== 0 &&
    (Deno.args.length !== 2 || Deno.args[0] !== "--profile")
  ) {
    throw new Error(
      "Публикация render.ts принимает только --profile; --output-dir и другие native overrides запрещены до запуска Quarto",
    );
  }
  const profiles = activeProfiles(
    Deno.args[1] ?? Deno.env.get("QUARTO_PROFILE") ?? "",
  );
  await safeRender(Deno.cwd(), profiles);
}
