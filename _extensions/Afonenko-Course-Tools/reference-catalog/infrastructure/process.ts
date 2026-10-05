export async function quarto(args: string[], cwd: string, extra: Record<string, string> = {}): Promise<string> {
  const command = Deno.env.get("QUARTO") || Deno.env.get("QRC_QUARTO") || "quarto";
  const result = await new Deno.Command(command, { args, cwd, env: extra, stdout: "piped", stderr: "piped" }).output();
  const out = new TextDecoder().decode(result.stdout);
  const err = new TextDecoder().decode(result.stderr);
  if (!result.success) throw new Error(`QRC команда quarto ${args[0]} завершилась с кодом ${result.code}\n${out}\n${err}`);
  if (args[0] === "render" && /(?:WARNING|WARN:)/.test(err)) throw new Error(`QRC предупреждения при сборке\n${err}`);
  return out;
}
