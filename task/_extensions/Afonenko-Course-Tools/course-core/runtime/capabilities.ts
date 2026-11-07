import { fail } from "../contracts/project.ts";
// Callback-local guards attach to exact public values; serialized DTOs carry no capability.
const guards = new WeakMap<
  object,
  {
    root: string;
    assert: () => Promise<void>;
    resource?: (
      source: string,
      target: string,
    ) => Promise<Uint8Array | undefined>;
  }
>();
export function bindNativeValue(
  value: object,
  root: string,
  assert: () => Promise<void>,
  resource?: (
    source: string,
    target: string,
  ) => Promise<Uint8Array | undefined>,
) {
  guards.set(value, { root, assert, resource });
}
export function inheritNativeValue(source: object, target: object) {
  const guard = guards.get(source);
  if (guard) guards.set(target, guard);
}
export async function assertNativeValue(value: object, root: string) {
  const guard = guards.get(value);
  if (!guard) {
    fail(
      "CONDITION_AUTHORITY",
      "Материализация требует точное значение текущей native операции",
    );
  }
  if (guard.root !== root) {
    fail(
      "CONDITION_BINDING",
      "Native bank и code project принадлежат разным owner",
    );
  }
  await guard.assert();
}

/** Только observed bytes той же complete operation и того же owning документа. */
export async function readNativeResource(
  value: object,
  root: string,
  source: string,
  target: string,
) {
  await assertNativeValue(value, root);
  const bytes = await guards.get(value)!.resource?.(source, target);
  return bytes ? new Uint8Array(bytes) : undefined;
}
