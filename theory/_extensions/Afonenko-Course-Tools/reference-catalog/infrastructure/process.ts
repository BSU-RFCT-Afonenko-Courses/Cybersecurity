import {createMetrics as __createMetrics} from "../observability/bridge.ts";
const __metrics=__createMetrics("reference-catalog");

export async function quarto(args: string[], cwd: string, extra: Record<string, string> = {}): Promise<string> {
  const command = Deno.env.get("QUARTO") || Deno.env.get("QRC_QUARTO") || "quarto";
  let result: Deno.CommandOutput;
  try {
    result = await new Deno.Command(command, { args, cwd, env: __metrics.childEnv(extra), stdout: "piped", stderr: "piped" }).output();
  } catch (cause) {
    if (!Object.values(Deno.errors).some(kind => cause instanceof kind)) throw cause;
    const error = new Error(`Не удалось запустить Quarto (${command}): ${cause instanceof Error ? cause.message : cause}`, { cause });
    error.name = "ExternalToolFailure";
    throw Object.assign(error, { tool: command, exitCode: null, stdout: "", stderr: cause instanceof Error ? cause.message : String(cause) });
  }
  const out = new TextDecoder().decode(result.stdout);
  const err = new TextDecoder().decode(result.stderr);
  if (!result.success) {
    const error = new Error(`Quarto ${args[0]} (${command}) завершился с кодом ${result.code}\n${out}\n${err}`, { cause: result });
    error.name = "ExternalToolFailure";
    throw Object.assign(error, { tool: command, exitCode: result.code, stdout: out, stderr: err });
  }
  if (result.stderr.length) await Deno.stderr.write(result.stderr);
  return out;
}

// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
quarto=__metrics.wrapAsync({id:"reference-catalog.infrastructure.process.quarto",kind:"command"},quarto);
