/** Current private reader facts. None of these files is a public resource. */
import { isAbsolute, join, relative } from "stdlib/path";
import { activeOwner } from "./owner.ts";
import { OwnerFailure } from "./owner/failure.ts";
import { digestFile, sha } from "./owner/runtime.ts";
import type { Session } from "./owner/protocol.ts";
import { type ResourceObservation } from "./resources.ts";
import {
  type NativeListingPlan,
  nativeListingPlanHash,
} from "./native-listing.ts";
import type { NativeListingAddress } from "./native-listing-addresses.ts";

export type ListingPhase = "capture" | "identity" | "render";
export type ListingPaths = Record<string, Record<ListingPhase, string>>;
export type ListingHashes = Record<
  string,
  Partial<Record<ListingPhase, { input: string; witness: string }>>
>;

function fail(cause: unknown): never {
  throw new OwnerFailure("SOURCE.NATIVE_LISTING_WITNESS_INVALID", cause);
}
function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((
        key,
      ) => [key, ordered((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}
function same(a: unknown, b: unknown) {
  return JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));
}
function record(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
export async function nativeListingEvidencePaths(root: string, keys: string[]) {
  const inputs: ListingPaths = {}, witnesses: ListingPaths = {};
  for (const key of keys.sort()) {
    const separator = key.indexOf(":"),
      profile = key.slice(0, separator),
      source = key.slice(separator + 1);
    if (separator < 1 || !["student", "full"].includes(profile)) fail(key);
    const name = await sha(source);
    inputs[key] = {} as Record<ListingPhase, string>;
    witnesses[key] = {} as Record<ListingPhase, string>;
    for (const phase of ["capture", "identity", "render"] as const) {
      inputs[key][phase] = join(
        root,
        ".course-owner/native-listing/input",
        phase,
        profile,
        name + ".md",
      );
      witnesses[key][phase] = join(
        root,
        ".course-owner/native-listing/witness",
        phase,
        profile,
        name + ".json",
      );
    }
  }
  return { inputs, witnesses };
}
async function privateFile(root: string, path: string) {
  const rel = relative(root, path);
  if (!rel || isAbsolute(rel) || rel === ".." || rel.startsWith("../")) {
    fail(path);
  }
  let current = root;
  for (const component of rel.split("/")) {
    current = join(current, component);
    const stat = await Deno.lstat(current);
    if (stat.isSymlink) fail("symlink: " + current);
  }
  if (!(await Deno.lstat(path)).isFile || await Deno.realPath(path) !== path) {
    fail(path);
  }
}
function body(value: unknown) {
  if (typeof value !== "string") fail("missing reader body");
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    fail("invalid reader body");
  }
  if (
    !record(parsed) || !Array.isArray(parsed.blocks) || !record(parsed.meta) ||
    Object.keys(parsed.meta).length
  ) fail("invalid body shape");
  return parsed;
}
function pointer(value: any, path: string) {
  if (!path.startsWith("/blocks/")) fail("carrier outside body");
  for (const component of path.slice(1).split("/")) {
    if (Array.isArray(value) && !/^(0|[1-9][0-9]*)$/.test(component)) {
      fail("invalid carrier index");
    }
    value = value?.[component];
  }
  return value;
}
function carriers(value: any, path = "", result: any[] = []) {
  if (!value || typeof value !== "object") return result;
  if (value.t) {
    if (
      ["RawBlock", "RawInline"].includes(value.t) && value.c?.[0] === "html"
    ) {
      result.push({
        path,
        kind: value.t,
        format: "html",
        text: value.c[1],
        ordinal: result.length + 1,
      });
    }
    carriers(value.c, path + "/c", result);
  } else if (Array.isArray(value)) {
    value.forEach((child, index) =>
      carriers(child, path + "/" + index, result)
    );
  } else {
    Object.keys(value).sort().forEach((key) =>
      carriers(value[key], path + "/" + key, result)
    );
  }
  return result;
}
function assertCarrierTrace(doc: any, trace: unknown) {
  if (!Array.isArray(trace)) fail("missing carrier trace");
  const seen = new Set<string>(), actual = carriers(doc.blocks, "/blocks");
  for (const item of trace) {
    if (!record(item) || seen.has(item.path)) fail("duplicate carrier");
    seen.add(item.path);
    const node = pointer(doc, item.path),
      occurrence = actual.find((raw) => raw.path === item.path);
    if (
      !occurrence || !same(item, occurrence) || node?.t !== item.kind ||
      node.c?.[0] !== item.format || node.c?.[1] !== item.text
    ) fail("carrier occurrence differs");
  }
}
export async function assertNativeListingEvidenceMaps(s: Session) {
  if (
    !same(s.nativeListingPlans, s.audit.nativeListingPlans) ||
    !same(s.nativeListingProvider, s.audit.nativeListingProvider)
  ) fail("listing audit identity differs");
  const keys = Object.keys(s.nativeListingPlans || {}).sort();
  const expected = await nativeListingEvidencePaths(s.root, keys);
  if (
    !same(s.nativeListingInputs || {}, expected.inputs) ||
    !same(s.nativeListingWitnesses || {}, expected.witnesses)
  ) fail("foreign reader sidecars");
  if (
    Object.keys(s.nativeListingHashes || {}).some((key) => !keys.includes(key))
  ) fail("foreign baseline hash");
  const assets = keys.length ? ["list.min.js", "quarto-listing.js"] : [];
  const expectedAssets = Object.fromEntries(assets.map((name) => {
    const file = s.nativeListingProvider?.files.find((file) =>
      file.relative === "share/projects/website/listing/" + name
    );
    if (!file) fail("missing stock dependency");
    return [
      join(s.root, ".course-owner/native-listing/provider", name),
      file.sha256,
    ];
  }));
  if (!same(s.nativeListingServiceFiles || {}, expectedAssets)) {
    fail("foreign provider service files");
  }
  for (const [path, hash] of Object.entries(expectedAssets)) {
    await privateFile(s.root, path);
    if (await digestFile(path) !== hash) fail("provider service changed");
  }
  if (s.validated) {
    for (const key of keys) {
      for (const phase of ["capture", "identity"] as const) {
        const hashes = s.nativeListingHashes?.[key]?.[phase];
        if (
          !hashes || !/^[a-f0-9]{64}$/.test(hashes.input) ||
          !/^[a-f0-9]{64}$/.test(hashes.witness)
        ) fail("incomplete baseline: " + key);
        for (
          const [path, hash] of [[expected.inputs[key][phase], hashes.input], [
            expected.witnesses[key][phase],
            hashes.witness,
          ]]
        ) {
          await privateFile(s.root, path);
          if (await digestFile(path) !== hash) {
            fail("baseline changed: " + path);
          }
        }
      }
    }
  }
}
/** Called only on the actual native observation, under its current guard. */
export async function validateNativeListingObservation(
  s: Session,
  observation: ResourceObservation,
): Promise<
  {
    plan: NativeListingPlan;
    planHash: string;
    witnessHash: string;
    inputHash: string;
    edges: NativeListingAddress[];
  } | undefined
> {
  const key = observation.profile + ":" + observation.source;
  const plan = s.nativeListingPlans?.[key];
  if (!plan) {
    if (
      observation.nativeListingWitness || observation.nativeListingAddresses
    ) fail("unexpected listing observation");
    return;
  }
  await assertNativeListingEvidenceMaps(s);
  const locator = observation.nativeListingWitness;
  if (
    !record(locator) ||
    Object.keys(locator).sort().join(",") !== "inputPath,witnessPath"
  ) fail("missing reader sidecars");
  const active = await activeOwner(s.root);
  const phases = (["capture", "identity", "render"] as const).filter((phase) =>
    locator.inputPath === s.nativeListingInputs![key][phase] &&
    locator.witnessPath === s.nativeListingWitnesses![key][phase]
  );
  if (phases.length !== 1) fail("foreign phase sidecars");
  const phase = phases[0];
  const inputPath = s.nativeListingInputs![key][phase],
    witnessPath = s.nativeListingWitnesses![key][phase];
  if (locator.inputPath !== inputPath || locator.witnessPath !== witnessPath) {
    fail("foreign phase sidecars");
  }
  await privateFile(s.root, inputPath);
  await privateFile(s.root, witnessPath);
  const witness = JSON.parse(await Deno.readTextFile(witnessPath));
  const planHash = await nativeListingPlanHash(plan);
  if (
    !record(witness) || witness.protocol !== 1 || witness.planKey !== key ||
    witness.planHash !== planHash || witness.source !== observation.source ||
    witness.providerHash !== s.nativeListingProvider?.sha256 ||
    witness.inputPath !== inputPath
  ) fail("witness identity");
  if (
    !record(witness.context) || !same(witness.context, {
      source: observation.source,
      profile: observation.profile,
      phase: observation.phase,
      effectiveBase: observation.effectiveBase,
      outputDirectory: observation.outputDirectory,
      outputFile: observation.outputFile,
    })
  ) fail("actual writer context differs");
  if (
    !record(witness.providerEnvironment) ||
    witness.providerEnvironment.bin !== s.nativeListingProvider?.binPath ||
    witness.providerEnvironment.share !== s.nativeListingProvider?.sharePath ||
    witness.providerEnvironment.deno !== s.nativeListingProvider?.denoPath
  ) fail("actual native provider differs");
  if (
    !record(witness.active) || witness.active.root !== s.root ||
    witness.active.attemptId !== s.attemptId ||
    witness.active.sessionId !== s.sessionId ||
    witness.active.profile !== observation.profile ||
    witness.active.phase !== observation.phase ||
    !!witness.active.identity !== (phase === "identity")
  ) fail("witness invocation");
  if (
    observation.phase === "render" && (!active || !same(witness.active, active))
  ) fail("stale render witness");
  const input = new TextDecoder("utf-8", { fatal: true }).decode(
    await Deno.readFile(inputPath),
  );
  if (
    typeof witness.input !== "string" || witness.input !== input ||
    witness.reader !==
      (phase === "identity" ? s.identityReaders[key] : plan.reader) ||
    !record(witness.options)
  ) fail("reader input/options");
  if (witness.nativeShape !== witness.fullReplayShape) {
    fail("full reader replay mismatch");
  }
  const native = body(witness.nativeShape), source = body(witness.sourceShape);
  if (
    !record(witness.prefix) ||
    (witness.prefix["constructor"] as unknown) !== plan.inputConstructor ||
    witness.prefix.sourceBlockCount !== source.blocks.length
  ) fail("prefix constructor");
  const expected = plan.inputConstructor === "identity"
    ? source.blocks
    : source.blocks.slice(1);
  if (plan.inputConstructor !== "identity") {
    const first = source.blocks[0];
    if (
      first?.t !== "Header" || first.c?.[0] !== 1 ||
      !record(witness.sourceHeaderWitness)
    ) fail("title transfer witness");
    const header = body(witness.sourceHeaderWitness.ordinaryHeader).blocks;
    const noauto = body(witness.sourceHeaderWitness.noAutoHeader).blocks;
    let title;
    try {
      title = JSON.parse(witness.sourceHeaderWitness.actualTitle)?.meta?.title;
    } catch {
      fail("invalid title witness");
    }
    if (
      header.length !== 1 || noauto.length !== 1 || !same(header[0], first) ||
      noauto[0]?.t !== "Header" || noauto[0].c?.[1]?.[0] !== "" ||
      !same(noauto[0].c[0], first.c[0]) ||
      !same(noauto[0].c[1].slice(1), first.c[1].slice(1)) ||
      !same(noauto[0].c[2], first.c[2]) || title?.t !== "MetaInlines" ||
      !same(title.c, first.c[2])
    ) fail("title transfer constructor differs");
    if (
      first.c[1][2].length ||
      !["", "unnumbered"].includes(first.c[1][1].join(",")) ||
      !first.c[2].length || first.c[2].some((inline: any) =>
        !["Str", "Space"].includes(inline.t)
      )
    ) fail("unsupported title source");
  }
  if (
    witness.prefix.nativeBlockCount !== expected.length ||
    !same(body(witness.prefix.shape).blocks, expected) ||
    !same(native.blocks.slice(0, expected.length), expected)
  ) fail("authored prefix differs");
  if (
    !record(witness.suffix) || typeof witness.suffix.rawShape !== "string" ||
    !same(
      JSON.parse(witness.suffix.rawShape),
      native.blocks.slice(expected.length),
    )
  ) fail("append coverage differs");
  const projectedPrefix = body(witness.prefix.projectedShape);
  const projectedSuffix = JSON.parse(witness.suffix.projectedShape);
  if (
    !Array.isArray(projectedSuffix) ||
    !same(projectedSuffix, JSON.parse(witness.suffix.rawShape)) ||
    !record(witness.carrierTrace)
  ) fail("projected append differs");
  assertCarrierTrace(native, witness.carrierTrace.raw);
  assertCarrierTrace({
    blocks: [...projectedPrefix.blocks, ...projectedSuffix],
  }, witness.carrierTrace.projected);
  if (
    !Array.isArray(witness.addresses) ||
    !same(witness.addresses, observation.nativeListingAddresses)
  ) fail("address witness differs");
  const inputHash = await digestFile(inputPath),
    witnessHash = await digestFile(witnessPath);
  const baseline = s.nativeListingHashes?.[key]?.[phase];
  if (
    s.validated && observation.phase === "capture" &&
    (!baseline || baseline.input !== inputHash ||
      baseline.witness !== witnessHash)
  ) fail("baseline witness changed");
  return { plan, planHash, witnessHash, inputHash, edges: witness.addresses };
}
export async function retainNativeListingProviderServices(s: Session) {
  if (!Object.keys(s.nativeListingPlans || {}).length) return;
  s.nativeListingServiceFiles = {};
  for (const name of ["list.min.js", "quarto-listing.js"]) {
    const file = s.nativeListingProvider?.files.find((file) =>
      file.relative === "share/projects/website/listing/" + name
    );
    if (!file || await digestFile(file.path) !== file.sha256) {
      fail("stock dependency changed");
    }
    const path = join(s.root, ".course-owner/native-listing/provider", name);
    await Deno.mkdir(join(s.root, ".course-owner/native-listing/provider"), {
      recursive: true,
    });
    await Deno.writeFile(path, await Deno.readFile(file.path), {
      createNew: true,
    });
    s.nativeListingServiceFiles[path] = file.sha256;
  }
}
export async function retainNativeListingBaselineHashes(
  s: Session,
  key: string,
  phase: "capture" | "identity",
) {
  if (!s.nativeListingPlans?.[key]) return;
  const input = s.nativeListingInputs![key][phase],
    witness = s.nativeListingWitnesses![key][phase];
  await privateFile(s.root, input);
  await privateFile(s.root, witness);
  s.nativeListingHashes ||= {};
  s.nativeListingHashes[key] ||= {};
  s.nativeListingHashes[key][phase] = {
    input: await digestFile(input),
    witness: await digestFile(witness),
  };
}
