import type {
  ProjectContext,
  ProjectContextView,
  ProjectContractContext,
} from "../contracts/project.ts";
import { SupportedQuartoVersionSchema } from "../infrastructure/quarto-version.ts";
import { operationProjectContextReuse } from "../infrastructure/project-context.ts";
import type { NativeOperationProjectContextBatch } from "../infrastructure/project-context.ts";
import { ProjectContextRequestSchema } from "../contracts/project.ts";
import type { ProjectContextRequest } from "../contracts/project.ts";
import { buildAssignmentProvenance } from "./assignment-provenance.ts";
import { NativeProjectFactsCaptureSchema } from "../document/project-facts.ts";
import {
  NativePreparedOperationSchema,
  withPreparedLease,
} from "./prepared-operation.ts";
import type {
  NativeCaptureScope,
  NativePreparedLease,
} from "./prepared-operation.ts";
import {
  addAuthorityMetrics,
  AssignmentAuthorityIdentitySchema,
  authorityCounterNames,
  emptyAuthorityMetrics,
} from "./assignment-authority.ts";
import { assertAssignmentDeclarations } from "./assignment-declarations.ts";
import {
  assignmentProjectRoot,
  assignmentRoleIndex,
} from "./assignment-roles.ts";
import { bindAssignmentCondition } from "./assignment-condition.ts";
import { buildAssignmentBody } from "../body-export/assignment.ts";
import type { AssignmentBodyCache } from "../body-export/assignment.ts";
import type {
  NativeAssignmentDelivery,
  NativeAssignmentDeliveryOptions,
  NativeAssignmentRequest,
} from "./assignment-delivery.ts";
import {
  runAssignmentCaptureChild,
  withAssignmentBeforeChild,
  withAssignmentContractProbe,
  withAssignmentExecution,
} from "./assignment-execution.ts";
import {
  assertAssignmentRuntime,
  assignmentProfile,
  consumeAssignmentAdmission,
} from "./assignment-admission.ts";
import type { AssignmentAdmission } from "./assignment-admission.ts";
import {
  assertSources,
  excluded,
  hash,
  ownedPhysical,
  regular,
  signature,
  snapshot,
  sourceIndex,
} from "./source-snapshot.ts";
import {
  toolCacheContainer,
  toolCachePath,
} from "../infrastructure/tool-cache.ts";
import { validateNativeRelease } from "../release/validate.ts";
import type {
  NativeAdapterValidator,
  NativeReleaseRequest,
} from "../release/contracts.ts";
import { bindNativeValue } from "./capabilities.ts";
import { dirname, join, relative, resolve } from "stdlib/path";
// @deno-types="../vendor/zod/v4/index.d.ts"
import { z } from "../vendor/zod/v4/index.js";
import { boundInput, fail } from "../contracts/project.ts";
import {
  decode,
  EarlyDocumentSchema,
  FinalizedDocumentSchema,
  LateDocumentSchema,
} from "../document/contracts.ts";
import { finalizeDocument } from "../document/finalize.ts";
import { immutable, selectCondition } from "../document/condition.ts";
import { command, quartoExecutable } from "../infrastructure/process.ts";
import { safeParent } from "../artifacts/files.ts";
import { assertArtifactTarget } from "../artifacts/project.ts";
import {
  NativeAssignmentRequestSchema,
  NativeCaptureReservationSchema,
  NativeCaptureScopeOptionsSchema,
  NativeCatalogSchema,
  NativeConditionRequestSchema,
  NativeDocumentRequestSchema,
  NativeOperationExpectationSchema,
  NativeOperationIdentitySchema,
  NativeOperationMetricsSchema,
  NativePendingOperationExpectationSchema,
  NativePendingOperationSchema,
  NativePublicDocumentSchema,
  NativeResourceInventorySchema,
  NativeResourceRequestSchema,
  NativeWebFormatSchema,
} from "./contracts.ts";
import type {
  NativeCaptureReservation,
  NativeCaptureScopeOptions,
  NativeConditionRequest,
  NativeDocumentRequest,
  NativeOperationExpectation,
  NativePendingOperationExpectation,
  NativeResourceRequest,
} from "./contracts.ts";
function observedDelta(value: number | undefined, before: number | undefined) {
  if (typeof value !== "number" || typeof before !== "number") {
    fail("METRICS_UNAVAILABLE", "Fresh capture required for metric delta");
  }
  return value - before;
}
const base = (root: string) => join(root, "_generated/course-spec/native-ts");
const pointer = (root: string) => join(base(root), "active.json");
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const pathSchema = z.string().min(1).refine((s) =>
  !s.startsWith("/") && !s.includes("\\") && !s.includes("\0") &&
  s.split("/").every((p) => p && p !== "." && p !== "..")
);
const rowSchema = z.strictObject({
  path: pathSchema,
  signature: z.string(),
  sha256: z.string(),
});
const nativeCaptureSchema = z.strictObject({
  assignmentDeclarations: z.array(z.unknown()).max(16384).optional(),
  output: z.string(),
  body: z.array(z.unknown()),
  role: z.enum(["exercise-bank", "page"]),
  resources: z.array(
    z.strictObject({
      source: z.string(),
      output: z.string(),
      sha1: z.string().regex(/^[a-f0-9]{40}$/),
    }),
  ),
});
const stateSchema = z.strictObject({
  schema: z.literal("course-native-operation-private-v1"),
  operation: z.uuid(),
  root: z.string(),
  directory: z.string(),
  outputDirectory: z.string(),
  profiles: z.array(z.string()),
  projection: z.enum(["student", "author"]),
  captureWitnesses: z.record(pathSchema, z.uuid()),
  assignment: z.strictObject({
    assessments: z.array(
      z.strictObject({ source: pathSchema, id: z.string().min(1) }),
    ).min(1).max(4096),
    runtime: z.strictObject({
      profile: z.string(),
      authority: AssignmentAuthorityIdentitySchema,
      files: z.array(
        z.strictObject({
          path: z.string(),
          signature: z.string(),
          sha256: z.string(),
        }),
      ),
      directories: z.array(
        z.strictObject({ path: z.string(), names: z.array(z.string()) }),
      ),
      absent: z.array(z.string()),
    }),
  }).optional(),
  invocation: z.string(),
  localInvocation: z.string(),
  inputs: z.array(pathSchema),
  sourcePolicy: z.enum(["general", "static"]).default("general"),
  rows: z.array(rowSchema),
  relevantInputs: z.array(pathSchema),
  ownerInputs: z.array(pathSchema).default([]),
  ownerWitness: z.strictObject({
    quarto: z.strictObject({ version: SupportedQuartoVersionSchema }),
    dir: z.string(),
    config: z.record(z.string(), z.unknown()),
    files: z.strictObject({
      input: z.array(z.string()),
      config: z.array(z.string()),
    }),
  }).optional(),
  configurationInputs: z.array(pathSchema),
  documentInputs: z.record(pathSchema, z.array(pathSchema)),
  memberships: z.record(z.string(), z.array(z.string())),
  metrics: z.strictObject({
    authorityDataReads: z.number().default(0),
    authorityHashBytes: z.number().default(0),
    authorityGraphHashReads: z.number().default(0),
    authorityGraphHashBytes: z.number().default(0),
    authorityPathReads: z.number().default(0),
    authorityDirectoryReads: z.number().default(0),
    authorityTopologyBytes: z.number().default(0),
    inspectCalls: z.number(),
    fullSourceFences: z.number(),
    localSourceFences: z.number(),
    sourceDirectoryReads: z.number(),
    runtimeHashReads: z.number(),
    runtimeHashBytes: z.number().default(0),
    runtimePathReads: z.number().default(0),
    runtimeDirectoryReads: z.number().default(0),
    outputHashReads: z.number(),
    nativeMetadataBytes: z.number(),
    childRenders: z.number(),

    fullWalks: z.number(),
    sourceHashReads: z.number(),
    sourceHashBytes: z.number().optional(),
    resourceHashReads: z.number(),
    nativeResourceHashReads: z.number(),
  }),
});
type State = z.output<typeof stateSchema>;
const completeSchema = z.strictObject({
  state: stateSchema,
  catalog: NativeCatalogSchema,
  documents: z.array(NativePublicDocumentSchema),
  resources: z.array(
    z.strictObject({
      source: pathSchema,
      path: z.string(),
      signature: z.string(),
      sha256: z.string(),
      documents: z.array(pathSchema),
    }),
  ),
  outputs: z.array(rowSchema),
  releaseDocuments: z.array(
    z.strictObject({
      source: pathSchema,
      projectFacts: NativeProjectFactsCaptureSchema.optional(),
      early: EarlyDocumentSchema.omit({ ast: true, occurrences: true }),
      final: FinalizedDocumentSchema.pick({ hasPublicSolution: true }),
    }),
  ),
});
const privateParts =
  /(^|\/)(?:private|reference|solution|solutions|grading-notes|rubric\.md|contract\.md|closed-tests|tests)(\/|$)/i;
const sourcePart =
  /(^|\/)(?:\.[^/]+|_extensions|_freeze|_generated|_site|_book|_output|site_libs|node_modules|build|target|out|__pycache__)(\/|$)|(^|\/)(?:_quarto(?:[-.]|$)|_metadata\.ya?ml$)|\.(?:qmd|rmd|ipynb|class|jar|ya?ml|lua|ts|cue|r|py|sh|toml)$/i;
const ordinary = (path: string) =>
  !privateParts.test(path) && !sourcePart.test(path) &&
  !/(^|\/)check\.sh$/.test(path);
