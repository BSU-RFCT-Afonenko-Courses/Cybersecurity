/** Finite selected-document addresses; no Source-QMD or generated-file grant. */
import { dirname, join, relative, resolve } from "stdlib/path";
import { parse } from "./vendor/parse5/dist/index.js";
import {
  inspectOwnerDownloads,
  preparedSession,
  readOwnerInvocationEvidence,
} from "./owner.ts";
import { OwnerFailure } from "./owner/failure.ts";
import { digestFile, exists, sha } from "./owner/runtime.ts";
import type { PreparedOwner, Session } from "./owner/protocol.ts";
import {
  buildOwnerResourceIndexDraft,
  type OwnerResourceFile,
  resourceHash,
  resourceNoLinks,
  type ResourceObservation,
  resourceObservations,
  resourceRelative,
} from "./resources.ts";
import {
  checkedPublicationAddressFinishContext,
  type OwnerPublicationAddressFinish,
} from "./publication-addresses.ts";
import { sameSourceProjectionArtifact } from "./capture-projections.ts";
import {
  nativeListingInitializer,
  type NativeListingPlan,
  type NativeListingWriter,
} from "./native-listing.ts";
import { validateNativeListingProviderBinding } from "./native-listing-provider.ts";
import { validateNativeListingObservation } from "./native-listing-evidence.ts";

export interface NativeListingDestination {
  id: string;
  path: string;
  ancestry: {
    kind: "Div";
    id: string;
    classes: string[];
    attributes: [string, string][];
  }[];
}
export interface NativeListingAddress {
  source: string;
  profile: "student" | "full";
  phase: "capture" | "render";
  projection: "raw" | "projected";
  planKey: string;
  declarationId: string;
  declarationIndex: number;
  rowIndex: number;
  targetSource: string;
  sourceHref: string;
  destination: NativeListingDestination;
}
export interface DeferredNativeListingAddress extends NativeListingAddress {
  planHash: string;
  witnessHash: string;
  inputHash: string;
  writer: NativeListingWriter;
  targetWriter: NativeListingWriter;
  nativeUri: string;
}
export interface NativeListingAuxiliaryEntry {
  listing: string;
  items: string[];
}
interface FileWitness {
  path: string;
  sha256: string;
}
export interface NativeListingPublicationGrant extends FileWitness {
  kind: "runtime" | "runtime-manifest";
  member: string;
  source: string;
  proof: { receiptHash: string; invocationId: string; providerHash: string };
}
function fail(code: string, cause: unknown): never {
  throw new OwnerFailure(code, cause);
}
function relativePath(path: string, extension?: string) {
  if (
    typeof path !== "string" || !path ||
    !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(path) ||
    path.split("/").some((part) =>
      part === "." || part === ".." || part.startsWith(".")
    ) ||
    extension && !path.endsWith(extension)
  ) {
    fail("SOURCE.NATIVE_LISTING_ADDRESS_INVALID", path);
  }
  return path;
}
/** Exact stock projectOffset(source) + selected outputHref, not .qmd replacement. */
export function nativeListingOutputURI(source: string, targetArtifact: string) {
  relativePath(source, ".qmd");
  relativePath(targetArtifact, ".html");
  const depth = source.split("/").length - 1;
  return (depth ? Array(depth).fill("..").join("/") : ".") + "/" +
    targetArtifact;
}
function absoluteHtmlURI(uri: unknown) {
  return typeof uri === "string" && uri.startsWith("/") &&
    relativePath(uri.slice(1), ".html");
}
/** Exact known JSON structure/order; no HTML href extraction. */
export function assertNativeListingAuxiliary(
  actual: unknown,
  expected: NativeListingAuxiliaryEntry[],
) {
  try {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      throw new Error("length");
    }
    for (const [index, entry] of actual.entries()) {
      if (
        !entry || typeof entry !== "object" ||
        Object.keys(entry).sort().join(",") !== "items,listing" ||
        !absoluteHtmlURI(entry.listing) || !Array.isArray(entry.items) ||
        !entry.items.every(absoluteHtmlURI) ||
        entry.listing !== expected[index].listing ||
        JSON.stringify(entry.items) !== JSON.stringify(expected[index].items)
      ) {
        throw new Error("entry " + index);
      }
    }
    if (new Set(actual.map((entry) => entry.listing)).size !== actual.length) {
      throw new Error("duplicate writer");
    }
  } catch (error) {
    fail("SOURCE.NATIVE_LISTING_ADDRESS_CHANGED", String(error));
  }
}

