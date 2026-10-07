/** Узкая CLI-граница: известные ошибки печатаются один раз, неизвестные сохраняют stack. */
export async function runCli(main: () => Promise<unknown>): Promise<void> {
  try { await main(); }
  catch (error) {
    if (!(error instanceof Error) || !["ExtensionDiagnostic", "ExternalToolFailure"].includes(error.name)) throw error;
    let current: unknown = error;
    const seen = new Set<Error>();
    while (current instanceof Error && !seen.has(current)) {
      seen.add(current);
      const expected = ["ExtensionDiagnostic", "ExternalToolFailure"].includes(current.name);
      console.error(expected ? current.message : current.stack ?? current.message);
      current = current.cause;
    }
    Deno.exit(1);
  }
}
