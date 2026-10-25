import {createMetrics as __createMetrics} from "../observability/bridge.ts";
const __metrics=__createMetrics("course-site");
export function executable(): string {
  return Deno.env.get("QUARTO") || "quarto";
}
export async function quarto(
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
  forward = false,
): Promise<string> {
  const tool = executable();
  let result: Deno.CommandOutput;
  try {
    const childEnv = __metrics.childEnv(env);
    const observed = childEnv !== env;
    result = await new Deno.Command(tool, {
      args,
      cwd,
      env: observed ? __metrics.childEnv({ ...Deno.env.toObject(), ...env }) : childEnv,
      clearEnv: observed,
      stdout: "piped",
      stderr: "piped",
    }).output();
  } catch (cause) {
    if (!Object.values(Deno.errors).some((kind) => cause instanceof kind)) {
      throw cause;
    }
    const error = new Error(
      `course-site: не удалось запустить ${tool} в ${cwd}\n${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      { cause },
    );
    error.name = "ExternalToolFailure";
    throw Object.assign(error, {
      tool,
      exitCode: null,
      stdout: "",
      stderr: "",
      forwarded: false,
    });
  }
  const out = new TextDecoder().decode(result.stdout),
    err = new TextDecoder().decode(result.stderr);
  if (forward) {
    await Deno.stdout.write(result.stdout);
    await Deno.stderr.write(result.stderr);
  }
  if (!result.success) {
    const error = new Error(
      `course-site: Quarto ${
        args[0]
      } завершился с кодом ${result.code} (проект: ${cwd})${
        forward ? "" : `\n${out}${err}`
      }`,
      { cause: result },
    );
    error.name = "ExternalToolFailure";
    throw Object.assign(error, {
      tool,
      exitCode: result.code,
      stdout: out,
      stderr: err,
      forwarded: forward,
    });
  }
  return out;
}
export function profileArguments(profiles: string[]): string[] {
  return profiles.length ? ["--profile", profiles.join(",")] : [];
}

// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
executable=__metrics.wrapSync({id:"course-site.infrastructure.process.executable",kind:"command"},executable);
// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
quarto=__metrics.wrapAsync({id:"course-site.infrastructure.process.quarto",kind:"command"},quarto);
// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
profileArguments=__metrics.wrapSync({id:"course-site.infrastructure.process.profileArguments",kind:"command"},profileArguments);
