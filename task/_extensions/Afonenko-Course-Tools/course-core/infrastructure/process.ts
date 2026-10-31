import {createMetrics as __createMetrics} from "../observability/bridge.ts";
const __metrics=__createMetrics("course-core");
export function quartoExecutable(): string { return Deno.env.get("QUARTO") || "quarto"; }
export async function command(executable: string, args: string[], cwd: string, env: Record<string, string> = {}): Promise<string> {
  let result: Deno.CommandOutput;
  try {
    const context = __metrics.childEnv(env);
    const childOptions = context === env ? { env } : {
      env: __metrics.childEnv({...Deno.env.toObject(),...env}), clearEnv: true,
    };
    result = await new Deno.Command(executable, { args, cwd, ...childOptions, stdout: "piped", stderr: "piped" }).output();
  } catch (cause) {
    if (!Object.values(Deno.errors).some(kind => cause instanceof kind)) throw cause;
    const error = new Error(`Не удалось запустить инструмент ${executable}`, { cause });
    error.name = "ExternalToolFailure";
    throw Object.assign(error, { tool: executable, exitCode: undefined, stdout: "", stderr: "" });
  }
  const stdout = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(result.stdout), stderr = new TextDecoder().decode(result.stderr);
  if (!result.success) {
    const error = new Error(`${executable} ${args[0] ?? ""}: внешний инструмент завершился с кодом ${result.code}\n${stdout}${stderr}`, { cause: result });
    error.name = "ExternalToolFailure";
    throw Object.assign(error, { tool: executable, exitCode: result.code, stdout, stderr });
  }
  if (stderr) await Deno.stderr.write(result.stderr);
  return stdout;
}

// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
quartoExecutable=__metrics.wrapSync({id:"course-core.infrastructure.process.quartoExecutable",kind:"command"},quartoExecutable);
// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
command=__metrics.wrapAsync({id:"course-core.infrastructure.process.command",kind:"command"},command);
