/** Finite ordinary-Link addresses; never a foreign owner resource grant. */
import { dirname, isAbsolute, join, relative, resolve } from "stdlib/path";
import {
  assertFrozen,
  inspectOwnerDownloads,
  preparedSession,
  readOwnerInvocationEvidence,
} from "./owner.ts";
import { OwnerFailure } from "./owner/failure.ts";
import { digestFile, exists, sha } from "./owner/runtime.ts";
import type { PreparedOwner, Session } from "./owner/protocol.ts";
import type { PreparedNavigationOwner } from "./navigation.ts";
import type { NavigationPublicationMember } from "./publication-resources.ts";
import {
  buildOwnerResourceIndexDraft,
  type OwnerResourceFile,
  resourceHash,
  resourceNoLinks,
  type ResourceObservation,
  resourceObservations,
  resourceRelative,
  resourceTargetLocation,
  type ResourceUse,
} from "./resources.ts";
import { sameSourceProjectionArtifact } from "./capture-projections.ts";
export interface OwnerPublicationAddressContext {
  navigation: PreparedNavigationOwner;
}
export type NativePublicationMemberOutput = Pick<
  NavigationPublicationMember,
  "path" | "mount" | "format" | "output"
>;
export interface OwnerPublicationAddressFinish {
  output: string;
  members: NativePublicationMemberOutput[];
}
type Address = NonNullable<Session["audit"]["navigation"]>["addresses"][number];
export interface PreparedPublicationAddresses {
  navigation: PreparedNavigationOwner;
  member: { path: string; mount: string; format: "html" };
  descriptorHash: string;
  addresses: Address[];
  contextHash: string;
}
export interface DeferredPublicationAddress {
  source: string;
  profile: "student" | "full";
  phase: "capture" | "render";
  projection: "raw" | "projected";
  effectiveBase: string;
  target: string;
  order: number;
  address: Address;
  writer: Address & { format: "html"; mount: string; outputFile: string };
  contextHash: string;
}
function fail(code: string, cause: unknown): never {
  throw new OwnerFailure(code, cause);
}
function inside(root: string, path: string) {
  const rel = relative(root, path).replaceAll("\\", "/");
  return rel && rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel);
}
export async function preparePublicationAddresses(
  root: string,
  attemptId: string,
  profile: "student" | "full",
  context: OwnerPublicationAddressContext,
): Promise<PreparedPublicationAddresses> {
  if (!context || Object.keys(context).join(",") !== "navigation") {
    fail("SOURCE.PUBLICATION_ADDRESS_CONTEXT_INVALID", context);
  }
  const parent = await preparedSession(context.navigation),
    nav = parent.audit.navigation;
  if (
    !nav || parent.publicationAddresses || parent.attemptId !== attemptId ||
    parent.profile !== profile || !inside(parent.root, root)
  ) {
    fail("SOURCE.PUBLICATION_ADDRESS_CONTEXT_INVALID", context);
  }
  await assertFrozen(context.navigation.sessionPath);
  const path = resourceRelative(parent.root, root);
  const matches = nav.scope.members.filter((m) =>
    resolve(parent.root, m.path) === root
  );
  if (
    matches.length !== 1 || matches[0].format !== "html" ||
    typeof matches[0].mount !== "string"
  ) {
    fail("SOURCE.PUBLICATION_ADDRESS_CONTEXT_INVALID", path);
  }
  const member = { path, mount: matches[0].mount, format: "html" as const };
  const body = {
    navigation: context.navigation,
    member,
    descriptorHash: await resourceHash(nav),
    addresses: nav.addresses,
  };
  return { ...body, contextHash: await resourceHash(body) };
}
/** Prepared source/config/module context only; root activation is deliberately absent. */
export async function validatePreparedPublicationAddresses(s: Session) {
  if (!s.publicationAddresses) return;
  const expected = await preparePublicationAddresses(
    s.root,
    s.attemptId,
    s.profile,
    { navigation: s.publicationAddresses.navigation },
  );
  if (
    await resourceHash(expected) !== await resourceHash(s.publicationAddresses)
  ) {
    fail("SOURCE.PUBLICATION_ADDRESS_CONTEXT_CHANGED", s.root);
  }
}
export async function deferredPublicationAddress(
  s: Session,
  observation: ResourceObservation,
  use: ResourceUse,
  projection: "raw" | "projected",
): Promise<DeferredPublicationAddress | undefined> {
  const context = s.publicationAddresses;
  if (!context || use.kind !== "Link") return;
  const location = resourceTargetLocation(s.root, observation, use);
  if (!location || inside(s.root, location)) return;
  if (
    observation.effectiveBase !== observation.source ||
    !s.audit.coverage[observation.source]?.profiles?.includes(
      observation.profile,
    )
  ) {
    fail("RESOURCE.INVALID_OBSERVATION_BASE", observation);
  }
  const parentRoot = context.navigation.root;
  if (!inside(parentRoot, location)) return;
  const target = resourceRelative(parentRoot, location);
  const addresses = context.addresses.filter((a) => a.target === target);
  if (addresses.length !== 1) return;
  const writers = context.addresses.filter((a) =>
    a.member === context.member.path &&
    a.source === resolve(s.root, observation.source) &&
    a.format === "html"
  );
  if (writers.length !== 1 || dirname(observation.source) !== ".") {
    fail("SOURCE.PUBLICATION_ADDRESS_WRITER_UNSUPPORTED", observation.source);
  }
  const own = writers[0],
    outputFile = resourceRelative(
      resolve(parentRoot, context.member.mount),
      resolve(parentRoot, own.target),
    );
  if (own.target !== context.member.mount + "/" + outputFile) {
    fail("SOURCE.PUBLICATION_ADDRESS_WRITER_UNSUPPORTED", own);
  }
  const mounted = resourceTargetLocation(parentRoot, {
    ...observation,
    effectiveBase: own.target,
  }, use);
  if (!mounted || resourceRelative(parentRoot, mounted) !== target) {
    fail("SOURCE.PUBLICATION_ADDRESS_WRITER_MISMATCH", {
      source: observation.source,
      target,
      writer: own,
    });
  }
  if (observation.phase === "render") {
    const project = s.audit.profiles[observation.profile]?.config?.project;
    const projectType = project?.type || "default";
    if (
      !project || typeof project !== "object" || Array.isArray(project) ||
      !["default", "book", "website"].includes(projectType)
    ) {
      fail("SOURCE.PUBLICATION_ADDRESS_WRITER_UNSUPPORTED", observation.source);
    }
    // Stock default projects report the intermediate writer under Source;
    // book/website projects report it under the current output directory.
    const writerRoot = projectType === "default"
      ? s.root
      : observation.outputDirectory;
    if (
      typeof observation.outputDirectory !== "string" ||
      typeof observation.outputFile !== "string" ||
      typeof writerRoot !== "string" ||
      resolve(s.root, observation.outputFile) !==
        resolve(s.root, writerRoot, outputFile)
    ) {
      fail("SOURCE.PUBLICATION_ADDRESS_WRITER_MISMATCH", observation);
    }
  }
  return {
    source: observation.source,
    profile: observation.profile,
    phase: observation.phase,
    projection,
    effectiveBase: observation.effectiveBase,
    target: use.target,
    order: use.order,
    address: addresses[0],
    writer: { ...own, format: "html", mount: context.member.mount, outputFile },
    contextHash: context.contextHash,
  };
}
export async function deferredPublicationAddresses(
  s: Session,
  observations: ResourceObservation[],
) {
  const edges: DeferredPublicationAddress[] = [];
  for (const observation of observations) {
    if (observation.opaque?.length) {
      fail("RESOURCE.OPAQUE_CARRIER_UNSUPPORTED", observation.opaque);
    }
    for (const projection of ["raw", "projected"] as const) {
      for (const use of observation[projection]) {
        const edge = await deferredPublicationAddress(
          s,
          observation,
          use,
          projection,
        );
        if (edge) edges.push(edge);
      }
    }
  }
  return edges;
}
async function canonicalDirectory(path: string) {
  if (
    typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path ||
    !await exists(path) || await Deno.realPath(path) !== path ||
    !(await Deno.stat(path)).isDirectory
  ) {
    fail("SOURCE.PUBLICATION_ADDRESS_FINISH_INVALID", path);
  }
  await resourceNoLinks("/", path);
}
async function witness(base: string, path: string) {
  const absolute = resolve(base, path);
  resourceRelative(base, absolute);
  await resourceNoLinks(base, absolute);
  if (!await exists(absolute) || !(await Deno.stat(absolute)).isFile) {
    fail("SOURCE.PUBLICATION_ADDRESS_ARTIFACT_MISSING", absolute);
  }
  return { path: absolute, sha256: await digestFile(absolute) };
}
function veto(
  files: OwnerResourceFile[],
  policy: { files: { path: string; allowed: boolean }[] },
  hashes: string[],
  artifact?: {
    format: "html";
    member: string;
    source: string;
    native: { path: string; sha256: string };
    stage: { path: string; sha256: string };
  },
) {
  const denied = new Set(
    files.filter((f) =>
      !policy.files.find((p) => p.path === f.path)?.allowed &&
      !(artifact && f.captureProjection &&
        sameSourceProjectionArtifact(
          f.captureProjection,
          artifact.member,
          artifact.source,
          artifact,
          artifact.stage.path,
          f.sha256,
        ))
    )
      .map((f) => f.sha256),
  );
  if (hashes.some((hash) => denied.has(hash))) {
    fail(
      "SOURCE.PUBLICATION_ADDRESS_DENIED_BYTES",
      "own service or closed source bytes",
    );
  }
}
/** Checked current native/stage geometry; never completes or indexes an owner. */
export async function checkedPublicationAddressFinishContext(
  p: PreparedOwner,
  options: OwnerPublicationAddressFinish,
) {
  const child = await readOwnerInvocationEvidence(p), s = child.session;
  const context = s.publicationAddresses;
  if (!context) fail("SOURCE.PUBLICATION_ADDRESS_CONTEXT_INVALID", p);
  await validatePreparedPublicationAddresses(s);
  const parent = await readOwnerInvocationEvidence(context.navigation);
  if (child.failure || parent.failure) {
    fail(
      "SOURCE.PUBLICATION_ADDRESS_NATIVE_FAILED",
      child.failure || parent.failure,
    );
  }
  if (
    !options || Object.keys(options).sort().join(",") !== "members,output" ||
    !Array.isArray(options.members)
  ) fail("SOURCE.PUBLICATION_ADDRESS_FINISH_INVALID", options);
  await canonicalDirectory(options.output);
  if (
    options.output === parent.session.root ||
    inside(parent.session.root, options.output) ||
    inside(options.output, parent.session.root) ||
    options.output === parent.invocation.output ||
    inside(parent.invocation.output, options.output) ||
    inside(options.output, parent.invocation.output)
  ) {
    fail(
      "SOURCE.PUBLICATION_ADDRESS_FINISH_INVALID",
      "publication stage overlap",
    );
  }
  const scope = parent.session.audit.navigation!.scope.members;
  if (scope.length !== options.members.length) {
    fail("SOURCE.PUBLICATION_ADDRESS_FINISH_INVALID", options);
  }
  const members: NativePublicationMemberOutput[] = [];
  for (const declared of scope) {
    const path = resolve(parent.session.root, declared.path);
    const rows = options.members.filter((m) => m.path === path);
    if (
      rows.length !== 1 ||
      Object.keys(rows[0]).sort().join(",") !== "format,mount,output,path" ||
      rows[0].mount !== declared.mount || rows[0].format !== declared.format
    ) {
      fail("SOURCE.PUBLICATION_ADDRESS_FINISH_INVALID", declared);
    }
    const member = rows[0];
    await canonicalDirectory(member.output);
    if (
      inside(parent.session.root, member.output) ||
      inside(member.output, parent.session.root) ||
      member.output === parent.session.root ||
      inside(options.output, member.output) ||
      inside(member.output, options.output) ||
      member.output === options.output ||
      members.some((m: NativePublicationMemberOutput) =>
        inside(m.output, member.output) ||
        inside(member.output, m.output) || m.output === member.output
      )
    ) {
      fail("SOURCE.PUBLICATION_ADDRESS_FINISH_INVALID", member);
    }
    members.push(member);
  }
  const own = members.find((m) => m.path === s.root);
  if (!own || own.output !== child.invocation.output) {
    fail("SOURCE.PUBLICATION_ADDRESS_FINISH_INVALID", "actual child output");
  }
  return { child, session: s, context, parent, members, own };
}
/** Derives current late proof, without completing or indexing the prepared parent. */
async function completionBody(
  p: PreparedOwner,
  options: OwnerPublicationAddressFinish,
) {
  const { child, session: s, context, parent, members, own } =
    await checkedPublicationAddressFinishContext(p, options);
  const observations = await resourceObservations(s);
  const actual = [];
  for (const report of child.reports) {
    const capture = JSON.parse(
      await Deno.readTextFile(
        join(
          s.root,
          ".course-owner/render",
          s.profile,
          await sha(report.source) + ".json",
        ),
      ),
    );
    if (
      !capture.resources ||
      resolve(s.root, capture.resources.outputDirectory) !==
        child.invocation.output
    ) {
      fail("SOURCE.PUBLICATION_ADDRESS_WRITER_MISMATCH", report.source);
    }
    actual.push(capture.resources as ResourceObservation);
  }
  const baselineEdges = await deferredPublicationAddresses(s, observations);
  const actualEdges = await deferredPublicationAddresses(s, actual);
  const sealedEdges = child.resourceSeals.flatMap((seal) =>
    seal.publicationAddresses || []
  );
  if (await resourceHash(actualEdges) !== await resourceHash(sealedEdges)) {
    fail("SOURCE.PUBLICATION_ADDRESS_CHANGED", "actual edge seals");
  }
  const edges = [...baselineEdges, ...actualEdges];
  const downloads = await inspectOwnerDownloads(p);
  const draft = await buildOwnerResourceIndexDraft(
    p,
    s,
    child.invocation,
    child.resourceSeals,
    downloads?.files || [],
  );
  const writers = [];
  for (
    const target of [...new Set(edges.map((edge) => edge.writer.target))].sort()
  ) {
    const writer = edges.find((edge) => edge.writer.target === target)!.writer;
    const native = await witness(own.output, writer.outputFile);
    const stage = await witness(options.output, writer.target);
    veto(draft.files, draft.policy, [native.sha256, stage.sha256], {
      format: writer.format,
      member: s.root,
      source: resourceRelative(s.root, writer.source),
      native: { path: writer.outputFile, sha256: native.sha256 },
      stage: { path: writer.target, sha256: stage.sha256 },
    });
    writers.push({ writer, native, stage });
  }
  const bindings = [];
  for (
    const target of [...new Set(edges.map((edge) => edge.address.target))]
      .sort()
  ) {
    const address = context.addresses.find((a) => a.target === target)!;
    const member = members.find((m) =>
      resourceRelative(parent.session.root, m.path) === address.member
    );
    if (
      !member || !["html", "pdf"].includes(address.format) ||
      member.format !== address.format
    ) {
      fail("SOURCE.PUBLICATION_ADDRESS_FINISH_INVALID", address);
    }
    const outputFile = resourceRelative(
      resolve(parent.session.root, member.mount),
      resolve(parent.session.root, address.target),
    );
    const native = await witness(member.output, outputFile),
      stage = await witness(options.output, target);
    if (address.format === "pdf" && native.sha256 !== stage.sha256) {
      fail("SOURCE.PUBLICATION_ADDRESS_CHANGED", target);
    }
    veto(draft.files, draft.policy, [native.sha256, stage.sha256]);
    bindings.push({ address, native, stage });
  }
  return {
    protocol: 1,
    prepared: p,
    contextHash: context.contextHash,
    options,
    child: { invocation: child.invocation, reports: child.reports },
    parent: {
      prepared: context.navigation,
      invocation: parent.invocation,
      reports: parent.reports,
    },
    edges,
    writers,
    bindings,
  };
}
export async function finishPublicationAddresses(
  p: PreparedOwner,
  options: OwnerPublicationAddressFinish,
) {
  const body = await completionBody(p, options);
  const receipt = { ...body, receiptHash: await resourceHash(body) };
  const path = join(p.root, ".course-owner/publication-addresses.json");
  await Deno.writeTextFile(path, JSON.stringify(receipt), { createNew: true });
  // A real proof service is now included in the final draft and denied-byte veto.
  const final = await completionBody(p, options);
  if (await resourceHash(final) !== await resourceHash(body)) {
    fail("SOURCE.PUBLICATION_ADDRESS_CHANGED", "completion changed");
  }
}
export async function validatePublicationAddresses(p: PreparedOwner) {
  const s = await preparedSession(p);
  if (!s.publicationAddresses) return;
  const path = join(p.root, ".course-owner/publication-addresses.json");
  if (!await exists(path)) {
    fail("SOURCE.PUBLICATION_ADDRESS_FINISH_REQUIRED", p.sessionId);
  }
  await resourceNoLinks(p.root, path);
  const receipt = JSON.parse(await Deno.readTextFile(path));
  const { receiptHash, ...body } = receipt;
  if (
    await resourceHash(body) !== receiptHash ||
    await resourceHash(await completionBody(p, receipt.options)) !== receiptHash
  ) {
    fail("SOURCE.PUBLICATION_ADDRESS_CHANGED", path);
  }
}
