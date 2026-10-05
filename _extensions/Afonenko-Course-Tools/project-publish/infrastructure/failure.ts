import type {
  BuildState,
  FailureContext,
  Integration,
} from "../domain/model.ts";
import { context, failurePaths } from "./attempt.ts";
import { integrations } from "./integrations.ts";
import { within } from "./files.ts";
import { quarto } from "./process.ts";
import { activeProfiles, profileArguments } from "./profiles.ts";

export interface FailurePoint {
  phase: FailureContext["failure"]["phase"];
  operation: FailureContext["failure"]["operation"];
  namespace?: string;
  format?: FailureContext["format"];
  output?: string;
  stage?: string;
}
const notified = new WeakSet<BuildState>();
const registrations = new WeakMap<BuildState, {
  root: string;
  sourceRoot: string;
  profiles: string[];
  configured: string[];
  callbacks: string[];
}>();
const compositions = new WeakMap<
  object,
  { primary: unknown; failures: unknown[] }
>();

export function registerFailureIntegrations(
  state: BuildState,
  adapters: Integration[],
) {
  const paths = [
    ...new Set(
      state.workspace.integrations.filter((_, index) =>
        typeof adapters[index].onFailure === "function"
      ),
    ),
  ];
  registrations.set(state, {
    root: state.workspace.root,
    sourceRoot: state.sourceRoot,
    profiles: [...state.workspace.profiles],
    configured: [...state.workspace.integrations],
    callbacks: [...paths],
  });
  if (paths.length) state.failureIntegrations = paths;
}
function equalPaths(actual: unknown, expected: string[]): boolean {
  return Array.isArray(actual) && actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}
async function authenticateRegistration(state: BuildState): Promise<void> {
  const w = state.workspace;
  const registration = registrations.get(state);
  if (registration) {
    if (
      w.root !== registration.root ||
      state.sourceRoot !== registration.sourceRoot ||
      !equalPaths(w.profiles, registration.profiles) ||
      !equalPaths(w.integrations, registration.configured) ||
      !equalPaths(state.failureIntegrations ?? [], registration.callbacks)
    ) {
      throw new Error(
        "Публикация: повреждена исходная регистрация failure callbacks",
      );
    }
    return;
  }
  const requested = activeProfiles();
  if (!equalPaths(w.profiles, requested)) {
    throw new Error(
      "Публикация: профиль регистрации failure callbacks не соответствует текущему запросу",
    );
  }
  const inspected = JSON.parse(
    await quarto(
      ["inspect", state.sourceRoot, ...profileArguments(requested)],
      state.sourceRoot,
      { QUARTO_PROFILE: "", QUARTO_PROJECT_OUTPUT_DIR: "" },
    ),
  );
  const pub = inspected.config?.["project-publish"];
  const declaration = pub?.integrations ?? [];
  if (
    !pub || typeof pub !== "object" || Array.isArray(pub) ||
    !Array.isArray(declaration) ||
    declaration.some((path) => typeof path !== "string") ||
    !equalPaths(w.integrations, declaration.map((path) => within(w.root, path)))
  ) {
    throw new Error(
      "Публикация: регистрация failure callbacks не соответствует конфигурации снимка",
    );
  }
}
function scalarText(value: unknown, fallback: string): string {
  if (
    value !== null && (typeof value === "object" || typeof value === "function")
  ) return fallback;
  try {
    return String(value);
  } catch {
    return fallback;
  }
}
function summary(error: unknown): { name: string; message: string } {
  try {
    return error instanceof Error
      ? {
        name: scalarText(error.name, "Error"),
        message: scalarText(
          error.message,
          "Недоступное описание исходного отказа",
        ),
      }
      : {
        name: typeof error,
        message: scalarText(error, "Недоступное описание исходного отказа"),
      };
  } catch {
    return { name: "Error", message: "Недоступное описание исходного отказа" };
  }
}
export function failureMessage(error: unknown): string {
  return summary(error).message;
}
export function logFailure(message: string, error: unknown): void {
  try {
    console.error(`${message}: ${failureMessage(error)}`);
  } catch { /* Display cannot replace the refusal or committed result. */ }
}
/** Diagnostics never throw through rollback/cleanup or certify completion. */
export async function notifyFailure(
  state: BuildState,
  error: unknown,
  point: FailurePoint,
): Promise<unknown[]> {
  if (notified.has(state)) return [];
  notified.add(state);
  const failures: unknown[] = [];
  const description = summary(error);
  let paths: string[];
  try {
    paths = failurePaths(state);
    if (paths.length) await authenticateRegistration(state);
  } catch (failure) {
    return [failure];
  }
  for (const path of paths) {
    try {
      const [adapter] = await integrations(state.workspace, state.sourceRoot, [
        path,
      ]);
      if (typeof adapter.onFailure !== "function") {
        throw new Error("Публикация: зарегистрированный onFailure отсутствует");
      }
      const { phase, operation, ...fields } = point;
      await adapter.onFailure({
        ...context(state),
        ...structuredClone(fields),
        failure: { phase, operation, error: { ...description } },
      });
    } catch (failure) {
      failures.push(failure);
    }
  }
  return failures;
}
export function failureError(
  primary: unknown,
  failures: unknown[],
  message?: string,
): unknown {
  if (!failures.length) return primary;
  const previous = primary !== null && typeof primary === "object"
    ? compositions.get(primary)
    : undefined;
  const original = previous ? previous.primary : primary;
  const combined = [...(previous?.failures ?? []), ...failures];
  const aggregate = new AggregateError(
    [original, ...combined],
    message === undefined
      ? `Публикация исходный отказ: ${
        summary(primary).message
      }; диагностика/очистка также отказала`
      : scalarText(message, "Недоступное описание отказа"),
    { cause: original },
  );
  compositions.set(aggregate, { primary: original, failures: combined });
  return aggregate;
}