function plans(s: Session): NativeListingPlan[] {
  return Object.values(s.nativeListingPlans || {}).filter((plan) =>
    plan.profile === s.profile
  );
}
export async function deferredNativeListingAddresses(
  s: Session,
  observations: ResourceObservation[],
): Promise<DeferredNativeListingAddress[]> {
  const result: DeferredNativeListingAddress[] = [];
  for (const observation of observations) {
    const validated = await validateNativeListingObservation(s, observation);
    if (!validated) continue;
    const { plan, planHash, witnessHash, inputHash, edges } = validated;
    const seen = new Set<string>();
    for (const edge of edges) {
      const declaration = plan.declarations[edge.declarationIndex];
      const row = declaration?.rows[edge.rowIndex];
      const selected = s.audit.profiles[edge.profile]?.files.input || [];
      if (
        edge.source !== observation.source ||
        edge.profile !== observation.profile ||
        edge.phase !== observation.phase || edge.planKey !== plan.key ||
        !["raw", "projected"].includes(edge.projection) ||
        !Number.isSafeInteger(edge.declarationIndex) ||
        edge.declarationIndex < 0 ||
        !Number.isSafeInteger(edge.rowIndex) || edge.rowIndex < 0 ||
        declaration?.id !== edge.declarationId || !row ||
        row.source !== edge.targetSource ||
        row.sourceHref !== edge.sourceHref ||
        row.writer.source !== row.source ||
        row.writer.sourceHash !== row.sourceHash ||
        !selected.some((source: string) =>
          resolve(s.root, source) === resolve(s.root, row.source)
        ) ||
        edge.destination.id !== edge.declarationId || !edge.destination.path ||
        !Array.isArray(edge.destination.ancestry)
      ) {
        fail("SOURCE.NATIVE_LISTING_ADDRESS_INVALID", edge);
      }
      const identity = edge.projection + ":" + edge.declarationIndex + ":" +
        edge.rowIndex;
      if (seen.has(identity)) {
        fail(
          "SOURCE.NATIVE_LISTING_ADDRESS_INVALID",
          "duplicate edge " + identity,
        );
      }
      seen.add(identity);
      if (
        row.writer.outputUri !== "/" + row.writer.artifact ||
        plan.sourceWriter.outputUri !== "/" + plan.sourceWriter.artifact
      ) {
        fail("SOURCE.NATIVE_LISTING_ADDRESS_INVALID", "writer URI model");
      }
      const nativeUri = nativeListingOutputURI(
        edge.source,
        row.writer.artifact,
      );
      const resolvedTarget = resolve(
        dirname(plan.sourceWriter.artifact),
        nativeUri,
      );
      if (resolvedTarget !== resolve(row.writer.artifact)) {
        fail(
          "SOURCE.NATIVE_LISTING_ADDRESS_INVALID",
          "stock source/writer URI mismatch",
        );
      }
      result.push({
        ...edge,
        planHash,
        witnessHash,
        inputHash,
        writer: plan.sourceWriter,
        targetWriter: row.writer,
        nativeUri,
      });
    }
    for (const declaration of plan.declarations) {
      for (const [rowIndex] of declaration.rows.entries()) {
        for (const projection of ["raw", "projected"]) {
          if (
            !seen.has(projection + ":" + declaration.index + ":" + rowIndex)
          ) {
            fail(
              "SOURCE.NATIVE_LISTING_ADDRESS_INVALID",
              "missing finite address edge",
            );
          }
        }
      }
    }
  }
  return result;
}

