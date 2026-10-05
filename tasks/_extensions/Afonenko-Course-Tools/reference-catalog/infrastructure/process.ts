import { isAbsolute } from "./files.ts";

async function traceNative(command: string, args: string[], cwd: string, started: number, exitCode: number | null): Promise<void> {
  try {
    const path = Deno.env.get("COURSE_BUILD_TRACE");
    if (!path || !isAbsolute(path) || !["inspect", "render"].includes(args[0])) return;
    const limited = args[1] && !args[1].startsWith("-") ? [args[1]] : [];
    const profile = args.indexOf("--profile");
    if (profile >= 0 && args[profile + 1]) limited.push("--profile", args[profile + 1]);
    await Deno.writeTextFile(path, JSON.stringify({ kind: args[0], executable: command, cwd, args: limited, elapsedMs: performance.now() - started, exitCode }) + "\n", { append: true });
  } catch { /* Optional telemetry cannot replace native output or failure. */ }
}

export async function quarto(args: string[], cwd: string, extra: Record<string, string> = {}): Promise<string> {
  const command = Deno.env.get("QUARTO") || Deno.env.get("QRC_QUARTO") || "quarto";
  const started = performance.now();
  let result: Deno.CommandOutput;
  let exitCode: number | null = null;
  try {
    result = await new Deno.Command(command, { args, cwd, env: extra, stdout: "piped", stderr: "piped" }).output();
    exitCode = result.code;
  } finally {
    await traceNative(command, args, cwd, started, exitCode);
  }
  const out = new TextDecoder().decode(result.stdout);
  const err = new TextDecoder().decode(result.stderr);
  if (!result.success) throw new Error(`QRC команда quarto ${args[0]} завершилась с кодом ${result.code}\n${out}\n${err}`);
  if (args[0] === "render" && /(?:WARNING|WARN:)/.test(err)) throw new Error(`QRC предупреждения при сборке\n${err}`);
  return out;
}
