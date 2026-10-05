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
  const result = await new Deno.Command(executable(), {
    args,
    cwd,
    env,
    stdout: "piped",
    stderr: "piped",
  }).output();
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
    throw new Error(
      `course-site native ${
        args[0]
      } failed (${result.code}) in ${cwd}\n${out}\n${err}`,
    );
  }
  return out;
}
export function profileArguments(profiles: string[]): string[] {
  return profiles.length ? ["--profile", profiles.join(",")] : [];
}