async function witness(base: string, path: string): Promise<FileWitness> {
  resourceRelative(base, resolve(base, path));
  await resourceNoLinks(base, resolve(base, path));
  const actual = resolve(base, path);
  if (
    !await exists(actual) || !(await Deno.stat(actual)).isFile ||
    await Deno.realPath(actual) !== actual
  ) {
    fail(
      "SOURCE.NATIVE_LISTING_ADDRESS_CHANGED",
      "missing/nonregular artifact " + actual,
    );
  }
  return { path, sha256: await digestFile(actual) };
}
function denyBytes(
  files: OwnerResourceFile[],
  policy: { files: { path: string; allowed: boolean }[] },
  item: FileWitness,
  artifact?: Parameters<typeof sameSourceProjectionArtifact>[3],
) {
  for (const file of files) {
    if (
      file.sha256 !== item.sha256 ||
      policy.files.find((row) => row.path === file.path)?.allowed
    ) continue;
    if (
      artifact && file.captureProjection && sameSourceProjectionArtifact(
        file.captureProjection,
        artifact.member,
        artifact.source,
        artifact,
        artifact.stage.path,
        item.sha256,
      )
    ) continue;
    fail(
      "SOURCE.NATIVE_LISTING_ADDRESS_CHANGED",
      "own source/service/closed bytes: " + file.path,
    );
  }
}

async function actualObservations(
  s: Session,
  current: Awaited<ReturnType<typeof readOwnerInvocationEvidence>>,
) {
  const observations: ResourceObservation[] = [];
  for (const report of current.reports) {
    const path = join(
      s.root,
      ".course-owner/render",
      s.profile,
      await sha(report.source) + ".json",
    );
    const observed = JSON.parse(await Deno.readTextFile(path));
    if (
      !observed.resources || observed.resources.source !== report.source ||
      observed.resources.phase !== "render" ||
      resolve(s.root, observed.resources.outputDirectory) !==
        current.invocation.output
    ) {
      fail(
        "SOURCE.NATIVE_LISTING_ADDRESS_INVALID",
        "current writer observation " + report.source,
      );
    }
    observations.push(observed.resources);
  }
  return observations;
}

