export function quartoExecutable(): string { return Deno.env.get("QUARTO") || "quarto"; }
export async function command(executable: string, args: string[], cwd: string, env: Record<string, string> = {}): Promise<string> {
  const result = await new Deno.Command(executable, { args, cwd, env, stdout: "piped", stderr: "piped" }).output();
  const output = new TextDecoder().decode(result.stdout), errors = new TextDecoder().decode(result.stderr);
  if (!result.success || /(?:WARNING|WARN:)/.test(errors)) throw new Error(`${executable} ${args[0]} завершился с ошибкой (${result.code})\n${output}\n${errors}`);
  return output;
}
