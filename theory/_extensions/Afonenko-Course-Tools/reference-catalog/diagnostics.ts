/** Локальный formatter: без IO, реестра правил и межпакетных зависимостей. */
export interface DiagnosticContext {
  source?: string; id?: string; field?: string;
  related?: { source?: string; id?: string; field?: string }[];
  hint?: string;
}
export function diagnostic(code: string, message: string, context: DiagnosticContext = {}, cause?: unknown): Error & { code: string } {
  const location = (item: { source?: string; id?: string; field?: string }) => [
    item.source === undefined ? undefined : `источник=${item.source}`,
    item.id === undefined ? undefined : `ID=${item.id}`,
    item.field === undefined ? undefined : `поле=${item.field}`,
  ].filter(Boolean).join("; ");
  const details = [location(context), ...(context.related ?? []).map(item => `связано: ${location(item)}`),
    context.hint === undefined ? undefined : `подсказка: ${context.hint}`].filter(Boolean);
  const error = new Error(`${code}: ${message}${details.length ? `\n${details.join("\n")}` : ""}`, cause === undefined ? undefined : { cause });
  error.name = "ExtensionDiagnostic";
  return Object.assign(error, { code });
}