async function runtimeIdentity(
  root: string,
  content = true,
  metrics?: State["metrics"],
  fixedExecutable?: string,
) {
  const requested = fixedExecutable ?? quartoExecutable();
  let path: string | undefined;
  for (
    const candidate of requested.includes("/")
      ? [resolve(root, requested)]
      : (Deno.env.get("PATH") || "").split(":").map((d) =>
        resolve(root, d, requested)
      )
  ) {
    try {
      if ((await Deno.stat(candidate)).isFile) {
        path = candidate;
        break;
      }
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) throw e;
    }
  }
  if (!path) fail("OPERATION_CHANGED", "Quarto executable отсутствует");
  const physical = await Deno.realPath(path), info = await Deno.lstat(physical);
  if (!info.isFile || info.isSymlink) {
    fail("OPERATION_CHANGED", "Quarto executable не regular");
  }
  if (content && metrics) {
    metrics.runtimeHashReads++;
    metrics.runtimeHashBytes += info.size;
  }
  return JSON.stringify({
    requested,
    path,
    physical,
    signature: signature(info),
    ...(content ? { sha256: await hash(await Deno.readFile(physical)) } : {}),
  });
}
async function json(path: string) {
  return JSON.parse(await Deno.readTextFile(path));
}
async function nativeFileSelection(root: string, key: string) {
  const file = Deno.env.get(
    key.replace("QUARTO_PROJECT_", "QUARTO_USE_FILE_FOR_PROJECT_"),
  );
  const content = file ? await Deno.readTextFile(file) : Deno.env.get(key);
  return {
    explicitlyEmpty: content === "",
    files: (content ?? "").split(/\r?\n/).filter(Boolean).map((p) =>
      resolve(root, p)
    ),
  };
}
async function envFiles(root: string, key: string) {
  return (await nativeFileSelection(root, key)).files;
}
/** No-work — только native hook lifecycle, не пустая capture/assignment операция. */
async function invalidateNoWorkHook(root: string) {
  const nativeRoot = Deno.env.get("QUARTO_PROJECT_DIR"),
    output = Deno.env.get("QUARTO_PROJECT_OUTPUT_DIR");
  decode(
    NativeOperationExpectationSchema.shape.profiles,
    (Deno.env.get("QUARTO_PROFILE") || "").split(",").filter(Boolean),
    "OPERATION_BINDING",
  );
  if (
    nativeRoot !== root || await Deno.realPath(Deno.cwd()) !== root ||
    !output || output !== resolve(output) ||
    !output.startsWith(root + "/") || toolCachePath(root, output) ||
    Deno.env.get("COURSE_CORE_CAPTURE_TOKEN") !== undefined
  ) {
    fail(
      "OPERATION_BINDING",
      "Zero-work требует обычного native hook owner/output без capture token",
    );
  }
  await safeParent(output);
  const current = await readOptionalPointer(root);
  if (!current) return;
  await ownedPhysical(root, relative(root, current.directory));
  try {
    await Deno.lstat(join(current.directory, "reservation.json"));
    fail(
      "OPERATION_BINDING",
      "Zero-work не может инвалидировать capture reservation",
    );
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  const state = decode(
    stateSchema,
    await json(
      await regular(
        root,
        relative(root, join(current.directory, "state.json")),
      ),
    ),
    "OPERATION_BINDING",
  );
  if (
    state.root !== root || state.operation !== current.operation ||
    state.directory !== current.directory || state.assignment
  ) fail("OPERATION_BINDING", "Zero-work не принадлежит ordinary operation");
  await withWriter(root, async () => {
    if (!same(await readOptionalPointer(root), current)) {
      fail(
        "OPERATION_CHANGED",
        "Operation pointer заменён во время zero-work hook",
      );
    }
    await Deno.remove(await regular(root, relative(root, pointer(root))));
  });
}
async function assertPrivate(state: State, full = false) {
  if (
    await Deno.realPath(state.root) !== state.root ||
    !same(await json(pointer(state.root)), {
      operation: state.operation,
      directory: state.directory,
    })
  ) fail("OPERATION_CHANGED", "Активная native операция заменена");
  if (state.assignment) {
    await assertAssignmentRuntime(
      state.assignment.runtime,
      state.root,
      state.metrics,
      full,
    );
  }
  const identity = await runtimeIdentity(
    state.root,
    full,
    state.metrics,
    state.assignment
      ? assignmentProfile(state.assignment.runtime, state.root).native
        .executable
      : undefined,
  );
  if (identity !== (full ? state.invocation : state.localInvocation)) {
    fail("OPERATION_CHANGED", "Изменён native runtime/environment");
  }
}
const childSchema = z.strictObject({
  token: z.uuid(),
  inputs: z.array(pathSchema).min(1),
  used: z.boolean(),
  posted: z.boolean(),
});
const reservationSchema = NativeCaptureReservationSchema.extend({
  schema: z.literal("course-native-capture-reservation-v1"),
  operation: z.uuid(),
  directory: z.string(),
  expectedSources: z.array(pathSchema).min(1),
  status: z.enum(["reserved", "prepared", "bound", "failed", "sealed"]),
  children: z.array(childSchema),
});
type Reservation = z.output<typeof reservationSchema>;
const reservationPath = (r: Pick<Reservation, "directory">) =>
  join(r.directory, "reservation.json");
async function readOptionalPointer(root: string) {
  try {
    const current = await json(
      await regular(root, relative(root, pointer(root))),
    );
    if (
      !z.uuid().safeParse(current.operation).success ||
      current.directory !== join(base(root), current.operation)
    ) {
      fail("OPERATION_BINDING", "Чужой private operation pointer");
    }
    return {
      operation: current.operation as string,
      directory: current.directory as string,
    };
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return undefined;
    throw e;
  }
}
async function readReservation(root: string): Promise<Reservation> {
  const active = await json(await regular(root, relative(root, pointer(root))));
  if (
    !z.uuid().safeParse(active.operation).success ||
    active.directory !== join(base(root), active.operation)
  ) {
    fail("OPERATION_BINDING", "Чужой scope pointer");
  }
  const reservation = decode(
    reservationSchema,
    await json(
      await regular(
        root,
        relative(root, join(active.directory, "reservation.json")),
      ),
    ),
    "OPERATION_BINDING",
  );
  if (
    reservation.root !== root || reservation.operation !== active.operation ||
    reservation.directory !== active.directory
  ) {
    fail("OPERATION_BINDING", "Чужая reservation");
  }
  return reservation;
}
/** Short cross-process writer lock. No lock is held across a native command/inspect. */
async function withWriter<T>(root: string, use: () => Promise<T>): Promise<T> {
  const path = join(base(root), "writer.lock");
  let lock: Deno.FsFile;
  try {
    lock = await Deno.open(path, { write: true, createNew: true, mode: 0o600 });
  } catch (e) {
    if (e instanceof Deno.errors.AlreadyExists) {
      fail("OPERATION_CHANGED", "Конкурирующий native writer");
    }
    throw e;
  }
  try {
    return await use();
  } finally {
    lock.close();
    await Deno.remove(path);
  }
}
async function writePrivate(path: string, value: unknown) {
  const temp = path + "." + crypto.randomUUID();
  await Deno.writeTextFile(temp, JSON.stringify(value), {
    createNew: true,
    mode: 0o600,
  });
  try {
    await Deno.rename(temp, path);
  } finally {
    try {
      await Deno.remove(temp);
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) throw e;
    }
  }
}
async function assertReservationCurrent(r: Reservation) {
  const current = await readReservation(r.root);
  if (current.operation !== r.operation || !same(current, r)) {
    fail("OPERATION_CHANGED", "Reservation заменена/изменена");
  }
}
function activeChild(r: Reservation, token: string) {
  const child = r.children.at(-1);
  if (
    r.status === "failed" || r.status === "sealed" || !child ||
    child.token !== token || child.posted
  ) {
    fail("OPERATION_BINDING", "Неверный/завершённый native child token");
  }
  return child;
}
async function failReservation(r: Reservation) {
  try {
    await withWriter(r.root, async () => {
      const current = await readReservation(r.root);
      if (current.operation === r.operation && current.status !== "sealed") {
        current.status = "failed";
        await writePrivate(reservationPath(current), current);
      }
    });
  } catch { /* A replaced pointer is never restored or removed. */ }
}
/** One bounded owner series; the first actual native pre supplies ordered profiles. */
export async function withNativeCaptureScope<T>(
  reservationValue: NativeCaptureReservation,
  optionsValue: NativeCaptureScopeOptions,
  use: (scope: NativeCaptureScope) => Promise<T>,
  prepared?: AssignmentAdmission,
): Promise<T> {
  if (prepared) consumeAssignmentAdmission(prepared);
  const expected = decode(
    NativeCaptureReservationSchema,
    reservationValue,
    "OPERATION_BINDING",
  );
  const options = decode(
    NativeCaptureScopeOptionsSchema,
    optionsValue,
    "OPERATION_BINDING",
  );
  const root = expected.root;
  if (
    await Deno.realPath(root) !== root ||
    resolve(expected.outputDirectory) !== expected.outputDirectory ||
    !expected.outputDirectory.startsWith(root + "/") ||
    toolCachePath(root, expected.outputDirectory)
  ) {
    fail(
      "OPERATION_BINDING",
      "Нужны canonical owner и отдельный native output",
    );
  }
  await safeParent(expected.outputDirectory);
  for (const source of options.expectedSources) await regular(root, source);
  const operation = prepared?.operation ?? crypto.randomUUID(),
    directory = join(base(root), operation);
  await safeParent(base(root));
  await Deno.mkdir(base(root), { recursive: true });
  await Deno.mkdir(directory, { mode: 0o700 });
  let reservation: Reservation = {
    ...expected,
    schema: "course-native-capture-reservation-v1",
    operation,
    directory,
    expectedSources: options.expectedSources,
    status: "reserved",
    children: [],
  };
  await withWriter(root, async () => {
    // Existing private data must remain a recognized Core pointer.
    try {
      const current = await json(
        await regular(root, relative(root, pointer(root))),
      );
      if (
        !z.uuid().safeParse(current.operation).success ||
        current.directory !== join(base(root), current.operation)
      ) fail("OPERATION_BINDING", "Чужой private pointer");
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) throw e;
    }
    await writePrivate(reservationPath(reservation), reservation);
    await writePrivate(pointer(root), { operation, directory });
  });
  let preparedState: State | undefined;
  if (prepared) {
    const initialRuntimeMetrics = { runtimeHashReads: 0, runtimeHashBytes: 0 };
    const initialInvocation = await runtimeIdentity(
      root,
      true,
      initialRuntimeMetrics as State["metrics"],
      prepared.profile.native.executable,
    );
    const state: State = {
      ...prepared.source,
      schema: "course-native-operation-private-v1",
      operation,
      root,
      directory,
      outputDirectory: expected.outputDirectory,
      profiles: [...prepared.profile.native.actualProfiles],
      projection: "author",
      captureWitnesses: Object.fromEntries(
        prepared.inputs.map((source) => [source, crypto.randomUUID()]),
      ),
      inputs: prepared.inputs,
      sourcePolicy: "general",
      ownerInputs: [],
      configurationInputs: [],
      documentInputs: {},
      relevantInputs: [],
      invocation: initialInvocation,
      localInvocation: await runtimeIdentity(
        root,
        false,
        undefined,
        prepared.profile.native.executable,
      ),
      assignment: {
        assessments: prepared.assessments,
        runtime: prepared.runtime,
      },
      metrics: {
        ...emptyAuthorityMetrics(),
        ...prepared.source.metrics,
        inspectCalls: prepared.inspectCalls,
        runtimeHashReads: prepared.runtimeHashReads +
          initialRuntimeMetrics.runtimeHashReads,
        runtimeHashBytes: prepared.runtimeHashBytes +
          initialRuntimeMetrics.runtimeHashBytes,
        runtimePathReads: prepared.runtimePathReads,
        runtimeDirectoryReads: prepared.runtimeDirectoryReads,
        outputHashReads: 0,
        nativeMetadataBytes: 0,
        childRenders: 0,
        resourceHashReads: 0,
        nativeResourceHashReads: 0,
      },
    };
    preparedState = state;
    addAuthorityMetrics(state.metrics, prepared);
    bindOwner(state, prepared.owner, true, expected.outputDirectory);
    await assertSources(state);
    await assertAssignmentRuntime(
      state.assignment!.runtime,
      root,
      state.metrics,
    );
    await withWriter(root, async () => {
      await assertReservationCurrent(reservation);
      await writePendingState(state);
      reservation.status = "prepared";
      await writePrivate(reservationPath(reservation), reservation);
    });
  }
  const preparationMetrics = () =>
    prepared
      ? {
        ...prepared.source.metrics,
        ...Object.fromEntries(
          authorityCounterNames.map((key) => [key, prepared[key]]),
        ),
        runtimeHashReads: prepared.runtimeHashReads,
        runtimeHashBytes: prepared.runtimeHashBytes,
        runtimePathReads: prepared.runtimePathReads,
        runtimeDirectoryReads: prepared.runtimeDirectoryReads,
        inspectCalls: prepared.inspectCalls,
      }
      : {};
  let preparationBaseline = preparationMetrics();
  async function flushPreparationMetrics() {
    if (!prepared) return;
    const current = preparationMetrics();
    const state = decode(
      stateSchema,
      await json(join(directory, "state.json")),
      "OPERATION_BINDING",
    );
    const delta = Object.fromEntries(
      Object.keys(state.metrics).map(
        (key) => [
          key,
          (current[key as keyof typeof current] ?? 0) -
          (preparationBaseline[key as keyof typeof preparationBaseline] ?? 0),
        ],
      ),
    );
    await Deno.writeTextFile(
      join(directory, "pending-" + crypto.randomUUID() + ".metrics.json"),
      JSON.stringify(delta),
      { createNew: true, mode: 0o600 },
    );
    preparationBaseline = current;
  }
  let live = true, running = false, failed = false;
  async function captureInputs<R>(
    sources: readonly string[],
    runNative: (token: string) => Promise<R>,
  ): Promise<R> {
    if (!live) fail("OPERATION_EXPIRED", "Scope callback завершён");
    if (failed || running) {
      failed = true;
      await failReservation(reservation);
      fail("OPERATION_BINDING", "Failed/active scope child");
    }
    running = true;
    try {
      const inputs = decode(
        NativeCaptureScopeOptionsSchema,
        { expectedSources: sources },
        "OPERATION_BINDING",
      ).expectedSources;
      if (
        typeof runNative !== "function" ||
        inputs.some((source) =>
          !reservation.expectedSources.includes(source) ||
          reservation.children.some((c) => c.inputs.includes(source))
        )
      ) {
        fail("OPERATION_BINDING", "Повторный/чужой scope input");
      }
      const token = crypto.randomUUID();
      await withWriter(root, async () => {
        await assertReservationCurrent(reservation);
        reservation = {
          ...reservation,
          children: [...reservation.children, {
            token,
            inputs,
            used: false,
            posted: false,
          }],
        };
        await writePrivate(reservationPath(reservation), reservation);
      });
      if (!live || failed) {
        fail("OPERATION_EXPIRED", "Scope child истёк до native command");
      }
      // Prepared path supplies only the private guarded command closure below.
      const result = await runNative(token);
      if (!live || failed) {
        fail(
          "OPERATION_EXPIRED",
          "Scope child истёк во время native command",
        );
      }
      const current = await readReservation(root),
        child = current.children.at(-1);
      if (
        current.operation !== operation || current.status !== "bound" ||
        !child || child.token !== token || !same(child.inputs, inputs) ||
        !child.used || !child.posted ||
        !same(current.expectedSources, reservation.expectedSources) ||
        current.children.length !== reservation.children.length
      ) {
        fail("OPERATION_INCOMPLETE", "Нет actual native child post");
      }
      await regular(
        root,
        relative(root, join(directory, "child-" + token + ".json")),
      );
      reservation = current;
      await flushPreparationMetrics();
      return result;
    } catch (e) {
      failed = true;
      await failReservation(reservation);
      throw e;
    } finally {
      running = false;
    }
  }

  const environment = JSON.stringify(
      Object.entries(Deno.env.toObject()).sort(),
    ),
    cwd = Deno.cwd();
  const preparedStatePath = join(directory, "state.json");
  const preparedStateSignature = prepared
    ? signature(await Deno.lstat(preparedStatePath))
    : undefined;
  let leasing = false;
  const scope: NativeCaptureScope = Object.freeze({
    async captureInputs<R>(
      sources: readonly string[],
      run: (token: string) => Promise<R>,
    ) {
      if (prepared) {
        failed = true;
        await failReservation(reservation);
        fail(
          "OPERATION_BINDING",
          "Assignment capture требует live prepared lease/correlation",
        );
      }
      return captureInputs(sources, run);
    },
    async withPreparedOperation<R>(
      use: (lease: NativePreparedLease) => Promise<R>,
    ): Promise<R> {
      if (!prepared || !preparedState) {
        fail(
          "OPERATION_BINDING",
          "Prepared lease требует explicit new assignment",
        );
      }
      if (!live) fail("OPERATION_EXPIRED", "Scope callback завершён");
      if (leasing || running || failed) {
        fail("OPERATION_BINDING", "Active/failed prepared lease");
      }
      leasing = true;
      const descriptor = NativePreparedOperationSchema.parse({
        schema: "course-native-prepared-operation-v1",
        root,
        outputDirectory: expected.outputDirectory,
        identity: {
          operation,
          profiles: preparedState.profiles,
          projection: preparedState.projection,
          runtime: "quarto-1.11.5",
        },
        inputs: prepared.inputs.map((source) => ({
          source,
          captureWitness: preparedState!.captureWitnesses[source],
        })),
        assessments: prepared.assessments,
      });
      const guard = async () => {
        if (!live) fail("OPERATION_EXPIRED", "Scope callback завершён");
        if (failed) fail("OPERATION_BINDING", "Scope failed");
        if (
          cwd !== Deno.cwd() ||
          environment !==
            JSON.stringify(Object.entries(Deno.env.toObject()).sort())
        ) fail("OPERATION_CHANGED", "Prepared environment изменён");
        await assertReservationCurrent(reservation);
        const current = await readReservation(root);
        if (
          !["prepared", "bound"].includes(current.status) ||
          current.operation !== operation ||
          !same(current.expectedSources, prepared.inputs)
        ) fail("OPERATION_CHANGED", "Prepared generation replaced/completed");
        if (
          signature(await Deno.lstat(preparedStatePath)) !==
            preparedStateSignature
        ) fail("OPERATION_CHANGED", "Prepared state replaced");
        await assertSources(prepared.source);
        await assertAssignmentRuntime(prepared.runtime, root, prepared);
      };
      try {
        return await withPreparedLease(
          descriptor,
          guard,
          (sources, command) =>
            captureInputs(
              sources,
              (token) =>
                withAssignmentExecution(prepared.profile, () =>
                  runAssignmentCaptureChild(token, command), guard),
            ),
          async () => {
            failed = true;
            await failReservation(reservation);
          },
          use,
        );
      } finally {
        leasing = false;
      }
    },
  });
  try {
    const result = await use(scope);
    if (
      failed || running || leasing || reservation.status !== "bound" ||
      !reservation.children.length || reservation.children.some((c) =>
        !c.used || !c.posted
      ) || !same(
        [...new Set(reservation.children.flatMap((c) => c.inputs))].sort(),
        [...reservation.expectedSources].sort(),
      )
    ) {
      fail(
        "OPERATION_INCOMPLETE",
        "Scope не охватывает все actual inputs/posts",
      );
    }
    await flushPreparationMetrics();
    await sealCaptureScope(reservation);
    return result;
  } catch (e) {
    failed = true;
    await failReservation(reservation);
    throw e;
  } finally {
    live = false;
  }
}
function bindOwner(
  state: State,
  owner: any,
  expectedProjection: boolean,
  nativeOutput?: string,
) {
  const root = state.root, inputs = state.inputs;
  if (!Array.isArray(owner.files?.input)) {
    fail("OPERATION_BINDING", "Нет native owner input scope");
  }
  state.ownerInputs = owner.files.input.map((path: string) =>
    relative(root, resolve(root, path))
  );
  if (
    !state.ownerInputs.length ||
    new Set(state.ownerInputs).size !== state.ownerInputs.length ||
    state.ownerInputs.some((path) => !pathSchema.safeParse(path).success)
  ) fail("OPERATION_BINDING", "Некорректный native owner input scope");
  let outputDirectory = state.outputDirectory;
  const view = owner.config?.course?.view;
  const projection = owner.config?.["course-core-projection"] ??
    (view === "full" ? "author" : "student");
  if (
    !SupportedQuartoVersionSchema.safeParse(owner.quarto?.version).success ||
    owner.dir !== root ||
    (owner.config?.["course-core-runtime"] ?? "native-ts") !== "native-ts" ||
    !["student", "author"].includes(projection) ||
    (view !== undefined &&
      view !== (projection === "author" ? "full" : "student"))
  ) {
    fail(
      "OPERATION_UNQUALIFIED",
      "Требуется согласованный native-ts Quarto>=1.11.5 owner/projection",
    );
  }
  if (expectedProjection && projection !== state.projection) {
    fail("OPERATION_BINDING", "Reservation projection отличается");
  }
  const policy = owner.config?.["course-core-source-policy"] === undefined
    ? "general"
    : owner.config["course-core-source-policy"];
  if (!["general", "static"].includes(policy)) {
    fail("OPERATION_SOURCE_POLICY", "Неизвестная source policy");
  }
  if (policy === "static") {
    if (
      !Array.isArray(owner.engines) || !owner.engines.length ||
      owner.engines.some((engine: unknown) => engine !== "markdown") ||
      owner.config?.["ojs-engine"] === true ||
      Object.values(owner.config?.format ?? {}).some((format: any) =>
        format?.["ojs-engine"] === true
      )
    ) {
      fail(
        "OPERATION_SOURCE_POLICY",
        "Static owner требует native markdown engine без вычислений",
      );
    }
    for (const input of state.ownerInputs) {
      const information = owner.fileInformation?.[input];
      if (
        !information || !Array.isArray(information.codeCells) ||
        !information.metadata || typeof information.metadata !== "object" ||
        Array.isArray(information.metadata) ||
        information.metadata["ojs-engine"] === true ||
        Object.values(information.metadata.format ?? {}).some((format: any) =>
          format?.["ojs-engine"] === true
        ) ||
        information.codeCells.some((cell: any) =>
          !cell || typeof cell.language !== "string" ||
          (!/^=[A-Za-z][A-Za-z0-9_-]*$/.test(cell.language) &&
            !["mermaid", "dot"].includes(cell.language))
        )
      ) {
        fail(
          "OPERATION_SOURCE_POLICY",
          "Native facts несовместимы со static source: " + input,
        );
      }
    }
  }
  state.sourcePolicy = policy;
  state.projection = projection;
  outputDirectory = resolve(
    root,
    nativeOutput ?? owner.config.project?.["output-dir"] ?? "_site",
  );
  if (outputDirectory !== state.outputDirectory) {
    fail("OPERATION_BINDING", "Native output отличается");
  }
  const configuration = new Set<string>();
  for (const config of owner.files?.config ?? []) {
    configuration.add(relative(root, resolve(root, config)));
  }
  state.configurationInputs = [...configuration];
  const relevant = new Set<string>(configuration);
  for (const source of inputs) {
    const dependencies = new Set<string>([source]);
    const information = owner.fileInformation?.[source];
    if (!information || !Array.isArray(information.includeMap)) {
      fail("OPERATION_UNQUALIFIED", "Нет native include closure");
    }
    for (const edge of information.includeMap) {
      if (typeof edge.source !== "string" || typeof edge.target !== "string") {
        fail(
          "OPERATION_UNQUALIFIED",
          "Некорректное native include observation",
        );
      }
      const original = resolve(root, edge.source);
      dependencies.add(relative(root, original));
      dependencies.add(relative(root, resolve(dirname(original), edge.target)));
    }
    let directory = dirname(resolve(root, source));
    while (true) {
      for (const name of ["_metadata.yml", "_metadata.yaml"]) {
        const path = relative(root, join(directory, name));
        if (sourceIndex(state).rows.has(path)) dependencies.add(path);
      }
      if (directory === root) break;
      directory = dirname(directory);
    }
    state.documentInputs[source] = [...dependencies];
    for (const dependency of dependencies) relevant.add(dependency);
  }
  for (const input of relevant) {
    if (!state.rows.some((r) => r.path === input)) {
      fail(
        "OPERATION_BINDING",
        "Native input/config/include отсутствует в source snapshot",
      );
    }
  }
  state.relevantInputs = [...relevant];
  state.ownerWitness = {
    quarto: { version: owner.quarto.version },
    dir: owner.dir,
    config: structuredClone(owner.config),
    files: {
      input: [...owner.files.input],
      config: [...(owner.files.config ?? [])],
    },
  };
}
async function writePendingState(state: State) {
  const { inputs, root, directory, operation } = state;
  for (let index = 0; index < inputs.length; index++) {
    await regular(root, inputs[index]);
    await Deno.writeTextFile(
      join(directory, `${index}.request.json`),
      JSON.stringify({
        context: {
          operation,
          captureWitness: state.captureWitnesses[inputs[index]],
          profiles: state.profiles,
          input: resolve(root, inputs[index]),
          projection: state.projection,
        },
        capture: join(directory, String(index)),
        ...(state.assignment
          ? {
            assignment: {
              source: inputs[index],
              assessments: state.assignment.assessments,
              authority: state.assignment.runtime.authority,
              producerProfile: state.assignment.runtime.profile,
            },
          }
          : {}),
      }),
      { createNew: true, mode: 0o600 },
    );
  }
  await Deno.writeTextFile(
    join(directory, "state.json"),
    JSON.stringify(state),
    { createNew: true, mode: 0o600 },
  );
}

