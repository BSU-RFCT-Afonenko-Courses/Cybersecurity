import {createMetrics as __createMetrics} from "../observability/bridge.ts";
const __metrics=__createMetrics("course-site");
export function executable(): string {
  return Deno.env.get("QUARTO") || "quarto";
}
async function liveOutput(command: Deno.Command): Promise<Deno.CommandOutput> {
  const child = command.spawn();
  const chunks: Uint8Array[][] = [[], []];
  let forwardingError: unknown;
  const pump = async (
    stream: ReadableStream<Uint8Array>,
    destination: { write(data: Uint8Array): Promise<number> },
    captured: Uint8Array[],
  ) => {
    try {
      for await (const chunk of stream) {
        captured.push(chunk);
        if (forwardingError !== undefined) continue;
        try {
          let offset = 0;
          while (offset < chunk.length) {
            const written = await destination.write(chunk.subarray(offset));
            if (written <= 0) throw new Error("course-site: поток вывода закрыт");
            offset += written;
          }
        } catch (error) {
          // Сначала дочитываем оба pipe и дожидаемся child: ошибка sink не оставляет его зависшим.
          forwardingError = error;
        }
      }
    } catch (error) {
      try { child.kill("SIGTERM"); } catch { /* child уже мог завершиться */ }
      throw error;
    }
  };
  const results = await Promise.allSettled([
    pump(child.stdout, Deno.stdout, chunks[0]),
    pump(child.stderr, Deno.stderr, chunks[1]),
    child.status,
  ]);
  for (const result of results) if (result.status === "rejected") throw result.reason;
  if (forwardingError !== undefined) throw forwardingError;
  const status = (results[2] as PromiseFulfilledResult<Deno.CommandStatus>).value;
  const concatenate = (parts: Uint8Array[]) => {
    const value = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
    let offset = 0;
    for (const part of parts) { value.set(part, offset); offset += part.length; }
    return value;
  };
  return { ...status, stdout: concatenate(chunks[0]), stderr: concatenate(chunks[1]) };
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
    const command = new Deno.Command(tool, {
      args,
      cwd,
      env: observed ? __metrics.childEnv({ ...Deno.env.toObject(), ...env }) : childEnv,
      clearEnv: observed,
      stdout: "piped",
      stderr: "piped",
    });
    result = forward ? await liveOutput(command) : await command.output();
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