function expectedAuxiliary(
  observations: ResourceObservation[],
  edges: DeferredNativeListingAddress[],
  currentPlans: NativeListingPlan[],
): NativeListingAuxiliaryEntry[] {
  const result: NativeListingAuxiliaryEntry[] = [];
  for (const observation of observations) {
    const rows = edges.filter((edge) =>
      edge.source === observation.source && edge.projection === "raw"
    );
    const plan = currentPlans.find((plan) =>
      plan.source === observation.source
    );
    if (!plan) continue;
    const unique = new Set<string>();
    const items: string[] = [];
    for (const edge of rows) {
      if (!unique.has(edge.targetSource)) {
        unique.add(edge.targetSource);
        items.push(edge.targetWriter.outputUri);
      }
    }
    result.push({ listing: plan.sourceWriter.outputUri, items });
  }
  return result;
}
async function currentWriter(
  s: Session,
  current: Awaited<ReturnType<typeof readOwnerInvocationEvidence>>,
  observations: ResourceObservation[],
  descriptor: NativeListingWriter,
) {
  relativePath(descriptor.source, ".qmd");
  relativePath(descriptor.artifact, ".html");
  const source = resolve(s.root, descriptor.source);
  if (
    descriptor.sourceHash !== s.files[descriptor.source] ||
    await digestFile(source) !== descriptor.sourceHash ||
    !s.audit.profiles[s.profile].files.input.some((path: string) =>
      resolve(s.root, path) === source
    ) ||
    resourceRelative(
        s.root,
        resolve(dirname(source), descriptor.inspectedOutputFile),
      ) !== descriptor.artifact ||
    descriptor.outputUri !== "/" + descriptor.artifact
  ) {
    fail("SOURCE.NATIVE_LISTING_ADDRESS_INVALID", descriptor);
  }
  await resourceNoLinks(s.root, source);
  const matches = observations.filter((observed) =>
    observed.source === descriptor.source
  );
  if (matches.length !== 1) {
    fail("SOURCE.NATIVE_LISTING_ADDRESS_INVALID", "writer multiplicity");
  }
  const observed = matches[0];
  if (
    typeof observed.outputDirectory !== "string" ||
    resolve(s.root, observed.outputDirectory) !== current.invocation.output ||
    typeof observed.outputFile !== "string"
  ) {
    fail("SOURCE.NATIVE_LISTING_ADDRESS_INVALID", "writer output identity");
  }
  const logical = resolve(s.root, observed.outputFile);
  const actual = resolve(current.invocation.output, descriptor.artifact);
  const inspected = resolve(dirname(source), descriptor.inspectedOutputFile);
  if (logical !== actual && logical !== inspected) {
    fail(
      "SOURCE.NATIVE_LISTING_ADDRESS_INVALID",
      "native writer/public inspect mismatch",
    );
  }
  return {
    descriptor,
    observationHash: await resourceHash(observed),
    native: await witness(current.invocation.output, descriptor.artifact),
  };
}
interface HtmlNode {
  tagName?: string;
  attrs?: { name: string; value: string }[];
  childNodes?: HtmlNode[];
  value?: string;
}
function htmlNodes(html: string) {
  const nodes: HtmlNode[] = [];
  function visit(node: HtmlNode) {
    if (node.tagName) nodes.push(node);
    for (const child of node.childNodes || []) visit(child);
  }
  visit(parse(html, {}) as HtmlNode);
  return nodes;
}
function attribute(node: HtmlNode, key: string) {
  return (node.attrs || []).filter((attr) => attr.name === key).map((attr) =>
    attr.value
  );
}
function text(node: HtmlNode): string {
  return (node.childNodes || []).map((child) => child.value || text(child))
    .join("");
}
/** Only exact known script registrations/offset/initializer; never inspects anchors. */
export function assertNativeListingStockRegistrations(
  html: string,
  source: string,
  writerArtifact: string,
  assets: string[],
  initializer: string,
) {
  const nodes = htmlNodes(html);
  const offset = nativeListingOutputURI(source, "index.html").slice(
    0,
    -"index.html".length,
  );
  const metas = nodes.filter((node) =>
    node.tagName === "meta" && attribute(node, "name")[0] === "quarto:offset"
  );
  if (
    metas.length !== 1 || attribute(metas[0], "content").length !== 1 ||
    attribute(metas[0], "content")[0] !== offset
  ) {
    fail("SOURCE.NATIVE_LISTING_ADDRESS_CHANGED", "stock project offset");
  }
  const listingScripts = nodes.filter((node) =>
    node.tagName === "script" &&
    attribute(node, "src").some((src) =>
      /(?:^|\/)quarto-listing\/(?:list\.min|quarto-listing)\.js(?:$|[?#])/.test(
        src,
      )
    )
  );
  if (listingScripts.length !== assets.length) {
    fail(
      "SOURCE.NATIVE_LISTING_ADDRESS_CHANGED",
      "extra stock dependency registration",
    );
  }
  for (const asset of assets) {
    const expected = relative(dirname(writerArtifact), asset).replaceAll(
      "\\",
      "/",
    );
    const registrations = nodes.filter((node) =>
      node.tagName === "script" &&
      attribute(node, "src")[0] === expected
    );
    if (
      registrations.length !== 1 ||
      attribute(registrations[0], "src").length !== 1 ||
      text(registrations[0]) !== "" ||
      (registrations[0].attrs || []).some((attr) => attr.name !== "src")
    ) {
      fail(
        "SOURCE.NATIVE_LISTING_ADDRESS_CHANGED",
        "stock dependency registration " + asset,
      );
    }
  }
  const initializers = nodes.filter((node) =>
    node.tagName === "script" &&
    !attribute(node, "src").length &&
    text(node).includes("window['quarto-listings']")
  );
  if (
    initializers.length !== 1 || text(initializers[0]) !== initializer ||
    (initializers[0].attrs || []).length
  ) {
    fail("SOURCE.NATIVE_LISTING_ADDRESS_CHANGED", "finite listing initializer");
  }
}

async function nativeOutputMap(output: string) {
  if (
    (await Deno.lstat(output)).isSymlink ||
    !(await Deno.stat(output)).isDirectory ||
    await Deno.realPath(output) !== output
  ) {
    fail("SOURCE.NATIVE_LISTING_ADDRESS_CHANGED", "noncanonical native output");
  }
  const files: FileWitness[] = [];
  async function visit(directory: string) {
    for await (const entry of Deno.readDir(directory)) {
      const path = join(directory, entry.name);
      await resourceNoLinks(output, path);
      if (entry.isDirectory) await visit(path);
      else if (entry.isFile && !entry.isSymlink) {
        files.push({
          path: resourceRelative(output, path),
          sha256: await digestFile(path),
        });
      } else {fail(
          "SOURCE.NATIVE_LISTING_ADDRESS_CHANGED",
          "nonregular native output " + path,
        );}
    }
  }
  await visit(output);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function receiptPath(root: string) {
  return join(root, ".course-owner/native-listing-addresses.json");
}
async function completionBody(
  p: PreparedOwner,
  suppliedCurrent:
    | Awaited<ReturnType<typeof readOwnerInvocationEvidence>>
    | undefined,
  finish?: OwnerPublicationAddressFinish,
) {
  // Read the provider's actual current facts. A caller-shaped current object is
  // compared, never accepted as an alternative authority or native success flag.
  const current = await readOwnerInvocationEvidence(p), s = current.session;
  if (
    suppliedCurrent &&
    await resourceHash(suppliedCurrent) !== await resourceHash(current)
  ) {
    fail("SOURCE.NATIVE_LISTING_ADDRESS_CHANGED", "current invocation changed");
  }
  if (current.failure) {
    fail("SOURCE.NATIVE_LISTING_ADDRESS_INVALID", current.failure);
  }
  const currentPlans = plans(s);
  if (!currentPlans.length) {
    if (await exists(receiptPath(p.root))) {
      fail("SOURCE.NATIVE_LISTING_ADDRESS_CHANGED", "unexpected receipt");
    }
    return;
  }
  const provider = s.nativeListingProvider;
  if (!provider) {
    fail(
      "SOURCE.NATIVE_LISTING_ADDRESS_INVALID",
      "missing native provider binding",
    );
  }
  await validateNativeListingProviderBinding(provider, { cwd: s.root });
  const actual = await actualObservations(s, current);
  const actualEdges = await deferredNativeListingAddresses(s, actual);
  for (const observation of actual) {
    const validated = await validateNativeListingObservation(s, observation);
    const seals = current.resourceSeals.filter((seal) =>
      seal.source === observation.source
    );
    if (seals.length !== 1) {
      fail(
        "SOURCE.NATIVE_LISTING_ADDRESS_CHANGED",
        "source resource seal multiplicity",
      );
    }
    const seal = seals[0];
    if (validated) {
      const edges = actualEdges.filter((edge) =>
        edge.source === observation.source
      );
      if (
        seal.nativeListingWitnessHash !== validated.witnessHash ||
        seal.nativeListingInputHash !== validated.inputHash ||
        await resourceHash(seal.nativeListingAddresses) !==
          await resourceHash(edges)
      ) {
        fail(
          "SOURCE.NATIVE_LISTING_ADDRESS_CHANGED",
          "source listing witness seal",
        );
      }
    } else if (
      seal.nativeListingAddresses || seal.nativeListingWitnessHash ||
      seal.nativeListingInputHash
    ) {
      fail(
        "SOURCE.NATIVE_LISTING_ADDRESS_CHANGED",
        "unexpected listing resource seal",
      );
    }
  }
  const baselineEdges = await deferredNativeListingAddresses(
    s,
    await resourceObservations(s),
  );
  const sealedEdges = current.resourceSeals.flatMap((seal) =>
    seal.nativeListingAddresses || []
  );
  if (await resourceHash(actualEdges) !== await resourceHash(sealedEdges)) {
    fail(
      "SOURCE.NATIVE_LISTING_ADDRESS_CHANGED",
      "actual listing address seals",
    );
  }
  const geometry = finish
    ? await checkedPublicationAddressFinishContext(p, finish)
    : undefined;
  if (
    s.publicationAddresses && !geometry || !s.publicationAddresses && geometry
  ) {
    fail("SOURCE.NATIVE_LISTING_ADDRESS_INVALID", "stage context identity");
  }
  if (
    geometry &&
    await resourceHash(geometry.child) !== await resourceHash(current)
  ) {
    fail(
      "SOURCE.NATIVE_LISTING_ADDRESS_CHANGED",
      "stage current child differs",
    );
  }
  const downloads = await inspectOwnerDownloads(p);
  const draft = await buildOwnerResourceIndexDraft(
    p,
    s,
    current.invocation,
    current.resourceSeals,
    downloads?.files || [],
  );
  const descriptors = new Map<string, NativeListingWriter>();
  for (const plan of currentPlans) {
    for (const descriptor of [plan.sourceWriter, ...plan.selectedWriters]) {
      const before = descriptors.get(descriptor.source);
      if (
        before && await resourceHash(before) !== await resourceHash(descriptor)
      ) {
        fail(
          "SOURCE.NATIVE_LISTING_ADDRESS_INVALID",
          "conflicting selected writer descriptors",
        );
      }
      descriptors.set(descriptor.source, descriptor);
    }
  }
  const writers = [];
  for (
    const descriptor of [...descriptors.values()].sort((a, b) =>
      a.source.localeCompare(b.source)
    )
  ) {
    const writer = await currentWriter(s, current, actual, descriptor);
    const stagePath = geometry
      ? join(geometry.own.mount, descriptor.artifact).replaceAll("\\", "/")
      : undefined;
    const stage = stagePath
      ? await witness(finish!.output, stagePath)
      : undefined;
    // Without a publication stage the exact current native artifact serves both
    // positions of the existing same-source private-projection collision rule.
    const collision = {
      format: "html",
      member: s.root,
      source: descriptor.source,
      native: writer.native,
      stage: stage || writer.native,
    };
    denyBytes(draft.files, draft.policy, writer.native, collision);
    if (stage) denyBytes(draft.files, draft.policy, stage, collision);
    writers.push({ ...writer, ...(stage ? { stage } : {}) });
  }
  const expected = expectedAuxiliary(actual, actualEdges, currentPlans);
  const auxiliary = await witness(current.invocation.output, "listings.json");
  const auxiliaryText = await Deno.readTextFile(
    join(current.invocation.output, auxiliary.path),
  );
  let auxiliaryJSON: unknown;
  try {
    auxiliaryJSON = JSON.parse(auxiliaryText);
  } catch {
    fail("SOURCE.NATIVE_LISTING_ADDRESS_CHANGED", "invalid listings.json");
  }
  assertNativeListingAuxiliary(auxiliaryJSON, expected);
  if (auxiliaryText !== JSON.stringify(expected, null, 2)) {
    fail(
      "SOURCE.NATIVE_LISTING_ADDRESS_CHANGED",
      "noncanonical auxiliary constructor",
    );
  }
  denyBytes(draft.files, draft.policy, auxiliary);
  const auxiliaryStage = geometry
    ? await witness(
      finish!.output,
      join(geometry.own.mount, auxiliary.path).replaceAll("\\", "/"),
    )
    : undefined;
  if (auxiliaryStage) {
    const stageText = await Deno.readTextFile(
      join(finish!.output, auxiliaryStage.path),
    );
    if (stageText !== auxiliaryText) {
      fail(
        "SOURCE.NATIVE_LISTING_ADDRESS_CHANGED",
        "mounted auxiliary constructor differs",
      );
    }
    denyBytes(draft.files, draft.policy, auxiliaryStage);
  }
  const libDir = s.audit.profiles[s.profile].config.project["lib-dir"];
  relativePath(libDir);
  if (currentPlans.some((plan) => plan.libraryDirectory !== libDir)) {
    fail("SOURCE.NATIVE_LISTING_ADDRESS_CHANGED", "library directory context");
  }
  const assetDescriptors = [provider.assets.listMin, provider.assets.listingJS];
  const assetPaths = assetDescriptors.map((asset) =>
    join(libDir, asset.librarySubpath).replaceAll("\\", "/")
  );
  const assets = [];
  for (const [index, asset] of assetDescriptors.entries()) {
    const path = assetPaths[index];
    relativePath(path);
    const privatePath = ".course-owner/native-listing/provider/" +
      path.split("/").at(-1);
    const source = await witness(s.root, privatePath);
    const native = await witness(current.invocation.output, path);
    const stage = geometry
      ? await witness(
        finish!.output,
        join(geometry.own.mount, path).replaceAll("\\", "/"),
      )
      : undefined;
    if (
      source.sha256 !== asset.sha256 || native.sha256 !== asset.sha256 ||
      stage && stage.sha256 !== asset.sha256
    ) {
      fail("SOURCE.NATIVE_LISTING_ADDRESS_CHANGED", "stock dependency bytes");
    }
    const sourceRows = draft.files.filter((file) => file.path === privatePath);
    if (
      sourceRows.length !== 1 || sourceRows[0].origin !== "service" ||
      sourceRows[0].sha256 !== asset.sha256 ||
      draft.policy.files.find((row) => row.path === privatePath)?.allowed !==
        false
    ) {
      fail(
        "SOURCE.NATIVE_LISTING_ADDRESS_CHANGED",
        "stock service registry identity",
      );
    }
    // Only the exact current canonical stock registration may collide with its
    // retained provider service copy. Any additional alias/source collision vetoes.
    const otherFiles = draft.files.filter((file) => file.path !== privatePath);
    denyBytes(otherFiles, draft.policy, native);
    if (stage) denyBytes(otherFiles, draft.policy, stage);
    assets.push({
      source,
      providerRelative: asset.relative,
      native,
      ...(stage ? { stage } : {}),
    });
  }
  for (const plan of currentPlans) {
    const initializer = nativeListingInitializer(plan);
    const writer = writers.find((writer) =>
      writer.descriptor.source === plan.source
    )!;
    assertNativeListingStockRegistrations(
      await Deno.readTextFile(
        join(current.invocation.output, writer.native.path),
      ),
      plan.source,
      plan.sourceWriter.artifact,
      assetPaths,
      initializer,
    );
    if (writer.stage) {
      // Uniform mount preserves relative stock script and quarto:offset semantics.
      assertNativeListingStockRegistrations(
        await Deno.readTextFile(join(finish!.output, writer.stage.path)),
        plan.source,
        plan.sourceWriter.artifact,
        assetPaths,
        initializer,
      );
    }
  }
  const { ownerHtmlRuntimeWitnesses } = await import(
    "./publication-resources.ts"
  );
  const canonicalRuntime = await ownerHtmlRuntimeWitnesses(
    s,
    current.invocation.output,
    writers.map((writer) => ({
      source: writer.descriptor.source,
      path: writer.native.path,
    })),
  );
  for (const grant of canonicalRuntime) {
    const proof = grant.proof as {
      nativeHtml?: string;
      nativeHtmlSha256?: string;
      nativeTarget?: string;
      producer?: string;
    };
    const writer = writers.find((writer) =>
      writer.native.path === proof.nativeHtml
    );
    const source = draft.files.filter((file) =>
      file.path === grant.source &&
      file.sha256 === grant.sha256 && file.origin === "service"
    );
    const decision = draft.policy.files.filter((file) =>
      file.path === grant.source &&
      file.sha256 === grant.sha256 && file.allowed === false &&
      file.reasons.includes("service")
    );
    const eligible = draft.runtimeEligibility.filter((row) =>
      row.source === grant.source &&
      row.sourceSha256 === grant.sha256 && row.eligible &&
      row.producer === "course-presentation"
    );
    if (
      grant.kind !== "runtime" || grant.member !== s.root ||
      proof.producer !== "course-presentation" ||
      source.length !== 1 || decision.length !== 1 || eligible.length !== 1 ||
      !writer || writer.native.sha256 !== proof.nativeHtmlSha256 ||
      proof.nativeTarget !== grant.path
    ) {
      fail(
        "SOURCE.NATIVE_LISTING_ADDRESS_CHANGED",
        "current registered owner runtime eligibility",
      );
    }
  }
  // Emitted inventory is current provenance only. Every byte alias remains
  // subject to the ordinary denial, regardless of whether it was referenced.
  const emitted = await nativeOutputMap(current.invocation.output);
  const deniedFiles = [...draft.files];
  for (const name of ["resources.json", "finished.json"]) {
    const path = join(s.root, ".course-owner", name);
    if (await exists(path)) {
      await resourceNoLinks(s.root, path);
      deniedFiles.push({
        path: ".course-owner/" + name,
        actualPath: path,
        sha256: await digestFile(path),
        origin: "service",
        role: "other",
        producer: "Core current private completion receipt",
      });
    }
  }
  for (const file of emitted) {
    const writer = writers.find((writer) => writer.native.path === file.path);
    const asset = assets.find((asset) => asset.native.path === file.path);
    const allowedCollision = writer
      ? {
        format: "html",
        member: s.root,
        source: writer.descriptor.source,
        native: writer.native,
        stage: writer.stage || writer.native,
      }
      : undefined;
    const runtime = canonicalRuntime.filter((grant) =>
      grant.path === file.path && grant.sha256 === file.sha256
    );
    const applicable = deniedFiles.filter((denied) =>
      !(asset && denied.path === asset.source.path) &&
      !runtime.some((grant) =>
        denied.path === grant.source && denied.sha256 === grant.sha256
      )
    );
    denyBytes(applicable, draft.policy, file, allowedCollision);
  }
  return {
    protocol: 1 as const,
    prepared: p,
    providerHash: provider.sha256,
    plansHash: await resourceHash(currentPlans),
    invocation: current.invocation,
    reportsHash: await resourceHash(current.reports),
    resourceSealsHash: await resourceHash(current.resourceSeals),
    baselineEdges,
    actualEdges,
    writers,
    auxiliary: {
      native: auxiliary,
      expected,
      ...(auxiliaryStage ? { stage: auxiliaryStage } : {}),
    },
    assets,
    canonicalRuntime,
    emitted,
    ...(geometry
      ? {
        finish,
        stageContext: {
          preparedParent: geometry.context.navigation,
          parentInvocation: geometry.parent.invocation,
          parentReportsHash: await resourceHash(geometry.parent.reports),
          contextHash: geometry.context.contextHash,
          member: geometry.own,
        },
      }
      : {}),
  };
}
export async function finishNativeListingAddresses(
  p: PreparedOwner,
  current: Awaited<ReturnType<typeof readOwnerInvocationEvidence>>,
  finish?: OwnerPublicationAddressFinish,
) {
  const body = await completionBody(p, current, finish);
  if (!body) return;
  const receipt = { ...body, receiptHash: await resourceHash(body) };
  await resourceNoLinks(p.root, receiptPath(p.root));
  await Deno.writeTextFile(receiptPath(p.root), JSON.stringify(receipt), {
    createNew: true,
  });
  // New producer receipt bytes are now in the ordinary private-byte veto.
  const checked = await completionBody(p, undefined, finish);
  if (await resourceHash(checked) !== receipt.receiptHash) {
    fail("SOURCE.NATIVE_LISTING_ADDRESS_CHANGED", "completion changed");
  }
  return receipt;
}
export async function validateNativeListingAddresses(p: PreparedOwner) {
  const s = await preparedSession(p);
  if (!plans(s).length) {
    if (await exists(receiptPath(p.root))) {
      fail("SOURCE.NATIVE_LISTING_ADDRESS_CHANGED", "unexpected receipt");
    }
    return;
  }
  await resourceNoLinks(p.root, receiptPath(p.root));
  if (!await exists(receiptPath(p.root))) {
    fail("SOURCE.NATIVE_LISTING_ADDRESS_CHANGED", "finish receipt required");
  }
  const receipt = JSON.parse(await Deno.readTextFile(receiptPath(p.root)));
  const { receiptHash, ...body } = receipt;
  if (
    await resourceHash(body) !== receiptHash ||
    await resourceHash(await completionBody(p, undefined, receipt.finish)) !==
      receiptHash
  ) {
    fail("SOURCE.NATIVE_LISTING_ADDRESS_CHANGED", "current address receipt");
  }
  return receipt;
}
/** Canonical selected paths only; caller must apply the ordinary stage byte veto. */
export async function nativeListingPublicationGrants(
  p: PreparedOwner,
): Promise<NativeListingPublicationGrant[]> {
  const receipt = await validateNativeListingAddresses(p);
  if (!receipt) return [];
  if (
    !receipt.stageContext || !receipt.auxiliary.stage ||
    receipt.assets.some((asset: any) => !asset.stage)
  ) {
    fail(
      "SOURCE.NATIVE_LISTING_ADDRESS_INVALID",
      "mounted completion required",
    );
  }
  const proof = {
    receiptHash: receipt.receiptHash,
    invocationId: receipt.invocation.invocationId,
    providerHash: receipt.providerHash,
  };
  return [
    {
      ...receipt.auxiliary.stage,
      kind: "runtime-manifest",
      member: p.root,
      source: "listings.json",
      proof,
    },
    ...receipt.assets.map((asset: any) => ({
      ...asset.stage,
      kind: "runtime",
      member: p.root,
      source: asset.source.path,
      proof,
    })),
  ];
}
