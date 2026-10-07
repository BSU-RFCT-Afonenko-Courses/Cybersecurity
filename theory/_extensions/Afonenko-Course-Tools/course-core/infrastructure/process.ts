export function quartoExecutable(): string { return Deno.env.get("QUARTO") || "quarto"; }
export async function command(executable: string, args: string[], cwd: string, env: Record<string, string> = {}): Promise<string> {
  let result: Deno.CommandOutput;
  try {
    result = await new Deno.Command(executable, { args, cwd, env, stdout: "piped", stderr: "piped" }).output();
  } catch (cause) {
    if (!Object.values(Deno.errors).some(kind => cause instanceof kind)) throw cause;
    const error = new Error(`Не удалось запустить инструмент ${executable}`, { cause });
    error.name = "ExternalToolFailure";
    throw Object.assign(error, { tool: executable, exitCode: undefined, stdout: "", stderr: "" });
  }
  const stdout = new TextDecoder().decode(result.stdout), stderr = new TextDecoder().decode(result.stderr);
  if (!result.success) {
    const error = new Error(`${executable} ${args[0] ?? ""}: внешний инструмент завершился с кодом ${result.code}\n${stdout}${stderr}`, { cause: result });
    error.name = "ExternalToolFailure";
    throw Object.assign(error, { tool: executable, exitCode: result.code, stdout, stderr });
  }
  if (stderr) await Deno.stderr.write(result.stderr);
  return stdout;
}
