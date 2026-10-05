import type { BuildState, Workspace } from "../domain/model.ts";
import { unchanged } from "../domain/attempt.ts";
import { failureError, type FailurePoint } from "../infrastructure/failure.ts";
export interface BuildPorts {
  workspace(): Promise<Workspace>;
  clearState(w: Workspace): Promise<void>;
  render(w: Workspace): Promise<BuildState>;
  saveState(w: Workspace, state: BuildState): Promise<void>;
  loadState(): Promise<BuildState>;
  preparePreview(w: Workspace): Promise<void>;
  publish(w: Workspace, state: BuildState): Promise<void>;
  cleanup(w: Workspace, state: BuildState, failed?: boolean): Promise<void>;
  failure?(
    state: BuildState,
    error: unknown,
    point: FailurePoint,
  ): Promise<unknown[]>;
}
async function diagnostics(
  ports: BuildPorts,
  state: BuildState,
  error: unknown,
  point: FailurePoint,
): Promise<unknown[]> {
  try {
    return await ports.failure?.(state, error, point) ?? [];
  } catch (failure) {
    return [failure];
  }
}
export async function prepare(ports: BuildPorts): Promise<void> {
  const w = await ports.workspace();
  await ports.clearState(w);
  let state: BuildState | undefined;
  let operation: FailurePoint["operation"] = "save-state";
  try {
    state = await ports.render(w);
    await ports.saveState(w, state);
    operation = "preview";
    await ports.preparePreview(w);
  } catch (error) {
    const failures = state
      ? await diagnostics(ports, state, error, {
        phase: "preparation",
        operation,
      })
      : [];
    try {
      await ports.clearState(w);
    } catch (cleanup) {
      failures.push(cleanup);
    }
    throw failureError(error, failures);
  }
}
export async function finalize(ports: BuildPorts): Promise<void> {
  const state = await ports.loadState();
  let failed = true;
  let rejected = false;
  let primary: unknown;
  const failures: unknown[] = [];
  try {
    const w = await ports.workspace();
    unchanged(w, state);
    await ports.publish(state.workspace, state);
    failed = false;
  } catch (error) {
    rejected = true;
    primary = error;
    failures.push(
      ...await diagnostics(ports, state, error, {
        phase: "publication",
        operation: "workspace",
      }),
    );
  }
  try {
    await ports.cleanup(state.workspace, state, failed);
  } catch (cleanup) {
    if (!rejected) throw cleanup;
    failures.push(cleanup);
  }
  if (rejected) throw failureError(primary, failures);
}
