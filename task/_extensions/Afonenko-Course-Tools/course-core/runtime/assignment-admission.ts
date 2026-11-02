import { SupportedQuartoVersionSchema } from "../infrastructure/quarto-version.ts";
import {
  assignmentChild,
  withAssignmentExecution,
} from "./assignment-execution.ts";
import {
  basename,
  dirname,
  fromFileUrl,
  join,
  relative,
  resolve,
} from "stdlib/path";
import { fail } from "../contracts/project.ts";
import { assertSources, hash, signature, snapshot } from "./source-snapshot.ts";
import type { SourceSnapshotState } from "./source-snapshot.ts";
import {
  addAuthorityMetrics,
  assertAssignmentAuthority,
  assertAuthorityHost,
  assertCapsuleIndependent,
  authorityProfile,
  emptyAuthorityMetrics,
  openAssignmentAuthority,
} from "./assignment-authority.ts";
import type {
  AssignmentAuthorityIdentity,
  AuthorityMetrics,
} from "./assignment-authority.ts";
import type { AssignmentProducerProfile } from "./assignment-producer-profiles.ts";
import type { NativeCaptureReservation } from "./contracts.ts";
export type AssignmentIntent = { source: string; id: string }[];
export type AssignmentPreparation = {
  assignment: {
    mode: "new";
    prepare: (
      owner: Readonly<Record<string, unknown>>,
    ) => Promise<
      {
        expectedSources: readonly string[];
        assessments: readonly { source: string; id: string }[];
      }
    >;
  };
};
export type AssignmentRuntimeWitness = {
  profile: string;
  authority: AssignmentAuthorityIdentity;
  files: { path: string; signature: string; sha256: string }[];
  directories: { path: string; names: string[] }[];
  absent: string[];
};
export type AssignmentAdmission = {
  source: SourceSnapshotState;
  operation: string;
  owner: Record<string, any>;
  inputs: string[];
  assessments: AssignmentIntent;
  profile: AssignmentProducerProfile;
  runtime: AssignmentRuntimeWitness;
  runtimeHashReads: number;
  runtimeHashBytes: number;
  runtimePathReads: number;
  runtimeDirectoryReads: number;
  inspectCalls: number;
} & AuthorityMetrics;
const admitted = new WeakSet<object>();
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const frozen = <T>(v: T): T => {
  if (v && typeof v === "object") {
    Object.values(v).forEach(frozen);
    Object.freeze(v);
  }
  return v;
};
function invalid(s: string): never {
  return fail("BODY.PRODUCER_INPUT_UNQUALIFIED", s);
}
const changed = (s: string): never => fail("BODY.PRODUCER_INPUT_CHANGED", s);
async function regular(path: string) {
  const stat = await Deno.lstat(path);
  if (!stat.isFile || stat.isSymlink || await Deno.realPath(path) !== path) {
    invalid("Неканонический producer input " + path);
  }
  return stat;
}
async function absent(path: string) {
  let current = path;
  while (true) {
    try {
      const stat = await Deno.lstat(current);
      if (current === path) return false;
      if (
        !stat.isDirectory || stat.isSymlink ||
        await Deno.realPath(current) !== current
      ) changed("Неканонический absence corridor " + current);
      return true;
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) throw e;
    }
    const parent = dirname(current);
    if (parent === current) changed("Нет canonical absence ancestor");
    current = parent;
  }
}
async function names(path: string) {
  const stat = await Deno.lstat(path);
  if (
    !stat.isDirectory || stat.isSymlink || await Deno.realPath(path) !== path
  ) invalid("Неканонический loader corridor " + path);
  const result = [];
  for await (const entry of Deno.readDir(path)) result.push(entry.name);
  return result.sort();
}
const runtimeAuthorities = new WeakMap<
  object,
  Awaited<ReturnType<typeof openAssignmentAuthority>>
