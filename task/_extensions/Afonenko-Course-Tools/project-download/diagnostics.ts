export interface DiagnosticContext {
  source?: string;
  id?: string;
  field?: string;
  related?: { source?: string; id?: string; field?: string }[];
  hint?: string;
}
/** Progress project scripts идёт только в stderr и не требует новых env permissions. */
export function reportProgress(message: string): boolean {
  try {
    if (Deno.env.get("QUARTO_PROJECT_SCRIPT_QUIET") === "1") return false;
  } catch {
    return false;
  }
  console.error(`project-download: ${message}`);
  return true;
}
export async function progress<T>(stage: string, action: () => Promise<T>): Promise<T> {
  if (!reportProgress(`${stage} — начало`)) return await action();
  const started = performance.now();
  try {
    const value = await action();
    console.error(`project-download: ${stage} — готово (${((performance.now() - started) / 1000).toFixed(1)} с)`);
    return value;
  } catch (error) {
    console.error(`project-download: ${stage} — ошибка (${((performance.now() - started) / 1000).toFixed(1)} с)`);
    throw error;
  }
}
export function diagnostic(
  code: string,
  message: string,
  context: DiagnosticContext = {},
  cause?: unknown,
): Error & { code: string } {
  const place = (value: { source?: string; id?: string; field?: string }) =>
    [
      value.source && `файл: ${value.source}`,
      value.id && `ID: ${value.id}`,
      value.field && `поле: ${value.field}`,
    ].filter(Boolean).join(", ");
  const details = [
    place(context),
    ...(context.related ?? []).map((value) => `связано: ${place(value)}`),
    context.hint && `Подсказка: ${context.hint}`,
  ].filter(Boolean);
  return Object.assign(
    new Error(
      `${code}: ${message}${details.length ? "\n" + details.join("\n") : ""}`,
      { cause },
    ),
    { name: "ExtensionDiagnostic", code },
  );
}
/** Исходные потоки внешнего инструмента не получают собственный semantic ID. */
export function externalFailure(
  tool: string,
  result?: { code: number; stdout: Uint8Array; stderr: Uint8Array },
  cause?: unknown,
): Error & {
  tool: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
} {
  const decode = new TextDecoder();
  const stdout = result ? decode.decode(result.stdout) : "";
  const stderr = result ? decode.decode(result.stderr) : "";
  const exitCode = result?.code ?? null;
  const message = [
    `Инструмент ${tool}: ${
      exitCode === null ? "не удалось запустить" : `код завершения ${exitCode}`
    }`,
    stdout.trimEnd(),
    stderr.trimEnd(),
    !result && cause instanceof Error ? cause.message : "",
  ].filter(Boolean).join("\n");
  return Object.assign(
    new Error(message, { cause: cause === undefined ? result : cause }),
    { name: "ExternalToolFailure", tool, exitCode, stdout, stderr },
  );
}
