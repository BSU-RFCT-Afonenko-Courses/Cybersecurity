import {
  assignmentBeforeChild,
  assignmentChild,
  assignmentQuarto,
} from "../runtime/assignment-execution.ts";
import { createMetrics as __createMetrics } from "../observability/bridge.ts";
const __metrics = __createMetrics("course-core");
export function quartoExecutable(): string {
  return assignmentQuarto() ?? Deno.env.get("QUARTO") ?? "quarto";
}
export async function command(
  executable: string,
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
): Promise<string> {
  return await execute(executable, args, cwd, env);
}
/** Внутренний transport JSON через stdin; публичный command API неизменён. */
export async function commandInput(
  executable: string,
  args: string[],
  cwd: string,
  input: string,
  env: Record<string, string> = {},
): Promise<string> {
  return await execute(executable, args, cwd, env, input);
}
async function execute(
  executable: string,
  args: string[],
  cwd: string,
  env: Record<string, string>,
  input?: string,
): Promise<string> {
  let result: Deno.CommandOutput;
  try {
    const context = __metrics.childEnv(env);
    const childOptions = context === env ? { env } : {
      env: __metrics.childEnv({ ...Deno.env.toObject(), ...env }),
      clearEnv: true,
    };
    await assignmentBeforeChild();
    const qualified = assignmentChild(executable, args, cwd, env);
    const tool = new Deno.Command(qualified?.executable ?? executable, {
      args,
      cwd,
      ...(qualified?.options ?? childOptions),
      ...(input === undefined ? {} : { stdin: "piped" as const }),
      stdout: "piped",
      stderr: "piped",
    });
    if (input === undefined) {
      result = await tool.output();
    } else {
      const child = tool.spawn(), writer = child.stdin.getWriter();
      // Дренируем оба output потока одновременно с записью: большой JSON и
      // большой stdout не должны взаимно блокировать pipe. Ошибка stdin не
      // скрывает реальный ненулевой exit/stderr завершившегося инструмента.
      const written = (async () => {
        try {
          await writer.write(new TextEncoder().encode(input));
          await writer.close();
        } catch (cause) {
          try {
            await writer.abort(cause);
          } catch { /* pipe уже закрыт */ }
          throw cause;
        } finally {
          writer.releaseLock();
        }
      })();
      const [write, output] = await Promise.allSettled([
        written,
        child.output(),
      ]);
      if (output.status === "rejected") throw output.reason;
      result = output.value;
      if (write.status === "rejected" && result.success) throw write.reason;
    }
  } catch (cause) {
    if (!Object.values(Deno.errors).some((kind) => cause instanceof kind)) {
      throw cause;
    }
    const error = new Error(`Не удалось запустить инструмент ${executable}`, {
      cause,
    });
    error.name = "ExternalToolFailure";
    throw Object.assign(error, {
      tool: executable,
      exitCode: undefined,
      stdout: "",
      stderr: "",
    });
  }
  const stdout = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })
      .decode(result.stdout),
    stderr = new TextDecoder().decode(result.stderr);
  if (!result.success) {
    const error = new Error(
      `${executable} ${
        args[0] ?? ""
      }: внешний инструмент завершился с кодом ${result.code}\n${stdout}${stderr}`,
      { cause: result },
    );
    error.name = "ExternalToolFailure";
    throw Object.assign(error, {
      tool: executable,
      exitCode: result.code,
      stdout,
      stderr,
    });
  }
  if (stderr) await Deno.stderr.write(result.stderr);
  return stdout;
}

// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
quartoExecutable = __metrics.wrapSync({
  id: "course-core.infrastructure.process.quartoExecutable",
  kind: "command",
}, quartoExecutable);
// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
command = __metrics.wrapAsync({
  id: "course-core.infrastructure.process.command",
  kind: "command",
}, command);

// @ts-expect-error JS допускает замену function binding; это внутренний transport того же command phase.
commandInput = __metrics.wrapAsync({
  id: "course-core.infrastructure.process.command",
  kind: "command",
}, commandInput);
