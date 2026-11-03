import type { NativeCaptureCommand } from "./prepared-operation.ts";
import { AsyncLocalStorage } from "node:async_hooks";
import { fail } from "../contracts/project.ts";
import type { AssignmentProducerProfile } from "./assignment-producer-profiles.ts";
// Callback-local only; ordinary commands retain their existing environment path.
type Execution = {
  profile: AssignmentProducerProfile;
  beforeChild?: () => Promise<void>;
  lives: { active: boolean }[];
  token?: string;
  probe?: { temporaryInput: string; originalInput: string; technical: string };
  contractProbe?: { temporaryOwner: string; guard: () => void };
};
const current = new AsyncLocalStorage<Execution>();
const carrierGuard = new AsyncLocalStorage<() => Promise<void>>();
function changed(message: string): never {
  return fail("BODY.PRODUCER_INPUT_CHANGED", message);
}
function execution() {
  const state = current.getStore();
  if (state?.lives.some((life) => !life.active)) {
    fail("OPERATION_EXPIRED", "Assignment execution scope истёк");
  }
  return state;
}
async function enter<T>(
  state: Omit<Execution, "lives"> & { lives?: Execution["lives"] },
  use: () => Promise<T>,
) {
  const life = { active: true };
  try {
    return await current.run(
      { ...state, lives: [...state.lives ?? [], life] },
      use,
    );
  } finally {
    life.active = false;
  }
}
export function withAssignmentExecution<T>(
  profile: AssignmentProducerProfile,
  use: () => Promise<T>,
  beforeChild?: () => Promise<void>,
) {
  return enter({ profile, beforeChild }, use);
}
/** Вложенная граница batch; наследует profile/token/probes и истекает отдельно. */
export function withAssignmentBeforeChild<T>(
  beforeChild: () => Promise<void>,
  use: () => Promise<T>,
  life: { active: boolean },
) {
  const state = execution();
  return state
    ? enter({ ...state, beforeChild, lives: [...state.lives, life] }, use)
    : use();
}
/** Internal Core lifecycle only: the reservation created this exact token. */
export function withAssignmentCaptureChild<T>(
  token: string,
  use: () => Promise<T>,
) {
  const state = execution();
  if (!state) changed("Нет assignment execution для capture child");
  return enter({ ...state, token }, use);
}
/** Internal Core A1 instrumentation site, not a public template/provider. */
export function withAssignmentA1Probe<T>(
  probe: NonNullable<Execution["probe"]>,
  use: () => Promise<T>,
) {
  const state = execution();
  if (!state) return use();
  return enter({ ...state, probe: { ...probe } }, use);
}
/** Внутренний вызов только из live operation closure после проверки SAME S/coverage. */
export async function withAssignmentContractProbe<T>(
  probe: {
    temporaryOwner: string;
    originalInputs: readonly string[];
    format: string;
    guard: () => void;
    beforeSpawn?: () => Promise<void>;
  },
  use: () => Promise<T>,
) {
  const state = execution();
  const run = () =>
    carrierGuard.run(async () => {
      probe.guard();
      await probe.beforeSpawn?.();
      probe.guard();
    }, use);
  if (!state) return await run();
  probe.guard();
  const profiles = state.profile.native.actualProfiles.join(",");
  if (
    probe.format !== "html" || !probe.temporaryOwner.startsWith("/") ||
    /[\\\0]/.test(probe.temporaryOwner) ||
    probe.temporaryOwner.split("/").slice(1).some((part) =>
      !part || part === "." || part === ".."
    ) ||
    probe.temporaryOwner === state.profile.root ||
    probe.temporaryOwner.startsWith(state.profile.root + "/") ||
    !probe.originalInputs.length ||
    new Set(probe.originalInputs).size !== probe.originalInputs.length ||
    probe.originalInputs.some((input) =>
      !state.profile.native.renders.some((allowed) =>
        JSON.stringify(allowed) ===
          JSON.stringify([
            "inspect",
            input,
            ...(profiles ? ["--profile", profiles] : []),
          ])
      )
    )
  ) {
    changed("Aggregate probe вне принятых project inputs/format");
  }
  return await enter({
    ...state,
    contractProbe: { temporaryOwner: probe.temporaryOwner, guard: probe.guard },
  }, run);
}
export async function assignmentBeforeChild() {
  const state = execution();
  state?.contractProbe?.guard();
  await state?.beforeChild?.();
  state?.contractProbe?.guard();
  await carrierGuard.getStore()?.();
  execution();
}
export function assignmentQuarto() {
  return execution()?.profile.native.executable;
}
export function assignmentChild(
  executable: string,
  args: readonly string[],
  cwd: string,
  env: Record<string, string> = {},
) {
  const state = execution();
  if (!state) return undefined;
  const profile = state.profile;
  const target = executable === "quarto"
    ? profile.native.executable
    : executable;
  if (
    !target || !target.startsWith("/") ||
    target !== profile.native.executable ||
    !profile.runtime.files.some((row) => row.path === target)
  ) {
    changed("Внешний executable вне квалифицированного command closure");
  }
  if (cwd !== profile.root) changed("Неизвестный assignment cwd");
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string")) {
    changed("Неверный assignment argv");
  }
  state.contractProbe?.guard();
  const exactContractProbe = !!state.contractProbe &&
    JSON.stringify(args) ===
      JSON.stringify(["inspect", state.contractProbe.temporaryOwner]);
  let qualifiedArgs = [...args];
  const base = profile.native.actualProfiles.join(",");
  const technicalProfiles = state.probe
    ? [...profile.native.actualProfiles, state.probe.technical].join(",")
    : undefined;
  let exactProbe = false;
  if (
    state.probe && target === profile.native.executable &&
    JSON.stringify(args) === JSON.stringify([
        "inspect",
        state.probe.temporaryInput,
        "--profile",
        technicalProfiles,
      ])
  ) {
    exactProbe = true;
    qualifiedArgs = [
      "inspect",
      state.probe.originalInput,
      ...(base ? ["--profile", base] : []),
    ];
  }
  if (
    !exactContractProbe &&
    !profile.native.renders.some((allowed) =>
      JSON.stringify(allowed) === JSON.stringify(qualifiedArgs)
    )
  ) {
    changed("Native argv вне точного квалифицированного перечня");
  }
  const fixed = { ...profile.native.environment };
  if (Object.hasOwn(fixed, "COURSE_CORE_CAPTURE_TOKEN")) {
    changed("Correlation не является фиксированным profile environment");
  }
  for (const [key, value] of Object.entries(env)) {
    if (key === "QUARTO_PROFILE") {
      if (
        exactContractProbe
          ? value !== ""
          : value !== base && !(exactProbe && value === technicalProfiles)
      ) {
        changed("Неквалифицированный child profiles");
      }
    } else if (key === "COURSE_CORE_CAPTURE_TOKEN") {
      if (!state.token || value !== state.token) {
        changed("Чужой child correlation");
      }
    } else if (fixed[key] !== value) {
      changed("Неквалифицированный child environment " + key);
    }
    fixed[key] = value;
  }
  return {
    executable: target,
    options: { args: [...args], cwd, env: fixed, clearEnv: true as const },
  };
}
/** Private implementation of the existing capture command seam. */
export function runAssignmentCaptureChild(
  token: string,
  command: NativeCaptureCommand,
) {
  return withAssignmentCaptureChild(token, async () => {
    const profile = execution()!.profile;
    const qualified = assignmentChild("quarto", command.args, profile.root, {
      COURSE_CORE_CAPTURE_TOKEN: token,
      QUARTO_PROFILE: profile.native.actualProfiles.join(","),
    })!;
    await assignmentBeforeChild();
    const result = await new Deno.Command(qualified.executable, {
      ...qualified.options,
      stdout: command.stdout ?? "piped",
      stderr: command.stderr ?? "piped",
      ...(command.timeoutMs
        ? { signal: AbortSignal.timeout(command.timeoutMs) }
        : {}),
    }).output();
    if (!result.success) {
      fail(
        "OPERATION_INCOMPLETE",
        "Native capture child failed: " + result.code,
      );
    }
    return result;
  });
}
/** Existing helper scratch data stays in an approved service area before child fences. */
export async function assignmentServiceDirectory(
  root: string,
  kind: "citations" | "validation",
) {
  const profile = current.getStore()?.profile;
  if (!profile) return undefined;
  if (root !== profile.root) {
    fail("BODY.PRODUCER_INPUT_CHANGED", "Чужой assignment service owner");
  }
  const { safeParent } = await import("../artifacts/files.ts");
  const directory = root + "/_generated/course-spec/assignment-work/" + kind;
  await safeParent(directory);
  await Deno.mkdir(directory, { recursive: true, mode: 0o700 });
  return directory;
}