>();
export function assignmentProfile(
  witness: AssignmentRuntimeWitness,
  root: string,
) {
  const handle = runtimeAuthorities.get(witness);
  if (!handle) invalid("Runtime authority не открыта/не связана");
  return authorityProfile(handle, witness.profile, root);
}
/** Кандидат owner из bound input/source; authorityProfile независимо проверяет root/id. */
export function nativeAssignmentOwner(
  input: string,
  source: unknown,
  capture: unknown,
  operation: string,
) {
  if (
    typeof input !== "string" || !input.startsWith("/") ||
    input.includes("\0") || resolve(input) !== input ||
    typeof source !== "string" || !source || source.startsWith("/") ||
    source.includes("\\") || source.includes("\0") ||
    source.split("/").some((part) => !part || part === "." || part === "..") ||
    !input.endsWith("/" + source)
  ) invalid("Native input/source owner binding отличается");
  const root = input.slice(0, -source.length - 1) || "/";
  if (
    typeof capture !== "string" || !capture.startsWith("/") ||
    capture.includes("\0") || resolve(capture) !== capture ||
    dirname(capture) !==
      join(root, "_generated/course-spec/native-ts", operation) ||
    !/^(0|[1-9][0-9]*)$/.test(basename(capture))
  ) invalid("Native capture/owner/operation binding отличается");
  return root;
}
export async function nativeAssignmentProfile(
  id: string,
  root: string,
  identity: AssignmentAuthorityIdentity,
) {
  const handle = await openAssignmentAuthority(root);
  if (!equal(handle.identity, identity)) {
    changed("Native authority identity отличается");
  }
  const profile = authorityProfile(handle, id, root);
  if (
    !profile.runtime.files.some((r) => r.path === Deno.execPath()) ||
    !profile.runtime.files.some((r) => r.path === fromFileUrl(Deno.mainModule))
  ) invalid("Native Core module/executable вне qualified K");
  return { profile, cost: handle.cost };
}
export async function assertAssignmentRuntime(
  witness: AssignmentRuntimeWitness,
  root: string,
  metrics?:
    & { runtimePathReads: number; runtimeDirectoryReads: number }
    & Partial<AuthorityMetrics>,
  full = false,
) {
  let handle = runtimeAuthorities.get(witness);
  if (!handle) {
    handle = await openAssignmentAuthority(root);
    if (!equal(handle.identity, witness.authority)) {
      changed("Authority identity отличается от private operation");
    }
    runtimeAuthorities.set(witness, handle);
    addAuthorityMetrics(metrics, handle.cost);
  }
  await assertAssignmentAuthority(handle, root, metrics, full);
  const profile = assignmentProfile(witness, root);
  if (
    !equal(
      witness.files.map((r) => ({ path: r.path, sha256: r.sha256 })),
      profile.runtime.files,
    ) || !equal(witness.directories, profile.runtime.directories) ||
    !equal(witness.absent, profile.runtime.absent)
  ) changed("Producer runtime witness не принадлежит поставке");
  for (const row of witness.files) {
    if (metrics) metrics.runtimePathReads++;
    if (signature(await regular(row.path)) !== row.signature) {
      changed("Изменён producer runtime " + row.path);
    }
  }
  for (const row of witness.directories) {
    if (metrics) metrics.runtimeDirectoryReads++;
    if (!equal(await names(row.path), row.names)) {
      changed("Изменён loader corridor " + row.path);
    }
  }
  for (const path of witness.absent) {
    if (metrics) metrics.runtimePathReads++;
    if (!await absent(path)) changed("Возник loader candidate " + path);
  }
}
/** Внутренняя preparation authority; ни JSON, ни consumer boolean не создают этот объект. */
export function consumeAssignmentAdmission(value: AssignmentAdmission) {
  if (!admitted.delete(value)) {
    fail("OPERATION_BINDING", "Чужая/повторная assignment preparation");
  }
  return value;
}
export async function prepareAssignment(
  reservation: NativeCaptureReservation,
  options: AssignmentPreparation,
): Promise<AssignmentAdmission> {
  if (options?.assignment?.mode !== "new") {
    invalid("Требуется явное новое assignment intent");
  }
  const authority = await openAssignmentAuthority(reservation.root);
  const profile = authorityProfile(authority, undefined, reservation.root);
  assertAuthorityHost(authority, profile);
  if (
    Object.keys(options).some((k) => k !== "assignment") ||
    Object.keys(options.assignment ?? {}).some((k) =>
      !["prepare", "mode"].includes(k)
    )
  ) invalid("Неизвестный assignment option");
  if (
    reservation.projection !== "author" ||
    await Deno.realPath(reservation.root) !== reservation.root ||
    resolve(reservation.outputDirectory) !== reservation.outputDirectory ||
    !reservation.outputDirectory.startsWith(reservation.root + "/_generated/")
  ) {
    invalid(
      "Assignment требует frozen canonical owner, author и служебный output",
    );
  }
  if (
    Deno.execPath() !== profile.launcher.executable ||
    !equal(Deno.args, profile.launcher.arguments)
  ) invalid("Launcher/argv не квалифицирован");
  if (
    Deno.env.get("COURSE_PERF_MODE") &&
    Deno.env.get("COURSE_PERF_MODE") !== "off"
  ) invalid("Ambient performance agent не квалифицирован");
  if (typeof options.assignment?.prepare !== "function") {
    invalid("Требуется trusted preparation callback");
  }
  for (const [key, value] of Object.entries(Deno.env.toObject())) {
    if (
      /^(?:QUARTO(?:_|$)|DENO(?:_|$)|PANDOC(?:_|$)|COURSE_(?:PERF|CORE|QRC|NATIVE)_)/
        .test(
          key,
        ) &&
      (!Object.hasOwn(profile.hostEnvironment, key) ||
        profile.hostEnvironment[key] !== value)
    ) invalid("Неквалифицированный environment override " + key);
  }
  for (const [key, value] of Object.entries(profile.hostEnvironment)) {
    if ((Deno.env.get(key) ?? null) !== value) {
      invalid("Host environment изменён " + key);
    }
  }
  if (
    profile.native.environment.XDG_CACHE_HOME !==
      Deno.env.get("XDG_CACHE_HOME") ||
    profile.native.environment.QUARTO_RUN_NO_NETWORK !== "true" ||
    profile.native.environment.JAVA_HOME !== "/usr/lib/jvm/java-25-openjdk" ||
    !profile.native.environment.PATH?.startsWith(
      "/usr/lib/jvm/java-25-openjdk/bin:",
    )
  ) invalid("Native child environment не квалифицирован");

  const state: SourceSnapshotState = {
    root: reservation.root,
    outputDirectory: reservation.outputDirectory,
    rows: [],
    memberships: {},
    relevantInputs: [],
    metrics: {
      fullWalks: 0,
      sourceDirectoryReads: 0,
      sourceHashReads: 0,
      sourceHashBytes: 0,
      fullSourceFences: 0,
      localSourceFences: 0,
    },
  };
  await snapshot(state);
  assertCapsuleIndependent(authority, state.rows);
  const actual = state.rows.map((r) => ({ path: r.path, sha256: r.sha256 }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const expected = [...profile.source.files].sort((a, b) =>
    a.path.localeCompare(b.path)
  );
  const sorted = (v: Record<string, readonly string[]>) =>
    Object.entries(v).sort(([a], [b]) => a.localeCompare(b));
  if (
    !equal(actual, expected) ||
    !equal(sorted(state.memberships), sorted(profile.source.memberships))
  ) invalid("Frozen source bytes/membership изменились");
  const runtime: AssignmentRuntimeWitness = {
    profile: profile.id,
    authority: authority.identity,
    files: [],
    directories: profile.runtime.directories.map((r) => ({
      path: r.path,
      names: [...r.names],
    })),
    absent: [...profile.runtime.absent],
  };
  runtimeAuthorities.set(runtime, authority);
  const result: AssignmentAdmission = {
    ...emptyAuthorityMetrics(),
    ...authority.cost,
    source: state,
    operation: crypto.randomUUID(),
    owner: {},
    inputs: [],
    assessments: [],
    profile,
    runtime,
    runtimeHashReads: 0,
    runtimeHashBytes: 0,
    runtimePathReads: 0,
    runtimeDirectoryReads: 0,
    inspectCalls: 0,
  };
  for (const row of profile.runtime.files) {
    const existing = state.rows.find((r) =>
      join(state.root, r.path) === row.path
    );
    if (existing) {
      if (
        existing.sha256 !== row.sha256 ||
        signature(await regular(row.path)) !== existing.signature
      ) invalid("Producer source dependency изменён " + row.path);
      result.runtimePathReads++;
      runtime.files.push({ ...row, signature: existing.signature });
      continue;
    }
    const before = signature(await regular(row.path)),
      bytes = await Deno.readFile(row.path);
    result.runtimeHashReads++;
    result.runtimeHashBytes += bytes.length;
    if (
      await hash(bytes) !== row.sha256 ||
      signature(await regular(row.path)) !== before
    ) invalid("Producer dependency изменён " + row.path);
    runtime.files.push({ ...row, signature: before });
  }
  if (
    !runtime.files.some((r) => r.path === profile.native.executable) ||
    !runtime.files.some((r) => r.path === profile.launcher.executable) ||
    !runtime.files.some((r) =>
      r.path === fromFileUrl(profile.launcher.entrypoint)
    )
  ) invalid("Неполный runtime/launcher closure");
  assertCapsuleIndependent(authority, runtime.files);
  await assertAssignmentRuntime(runtime, reservation.root, result);
  await assertSources(state);
  const inspected = await withAssignmentExecution(profile, async () => {
    const qualified = assignmentChild(profile.native.executable, [
      "inspect",
      reservation.root,
      ...(profile.launcher.requestedProfiles.length
        ? ["--profile", profile.launcher.requestedProfiles.join(",")]
        : []),
    ], reservation.root)!;
    return await new Deno.Command(qualified.executable, {
      ...qualified.options,
      stdout: "piped",
      stderr: "piped",
    }).output();
  });
  result.inspectCalls++;
  if (!inspected.success) {
    fail(
      "BODY.PRODUCER_INSPECTION_FAILED",
      new TextDecoder().decode(inspected.stderr),
    );
  }
  await assertAssignmentRuntime(runtime, reservation.root, result);
  await assertSources(state);
  const owner = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(inspected.stdout),
  );
  if (
    owner.dir !== reservation.root ||
    !SupportedQuartoVersionSchema.safeParse(owner.quarto?.version).success ||
    owner.config?.["course-core-runtime"] !== "native-ts" ||
    owner.config?.["course-core-projection"] !== "author" ||
    !Array.isArray(owner.files?.input) || !Array.isArray(owner.engines) ||
    owner.engines.some((s: unknown) => s !== "markdown")
  ) invalid("Native owner не соответствует квалифицированному producer");
  result.owner = owner;
  const selection = await withAssignmentExecution(
    profile,
    () => options.assignment.prepare(frozen(structuredClone(owner))),
    async () => {
      await assertSources(state);
      await assertAssignmentRuntime(runtime, reservation.root, result);
    },
  );
  if (
    !selection || !Array.isArray(selection.expectedSources) ||
    !selection.expectedSources.length ||
    selection.expectedSources.length > 4096 ||
    new Set(selection.expectedSources).size !==
      selection.expectedSources.length ||
    selection.expectedSources.some((p) =>
      typeof p !== "string" ||
      !owner.files.input.includes(join(reservation.root, p)) ||
      p !== relative(reservation.root, join(reservation.root, p)) ||
      p.split("/").some((s) => !s || s === "." || s === "..")
    )
  ) invalid("Неверный prepared source scope");
  if (
    !Array.isArray(selection.assessments) || !selection.assessments.length ||
    selection.assessments.length > 4096 ||
    new Set(selection.assessments.map((p) => p.source + "\0" + p.id)).size !==
      selection.assessments.length ||
    selection.assessments.some((p) =>
      !selection.expectedSources.includes(p.source) || !p.id ||
      !/^[a-z][a-z0-9-]*$/.test(p.id)
    )
  ) invalid("Неверный assignment intent");
  result.inputs = [...selection.expectedSources];
  result.assessments = selection.assessments.map((p) => ({ ...p }));
  await assertAssignmentRuntime(runtime, reservation.root, result);
  await assertSources(state);
  admitted.add(result);
  return result;
}
