export function executable(): string {
  return Deno.env.get("QUARTO") || "quarto";
}
export async function quarto(
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
  forward = false,
): Promise<string> {
  const start = performance.now();
  const tool = executable();
  let result: Deno.CommandOutput;
  try {
    result = await new Deno.Command(tool, {
      args,
      cwd,
      env,
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
  const trace = Deno.env.get("COURSE_BUILD_TRACE");
  if (trace) {
    await Deno.writeTextFile(
      trace,
      JSON.stringify({
        kind: args[0],
        args,
        cwd,
        elapsedMs: performance.now() - start,
        exitCode: result.code,
      }) + "\n",
      { append: true },
    );
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
