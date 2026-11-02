import { withAssignmentExecution } from "./runtime/assignment-execution.ts";
/** Инертная точка existing capture scope: до gate не импортирует project/metrics runtime. */
import { assertAssignmentRuntime } from "./runtime/assignment-admission.ts";
import { assertSources } from "./runtime/source-snapshot.ts";
import { prepareAssignment } from "./runtime/assignment-admission.ts";
import type { AssignmentPreparation } from "./runtime/assignment-admission.ts";
import type {
  NativeCaptureReservation,
  NativeCaptureScopeOptions,
} from "./runtime/contracts.ts";
import type { withNativeCaptureScope as OrdinaryCapture } from "./runtime/operation.ts";
export type NativeAssignmentPreparation = AssignmentPreparation;
export async function withNativeCaptureScope<T>(
  reservation: NativeCaptureReservation,
  options: NativeCaptureScopeOptions | NativeAssignmentPreparation,
  use: Parameters<typeof OrdinaryCapture<T>>[2],
): Promise<T> {
  if (options && Object.hasOwn(options, "assignment")) {
    const fixedReservation = Object.freeze({ ...reservation });
    const prepared = await prepareAssignment(
      fixedReservation,
      options as AssignmentPreparation,
    );
    return await withAssignmentExecution(prepared.profile, async () => {
      const runtime = await import("./runtime/operation.ts");
      return await runtime.withPreparedNativeCaptureScope(
        prepared,
        fixedReservation,
        use,
      );
    }, async () => {
      await assertSources(prepared.source);
      await assertAssignmentRuntime(
        prepared.runtime,
        prepared.source.root,
        prepared,
      );
    });
  }
  const runtime = await import("./runtime/operation.ts");
  return await runtime.withNativeCaptureScope(
    reservation,
    options as NativeCaptureScopeOptions,
    use,
  );
}

export type {
  NativeCaptureCommand,
  NativeCaptureScope,
  NativePreparedLease,
  NativePreparedOperation,
} from "./runtime/prepared-operation.ts";
