export interface DiagnosticContext {
  source?: string;
  id?: string;
  field?: string;
  related?: {source?: string; id?: string; field?: string}[];
  hint?: string;
}
export function diagnostic(code: string, message: string, context: DiagnosticContext = {}, cause?: unknown): Error & {code: string} {
  const location = (value: {source?: string; id?: string; field?: string}) => [
    value.source && "источник=" + value.source,
    value.id && "объект=" + value.id,
    value.field && "поле=" + value.field,
  ].filter(Boolean).join(", ");
  const parts = [code + ": " + message, location(context),
    ...(context.related ?? []).map(value => "связано: " + location(value)),
    context.hint && "подсказка=" + context.hint].filter(Boolean);
  const error = new Error(parts.join("; "), cause === undefined ? undefined : {cause});
  error.name = "ExtensionDiagnostic";
  return Object.assign(error, {code});
}