/** Production pre-render: реальный native inspect, source fence и новые capture capabilities. */
export async function beginNativeOperation(root: string) {
  return await beginNativeOperationInternal(root, false);
}
function nativeProgressEnabled(): boolean {
  try {
    return Deno.env.get("QUARTO_PROJECT_SCRIPT_QUIET") !== "1";
  } catch {
    return false;
  }
}
async function nativeHookProgress(
  stage: string,
  root: string,
  action: () => Promise<void>,
) {
  if (!nativeProgressEnabled()) return await action();
  const started = performance.now();
  console.error(`Core: ${stage}: ${root} — начало`);
  try {
    await action();
    console.error(
      `Core: ${stage}: ${root} — готово (${
        ((performance.now() - started) / 1000).toFixed(1)
      } с)`,
    );
  } catch (error) {
    console.error(
      `Core: ${stage}: ${root} — ошибка (${
        ((performance.now() - started) / 1000).toFixed(1)
      } с)`,
    );
    throw error;
  }
}
/** Internal pre-render entrypoint; не экспортируется через public.ts. */
export async function beginNativePreHook(root: string) {
  return await nativeHookProgress(
    "Подготовка модели",
    root,
    () => beginNativeOperationInternal(root, true),
  );
}
async function beginNativeOperationInternal(root: string, nativeHook: boolean) {
  root = await Deno.realPath(root);
  const profiles = decode(
    NativeOperationExpectationSchema.shape.profiles,
    (Deno.env.get("QUARTO_PROFILE") || "").split(",").filter(Boolean),
    "OPERATION_BINDING",
  );
  const selection = await nativeFileSelection(
    root,
    "QUARTO_PROJECT_INPUT_FILES",
  );
  if (nativeHook && nativeProgressEnabled()) {
    console.error(`Core: Подготовка модели — inputs=${selection.files.length}`);
  }
  if (nativeHook && selection.explicitlyEmpty) {
    await invalidateNoWorkHook(root);
    return;
  }
  const actualInputs = selection.files.map((p) => relative(root, p));
  if (
    !actualInputs.length ||
    new Set(actualInputs).size !== actualInputs.length ||
    actualInputs.some((p) => !pathSchema.safeParse(p).success)
  ) {
    fail("OPERATION_BINDING", "Нет уникальных текущих native inputs");
  }
  const token = Deno.env.get("COURSE_CORE_CAPTURE_TOKEN");
  const previousPointer = token === undefined
    ? await readOptionalPointer(root)
    : undefined;
  let reservation: Reservation | undefined;
  if (token !== undefined) {
    reservation = await readReservation(root);
    const child = activeChild(reservation, token);
    if (
      child.used || !same([...child.inputs].sort(), [...actualInputs].sort()) ||
      resolve(Deno.cwd()) !== root ||
      resolve(Deno.env.get("QUARTO_PROJECT_OUTPUT_DIR") || "") !==
        reservation.outputDirectory
    ) {
      fail(
        "OPERATION_BINDING",
        "Native child inputs/owner/output/token отличаются",
      );
    }
    if (reservation.status === "bound" || reservation.status === "prepared") {
      const state = decode(
        stateSchema,
        await json(join(reservation.directory, "state.json")),
        "OPERATION_BINDING",
      );
      if (
        state.root !== root || state.directory !== reservation.directory ||
        state.operation !== reservation.operation ||
        state.outputDirectory !== reservation.outputDirectory ||
        state.projection !== reservation.projection ||
        !same(state.inputs, reservation.expectedSources)
      ) {
        fail("OPERATION_BINDING", "Bound state не принадлежит reservation");
      }
      if (!same(profiles, state.profiles)) {
        fail("OPERATION_BINDING", "Native child ordered profiles изменились");
      }
      const baselineMetrics = { ...state.metrics };
      await assertPrivate(state);
      await assertSources(state, [], false, [
        ...new Set([
          ...state.configurationInputs,
          ...actualInputs.flatMap((source) => state.documentInputs[source]),
        ]),
      ]);
      await withWriter(root, async () => {
        await assertReservationCurrent(reservation!);
        child.used = true;
        reservation!.status = "bound";
        await Deno.writeTextFile(
          join(state.directory, "pre-" + token + ".metrics.json"),
          JSON.stringify(
            Object.fromEntries(
              Object.entries(state.metrics).map((
                [key, value],
              ) => [
                key,
                observedDelta(
                  value,
                  baselineMetrics[key as keyof typeof baselineMetrics],
                ),
              ]),
            ),
          ),
          { createNew: true, mode: 0o600 },
        );
        await writePrivate(reservationPath(reservation!), reservation);
      });
      return;
    }
  }
  const operation = reservation?.operation ?? crypto.randomUUID(),
    directory = reservation?.directory ?? join(base(root), operation);
  const inputs = reservation?.expectedSources ?? actualInputs;
  // The scope snapshot must precede its only owner inspect.
  let outputDirectory = reservation?.outputDirectory ??
    resolve(root, Deno.env.get("QUARTO_PROJECT_OUTPUT_DIR") || "_site");
  if (!outputDirectory.startsWith(root + "/")) {
    fail("OPERATION_BINDING", "Output вне owner");
  }
  await safeParent(base(root));
  await Deno.mkdir(base(root), { recursive: true });
  if (!reservation) await Deno.mkdir(directory, { mode: 0o700 });
  const initialRuntimeMetrics = { runtimeHashReads: 0, runtimeHashBytes: 0 };
  const initialInvocation = await runtimeIdentity(
    root,
    true,
    initialRuntimeMetrics as State["metrics"],
  );
  const state: State = {
    schema: "course-native-operation-private-v1",
    operation,
    root,
    directory,
    outputDirectory,
    profiles,
    projection: reservation?.projection ?? "student",
    captureWitnesses: {},
    inputs,
    sourcePolicy: "general",
    rows: [],
    relevantInputs: [],
    ownerInputs: [],
    configurationInputs: [],
    documentInputs: {},
    memberships: {},
    invocation: initialInvocation,
    localInvocation: await runtimeIdentity(root, false),
    metrics: {
      ...emptyAuthorityMetrics(),
      fullSourceFences: 0,
      localSourceFences: 0,
      sourceDirectoryReads: 0,
      runtimeHashReads: initialRuntimeMetrics.runtimeHashReads,
      runtimeHashBytes: initialRuntimeMetrics.runtimeHashBytes,
      runtimePathReads: 0,
      runtimeDirectoryReads: 0,
      outputHashReads: 0,
      nativeMetadataBytes: 0,
      childRenders: 0,
      inspectCalls: 0,
      fullWalks: 0,
      sourceHashReads: 0,
      sourceHashBytes: 0,
      resourceHashReads: 0,
      nativeResourceHashReads: 0,
    },
  };
  await snapshot(state);
  const owner = JSON.parse(
    await command(quartoExecutable(), [
      "inspect",
      root,
      ...(profiles.length ? ["--profile", profiles.join(",")] : []),
    ], root),
  );
  state.metrics.inspectCalls++;
  bindOwner(
    state,
    owner,
    !!reservation,
    Deno.env.get("QUARTO_PROJECT_OUTPUT_DIR"),
  );
  await assertSources(state);
  if (await runtimeIdentity(root, true, state.metrics) !== state.invocation) {
    fail("OPERATION_CHANGED", "Runtime изменён во время bind");
  }
  if (reservation) await assertReservationCurrent(reservation);
  state.captureWitnesses = Object.fromEntries(
    inputs.map((source) => [source, crypto.randomUUID()]),
  );
  const publish = async () => {
    if (reservation) await assertReservationCurrent(reservation);
    else if (!same(await readOptionalPointer(root), previousPointer)) {
      fail("OPERATION_CHANGED", "Operation pointer изменён во время pre");
    }
    await writePendingState(state);
    if (reservation) {
      activeChild(reservation, token!).used = true;
      reservation.status = "bound";
      await writePrivate(reservationPath(reservation), reservation);
    } else {
      if (!same(await readOptionalPointer(root), previousPointer)) {
        fail(
          "OPERATION_CHANGED",
          "Operation pointer заменён перед publication",
        );
      }
      await writePrivate(pointer(root), { operation, directory });
    }
  };
  await withWriter(root, publish);
}

