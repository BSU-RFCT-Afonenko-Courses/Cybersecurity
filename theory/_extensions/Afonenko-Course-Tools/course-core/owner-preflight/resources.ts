import {
  dirname,
  fromFileUrl,
  isAbsolute,
  join,
  relative,
  resolve,
} from "stdlib/path";
import {
  activeOwner,
  assertFrozen,
  evaluate,
  inspectOwnerDownloads,
  preparedSession,
  sessionAt,
} from "./owner.ts";
import { OwnerFailure } from "./owner/failure.ts";
import { digestFile, exists, sha } from "./owner/runtime.ts";
import type { Invocation, PreparedOwner, Session } from "./owner/protocol.ts";
import {
  assertCaptureProjections,
  type CaptureProjection,
  projectionManifestPath,
} from "./capture-projections.ts";
import {
  navigationDownloads,
  validateNavigationCompletion,
} from "./navigation.ts";
import {
  type DeferredPublicationAddress,
  deferredPublicationAddress,
  deferredPublicationAddresses,
  validatePublicationAddresses,
} from "./publication-addresses.ts";
import { validateNativeListingObservation } from "./native-listing-evidence.ts";
import {
  type DeferredNativeListingAddress,
  deferredNativeListingAddresses,
  type NativeListingAddress,
  validateNativeListingAddresses,
} from "./native-listing-addresses.ts";
import { bodyServicePaths } from "../body-export/producer.ts";
export interface ResourceUse {
  kind: "Link" | "Image";
  target: string;
  order: number;
  nativePlot?: boolean;
}
export interface ResourceObservation {
  source: string;
  profile: "student" | "full";
  phase: "capture" | "render";
  effectiveBase: string;
  outputDirectory?: string;
  outputFile?: string;
  raw: ResourceUse[];
  projected: ResourceUse[];
  opaque?: string[];
  canonicalIds?: string[];
  references?: { id: string; target: string }[];
  nativeListingAddresses?: NativeListingAddress[];
  nativeListingWitness?: { inputPath: string; witnessPath: string };
}
export interface ResolvedResourceUse extends ResourceUse {
  source: string;
  profile: "student" | "full";
  phase: "capture" | "render";
  projection: "raw" | "projected";
  path: string;
  effectiveBase: string;
}
export interface OwnerResourceFile {
  path: string;
  sha256: string;
  origin: "source" | "generated" | "service";
  actualPath: string;
  producer: string;
  role: "root" | "include" | "resource" | "other";
  captureProjection?: CaptureProjection;
}
export interface ResourceFilePolicy {
  path: string;
  sha256: string;
  allowed: boolean;
  reasons: string[];
  baselinePublic: boolean;
  baselineSeen: boolean;
  baselineClosedOnly: boolean;
  actualPublic: boolean;
}
export interface ResourceDiagnostic {
  code: string;
  path: string;
  reasons: string[];
}
export interface RuntimeDeclaration {
  source: string;
  sourceSha256: string;
  producer: string;
  dependency: string;
  version: string;
  asset: string;
  kind: "script" | "stylesheet";
  descriptorPath: string;
  descriptorSha256: string;
  registrationPath: string;
  registrationSha256: string;
  markerProvider: string;
  markerAsset: string;
}
export interface RuntimeEligibility
  extends Omit<RuntimeDeclaration, "markerProvider" | "markerAsset"> {
  eligible: boolean;
  reasons: string[];
}
interface ResourcePolicyResult {
  files: ResourceFilePolicy[];
  diagnostics: ResourceDiagnostic[];
  runtimeEligibility: RuntimeEligibility[];
}
export interface OwnerResourceIndex {
  protocol: 1;
  root: string;
  attemptId: string;
  profile: "student" | "full";
  sessionId: string;
  sessionHash: string;
  invocationId: string;
  files: OwnerResourceFile[];
  evidence: { baseline: ResolvedResourceUse[]; actual: ResolvedResourceUse[] };
  policy: { files: ResourceFilePolicy[]; diagnostics: ResourceDiagnostic[] };
  runtimeEligibility: RuntimeEligibility[];
  indexHash: string;
  nativeListingAddressReceiptHash?: string;
}
const here = dirname(fromFileUrl(import.meta.url));
function fail(code: string, cause: unknown): never {
  throw new OwnerFailure(code, cause);
}
export function resourceRelative(root: string, path: string): string {
  const rel = relative(root, resolve(root, path)).replaceAll("\\", "/");
  if (!rel || rel === ".." || rel.startsWith("../") || isAbsolute(rel)) {
    fail("RESOURCE.OUTSIDE_OWNER", path);
  }
  return rel;
}
export async function resourceNoLinks(root: string, path: string) {
  const rel = resourceRelative(root, path);
  let current = root;
  for (const part of rel.split("/")) {
    current = join(current, part);
    try {
      if ((await Deno.lstat(current)).isSymlink) {
        fail("RESOURCE.SYMLINK_UNSUPPORTED", current);
      }
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) return;
      throw e;
    }
  }
}
/** The unchanged native URI-to-location rule, before any ownership decision. */
export function resourceTargetLocation(
  root: string,
  observation: ResourceObservation,
  use: ResourceUse,
): string | undefined {
  const target = use.target;
  if (
    target.startsWith("#") || target.startsWith("//") ||
    /^[a-z][a-z0-9+.-]*:/i.test(target)
  ) return;
  let decoded: string;
  try {
    decoded = decodeURIComponent(target.split(/[?#]/, 1)[0]);
  } catch {
    fail("RESOURCE.INVALID_URI", target);
  }
  if (!decoded || decoded.includes("\0") || decoded.includes("\\")) {
    fail("RESOURCE.INVALID_URI", target);
  }
  resourceRelative(root, observation.effectiveBase);
  return decoded.startsWith("/")
    ? resolve(root, "." + decoded)
    : resolve(root, dirname(observation.effectiveBase), decoded);
}
export async function resolveResourceTarget(
  root: string,
  observation: ResourceObservation,
  use: ResourceUse,
): Promise<{ path: string; actualPath: string } | undefined> {
  const actualPath = resourceTargetLocation(root, observation, use);
  if (!actualPath) return;
  const path = resourceRelative(root, actualPath);
  await resourceNoLinks(root, actualPath);
  if (await exists(actualPath)) {
    if (!(await Deno.stat(actualPath)).isFile) fail("RESOURCE.NOT_FILE", path);
    if (await Deno.realPath(actualPath) !== actualPath) {
      fail("RESOURCE.SYMLINK_UNSUPPORTED", path);
    }
  }
  return { path, actualPath };
}
export async function resourceHash(value: unknown) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(value)),
      ),
    ),
  ).map((n) => n.toString(16).padStart(2, "0")).join("");
}
export async function resourcePolicy(
  profile: "student" | "full",
  baseline: ResolvedResourceUse[],
  actual: ResolvedResourceUse[],
  files: OwnerResourceFile[],
  selections: string[],
  directory: string,
  schema = join(here, "resource-policy.cue"),
  runtime: RuntimeDeclaration[] = [],
  filters: string[] = [],
) {
  const compact = (uses: ResolvedResourceUse[]) =>
    uses.map((
      { source, profile, phase, projection, kind, target, order, path },
    ) => ({ source, profile, phase, projection, kind, target, order, path }));
  return await evaluate(
    {
      profile,
      baseline: compact(baseline),
      actual: compact(actual),
      files: files.map(({ path, sha256, origin, role }) => ({
        path,
        sha256,
        origin,
        role,
      })),
      selections,
      runtime,
      filters,
    },
    directory,
    schema,
  ) as ResourcePolicyResult;
}
export async function runtimeDeclarations(
  s: Session,
): Promise<RuntimeDeclaration[]> {
  const providers = (s.audit.profiles[s.profile].extensions || []).filter((
    extension: any,
  ) => extension.id?.name === "course-presentation");
  if (providers.length > 1) {
    fail(
      "RESOURCE.RUNTIME_PROVIDER_AMBIGUOUS",
      providers.map((x: any) => x.path),
    );
  }
  const result: RuntimeDeclaration[] = [];
  for (const extension of providers) {
    const base = resolve(s.root, extension.path);
    const descriptorPath = resourceRelative(
      s.root,
      join(base, "html-dependency.json"),
    );
    const registrationPath = resourceRelative(s.root, join(base, "filter.lua"));
    if (!s.files[descriptorPath] || !s.files[registrationPath]) {
      fail("RESOURCE.RUNTIME_DECLARATION_UNSUPPORTED", descriptorPath);
    }
    await resourceNoLinks(s.root, join(s.root, descriptorPath));
    const descriptor = JSON.parse(
      await Deno.readTextFile(join(s.root, descriptorPath)),
    );
    if (
      typeof descriptor.name !== "string" ||
      typeof descriptor.version !== "string" ||
      !Array.isArray(descriptor.scripts) ||
      !Array.isArray(descriptor.stylesheets) ||
      Object.keys(descriptor).some((key) =>
        !["name", "version", "scripts", "stylesheets"].includes(key)
      )
    ) fail("RESOURCE.RUNTIME_DECLARATION_UNSUPPORTED", descriptorPath);
    for (
      const [key, kind] of [["scripts", "script"], [
        "stylesheets",
        "stylesheet",
      ]] as const
    ) {
      for (const asset of descriptor[key]) {
        if (
          !asset || typeof asset.path !== "string" || !asset.attribs ||
          typeof asset.attribs["data-course-runtime-provider"] !== "string" ||
          typeof asset.attribs["data-course-runtime-asset"] !== "string"
        ) fail("RESOURCE.RUNTIME_DECLARATION_UNSUPPORTED", asset);
        const path = resourceRelative(base, resolve(base, asset.path));
        if (path !== asset.path) {
          fail("RESOURCE.RUNTIME_DECLARATION_UNSUPPORTED", asset.path);
        }
        const source = resourceRelative(s.root, join(base, path));
        if (!s.files[source]) {
          fail("RESOURCE.RUNTIME_SOURCE_UNPROVEN", source);
        }
        await resourceNoLinks(s.root, join(s.root, source));
        result.push({
          source,
          sourceSha256: s.files[source],
          producer: extension.id.name,
          dependency: descriptor.name,
          version: descriptor.version,
          asset: asset.path,
          kind,
          descriptorPath,
          descriptorSha256: s.files[descriptorPath],
          registrationPath,
          registrationSha256: s.files[registrationPath],
          markerProvider: asset.attribs["data-course-runtime-provider"],
          markerAsset: asset.attribs["data-course-runtime-asset"],
        });
      }
    }
  }
  return result;
}
export async function sourceResourceFiles(
  s: Session,
): Promise<OwnerResourceFile[]> {
  const files: OwnerResourceFile[] = [];
  // Body delivery consumes exact public native inspect identities from both
  // profiles. Author configs are frozen service bytes, not starter assets.
  const configs = new Set<string>(
    s.body
      ? Object.values(s.audit.profiles).flatMap((info) =>
        (info.files.config || []).map((path: string) =>
          resourceRelative(s.root, resolve(s.root, path))
        )
      )
      : [],
  );
  for (const path of configs) {
    if (!Object.hasOwn(s.files, path)) {
      fail("RESOURCE.NATIVE_CONFIG_UNFROZEN", path);
    }
  }
  const producers = new Map<string, string>([[
    s.extension,
    "Core installed extension",
  ]]);
  for (const info of Object.values(s.audit.profiles)) {
    for (const extension of info.extensions || []) {
      const nativePath = resolve(s.root, extension.path);
      const rel = relative(s.root, nativePath).replaceAll("\\", "/");
      if (rel && rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel)) {
        producers.set(rel, "native inspect installed extension");
      }
    }
  }
  for (const [path, sha256] of Object.entries(s.files)) {
    const actualPath = join(s.root, path);
    await resourceNoLinks(s.root, actualPath);
    if (await digestFile(actualPath) !== sha256) {
      fail("RESOURCE.BYTES_CHANGED", path);
    }
    const producer = configs.has(path)
      ? "Core frozen native config"
      : [...producers].find(([directory]) =>
        path === directory || path.startsWith(directory + "/")
      )?.[1];
    const navigation = s.audit.navigation;
    const navigationService = navigation && (
      path.endsWith(".qmd") ||
      Object.keys(navigation.scope.portal.configHashes).includes(actualPath) ||
      navigation.members.some((member) => path.startsWith(member.path + "/")) ||
      navigation.dormant.some((scope) => path.startsWith(scope.path + "/"))
    );
    const service = producer !== undefined || navigationService;
    files.push({
      path,
      sha256,
      actualPath,
      origin: service ? "service" : "source",
      producer: producer ||
        (navigationService
          ? "Core native navigation control or child project boundary"
          : "frozen owner source"),
      role: s.audit.coverage[path]?.kind || "other",
    });
  }
  return files;
}
export async function resolveResourceEvidence(
  s: Session,
  observations: ResourceObservation[],
): Promise<ResolvedResourceUse[]> {
  const result: ResolvedResourceUse[] = [];
  for (const observation of observations) {
    if (
      observation.effectiveBase !== observation.source ||
      !s.audit.coverage[observation.source]?.profiles?.includes(
        observation.profile,
      )
    ) fail("RESOURCE.INVALID_OBSERVATION_BASE", observation);
    await validateNativeListingObservation(s, observation);
    if (observation.opaque?.length) {
      fail("RESOURCE.OPAQUE_CARRIER_UNSUPPORTED", observation.opaque);
    }
    for (const projection of ["raw", "projected"] as const) {
      for (const use of observation[projection]) {
        if (await deferredPublicationAddress(s, observation, use, projection)) {
          continue;
        }
        const local = await resolveResourceTarget(s.root, observation, use);
        if (!local) {
          continue;
        }
        // A mounted native member artifact is a deferred publication address.
        // Its bytes are proved at finish; child source is never a root resource.
        if (
          use.kind === "Link" &&
          s.audit.navigation?.rootAddresses.some((x) => x.target === local.path)
        ) continue;
        result.push({
          ...use,
          source: observation.source,
          profile: observation.profile,
          phase: observation.phase,
          projection,
          effectiveBase: observation.effectiveBase,
          path: local.path,
        });
      }
    }
  }
  return result;
}
export async function resourceObservations(
  s: Session,
): Promise<ResourceObservation[]> {
  const result: ResourceObservation[] = [];
  for (const path of Object.values(s.captures)) {
    const doc = JSON.parse(await Deno.readTextFile(path));
    if (!doc.resources) fail("RESOURCE.OBSERVATION_MISSING", path);
    result.push(doc.resources);
  }
  return result;
}
export async function sealGeneratedResources(
  s: Session,
  observation: ResourceObservation,
  output: string,
): Promise<OwnerResourceFile[]> {
  const files: OwnerResourceFile[] = [];
  if (observation.phase !== "render") return files;
  const stem = observation.source.replace(/\.qmd$/, "");
  const expected = stem + "_files/figure-html/";
  for (const use of observation.raw) {
    if (await deferredPublicationAddress(s, observation, use, "raw")) continue;
    const local = await resolveResourceTarget(s.root, observation, use);
    if (
      use.kind === "Link" &&
      s.audit.navigation?.rootAddresses.some((x) => x.target === local?.path)
    ) continue;
    if (
      !local || s.files[local.path] || files.some((f) => f.path === local.path)
    ) continue;
    if (!await exists(local.actualPath)) {
      fail("RESOURCE.ACTUAL_TARGET_MISSING", local.path);
    }
    if (
      use.kind !== "Image" || !use.nativePlot ||
      s.audit.profiles[observation.profile]?.fileInformation
          ?.[observation.source]?.metadata?.engine !== "knitr" ||
      !s.audit.profiles[observation.profile]?.fileInformation
        ?.[observation.source]?.codeCells?.some((cell: any) =>
          cell.language === "r"
        ) ||
      !local.path.startsWith(expected) ||
      !/^[-a-zA-Z0-9_.]+\.(png|svg|jpg|jpeg|webp)$/.test(
        local.path.slice(expected.length),
      )
    ) fail("RESOURCE.GENERATED_PRODUCER_UNSUPPORTED", local.path);
    const sha256 = await digestFile(local.actualPath);
    files.push({
      path: local.path,
      sha256,
      origin: "generated",
      role: "other",
      actualPath: resolve(output, local.path),
      producer: "native cell-output-display figure-html",
    });
  }
  return files;
}
export async function nativeResourceSelections(s: Session): Promise<string[]> {
  const paths: string[] = [];
  async function add(path: string) {
    const actualPath = resolve(s.root, path);
    await resourceNoLinks(s.root, actualPath);
    const info = await Deno.stat(actualPath);
    if (info.isDirectory) {
      for await (const entry of Deno.readDir(actualPath)) {
        await add(join(actualPath, entry.name));
      }
    } else if (info.isFile) paths.push(resourceRelative(s.root, actualPath));
    else fail("RESOURCE.NOT_FILE", path);
  }
  for (const path of s.audit.profiles[s.profile].files.resources || []) {
    await add(path);
  }
  return [...new Set(paths)].sort();
}
export async function earlyResourceGate(s: Session) {
  const baseline = await resolveResourceEvidence(
    s,
    await resourceObservations(s),
  );
  const files = [
    ...await sourceResourceFiles(s),
    ...await coreServiceResourceFiles(s),
  ];
  const policy = await resourcePolicy(
    s.profile,
    baseline,
    [],
    files,
    await nativeResourceSelections(s),
    join(s.root, ".course-owner"),
    join(s.root, s.extension, "owner-preflight/resource-policy.cue"),
  );
  if (policy.diagnostics.length) fail("RESOURCE.POLICY_DENIED", policy);
}
export async function sealResourceObservation(
  s: Session,
  identity: Invocation,
  observation: ResourceObservation,
) {
  const baseline = await resolveResourceEvidence(
    s,
    await resourceObservations(s),
  );
  const actual = await resolveResourceEvidence(s, [observation]);
  const listingWitness = await validateNativeListingObservation(s, observation);
  const generated = await sealGeneratedResources(
    s,
    observation,
    identity.output,
  );
  const files = [
    ...await sourceResourceFiles(s),
    ...await coreServiceResourceFiles(s, [], identity),
    ...generated,
  ];
  for (const use of actual) {
    if (!files.some((f) => f.path === use.path)) {
      fail("RESOURCE.GENERATED_PRODUCER_UNSUPPORTED", use.path);
    }
  }
  const policy = await resourcePolicy(
    s.profile,
    baseline,
    actual,
    files,
    [],
    join(s.root, ".course-owner"),
    join(s.root, s.extension, "owner-preflight/resource-policy.cue"),
  );
  if (policy.diagnostics.length) fail("RESOURCE.POLICY_DENIED", policy);
  return {
    protocol: 1,
    invocationId: identity.invocationId,
    source: observation.source,
    generated,
    actual,
    ...(listingWitness
      ? {
        nativeListingAddresses: await deferredNativeListingAddresses(s, [
          observation,
        ]),
        nativeListingWitnessHash: listingWitness.witnessHash,
        nativeListingInputHash: listingWitness.inputHash,
      }
      : {}),
    ...(s.publicationAddresses
      ? {
        publicationAddresses: await deferredPublicationAddresses(s, [
          observation,
        ]),
      }
      : {}),
  };
}
function selectedNativeAdapter(native: any) {
  return ["cloud", "prairielearn"].find((name) =>
    JSON.stringify(native?.config.course?.adapters) ===
      JSON.stringify([name]) &&
    [["course-core", "course-" + name], [
      "course-core",
      "course-" + name,
      "course-presentation",
    ]].some((chain) =>
      JSON.stringify(native?.config.filters) === JSON.stringify(chain)
    )
  );
}
export async function coreServiceResourceFiles(
  s: Session,
  ownedRequests: { path: string; sha256: string }[] = [],
  invocation?: Invocation,
  requireFinishedChildren = false,
): Promise<OwnerResourceFile[]> {
  await assertCaptureProjections(s);
  const paths = [
    "_generated/course-spec/course.json",
    "_generated/course-spec/course-candidate.json",
    ".course-owner/session.json",
    ".course-owner/preparation.json",
    ...(s.captureProjectionHash
      ? [resourceRelative(s.root, projectionManifestPath(s.root))]
      : []),
    ...Object.values(s.captureProjections).map((p) =>
      resourceRelative(s.root, p.retainedPath)
    ),
    ...(s.audit.navigation ? [".course-owner/navigation-addresses.json"] : []),
    // Exact owned producer path remains service even in a synthetic child scope.
    ".course-owner/publication-addresses.json",
    ...(s.nativeListingPlans
      ? [".course-owner/native-listing-addresses.json"]
      : []),
    ...Object.values(s.nativeListingInputs || {}).flatMap((phases) =>
      Object.values(phases)
    ).map((path) => resourceRelative(s.root, path)),
    ...Object.values(s.nativeListingWitnesses || {}).flatMap((phases) =>
      Object.values(phases)
    ).map((path) => resourceRelative(s.root, path)),
    ...Object.keys(s.nativeListingServiceFiles || {}).map((path) =>
      resourceRelative(s.root, path)
    ),
    ...Object.values(s.captures).map((path) => resourceRelative(s.root, path)),
    ...Object.values(s.identities).map((path) =>
      resourceRelative(s.root, path)
    ),
    ...Object.values(s.readerInputs).map((path) =>
      resourceRelative(s.root, path)
    ),
    ...await bodyServicePaths(s, invocation),
  ];
  // Only the selected, audited native adapter owns these exact source fragments.
  // The current profile's native input list also binds synthetic child scopes.
  const profile = invocation?.profile || s.profile;
  const native = s.audit.profiles?.[profile];
  const adapter = selectedNativeAdapter(native);
  const adapterSources = new Map<string, string>();
  for (const [path, role] of Object.entries(s.audit.coverage)) {
    if (role.kind === "root") {
      paths.push(`_generated/course-spec/core/${await sha(path)}.json`);
      if (
        adapter && path.endsWith(".qmd") && role.profiles?.includes(profile) &&
        native.files.input.some((input: string) =>
          resolve(s.root, input) === join(s.root, path)
        )
      ) {
        const fragment = `_generated/course-spec/${adapter}/${await sha(
          path,
        )}.json`;
        paths.push(fragment);
        adapterSources.set(fragment, path);
      }
      if (invocation && role.profiles?.includes(invocation.profile)) {
        const key = await sha(invocation.profile + ":" + path);
        paths.push(
          `.course-owner/render/${invocation.profile}/${await sha(path)}.json`,
          `.course-owner/result-${key}.json`,
          `.course-owner/resource-seal-${key}.json`,
        );
      }
    }
  }
  if (invocation) {
    paths.push(
      ".course-owner/active.json",
      ".course-owner/render-invocation.json",
      `.course-owner/guard-${invocation.invocationId}.json`,
    );
  }
  const known = new Set(paths);
  async function checkProducerArea(directory: string) {
    if (!await exists(directory)) return;
    await resourceNoLinks(s.root, directory);
    for await (const entry of Deno.readDir(directory)) {
      const absolute = join(directory, entry.name);
      await resourceNoLinks(s.root, absolute);
      if (entry.isDirectory) await checkProducerArea(absolute);
      else if (
        !entry.isFile || !known.has(resourceRelative(s.root, absolute))
      ) {
        fail(
          "RESOURCE.SERVICE_PRODUCER_UNSUPPORTED",
          resourceRelative(s.root, absolute),
        );
      }
    }
  }
  await checkProducerArea(join(s.root, "_generated/course-spec"));
  await checkProducerArea(join(s.root, ".course-owner/native-listing"));
  if (s.body) await checkProducerArea(join(s.root, ".course-owner/body"));
  const files: OwnerResourceFile[] = [];
  for (const path of paths) {
    const actualPath = join(s.root, path);
    if (await exists(actualPath)) {
      await resourceNoLinks(s.root, actualPath);
      if (adapterSources.has(path)) {
        let fragment: any;
        try {
          fragment = JSON.parse(await Deno.readTextFile(actualPath));
        } catch {
          fail("RESOURCE.SERVICE_PRODUCER_UNSUPPORTED", path);
        }
        if (fragment?.source !== adapterSources.get(path)) {
          fail("RESOURCE.SERVICE_PRODUCER_UNSUPPORTED", path);
        }
      }
      files.push({
        path,
        sha256: await digestFile(actualPath),
        origin: "service",
        actualPath,
        producer: path.startsWith(".course-owner/")
          ? "Core native owner session producer"
          : adapterSources.has(path)
          ? `${adapter} native adapter producer`
          : "Core native model producer",
        role: "other",
        ...(Object.values(s.captureProjections).find((p) =>
            p.retainedPath === actualPath
          )
          ? {
            captureProjection: Object.values(s.captureProjections).find((p) =>
              p.retainedPath === actualPath
            ),
          }
          : {}),
      });
    }
  }
  for (const request of [...ownedRequests, ...await navigationDownloads(s)]) {
    const path = resourceRelative(s.root, request.path);
    await resourceNoLinks(s.root, request.path);
    if (await digestFile(request.path) !== request.sha256) {
      fail("RESOURCE.BYTES_CHANGED", path);
    }
    files.push({
      path,
      sha256: request.sha256,
      origin: "service",
      actualPath: request.path,
      producer:
        "Download public inspectOwnerDownloads/inspectOwnedRequests ownership API",
      role: "other",
    });
  }
  // This Core provider owns the finite legacy native output protocol as well.
  // Current child model bytes are service, never a child visibility certificate.
  for (const scope of s.audit.navigation?.members || []) {
    if (!scope.native.config.filters?.includes("course-core")) continue;
    const root = join(s.root, scope.path);
    const coverage = Object.fromEntries(
      scope.native.files.input.map((
        path: string,
      ) => [resourceRelative(root, path), {
        kind: "root",
        profiles: [s.profile],
        evidence: "native child input",
      }]),
    );
    const child = {
      ...s,
      root,
      captures: {},
      captureHashes: {},
      captureProjections: {},
      captureProjectionHash: "",
      validated: false,
      publicationAddresses: undefined,
      identities: {},
      identityHashes: {},
      identityReaders: {},
      identityReplays: {},
      readerInputs: {},
      readerInputHashes: {},
      nativeListingPlans: undefined,
      nativeListingProvider: undefined,
      nativeListingInputs: undefined,
      nativeListingWitnesses: undefined,
      nativeListingHashes: undefined,
      nativeListingServiceFiles: undefined,
      headers: [],
      audit: {
        ...s.audit,
        root,
        navigation: undefined,
        coverage,
        profiles: { [s.profile]: scope.native },
      },
    } as Session;
    const childPath = join(root, ".course-owner/session.json");
    let current = child;
    let active: Invocation | undefined;
    if (await exists(childPath)) {
      current = await sessionAt(childPath);
      if (
        current.root !== root || current.attemptId !== s.attemptId ||
        current.profile !== s.profile || !current.validated
      ) fail("RESOURCE.SERVICE_PRODUCER_UNSUPPORTED", childPath);
      const prepared: PreparedOwner = {
        protocol: 1,
        root,
        attemptId: current.attemptId,
        profile: current.profile,
        sessionId: current.sessionId,
        sessionPath: childPath,
        sessionHash: await digestFile(childPath),
      };
      await preparedSession(prepared);
      active = await activeOwner(root);
      if (requireFinishedChildren) await validateOwnerResources(prepared);
    } else if (await exists(projectionManifestPath(root))) {
      fail(
        "RESOURCE.SERVICE_PRODUCER_UNSUPPORTED",
        projectionManifestPath(root),
      );
    }
    for (const file of await coreServiceResourceFiles(current, [], active)) {
      const producer = file.path.match(
        /^_generated\/course-spec\/(core|cloud|prairielearn)\//,
      )?.[1];
      if (producer) {
        const fragment = JSON.parse(await Deno.readTextFile(file.actualPath));
        if (
          (producer !== "core" &&
            producer !== selectedNativeAdapter(scope.native)) ||
          !Object.hasOwn(coverage, fragment.source) ||
          file.path !==
            `_generated/course-spec/${producer}/${await sha(
              fragment.source,
            )}.json`
        ) fail("RESOURCE.SERVICE_PRODUCER_UNSUPPORTED", file.path);
      }
      files.push({ ...file, path: scope.path + "/" + file.path });
    }
  }
  return files;
}
export async function checkResourceFiles(
  files: OwnerResourceFile[],
  root: string,
  output: string,
) {
  for (const file of files) {
    const base = file.origin === "generated" ? output : root;
    if (await Deno.realPath(base) !== base) {
      fail("RESOURCE.SYMLINK_UNSUPPORTED", base);
    }
    await resourceNoLinks(base, file.actualPath);
    if (
      !await exists(file.actualPath) ||
      await digestFile(file.actualPath) !== file.sha256
    ) fail("RESOURCE.BYTES_CHANGED", file.path);
  }
}
export interface ResourceSeal {
  protocol: 1;
  invocationId: string;
  source: string;
  generated: OwnerResourceFile[];
  actual: ResolvedResourceUse[];
  publicationAddresses?: DeferredPublicationAddress[];
  nativeListingAddresses?: DeferredNativeListingAddress[];
  nativeListingWitnessHash?: string;
  nativeListingInputHash?: string;
}
/** Checked current policy data, not a completed index or publication authority. */
export async function buildOwnerResourceIndexDraft(
  p: PreparedOwner,
  s: Session,
  a: Invocation,
  seals: ResourceSeal[],
  ownedRequests: { path: string; sha256: string }[] = [],
) {
  const baseline = await resolveResourceEvidence(
    s,
    await resourceObservations(s),
  );
  const actual = seals.flatMap((seal) => seal.actual);
  const byPath = new Map<string, OwnerResourceFile>();
  for (
    const file of [
      ...await sourceResourceFiles(s),
      ...await coreServiceResourceFiles(s, ownedRequests, a, true),
      ...seals.flatMap((seal) => seal.generated),
    ]
  ) {
    const previous = byPath.get(file.path);
    if (previous && previous.sha256 !== file.sha256) {
      fail("RESOURCE.CONFLICTING_BYTES", file.path);
    }
    byPath.set(file.path, file);
  }
  const files = [...byPath.values()].sort((a, b) =>
    a.path.localeCompare(b.path)
  );
  await checkResourceFiles(files, s.root, a.output);
  const checked = await resourcePolicy(
    s.profile,
    baseline,
    actual,
    files,
    await nativeResourceSelections(s),
    join(s.root, ".course-owner"),
    join(s.root, s.extension, "owner-preflight/resource-policy.cue"),
    await runtimeDeclarations(s),
    s.audit.profiles[s.profile].config.filters,
  );
  const { runtimeEligibility, ...policy } = checked;
  if (policy.diagnostics.length) fail("RESOURCE.POLICY_DENIED", policy);
  return { files, evidence: { baseline, actual }, policy, runtimeEligibility };
}
export async function writeResourceIndex(
  p: PreparedOwner,
  s: Session,
  a: Invocation,
  seals: ResourceSeal[],
  ownedRequests: { path: string; sha256: string }[] = [],
): Promise<OwnerResourceIndex> {
  const draft = await buildOwnerResourceIndexDraft(
    p,
    s,
    a,
    seals,
    ownedRequests,
  );
  const body = {
    protocol: 1 as const,
    root: p.root,
    attemptId: p.attemptId,
    profile: p.profile,
    sessionId: p.sessionId,
    sessionHash: p.sessionHash,
    invocationId: a.invocationId,
    ...draft,
    ...(s.nativeListingPlans
      ? {
        nativeListingAddressReceiptHash: await digestFile(
          join(s.root, ".course-owner/native-listing-addresses.json"),
        ),
      }
      : {}),
  };
  const index: OwnerResourceIndex = {
    ...body,
    indexHash: await resourceHash(body),
  };
  await Deno.writeTextFile(
    join(p.root, ".course-owner/resources.json"),
    JSON.stringify(index),
    { createNew: true },
  );
  await Deno.writeTextFile(
    join(p.root, ".course-owner/finished.json"),
    JSON.stringify({
      ...p,
      invocationId: a.invocationId,
      indexHash: index.indexHash,
      output: a.output,
    }),
    { createNew: true },
  );
  return index;
}
/** Projection tags are private canonical registry metadata, never index-supplied authority. */
export function assertCurrentCaptureProjectionMetadata(
  files: OwnerResourceFile[],
  current: OwnerResourceFile[],
  policy: ResourceFilePolicy[],
) {
  for (const file of files.filter((file) => file.captureProjection)) {
    if (
      !current.some((owned) =>
        owned.captureProjection && owned.path === file.path &&
        owned.actualPath === file.actualPath && owned.sha256 === file.sha256 &&
        file.origin === "service" && owned.producer === file.producer &&
        JSON.stringify(owned.captureProjection) ===
          JSON.stringify(file.captureProjection)
      )
    ) fail("RESOURCE.CAPTURE_PROJECTION_METADATA_CHANGED", file.path);
    const decisions = policy.filter((row) =>
      row.path === file.path && row.sha256 === file.sha256
    );
    if (
      decisions.length !== 1 || decisions[0].allowed !== false ||
      !decisions[0].reasons.includes("service")
    ) fail("RESOURCE.CAPTURE_PROJECTION_POLICY_CHANGED", file.path);
  }
}
export async function validateOwnerResources(
  p: PreparedOwner,
  options: { selections?: string[] } = {},
): Promise<OwnerResourceIndex> {
  const s = await preparedSession(p), a = await activeOwner(p.root);
  const marker = join(p.root, ".course-owner/finished.json"),
    path = join(p.root, ".course-owner/resources.json");
  if (
    !a || a.phase !== "render" || !await exists(marker) || !await exists(path)
  ) fail("RESOURCE.FINISH_REQUIRED", p.sessionId);
  await resourceNoLinks(p.root, marker);
  await resourceNoLinks(p.root, path);
  const finished = JSON.parse(await Deno.readTextFile(marker));
  if (
    Object.keys(p).some((key) =>
      finished[key] !== p[key as keyof PreparedOwner]
    ) || finished.invocationId !== a.invocationId ||
    finished.output !== a.output
  ) fail("RESOURCE.INVALID_INDEX", finished);
  await assertFrozen(p.sessionPath);
  await validateNavigationCompletion(p);
  await validatePublicationAddresses(p);
  await validateNativeListingAddresses(p);
  const index = JSON.parse(await Deno.readTextFile(path)) as OwnerResourceIndex;
  const { indexHash, ...body } = index;
  if (
    indexHash !== finished.indexHash ||
    await resourceHash(body) !== indexHash ||
    ["root", "attemptId", "profile", "sessionId", "sessionHash"].some((key) =>
      (body as any)[key] !== p[key as keyof PreparedOwner]
    ) || body.invocationId !== a.invocationId
  ) fail("RESOURCE.INDEX_CHANGED", path);
  if (
    s.nativeListingPlans &&
    index.nativeListingAddressReceiptHash !==
      await digestFile(
        join(s.root, ".course-owner/native-listing-addresses.json"),
      )
  ) fail("RESOURCE.INDEX_CHANGED", "native listing receipt");
  await checkResourceFiles(index.files, s.root, a.output);
  const downloads = await inspectOwnerDownloads(p);
  const currentServices = await coreServiceResourceFiles(
    s,
    downloads?.files || [],
    a,
    true,
  );
  assertCurrentCaptureProjectionMetadata(
    index.files,
    currentServices,
    index.policy.files,
  );
  for (const current of currentServices) {
    if (
      !index.files.some((file) =>
        file.path === current.path && file.sha256 === current.sha256 &&
        file.origin === "service" &&
        JSON.stringify(file.captureProjection) ===
          JSON.stringify(current.captureProjection)
      )
    ) fail("RESOURCE.SERVICE_SET_CHANGED", current.path);
  }
  const selections = (options.selections || []).map((selection) => {
    if (
      isAbsolute(selection) || resourceRelative(s.root, selection) !== selection
    ) fail("RESOURCE.INVALID_SELECTION", selection);
    return selection;
  });
  const policy = await resourcePolicy(
    s.profile,
    index.evidence.baseline,
    index.evidence.actual,
    index.files,
    selections,
    join(s.root, ".course-owner"),
    join(s.root, s.extension, "owner-preflight/resource-policy.cue"),
    await runtimeDeclarations(s),
    s.audit.profiles[s.profile].config.filters,
  );
  if (
    await resourceHash(policy.runtimeEligibility) !==
      await resourceHash(index.runtimeEligibility)
  ) fail("RESOURCE.RUNTIME_ELIGIBILITY_CHANGED", path);
  if (policy.diagnostics.length) fail("RESOURCE.POLICY_DENIED", policy);
  return index;
}
