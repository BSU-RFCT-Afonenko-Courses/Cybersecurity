export interface DiagnosticContext {
  source?: string;
  id?: string;
  field?: string;
  related?: { source?: string; id?: string; field?: string }[];
  hint?: string;
}
function contextText(context: DiagnosticContext): string {
  return [
    context.source && `источник: ${context.source}`,
    context.id && `ID: ${context.id}`,
    context.field && `поле: ${context.field}`,
    ...(context.related || []).map((item) =>
      `связано: ${
        [item.source, item.id, item.field].filter(Boolean).join("; ")
      }`
    ),
    context.hint && `подсказка: ${context.hint}`,
  ].filter(Boolean).join("; ");
}
export function diagnostic(
  code: string,
  message: string,
  context: DiagnosticContext = {},
  cause?: unknown,
): Error & { code: string } {
  const details = contextText(context);
  const error = new Error(
    `[${code}] course-site: ${message}${details ? ` (${details})` : ""}`,
    cause === undefined ? undefined : { cause },
  );
  error.name = "ExtensionDiagnostic";
  return Object.assign(error, { code });
}
/** Add caller provenance only to this component's own diagnostics. */
export function contextualize(
  error: unknown,
  context: DiagnosticContext,
): unknown {
  if (error instanceof Error && error.name === "ExtensionDiagnostic") {
    const details = contextText(context);
    if (details) error.message += ` (${details})`;
  }
  return error;
}

/** Only expected component/foreign tool errors are printed without a stack. */
export async function runHook(action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "ExtensionDiagnostic" ||
        error.name === "ExternalToolFailure")
    ) {
      console.error(error.message);
      Deno.exit(1);
    }
    throw error;
  }
}