function localUses(value: unknown): string[] {
  const result = new Set<string>();
  function visit(value: unknown) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const node = value as Record<string, unknown>, content = node.c;
    if ((node.t === "Link" || node.t === "Image") && Array.isArray(content)) {
      const target = content[2],
        url = Array.isArray(target) ? target[0] : undefined;
      if (
        typeof url === "string" && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url)
      ) result.add(url.split(/[?#]/)[0]);
    }
    if (
      (node.t === "RawBlock" || node.t === "RawInline") &&
      Array.isArray(content) && content[0] === "html" &&
      typeof content[1] === "string"
    ) {
      for (
        const m of content[1].matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)
      ) {
        if (!/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(m[1])) {
          result.add(m[1].split(/[?#]/)[0]);
        }
      }
    }
    Object.values(node).forEach(visit);
  }
  visit(value);
  return [...result];
}
/** Production post-render: поздняя фактическая проекция и только текущие native outputs. */
export async function finishNativeOperation(root: string) {
  return await finishNativeOperationInternal(root, false);
}
/** Internal post-render entrypoint; no-work не создаёт complete.json. */
export async function finishNativePostHook(root: string) {
  return await nativeHookProgress(
    "Финализация модели",
    root,
    () => finishNativeOperationInternal(root, true),
  );
}
async function finishNativeOperationInternal(
  root: string,
  nativeHook: boolean,
) {
  root = await Deno.realPath(root);
  const selection = nativeHook
    ? await nativeFileSelection(root, "QUARTO_PROJECT_OUTPUT_FILES")
    : undefined;
  if (selection && nativeProgressEnabled()) {
    console.error(
      `Core: Финализация модели — outputs=${selection.files.length}`,
    );
  }
  if (selection?.explicitlyEmpty) {
    await invalidateNoWorkHook(root);
    return;
  }
  const active = await json(pointer(root));
  if (
    !z.uuid().safeParse(active.operation).success ||
    active.directory !== join(base(root), active.operation)
  ) fail("OPERATION_BINDING", "Чужой private operation pointer");
  const state = decode(
    stateSchema,
    await json(join(active.directory, "state.json")),
    "OPERATION_BINDING",
  );
  if (
    state.root !== root || state.directory !== active.directory ||
    state.operation !== active.operation
  ) fail("OPERATION_BINDING", "Чужой native post state");
  const token = Deno.env.get("COURSE_CORE_CAPTURE_TOKEN");
  const reservation = token !== undefined
    ? await readReservation(root)
    : undefined;
  const child = reservation ? activeChild(reservation, token!) : undefined;
  if (child && (!child.used || reservation!.operation !== state.operation)) {
    fail("OPERATION_BINDING", "Незарегистрированный native post");
  }
  if (!reservation) {
    try {
      await Deno.lstat(join(state.directory, "reservation.json"));
      fail("OPERATION_BINDING", "Scope post требует registered token");
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) throw e;
    }
  }
  const inputs = child?.inputs ?? state.inputs;
  if (child) {
    state.metrics.childRenders++;
    try {
      const delta = await json(
        join(state.directory, "pre-" + token + ".metrics.json"),
      );
      for (
        const key of Object.keys(state.metrics) as (keyof State["metrics"])[]
      ) {
        if (
          typeof delta[key] !== "number" || !Number.isInteger(delta[key]) ||
          delta[key] < 0
        ) fail("OPERATION_BINDING", "Некорректные child metrics");
        if (typeof state.metrics[key] !== "number") {
          fail("METRICS_UNAVAILABLE", "Incomplete pending counters");
        }
        state.metrics[key]! += delta[key];
      }
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) throw e;
    }
  }
  await assertPrivate(state, !reservation);
  if (
    !same(
      state.profiles,
      (Deno.env.get("QUARTO_PROFILE") || "").split(",").filter(Boolean),
    )
  ) fail("OPERATION_BINDING", "Native profiles изменились между hooks");
  const outputs = selection?.files ??
    await envFiles(root, "QUARTO_PROJECT_OUTPUT_FILES");
  if (!outputs.length) {
    fail("OPERATION_INCOMPLETE", "Нет текущих native outputs");
  }
  const documents: z.output<typeof NativePublicDocumentSchema>[] = [],
    catalogDocuments: z.output<typeof NativeCatalogSchema>["documents"] = [],
    resources: z.output<typeof completeSchema>["resources"] = [],
    outputRows: z.output<typeof rowSchema>[] = [];
  const additions: string[] = [];
  const declaredOutputs = new Set(outputs);
  const indexTopics = new Map<string, Record<string, unknown>>();
  const indexPages = new Map<string, string>();
  const releaseDocuments: z.output<typeof completeSchema>["releaseDocuments"] =
    [];
  for (const sourceInput of inputs) {
    const index = state.inputs.indexOf(sourceInput);
    if (index < 0) fail("OPERATION_BINDING", "Чужой child source");
    const capture = join(state.directory, String(index));
    const early = decode(
      EarlyDocumentSchema,
      await json(capture + ".early.json"),
      "OPERATION_INCOMPLETE",
    );
    const late = decode(
      LateDocumentSchema,
      await json(capture + ".late.json"),
      "OPERATION_INCOMPLETE",
    );
    const native = decode(
      nativeCaptureSchema,
      await json(capture + ".native.json"),
      "OPERATION_INCOMPLETE",
    );
    state.metrics.nativeResourceHashReads += native.resources.length;
    state.metrics.nativeMetadataBytes += new TextEncoder().encode(
      JSON.stringify(early.release?.nativeMetadata ?? {}),
    ).length;
    if (
      early.context.captureWitness !==
        state.captureWitnesses[state.inputs[index]] ||
      !same(early.context.profiles, state.profiles) ||
      early.context.operation !== state.operation ||
      early.context.input !== resolve(root, state.inputs[index]) ||
      !NativeWebFormatSchema.safeParse(early.context.format).success ||
      early.context.projection !== state.projection
    ) fail("OPERATION_BINDING", "Чужой native capture");
    if (early.context.exerciseBank !== (native.role === "exercise-bank")) {
      fail("OPERATION_BINDING", "Native role/capture отличаются");
    }
    const document = finalizeDocument(early, late);
    if (document.status !== "complete") {
      fail("OPERATION_INCOMPLETE", "Неполный late native capture");
    }
    const output = resolve(root, native.output);
    if (
      !outputs.includes(output) ||
      !output.startsWith(state.outputDirectory + "/") ||
      !output.endsWith(".html")
    ) fail("OPERATION_BINDING", "Документ не принадлежит текущему HTML output");
    const outputPath = relative(root, output);
    await regular(root, outputPath);
    if (outputRows.some((r) => r.path === outputPath)) {
      fail("OPERATION_BINDING", "Output collision");
    }
    if (state.assignment) {
      if (!early.authorityCost) {
        fail(
          "BODY.PRODUCER_INPUT_UNQUALIFIED",
          "Missing native authority cost/witness producer",
        );
      }
      addAuthorityMetrics(state.metrics, early.authorityCost);
      assertAssignmentDeclarations(
        native.assignmentDeclarations,
        resolve(root, sourceInput),
        new Set([
          ...state.rows.map((row) => resolve(root, row.path)),
          ...state.assignment.runtime.files.map((row) => row.path),
        ]),
        {
          root,
          outputDirectory: state.outputDirectory,
          xdg:
            assignmentProfile(state.assignment.runtime, root).native.environment
              .XDG_CACHE_HOME,
          format: early.context.format,
          outputs: declaredOutputs,
        },
      );
      state.metrics.nativeMetadataBytes +=
        new TextEncoder().encode(JSON.stringify(native.assignmentDeclarations))
          .length;
    } else if (native.assignmentDeclarations) {
      fail(
        "BODY.PRODUCER_DEPENDENCY_UNQUALIFIED",
        "Unexpected assignment declarations",
      );
    }
    const outputBytes = await Deno.readFile(output);
    const outputText = new TextDecoder().decode(outputBytes);
    if (outputText.includes("<!--course-exercise-index")) {
      indexPages.set(outputPath, outputText);
    }
    indexTopics.set(state.inputs[index], early.ast.meta);
    state.metrics.outputHashReads++;
    outputRows.push({
      path: outputPath,
      signature: signature(await Deno.lstat(output)),
      sha256: await hash(outputBytes),
    });
    let projectFacts:
      | z.output<typeof NativeProjectFactsCaptureSchema>
      | undefined;
    if (state.assignment) {
      const projectFactsBytes = await Deno.readFile(
        capture + ".project-facts.json",
      );
      if (projectFactsBytes.length > 16 * 1024 * 1024) {
        fail("DOCUMENT_LIMIT", "Project facts больше16MiB");
      }
      state.metrics.nativeMetadataBytes += projectFactsBytes.length;
      projectFacts = decode(
        NativeProjectFactsCaptureSchema,
        JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(projectFactsBytes),
        ),
        "BODY.PROJECT_FACTS_UNQUALIFIED",
      );
      const declared = early.release?.declarations.filter((row) =>
        row.project
      ) ?? [];
      if (
        !same(projectFacts.context, early.context) ||
        projectFacts.source !== sourceInput ||
        projectFacts.projects.length !== declared.length ||
        projectFacts.projects.some((fact) =>
          fact.source !== sourceInput || !declared.some((row) =>
            row.id === fact.exerciseId &&
            row.project === "/" + fact.projectRoot &&
            row.check === fact.projectCheck
          )
        )
      ) {
        fail(
          "BODY.PROJECT_FACTS_UNQUALIFIED",
          "Foreign/incomplete preprojection Core project facts",
        );
      }
    }
    releaseDocuments.push({
      ...(projectFacts ? { projectFacts } : {}),
      source: state.inputs[index],
      early: {
        context: early.context,
        definitions: early.definitions,
        release: early.release,
      },
      final: { hasPublicSolution: structuredClone(document.hasPublicSolution) },
    });
    const source = state.inputs[index],
      visibleIds = new Set(
        document.occurrences.filter((r) => r.kind === "exercise").map((r) =>
          r.exerciseId
        ),
      );
    document.definitions = Object.fromEntries(
      Object.entries(document.definitions).filter(([id]) => visibleIds.has(id)),
    );
    document.context = { ...document.context, input: source, defaults: {} };
    documents.push(
      decode(NativePublicDocumentSchema, document, "OPERATION_DOCUMENT"),
    );
    const role = native.role;
    if (role !== "exercise-bank" && role !== "page") {
      fail("OPERATION_UNQUALIFIED", "Не квалифицирована native document role");
    }
    catalogDocuments.push({
      source,
      output: relative(state.outputDirectory, output),
      format: NativeWebFormatSchema.parse(early.context.format),
      role,
      exercises: document.occurrences.filter((r) => r.kind === "exercise").map(
        (r) => ({
          id: r.exerciseId,
          occurrence: r.key,
          anchor: r.anchor,
          hasPublicSolution: document.hasPublicSolution[r.exerciseId] === true,
          ...(document.definitions[r.exerciseId]?.project
            ? {
              project: relative(
                root,
                resolve(
                  document.definitions[r.exerciseId].project!.startsWith("/")
                    ? root
                    : dirname(resolve(root, source)),
                  document.definitions[r.exerciseId].project!.replace(
                    /^\//,
                    "",
                  ),
                ),
              ),
            }
            : {}),
        }),
      ),
    });
    for (const use of localUses(native.body)) {
      let decoded: string;
      try {
        decoded = decodeURIComponent(use);
      } catch {
        fail("RESOURCE_PATH", "Некорректный URL ресурса");
      }
      const canonical = relative(
        root,
        resolve(
          use.startsWith("/") ? root : dirname(resolve(root, source)),
          decoded.replace(/^\//, ""),
        ),
      );
      if (!pathSchema.safeParse(canonical).success) {
        fail("RESOURCE_PATH", "Ресурс выходит из owner");
      }
      if (!ordinary(canonical) || toolCachePath(root, canonical)) continue;
      // Только фактическое native наблюдение разрешает relocated fallback.
      const observed = native.resources.find((r) =>
        resolve(r.source) === resolve(root, canonical)
      );
      if (!observed) {
        try {
          await regular(root, canonical);
        } catch (e) {
          if (e instanceof Deno.errors.NotFound) continue;
          throw e;
        }
        fail(
          "RESOURCE_UNQUALIFIED",
          "Ресурс появился после native byte observation",
        );
      }
      const expectedOutput = resolve(state.outputDirectory, canonical);
      if (resolve(observed.output) !== expectedOutput) {
        fail("OPERATION_BINDING", "Native resource output отличается");
      }
      let path: string;
      try {
        path = await regular(root, canonical);
      } catch (e) {
        if (!(e instanceof Deno.errors.NotFound)) throw e;
        try {
          path = await regular(root, relative(root, expectedOutput));
        } catch (missing) {
          if (missing instanceof Deno.errors.NotFound) {
            fail(
              "RESOURCE_CURRENT_BYTES_MISSING",
              "Не найдены наблюдавшиеся native bytes",
            );
          }
          throw missing;
        }
      }
      const existing = resources.find((r) => r.source === canonical);
      if (existing) {
        if (!existing.documents.includes(source)) {
          existing.documents.push(source);
        }
        continue;
      }
      const bytes = await Deno.readFile(path);
      state.metrics.resourceHashReads += 2;
      if (await hash(bytes, "SHA-1") !== observed.sha1) {
        fail(
          "OPERATION_CHANGED",
          "Native resource bytes отличаются от late observation",
        );
      }
      resources.push({
        source: canonical,
        documents: [source],
        path,
        signature: signature(await Deno.lstat(path)),
        sha256: await hash(bytes),
      });
      if (!state.rows.some((r) => r.path === canonical)) {
        additions.push(canonical);
      }
    }
  }
  if (indexPages.size && !reservation) {
    if (!same([...inputs].sort(), [...state.ownerInputs].sort())) {
      fail(
        "RELEASE.FULL_NATIVE_RUN_REQUIRED",
        "Указатель требует полной текущей native области",
      );
    }
    const { renderExerciseIndex } = await import(
      "../../course-navigation/exercise-index.ts"
    );
    const catalog = NativeCatalogSchema.parse({
      identity: {
        operation: state.operation,
        profiles: state.profiles,
        projection: state.projection,
        runtime: "quarto-1.11.5",
      },
      documents: catalogDocuments,
    });
    for (const [path, html] of indexPages) {
      const rendered = html.replace(
        /<!--course-exercise-index(?::(.*?))?-->/g,
        (_marker, request) =>
          renderExerciseIndex(
            documents,
            catalog,
            indexTopics,
            (source, anchor) => {
              const target = catalog.documents.find((doc) =>
                doc.source === source
              );
              if (!target) {
                fail("OPERATION_BINDING", "Нет current index target");
              }
              return relative(
                dirname(resolve(root, path)),
                resolve(state.outputDirectory, target.output),
              ).replaceAll("\\", "/") + "#" + anchor;
            },
            request ? JSON.parse(request) : {},
          ),
      );
      await Deno.writeTextFile(resolve(root, path), rendered);
      const row = outputRows.find((row) => row.path === path)!;
      row.signature = signature(await Deno.lstat(resolve(root, path)));
      row.sha256 = await hash(new TextEncoder().encode(rendered));
      state.metrics.outputHashReads++;
    }
  }
  if (
    outputs.filter((p) => p.endsWith(".html")).some((p) =>
      !outputRows.some((r) => resolve(root, r.path) === p)
    )
  ) fail("OPERATION_INCOMPLETE", "HTML output без Core capture");
  await assertSources(state, additions, !reservation, [
    ...new Set([
      ...state.configurationInputs,
      ...inputs.flatMap((source) => state.documentInputs[source]),
    ]),
  ]);
  const identity = NativeOperationIdentitySchema.parse({
    operation: state.operation,
    profiles: state.profiles,
    projection: state.projection,
    runtime: "quarto-1.11.5",
  });
  const complete = completeSchema.parse({
    state,
    catalog: { identity, documents: catalogDocuments },
    documents,
    resources,
    outputs: outputRows,
    releaseDocuments,
  });
  await withWriter(root, async () => {
    await assertPrivate(state);
    if (reservation) await assertReservationCurrent(reservation);
    await Deno.writeTextFile(
      join(
        state.directory,
        reservation ? "child-" + token + ".json" : "complete.json",
      ),
      JSON.stringify(complete),
      { createNew: true, mode: 0o600 },
    );
    if (reservation) {
      child!.posted = true;
      await writePrivate(reservationPath(reservation), reservation);
    }
  });
  console.log(
    `Core: ${documents.length} текущих native-ts ${state.projection} документов`,
  );
}
async function sealCaptureScope(reservation: Reservation) {
  const root = reservation.root;
  const state = decode(
    stateSchema,
    await json(join(reservation.directory, "state.json")),
    "OPERATION_BINDING",
  );
  if (
    state.root !== root || state.directory !== reservation.directory ||
    state.operation !== reservation.operation ||
    state.outputDirectory !== reservation.outputDirectory ||
    state.projection !== reservation.projection ||
    !same(state.inputs, reservation.expectedSources)
  ) fail("OPERATION_BINDING", "Чужой seal state");
  const baselineMetrics = { ...state.metrics };
  await assertPrivate(state, true);
  const children = [];
  for (const child of reservation.children) {
    children.push(
      decode(
        completeSchema,
        await json(
          await regular(
            root,
            relative(
              root,
              join(reservation.directory, "child-" + child.token + ".json"),
            ),
          ),
        ),
        "OPERATION_INCOMPLETE",
      ),
    );
  }
  const documents = children.flatMap((c) => c.documents),
    catalogDocuments = children.flatMap((c) => c.catalog.documents),
    outputs = children.flatMap((c) => c.outputs),
    releaseDocuments = children.flatMap((c) => c.releaseDocuments);
  if (
    new Set(documents.map((d) => d.context.input)).size !==
      state.inputs.length ||
    documents.length !== state.inputs.length ||
    new Set(outputs.map((r) => r.path)).size !== outputs.length
  ) {
    fail("OPERATION_BINDING", "Missing/duplicate source или output collision");
  }
  const resources: z.output<typeof completeSchema>["resources"] = [];
  for (const child of children) {
    if (
      !same(child.catalog.identity, {
        operation: state.operation,
        profiles: state.profiles,
        projection: state.projection,
        runtime: "quarto-1.11.5",
      })
    ) fail("OPERATION_BINDING", "Чужой child receipt");
    if (
      !same(child.state.ownerWitness, state.ownerWitness) ||
      !same(child.state.rows, state.rows) ||
      !same(child.state.memberships, state.memberships)
    ) fail("OPERATION_BINDING", "Child owner/S witness отличается");
    for (const resource of child.resources) {
      const known = resources.find((r) => r.source === resource.source);
      if (known) {
        if (
          known.path !== resource.path || known.sha256 !== resource.sha256 ||
          known.signature !== resource.signature
        ) fail("OPERATION_CHANGED", "Child resource изменён");
        known.documents = [
          ...new Set([...known.documents, ...resource.documents]),
        ];
      } else resources.push(resource);
    }
    for (
      const key of Object.keys(state.metrics) as (keyof State["metrics"])[]
    ) {
      const previous = state.metrics[key],
        childValue = child.state.metrics[key],
        baseline = baselineMetrics[key];
      if (
        typeof previous !== "number" || typeof childValue !== "number" ||
        typeof baseline !== "number"
      ) fail("METRICS_UNAVAILABLE", "Incomplete child counters");
      state.metrics[key] = previous + childValue - baseline;
    }
  }
  for await (const entry of Deno.readDir(state.directory)) {
    if (!/^pending-[a-f0-9-]+\.metrics\.json$/.test(entry.name)) continue;
    const delta = await json(
      await regular(root, relative(root, join(state.directory, entry.name))),
    );
    for (
      const key of Object.keys(state.metrics) as (keyof State["metrics"])[]
    ) {
      if (
        typeof delta[key] !== "number" || !Number.isInteger(delta[key]) ||
        delta[key] < 0
      ) fail("OPERATION_BINDING", "Некорректные pending metrics");
      if (typeof state.metrics[key] !== "number") {
        fail("METRICS_UNAVAILABLE", "Incomplete pending counters");
      }
      state.metrics[key]! += delta[key];
    }
  }
  for (
    const row of [
      ...outputs.map((r) => ({ ...r, resource: false })),
      ...resources.map((r) => ({
        ...r,
        path: relative(root, r.path),
        resource: true,
      })),
    ]
  ) {
    const path = await regular(root, row.path);
    if (row.resource) state.metrics.resourceHashReads++;
    else state.metrics.outputHashReads++;
    if (
      signature(await Deno.lstat(path)) !== row.signature ||
      await hash(await Deno.readFile(path)) !== row.sha256
    ) fail("OPERATION_CHANGED", "Child output/resource bytes изменены до seal");
  }
  const complete = completeSchema.parse({
    state,
    catalog: {
      identity: children[0].catalog.identity,
      documents: catalogDocuments,
    },
    documents,
    outputs,
    resources,
    releaseDocuments,
  });
  await withWriter(root, async () => {
    await assertReservationCurrent(reservation);
    await assertPrivate(state, true);
    await assertSources(state);
    reservation.status = "sealed";
    await writePrivate(reservationPath(reservation), reservation);
    complete.state.metrics = { ...state.metrics };
    await Deno.writeTextFile(
      join(state.directory, "complete.json"),
      JSON.stringify(complete),
      { createNew: true, mode: 0o600 },
    );
  });
}
async function assertReservationPhase(state: State, phase: "bound" | "sealed") {
  try {
    await Deno.lstat(join(state.directory, "reservation.json"));
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return;
    throw e;
  }
  const reservation = await readReservation(state.root);
  if (
    reservation.operation !== state.operation || reservation.status !== phase
  ) {
    fail("OPERATION_INCOMPLETE", "Capture scope не находится в требуемой фазе");
  }
  return reservation;
}
/** Только correlation текущей pre-фазы; DTO не даёт complete IO authority. */
export async function withPendingNativeOperation<T>(
  expectationValue: NativePendingOperationExpectation,
  use: (operation: z.output<typeof NativePendingOperationSchema>) => Promise<T>,
): Promise<T> {
  const expectation = decode(
    NativePendingOperationExpectationSchema,
    expectationValue,
    "OPERATION_BINDING",
  );
  if (await Deno.realPath(expectation.root) !== expectation.root) {
    fail("OPERATION_BINDING", "Не canonical owner");
  }
  let active: { operation: string; directory: string }, state: State;
  try {
    active = await json(
      await regular(
        expectation.root,
        relative(expectation.root, pointer(expectation.root)),
      ),
    );
    if (
      !z.uuid().safeParse(active.operation).success ||
      active.directory !== join(base(expectation.root), active.operation)
    ) fail("OPERATION_BINDING", "Чужой pending pointer");
    state = decode(
      stateSchema,
      await json(
        await regular(
          expectation.root,
          relative(expectation.root, join(active.directory, "state.json")),
        ),
      ),
      "OPERATION_INCOMPLETE",
    );
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      fail("OPERATION_INCOMPLETE", "Pending generation отсутствует");
    }
    throw error;
  }
  if (
    state.root !== expectation.root || state.operation !== active.operation ||
    state.directory !== active.directory ||
    !same(state.profiles, expectation.profiles) ||
    state.projection !== expectation.projection ||
    state.outputDirectory !== expectation.outputDirectory
  ) {
    fail(
      "OPERATION_BINDING",
      "Pending owner/profile/projection/output отличаются",
    );
  }
  const pendingScope = await assertReservationPhase(state, "bound");
  const reservationSignature = pendingScope
    ? signature(await Deno.lstat(reservationPath(pendingScope)))
    : undefined;
  const pendingMetricBaseline = { ...state.metrics };
  const localInputs = pendingScope
    ? [
      ...new Set([
        ...state.configurationInputs,
        ...pendingScope.children.at(-1)!.inputs.flatMap((source) =>
          state.documentInputs[source]
        ),
      ]),
    ]
    : state.relevantInputs;
  const statePath = join(state.directory, "state.json"),
    stateSignature = signature(await Deno.lstat(statePath));
  const descriptor = immutable(NativePendingOperationSchema.parse({
    identity: {
      operation: state.operation,
      profiles: state.profiles,
      projection: state.projection,
      runtime: "quarto-1.11.5",
    },
    inputs: state.inputs.map((source) => ({
      source,
      captureWitness: state.captureWitnesses[source],
    })),
  }));
  let live = true;
  const environment = JSON.stringify(
      Object.entries(Deno.env.toObject()).sort(),
    ),
    cwd = Deno.cwd();
  const syncGuard = () => {
    if (!live) fail("OPERATION_EXPIRED", "Pending callback завершён");
  };
  const guard = async () => {
    syncGuard();
    if (
      cwd !== Deno.cwd() ||
      environment !== JSON.stringify(Object.entries(Deno.env.toObject()).sort())
    ) fail("OPERATION_CHANGED", "Изменён pending environment");
    await assertPrivate(state, !pendingScope);
    await assertReservationPhase(state, "bound");
    if (
      pendingScope &&
      signature(await Deno.lstat(reservationPath(pendingScope))) !==
        reservationSignature
    ) fail("OPERATION_CHANGED", "Pending child scope изменён");
    if (signature(await Deno.lstat(statePath)) !== stateSignature) {
      fail("OPERATION_CHANGED", "Изменён pending state");
    }
    try {
      await Deno.lstat(join(state.directory, "complete.json"));
      fail("OPERATION_COMPLETED", "Pending generation уже завершена");
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
    await assertSources(state, [], !pendingScope, localInputs);
  };
  const view = Object.freeze({
    get identity() {
      syncGuard();
      return descriptor.identity;
    },
    get inputs() {
      syncGuard();
      return descriptor.inputs;
    },
  });
  try {
    await guard();
    const result = await use(view);
    await guard();
    return result;
  } finally {
    live = false;
    if (pendingScope) {
      const delta = Object.fromEntries(
        Object.entries(state.metrics).map((
          [key, value],
        ) => [
          key,
          observedDelta(
            value,
            pendingMetricBaseline[key as keyof typeof pendingMetricBaseline],
          ),
        ]),
      );
      await Deno.writeTextFile(
        join(
          state.directory,
          "pending-" + crypto.randomUUID() + ".metrics.json",
        ),
        JSON.stringify(delta),
        { createNew: true, mode: 0o600 },
      );
    }
  }
}
export async function withCurrentNativeOperation<T>(
  expectationValue: NativeOperationExpectation,
  use: (operation: ReturnType<typeof publicOperation>) => Promise<T>,
): Promise<T> {
  const expectation = decode(
    NativeOperationExpectationSchema,
    expectationValue,
    "OPERATION_BINDING",
  );
  if (await Deno.realPath(expectation.root) !== expectation.root) {
    fail("OPERATION_BINDING", "Не canonical owner");
  }
  let active: { operation: string; directory: string };
  try {
    await regular(
      expectation.root,
      relative(expectation.root, pointer(expectation.root)),
    );
    active = await json(pointer(expectation.root));
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      fail("OPERATION_BINDING", "В owner нет текущей native операции");
    }
    throw error;
  }
  if (
    !z.uuid().safeParse(active.operation).success ||
    active.directory !== join(base(expectation.root), active.operation)
  ) fail("OPERATION_BINDING", "Неверный operation pointer");
  const path = join(active.directory, "complete.json");
  let signatureBefore: string, complete: z.output<typeof completeSchema>;
  try {
    signatureBefore = signature(
      await Deno.lstat(
        await regular(expectation.root, relative(expectation.root, path)),
      ),
    );
    complete = decode(completeSchema, await json(path), "OPERATION_INCOMPLETE");
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      fail("OPERATION_INCOMPLETE", "Операция ещё не завершена");
    }
    throw e;
  }
  await assertReservationPhase(complete.state, "sealed");
  const pointerSignature = signature(
    await Deno.lstat(pointer(expectation.root)),
  );
  if (
    complete.state.root !== expectation.root ||
    complete.state.directory !== active.directory ||
    complete.state.operation !== active.operation ||
    !same(complete.state.profiles, expectation.profiles) ||
    complete.state.projection !== expectation.projection ||
    complete.state.outputDirectory !== expectation.outputDirectory
  ) fail("OPERATION_BINDING", "Ожидания root/profiles/output отличаются");
  if (expectation.expectedDocuments) {
    const expected = expectation.expectedDocuments;
    if (
      new Set(expected.map((d) => d.source)).size !== expected.length ||
      expected.length !== complete.catalog.documents.length ||
      expected.some((d) =>
        !complete.catalog.documents.some((actual) =>
          actual.source === d.source && actual.format === d.format
        )
      )
    ) {
      fail("OPERATION_BINDING", "Exact document coverage/format отличаются");
    }
  }
  const index = sourceIndex(complete.state);
  const resourceBySource = new Map(
    complete.resources.map((row) => [row.source, row]),
  );
  const resourcesByDocument = new Map<string, typeof complete.resources>();
  for (const resource of complete.resources) {
    for (const source of resource.documents) {
      const rows = resourcesByDocument.get(source) ?? [];
      rows.push(resource);
      resourcesByDocument.set(source, rows);
    }
  }
  const additions = complete.resources.map((row) => row.source).filter((path) =>
    !index.rows.has(path)
  );
  let live = true;
  const callbackLife = { active: true };
  const callbackGuard = () => {
    if (!callbackLife.active) {
      projectBatches.failed = true;
      fail("OPERATION_EXPIRED", "User callback native операции завершён");
    }
  };
  const invocationEnvironment = JSON.stringify(
      Object.entries(Deno.env.toObject()).sort(),
    ),
    invocationCwd = Deno.cwd();
  const hostGuard = () => {
    if (!live) fail("OPERATION_EXPIRED", "Callback native операции завершён");
    if (projectBatches.failed) fail("OPERATION_INCOMPLETE", "A1 batch failed");
    if (
      Deno.cwd() !== invocationCwd ||
      JSON.stringify(Object.entries(Deno.env.toObject()).sort()) !==
        invocationEnvironment
    ) fail("OPERATION_CHANGED", "Environment/cwd изменились внутри callback");
  };
  const guard = async (
    full = false,
    selectedResources?: readonly string[],
    documentSources?: readonly string[],
    additionalInputs: readonly string[] = [],
  ) => {
    if (!live) fail("OPERATION_EXPIRED", "Callback native операции завершён");
    if (projectBatches.failed) fail("OPERATION_INCOMPLETE", "A1 batch failed");
    // В static owner callback неизменность исходников утверждена владельцем.
    // Полные entry/exit/явные fences проходят ниже; getters проверяют жизнь.
    if (!full && complete.state.sourcePolicy === "static") return;
    hostGuard();
    if (
      signature(await Deno.lstat(pointer(expectation.root))) !==
        pointerSignature
    ) fail("OPERATION_CHANGED", "Operation pointer заменён");
    metrics.currentnessChecks++;
    if (full) metrics.fullFences++;
    await assertPrivate(complete.state, full);
    await assertReservationPhase(complete.state, "sealed");
    if (signature(await Deno.lstat(path)) !== signatureBefore) {
      fail("OPERATION_CHANGED", "Complete capture заменён");
    }
    const documents = new Set(
      documentSources ??
        (selectedResources
          ? selectedResources.flatMap((source) =>
            resourceBySource.get(source)?.documents ?? []
          )
          : complete.state.inputs),
    );
    const inputs = [
      ...new Set([
        ...complete.state.configurationInputs,
        ...additionalInputs,
        ...[...documents].flatMap((source) =>
          complete.state.documentInputs[source] ?? []
        ),
      ]),
    ];
    await assertSources(
      complete.state,
      additions,
      full,
      inputs,
    );
    for (
      const row of [
        ...(full ? complete.outputs : []),
        ...(full ? complete.resources : [
          ...new Set(
            selectedResources
              ? selectedResources.flatMap((source) =>
                resourceBySource.get(source) ?? []
              )
              : [...documents].flatMap((source) =>
                resourcesByDocument.get(source) ?? []
              ),
          ),
        ]).map((r) => ({
          ...r,
          path: relative(expectation.root, r.path),
        })),
      ]
    ) {
      if (
        signature(
          await Deno.lstat(await regular(expectation.root, row.path)),
        ) !== row.signature
      ) fail("OPERATION_CHANGED", "Native output/resource изменён");
    }
  };
  const metrics = {
    ...complete.state.metrics,
    resourceByteReads: 0,
    resourceCacheHits: 0,
    fullFences: 0,
    currentnessChecks: 0,
  };
  const projectBatches = { active: 0, failed: false };
  const operation = publicOperation(
    complete,
    () => {
      if (!live) fail("OPERATION_EXPIRED", "Callback native операции завершён");
    },
    guard,
    metrics,
    projectBatches,
    hostGuard,
    callbackGuard,
  );
  const beforeOperationChild = async () => {
    callbackGuard();
    await guard();
    await assertSources(complete.state);
    callbackGuard();
  };
  const run = async () => {
    const result = await withAssignmentBeforeChild(
      beforeOperationChild,
      async () => {
        try {
          return await use(operation);
        } finally {
          callbackLife.active = false;
        }
      },
      callbackLife,
    );
    if (projectBatches.active || projectBatches.failed) {
      fail("OPERATION_INCOMPLETE", "A1 batch failed/not awaited");
    }
    await guard(true);
    hostGuard();
    if (projectBatches.active || projectBatches.failed) {
      fail(
        "OPERATION_INCOMPLETE",
        "A1 batch failed/not awaited after outer fence",
      );
    }
    return result;
  };
  try {
    await guard(true);
    return complete.state.assignment
      ? await withAssignmentExecution(
        assignmentProfile(
          complete.state.assignment.runtime,
          complete.state.root,
        ),
        run,
        beforeOperationChild,
      )
      : await run();
  } finally {
    callbackLife.active = false;
    live = false;
  }
}
function publicOperation(
  complete: z.output<typeof completeSchema>,
  syncGuard: () => void,
  guard: (
    full?: boolean,
    resources?: readonly string[],
    documents?: readonly string[],
    additionalInputs?: readonly string[],
  ) => Promise<void>,
  metrics:
    & Omit<z.output<typeof NativeOperationMetricsSchema>, "sourceHashBytes">
    & { sourceHashBytes?: number },
  projectBatches: { active: number; failed: boolean },
  hostGuard: () => void,
  callbackGuard: () => void,
) {
  const documents = new Map(
    complete.documents.map((d) => [d.context.input, immutable(d)]),
  );
  const generation = Object.freeze({});
  let reuse: ReturnType<typeof operationProjectContextReuse> | undefined;
  const declaredProjects = () =>
    complete.releaseDocuments.flatMap((row) =>
      Object.entries(row.early.definitions).flatMap(([id, value]) =>
        value.project
          ? [{ source: row.source, id, project: value.project }]
          : []
      )
    );
  const snapshots = new Map<string, Uint8Array>();
  let releaseValidated = false,
    releaseValidationFailed = false,
    validating = false;
  const roleCache = new Map<
    string,
    {
      pairs: NativeAssignmentDeliveryOptions["projectPlans"];
      index: Awaited<ReturnType<typeof assignmentRoleIndex>>;
    }
  >();
  const noReferences = {};
  const bodyCaches = new WeakMap<
    object,
    {
      namespace?: string;
      resolve?: unknown;
      sourceUrl?: unknown;
      cache: AssignmentBodyCache;
    }
  >();
  const deliveryCache = new Map<
    string,
    { roles: object; references: object; delivery: NativeAssignmentDelivery }
  >();

  const sourceRows = sourceIndex(complete.state).rows;
  const resourcesBySource = new Map(
    complete.resources.map((row) => [row.source, row]),
  );
  async function resourceInventory(value: NativeResourceRequest) {
    const request = decode(
      NativeResourceRequestSchema,
      value,
      "RESOURCE_PATH",
    );
    await guard(false, request.files.map((f) => f.source));
    const targets = new Set<string>(), files = [];
    let readBytes = false;
    for (const file of request.files) {
      assertArtifactTarget(
        file.target,
        complete.state.projection === "student" ? "student" : "full",
        complete.state.root,
      );
      if (
        targets.has(file.target) ||
        [...targets].some((t) =>
          t.startsWith(file.target + "/") || file.target.startsWith(t + "/")
        )
      ) fail("ARTIFACT_COLLISION", "Повторный ресурсный target");
      targets.add(file.target);
      const row = resourcesBySource.get(file.source);
      if (
        !ordinary(file.source) ||
        toolCachePath(complete.state.root, file.source) || !row
      ) {
        fail(
          "RESOURCE_PRIVATE_OR_SOURCE",
          "Файл не является видимым обычным native ресурсом",
        );
      }
      const physicalKey = JSON.stringify([
        JSON.parse(row.signature).slice(0, 2),
        row.sha256,
      ]);
      let bytes = snapshots.get(physicalKey);
      if (!bytes) {
        readBytes = true;
        metrics.resourceByteReads++;
        metrics.resourceHashReads++;
        const actual = await regular(
          complete.state.root,
          relative(complete.state.root, row.path),
        );
        if (signature(await Deno.lstat(actual)) !== row.signature) {
          fail("OPERATION_CHANGED", "Ресурс изменён перед чтением");
        }
        bytes = await Deno.readFile(actual);
        if (
          signature(await Deno.lstat(actual)) !== row.signature ||
          await hash(bytes) !== row.sha256
        ) {
          fail("OPERATION_CHANGED", "Ресурс изменён перед выдачей bytes");
        }
        snapshots.set(physicalKey, bytes);
      } else metrics.resourceCacheHits++;
      files.push({
        target: file.target,
        bytes: new Uint8Array(bytes),
        size: bytes.length,
        sha256: row.sha256,
        audience: complete.state.projection === "student"
          ? "student" as const
          : "full" as const,
        reason: "native-resource" as const,
      });
    }
    // Cached bytes копируются синхронно: после entry fence нет await/read/callback.
    // Второй fence нужен только когда выше действительно читались/хешировались bytes.
    if (readBytes) await guard(false, request.files.map((f) => f.source));
    return NativeResourceInventorySchema.parse({
      schema: "course-native-resource-inventory-v1",
      operation: catalog.identity.operation,
      audience: complete.state.projection === "student" ? "student" : "full",
      files,
    });
  }
  for (const doc of documents.values()) {
    bindNativeValue(
      doc,
      complete.state.root,
      () => guard(false, undefined, [doc.context.input]),
      async (source, target) => {
        const observed = complete.resources.find((r) =>
          r.source === source && r.documents.includes(doc.context.input)
        );
        if (!observed) return undefined;
        return (await resourceInventory({ files: [{ source, target }] }))
          .files[0].bytes;
      },
    );
  }
  const catalog = immutable(complete.catalog);
  const document = (value: NativeDocumentRequest) => {
    syncGuard();
    if (complete.state.assignment) {
      fail(
        "BODY.DELIVERY_ACCESS_REQUIRED",
        "Assignment bodies доступны только через selected delivery",
      );
    }
    const request = decode(
      NativeDocumentRequestSchema,
      value,
      "OPERATION_DOCUMENT",
    );
    const doc = documents.get(request.source);
    if (!doc) {
      fail("OPERATION_DOCUMENT", "Документ отсутствует в текущей операции");
    }
    return doc;
  };
  let acceptedContractProjects: ReadonlySet<string> | undefined;
  async function withProjectBatch<T, C extends ProjectContextView>(
    requestsValue: readonly ProjectContextRequest[],
    use: (batch: NativeOperationProjectContextBatch<C>) => Promise<T>,
    contractsOnly = false,
  ): Promise<T> {
    callbackGuard();
    syncGuard();
    if (projectBatches.active || projectBatches.failed) {
      projectBatches.failed = true;
      fail("CONTEXT_REQUEST", "Active/failed operation A1 batch");
    }
    projectBatches.active++;
    const childLife = { active: true };
    let callbackLive = false;
    const checkpoint = async (insideCallback = true) => {
      try {
        callbackGuard();
        syncGuard();
        if (!childLife.active || (insideCallback && !callbackLive)) {
          fail(
            "OPERATION_EXPIRED",
            "Checkpoint принадлежит завершённой A1 batch",
          );
        }
        hostGuard();
        if (complete.state.sourcePolicy !== "static") {
          await guard(false);
          callbackGuard();
          syncGuard();
          if (!childLife.active || (insideCallback && !callbackLive)) {
            fail(
              "OPERATION_EXPIRED",
              "Checkpoint завершился после callback A1 batch",
            );
          }
          hostGuard();
        }
      } catch (error) {
        projectBatches.failed = true;
        throw error;
      }
    };
    try {
      if (complete.state.sourcePolicy === "static") await guard(true);
      if (typeof use !== "function") {
        fail("CONTEXT_REQUEST", "A1 callback required");
      }
      const witness = complete.state.ownerWitness;
      if (
        !witness || typeof complete.state.metrics.sourceHashBytes !== "number"
      ) {
        fail(
          "CONTEXT_OWNER_WITNESS",
          "Fresh capture required: old complete has no owner witness",
        );
      }
      if (complete.state.assignment) {
        if (!releaseValidated || releaseValidationFailed || validating) {
          fail(
            "BODY.ASSIGNMENT_VALIDATION_REQUIRED",
            "Требуется current validation",
          );
        }
        buildAssignmentProvenance(
          catalog.identity,
          complete.state.ownerInputs,
          complete.state.inputs,
          complete.state.rows,
          complete.releaseDocuments,
        );
      }
      boundInput(requestsValue);
      const requests = decode(
        z.array(ProjectContextRequestSchema),
        requestsValue,
        "CONTEXT_REQUEST",
      );
      const allowed = new Set(
        declaredProjects().map((row) => {
          const format = complete.releaseDocuments.find((doc) =>
            doc.source === row.source
          )!.early.context.format;
          return relative(
            complete.state.root,
            join(
              assignmentProjectRoot(complete.state.root, row),
              "native-input.qmd",
            ),
          ) + "\0" + format;
        }),
      );
      const selected = new Set<string>();
      for (const request of requests) {
        if (
          request.owner !== complete.state.root ||
          !same(request.profiles, catalog.identity.profiles) ||
          new Set(request.inputs).size !== request.inputs.length
        ) fail("CONTEXT_REQUEST", "Foreign owner/profiles/duplicate input");
        for (const input of request.inputs) {
          const key = input + "\0" + request.format;
          if (!allowed.has(key) || selected.has(key)) {
            fail(
              "CONTEXT_REQUEST",
              "Foreign/duplicate private project input/format",
            );
          }
          selected.add(key);
        }
      }
      if (
        complete.state.assignment &&
        (selected.size !== allowed.size ||
          [...allowed].some((key) => !selected.has(key)))
      ) {
        fail(
          "BODY.ASSIGNMENT_PROJECT_PLANS",
          "Неполное private project/format coverage",
        );
      }
      await guard(false, [], []);
      acceptedContractProjects = selected;
      reuse ??= operationProjectContextReuse({
        owner: complete.state.root,
        profiles: catalog.identity.profiles,
        generation,
        staticSources: complete.state.sourcePolicy === "static",
        contractProbe: async (
          temporaryOwner,
          inputs,
          format,
          use,
          beforeSpawn,
        ) => {
          const check = () => {
            syncGuard();
            if (
              projectBatches.failed || projectBatches.active !== 1 ||
              !acceptedContractProjects ||
              format !== "html" || inputs.some((input) =>
                !acceptedContractProjects!.has(input + "\0" + format)
              ) ||
              complete.state.ownerWitness !== witness
            ) {
              fail(
                "BODY.ASSIGNMENT_PROJECT_PLANS",
                "Aggregate probe вне current operation/S/request coverage",
              );
            }
          };
          check();
          return await withAssignmentContractProbe({
            temporaryOwner,
            originalInputs: inputs.map((input) =>
              join(complete.state.root, input)
            ),
            format,
            guard: check,
            beforeSpawn,
          }, use);
        },
        sync: () => {
          syncGuard();
          if (projectBatches.failed) {
            fail("OPERATION_INCOMPLETE", "A1 batch failed");
          }
        },
        ownerWitness: witness,
        rows: complete.state.rows,
        memberships: complete.state.memberships,
        guard: async (paths) => {
          syncGuard();
          if (projectBatches.failed) {
            fail("OPERATION_INCOMPLETE", "A1 batch failed");
          }
          if (complete.state.sourcePolicy === "static") {
            return;
          }
          const locals = paths.map((path) =>
            relative(complete.state.root, path)
          );
          // SAME S directory membership does not itself prove canonical type.
          // Address only supplied known directories; no discovery or new hash.
          for (const local of new Set(locals)) {
            if (local && Object.hasOwn(complete.state.memberships, local)) {
              const actual = await ownedPhysical(complete.state.root, local);
              if (!(await Deno.lstat(actual)).isDirectory) {
                fail("OPERATION_CHANGED", "A1 source directory type changed");
              }
            }
          }
          await guard(false, [], [], locals);
        },
        read: async (path) => {
          const local = relative(complete.state.root, path),
            row = sourceRows.get(local);
          if (!row) {
            fail("PROJECT_SOURCE", "Required file is outside SAME S");
          }
          const actual = await regular(complete.state.root, local);
          if (signature(await Deno.lstat(actual)) !== row.signature) {
            fail("OPERATION_CHANGED", "A1 source changed before read");
          }
          const bytes = await Deno.readFile(actual);
          if (signature(await Deno.lstat(actual)) !== row.signature) {
            fail("OPERATION_CHANGED", "A1 source changed during read");
          }
          return bytes;
        },
      });
      const acquire = () =>
        reuse!<T, C>(requests, async (batch) => {
          callbackLive = true;
          try {
            return await use(Object.freeze({
              groups: batch.groups,
              get metrics() {
                return batch.metrics;
              },
              checkpoint: () => checkpoint(),
            }));
          } finally {
            callbackLive = false;
            childLife.active = false;
          }
        }, contractsOnly);
      const result = complete.state.sourcePolicy === "static"
        ? await withAssignmentBeforeChild(
          () => checkpoint(false),
          acquire,
          childLife,
        )
        : await acquire();
      if (complete.state.sourcePolicy === "static") await guard(true);
      syncGuard();
      hostGuard();
      if (projectBatches.active !== 1 || projectBatches.failed) {
        fail(
          "OPERATION_INCOMPLETE",
          "A1 batch failed/not active after closing fence",
        );
      }
      return result;
    } catch (e) {
      projectBatches.failed = true;
      throw e;
    } finally {
      callbackLive = false;
      childLife.active = false;
      acceptedContractProjects = undefined;
      projectBatches.active--;
    }
  }

  return Object.freeze({
    identity: catalog.identity,
    catalog,
    get metrics() {
      syncGuard();
      if (typeof complete.state.metrics.sourceHashBytes !== "number") {
        fail(
          "METRICS_UNAVAILABLE",
          "Fresh capture required for sourceHashBytes",
        );
      }
      return immutable(NativeOperationMetricsSchema.parse({
        ...metrics,
        ...Object.fromEntries(
          [
            ...authorityCounterNames,
            "sourceHashBytes",
            "fullSourceFences",
            "localSourceFences",
            "sourceDirectoryReads",
            "runtimeHashReads",
            "runtimeHashBytes",
            "runtimePathReads",
            "runtimeDirectoryReads",
            "outputHashReads",
            "nativeMetadataBytes",
            "childRenders",
          ].map(
            (key) => [
              key,
              complete.state.metrics[key as keyof State["metrics"]],
            ],
          ),
        ),
      }));
    },
    document,
    condition(value: NativeConditionRequest) {
      const request = decode(
        NativeConditionRequestSchema,
        value,
        "OPERATION_DOCUMENT",
      );
      return selectCondition(
        document({ source: request.source }),
        request.exerciseId,
        request.view,
      );
    },
    assertCurrent: () => guard(complete.state.sourcePolicy === "static"),
    async validateRelease(
      request: NativeReleaseRequest,
      validators: readonly NativeAdapterValidator[] = [],
    ) {
      syncGuard();
      await guard();
      const installed: string[] = [];
      for (
        const row of complete.state.rows.filter((r) =>
          r.path.startsWith("_extensions/") && r.path.endsWith("/contract.json")
        )
      ) {
        const contract = await json(
          await regular(complete.state.root, row.path),
        );
        if (typeof contract.name === "string") {
          if (installed.includes(contract.name)) {
            fail(
              "CORE.ADAPTER_INVALID",
              "Повторный installed adapter " + contract.name,
            );
          }
          installed.push(contract.name);
        }
      }
      if (
        complete.state.assignment && (validating || releaseValidationFailed)
      ) {
        fail(
          "BODY.ASSIGNMENT_VALIDATION_REQUIRED",
          "Failed/reentrant assignment validation",
        );
      }
      validating = true;
      try {
        const proof = await validateNativeRelease(
          complete.releaseDocuments,
          catalog.identity,
          request,
          validators,
          installed,
          async (source, path, kind) => {
            const absolute = resolve(
              kind || path.startsWith("/")
                ? complete.state.root
                : dirname(resolve(complete.state.root, source)),
              path.replace(/^\//, ""),
            );
            const local = relative(complete.state.root, absolute);
            if (toolCachePath(complete.state.root, absolute)) {
              fail(
                "RESOURCE.PROJECT_PATH_INVALID",
                "Tool cache не является проектом",
              );
            }
            if (
              excluded(complete.state, absolute) ||
              (!complete.state.rows.some((r) => r.path === local) &&
                !Object.hasOwn(complete.state.memberships, local))
            ) {
              fail(
                "RELEASE.SOURCE_POLICY",
                "Источник проекта/адаптера исключён или отсутствует среди зафиксированных входов владельца",
              );
            }
            const actual = await ownedPhysical(complete.state.root, local),
              info = await Deno.stat(actual);
            // Только объявленный dependency subtree: остальные sources проверит final full fence.
            const selected = info.isDirectory
              ? [
                local,
                ...complete.state.rows.map((r) => r.path).filter((p) =>
                  p.startsWith(local + "/")
                ),
                ...Object.keys(complete.state.memberships).filter((p) =>
                  p.startsWith(local + "/")
                ),
              ]
              : [local];
            await assertSources(
              complete.state,
              // Тот же sealed native resource set, который проверяет guard до/после release.
              complete.resources.map((r) => r.source).filter((path) =>
                !complete.state.rows.some((row) => row.path === path)
              ),
              false,
              selected,
            );
            if (
              (kind === "file" && !info.isFile) ||
              (kind === "directory" && !info.isDirectory) ||
              (!info.isDirectory && !info.isFile)
            ) {
              fail("RESOURCE.PROJECT_MISSING", "Нет project input");
            }
          },
          () => guard(),
        );
        await guard();
        releaseValidated = true;
        return proof;
      } catch (error) {
        if (complete.state.assignment) releaseValidationFailed = true;
        throw error;
      } finally {
        validating = false;
      }
    },
    async withProjectContexts<T>(
      requests: readonly ProjectContextRequest[],
      use: (batch: NativeOperationProjectContextBatch) => Promise<T>,
    ): Promise<T> {
      return await withProjectBatch<T, ProjectContext>(requests, use);
    },
    async withProjectContracts<T>(
      requests: readonly ProjectContextRequest[],
      use: (
        batch: NativeOperationProjectContextBatch<ProjectContractContext>,
      ) => Promise<T>,
    ): Promise<T> {
      return await withProjectBatch<T, ProjectContractContext>(
        requests,
        use,
        true,
      );
    },
    async assignmentProvenance() {
      syncGuard();
      if (!complete.state.assignment) {
        fail("BODY.ASSIGNMENT_REQUIRED", "Нет explicit assignment intent");
      }
      if (!releaseValidated || releaseValidationFailed || validating) {
        fail(
          "BODY.ASSIGNMENT_VALIDATION_REQUIRED",
          "Требуется успешная текущая owner validation",
        );
      }
      await guard(false);
      const value = buildAssignmentProvenance(
        catalog.identity,
        complete.state.ownerInputs,
        complete.state.inputs,
        complete.state.rows,
        complete.releaseDocuments,
      );
      await guard(false);
      return value;
    },
    async assignmentDelivery(
      requestValue: NativeAssignmentRequest,
      options: NativeAssignmentDeliveryOptions,
    ): Promise<NativeAssignmentDelivery> {
      syncGuard();
      await guard();
      const assignment = complete.state.assignment;
      if (!assignment) {
        fail("BODY.ASSIGNMENT_REQUIRED", "Нет explicit assignment intent");
      }
      if (!releaseValidated || releaseValidationFailed || validating) {
        fail(
          "BODY.ASSIGNMENT_VALIDATION_REQUIRED",
          "Требуется успешная текущая owner validation",
        );
      }
      buildAssignmentProvenance(
        catalog.identity,
        complete.state.ownerInputs,
        complete.state.inputs,
        complete.state.rows,
        complete.releaseDocuments,
      );
      const request = decode(
        NativeAssignmentRequestSchema,
        requestValue,
        "BODY.ASSIGNMENT_MEMBERSHIP",
      );
      if (
        !assignment.assessments.some((p) =>
          p.source === request.source && p.id === request.assessmentId
        )
      ) fail("BODY.ASSIGNMENT_MEMBERSHIP", "Composition вне выбранного intent");
      if (
        !options || Object.keys(options).some((k) =>
          !["projectPlans", "references"].includes(k)
        ) || !Array.isArray(options.projectPlans) ||
        options.projectPlans.length > 4096
      ) {
        fail(
          "BODY.ASSIGNMENT_PROJECT_PLANS",
          "Нужны exact all-declaration student/full plans",
        );
      }
      const work = complete.releaseDocuments.find((row) =>
        row.source === request.source
      )?.early.release?.assessment;
      if (!work || work.id !== request.assessmentId) {
        fail(
          "BODY.ASSIGNMENT_MEMBERSHIP",
          "Нет actual selected canonical composition",
        );
      }
      const declared = declaredProjects();
      const key = options.projectPlans.map((p) =>
        [p.source, p.exerciseId, p.student?.id, p.full?.id].join(":")
      ).sort().join("\n");
      let saved = roleCache.get(key);
      const samePairs = saved &&
        saved.pairs.length === options.projectPlans.length &&
        saved.pairs.every((a) =>
          options.projectPlans.some((b) =>
            a.source === b.source && a.exerciseId === b.exerciseId &&
            a.student === b.student && a.full === b.full
          )
        );
      if (!samePairs) {
        const index = await assignmentRoleIndex(
          complete.state.root,
          catalog.identity.profiles,
          complete.catalog.documents,
          declared,
          options.projectPlans,
          [
            ...complete.state.rows,
            ...complete.resources.map((row) => ({
              path: row.source,
              signature: row.signature,
            })),
          ],
          generation,
        );
        saved = {
          pairs: options.projectPlans.map((pair) => ({ ...pair })),
          index,
        };
        roleCache.set(key, saved);
      }
      const roles = saved!.index;
      await roles.guard();
      const knownResourceInputs = new Set([
        ...complete.state.rows.map((row) =>
          resolve(complete.state.root, row.path)
        ),
        ...complete.resources.map((row) =>
          resolve(complete.state.root, row.source)
        ),
        ...assignment.runtime.files.map((row) =>
          row.path
        ),
      ]);
      const publicResource = (absolute: string) => {
        roles.assertPath(absolute);
        if (!knownResourceInputs.has(absolute)) {
          fail(
            "BODY.PRODUCER_DEPENDENCY_UNQUALIFIED",
            "Body/citation resource вне frozen inputs " + absolute,
          );
        }
      };
      const referenceKey = options.references ?? noReferences;
      let refs = bodyCaches.get(referenceKey);
      if (!refs) {
        refs = {
          namespace: options.references?.namespace,
          resolve: options.references?.resolve,
          sourceUrl: options.references?.sourceUrl,
          cache: { questions: new Map(), introductions: new Map() },
        };
        bodyCaches.set(referenceKey, refs);
      }
      const referenceGuard = () => {
        if (
          options.references &&
          (refs!.namespace !== options.references.namespace ||
            refs!.resolve !== options.references.resolve ||
            refs!.sourceUrl !== options.references.sourceUrl)
        ) {
          fail(
            "BODY.REFERENCE_CONTEXT_CHANGED",
            "Body reference context изменён",
          );
        }
      };
      referenceGuard();
      const deliveryKey = request.source + "\0" + request.assessmentId + "\0" +
          key,
        cached = deliveryCache.get(deliveryKey);
      if (
        cached && cached.roles === roles && cached.references === referenceKey
      ) {
        await guard();
        return cached.delivery;
      }
      const built = await buildAssignmentBody({
        root: complete.state.root,
        owner: complete.releaseDocuments[0].early.release?.course.id ?? "",
        work: { source: request.source, composition: work },
        documents: complete.documents,
        references: options.references,
        cache: refs.cache,
        assertPublicResource: publicResource,
        readResource: async (source, target, documentSource) => {
          roles.assertPath(resolve(complete.state.root, source));
          const observed = complete.resources.find((row) =>
            row.source === source && row.documents.includes(documentSource)
          );
          if (!observed) {
            fail(
              "RESOURCE_UNQUALIFIED",
              "Нет resource witness owning native document",
            );
          }
          const file =
            (await resourceInventory({ files: [{ source, target }] })).files[0];
          return {
            bytes: file.bytes,
            sha256: file.sha256,
            identity: JSON.stringify([
              JSON.parse(observed.signature).slice(0, 2),
              observed.sha256,
            ]),
          };
        },
      });
      const conditionGuard = async () => {
        referenceGuard();
        if (!releaseValidated || releaseValidationFailed) {
          fail(
            "BODY.ASSIGNMENT_VALIDATION_REQUIRED",
            "Assignment validation утрачена",
          );
        }
        await guard();
        await roles.guard();
      };
      for (const condition of Object.values(built.conditions)) {
        immutable(condition);
        const pair = roles.plans.get(
          condition.context.input + "\0" + condition.exerciseId,
        );
        bindAssignmentCondition(
          condition,
          pair ? [pair.student, pair.full] : [],
          roles.assertPath,
        );
        bindNativeValue(
          condition,
          complete.state.root,
          conditionGuard,
          async (source, target) => {
            roles.assertPath(resolve(complete.state.root, source));
            if (
              !complete.resources.some((row) =>
                row.source === source &&
                row.documents.includes(condition.context.input)
              )
            ) {
              return undefined;
            }
            return (await resourceInventory({ files: [{ source, target }] }))
              .files[0].bytes;
          },
        );
      }
      const delivery = immutable({
        schema: "course-native-assignment-delivery-v1" as const,
        origin: { ...catalog.identity, assessments: assignment.assessments },
        assessment: { source: request.source, id: request.assessmentId },
        publicPackage: built.publicPackage,
        conditions: built.conditions,
      });
      await conditionGuard();
      deliveryCache.set(deliveryKey, {
        roles,
        references: referenceKey,
        delivery,
      });
      return delivery;
    },
    resourceInventory(value: NativeResourceRequest) {
      syncGuard();
      if (complete.state.assignment) {
        fail(
          "BODY.DELIVERY_ACCESS_REQUIRED",
          "Assignment resources требуют role-bound delivery",
        );
      }
      return resourceInventory(value);
    },
  });
}

export type NativeOperation = ReturnType<typeof publicOperation>;

export async function withPreparedNativeCaptureScope<T>(
  prepared: AssignmentAdmission,
  reservation: NativeCaptureReservation,
  use: Parameters<typeof withNativeCaptureScope<T>>[2],
): Promise<T> {
  return await withNativeCaptureScope(
    reservation,
    { expectedSources: prepared.inputs },
    use,
    prepared,
  );
}
