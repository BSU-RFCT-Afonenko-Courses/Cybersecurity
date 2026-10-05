/** Finite private native writer projections. Auxiliary inventory is provenance only. */
import { dirname, isAbsolute, join, relative, resolve } from "stdlib/path";
import { activeOwner } from "./owner.ts";
import { OwnerFailure } from "./owner/failure.ts";
import { digestFile, exists, sha } from "./owner/runtime.ts";
import type { Invocation, Session } from "./owner/protocol.ts";
export interface CaptureProjection {
  root: string;
  profile: "student" | "full";
  source: string;
  channel: "ordinary" | "identity";
  invocationId: string;
  inputsHash: string;
  native: {
    format: "html";
    inspectedOutputFile: string;
    outputDirectory: string;
    outputFile: string;
    artifact: string;
  };
  retainedPath: string;
  sha256: string;
  capturePath: string;
  captureHash: string;
  emitted: { path: string; sha256: string; bytes: number }[];
  emittedInventoryHash: string;
}
function fail(cause: unknown): never {
  throw new OwnerFailure("SOURCE.CAPTURE_PROJECTION_CHANGED", cause);
}
function within(root: string, path: string) {
  const r = relative(root, resolve(path)).replaceAll("\\", "/");
  if (!r || r === ".." || r.startsWith("../") || isAbsolute(r)) fail(path);
  return r;
}
async function noLinks(root: string, path: string) {
  let current = root;
  for (const part of within(root, path).split("/")) {
    current = join(current, part);
    if ((await Deno.lstat(current)).isSymlink) fail("symlink: " + current);
  }
}
export async function projectionHash(value: unknown) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(value)),
      ),
    ),
  ).map((x) => x.toString(16).padStart(2, "0")).join("");
}
export function privateCaptureOutput(s: Session, profile: string) {
  return s.audit.navigation
    ? s.audit.navigation.scope.portal.output + "-capture"
    : join(s.root, ".course-owner/native-capture-output", profile);
}
export function projectionManifestPath(root: string) {
  return join(root, ".course-owner/capture-projections.json");
}
async function retainedPath(
  s: Session,
  p: Pick<CaptureProjection, "source" | "profile" | "channel">,
) {
  return join(
    s.root,
    ".course-owner/capture-projections",
    p.profile,
    await sha(p.source) + "-" + p.channel + ".html",
  );
}
function manifest(s: Session) {
  return {
    protocol: 1,
    root: s.root,
    attemptId: s.attemptId,
    sessionId: s.sessionId,
    profile: s.profile,
    projections: s.captureProjections,
  };
}
export async function retainCaptureProjection(
  s: Session,
  a: Invocation,
  source: string,
  document: any,
  raw: any,
  channel: CaptureProjection["channel"],
  capturePath: string,
) {
  // Check the still-current native invocation before updating its session manifest.
  // Session/service writes may follow only the same successful materialization;
  // never remove a stale locator to make this proof succeed.
  const current = await activeOwner(s.root);
  if (!current || JSON.stringify(current) !== JSON.stringify(a)) {
    fail("capture invocation changed");
  }
  const output = privateCaptureOutput(s, a.profile),
    inspected = document.formats?.html?.pandoc?.["output-file"],
    observed = raw.resources;
  if (
    a.phase !== "capture" || a.output !== output ||
    typeof inspected !== "string" || !inspected || !observed ||
    resolve(s.root, observed.outputDirectory) !== output ||
    typeof observed.outputFile !== "string"
  ) fail({ source, channel, observed });
  const nativeFile = resolve(s.root, observed.outputFile);
  const inspectedFile = resolve(dirname(join(s.root, source)), inspected);
  let artifact: string;
  if (nativeFile.startsWith(output + "/")) {
    artifact = within(output, nativeFile);
    if (within(s.root, inspectedFile) !== artifact) {
      fail("native writer/inspect mismatch");
    }
  } else {
    artifact = within(s.root, nativeFile);
    if (nativeFile !== inspectedFile) fail("native writer/inspect mismatch");
  }
  const emitted: CaptureProjection["emitted"] = [];
  async function walk(dir: string) {
    await noLinks(dirname(output), dir);
    for await (const entry of Deno.readDir(dir)) {
      const path = join(dir, entry.name);
      if (entry.isSymlink) fail("symlink: " + path);
      if (entry.isDirectory) await walk(path);
      else if (entry.isFile) {
        emitted.push({
          path: within(output, path),
          sha256: await digestFile(path),
          bytes: (await Deno.stat(path)).size,
        });
      } else fail(path);
    }
  }
  await walk(output);
  emitted.sort((a, b) => a.path.localeCompare(b.path));
  const writer = emitted.find((x) => x.path === artifact);
  if (!writer) fail({ source, artifact, emitted });
  const p: CaptureProjection = {
    root: s.root,
    profile: a.profile,
    source,
    channel,
    invocationId: a.invocationId,
    inputsHash: a.inputsHash,
    native: {
      format: "html",
      inspectedOutputFile: inspected,
      outputDirectory: output,
      outputFile: nativeFile,
      artifact,
    },
    retainedPath: "",
    sha256: writer.sha256,
    capturePath,
    captureHash: await digestFile(capturePath),
    emitted,
    emittedInventoryHash: await projectionHash(emitted),
  };
  p.retainedPath = await retainedPath(s, p);
  await Deno.mkdir(dirname(p.retainedPath), { recursive: true });
  await noLinks(s.root, dirname(p.retainedPath));
  await Deno.copyFile(join(output, artifact), p.retainedPath);
  if (await digestFile(p.retainedPath) !== p.sha256) fail(source);
  const key = a.profile + ":" + source + ":" + channel;
  if (s.captureProjections[key]) fail("duplicate projection: " + key);
  s.captureProjections[key] = p;
  await Deno.writeTextFile(
    projectionManifestPath(s.root),
    JSON.stringify(manifest(s)),
  );
  s.captureProjectionHash = await digestFile(projectionManifestPath(s.root));
  await Deno.remove(output, { recursive: true });
}
export async function assertCaptureProjections(
  s: Session,
  complete = s.validated,
) {
  if (
    !s.captureProjections || typeof s.captureProjections !== "object" ||
    Array.isArray(s.captureProjections) ||
    typeof s.captureProjectionHash !== "string"
  ) fail("missing projection maps");
  const expected: string[] = [];
  for (const [source, coverage] of Object.entries(s.audit.coverage)) {
    if (coverage.kind === "root") {
      for (const profile of coverage.profiles || []) {
        expected.push(profile + ":" + source + ":ordinary");
        if (!s.identityReplays[profile + ":" + source]) {
          expected.push(profile + ":" + source + ":identity");
        }
      }
    }
  }
  if (
    complete &&
    JSON.stringify(Object.keys(s.captureProjections).sort()) !==
      JSON.stringify(expected.sort())
  ) fail("incomplete projections");
  for (const [key, p] of Object.entries(s.captureProjections)) {
    if (
      p.root !== s.root || !expected.includes(key) ||
      key !== p.profile + ":" + p.source + ":" + p.channel ||
      !["ordinary", "identity"].includes(p.channel) ||
      p.native?.format !== "html" ||
      p.native.outputDirectory !== privateCaptureOutput(s, p.profile) ||
      p.retainedPath !== await retainedPath(s, p) ||
      !/^[a-f0-9-]{36}$/.test(p.invocationId) ||
      !/^[a-f0-9]{64}$/.test(p.inputsHash) ||
      p.inputsHash !==
        await projectionHash(s.audit.profiles[p.profile].files.input) ||
      !Array.isArray(p.emitted) ||
      await projectionHash(p.emitted) !== p.emittedInventoryHash ||
      !p.emitted.some((x) =>
        x.path === p.native.artifact && x.sha256 === p.sha256
      )
    ) fail(key);
    const capture = p.channel === "ordinary"
      ? s.captures[p.profile + ":" + p.source]
      : s.identities[p.profile + ":" + p.source];
    if (capture !== p.capturePath || !await exists(p.retainedPath)) fail(key);
    if (!await exists(capture) || await digestFile(capture) !== p.captureHash) {
      throw new OwnerFailure(
        p.channel === "identity"
          ? "SOURCE.HEADER_IDENTITY_CHANGED"
          : "SOURCE.BASELINE_CHANGED",
        key,
      );
    }
    await noLinks(s.root, p.retainedPath);
    await noLinks(s.root, capture);
    if (
      await digestFile(p.retainedPath) !== p.sha256 ||
      await digestFile(capture) !== p.captureHash
    ) fail(key);
  }
  const retained = join(s.root, ".course-owner/capture-projections");
  if (await exists(retained)) {
    const expectedFiles = new Set(
      Object.values(s.captureProjections).map((p) => p.retainedPath),
    );
    async function check(dir: string) {
      await noLinks(s.root, dir);
      for await (const entry of Deno.readDir(dir)) {
        const path = join(dir, entry.name);
        if (
          entry.isSymlink ||
          !entry.isDirectory && (!entry.isFile || !expectedFiles.has(path))
        ) fail("unknown retained projection: " + path);
        if (entry.isDirectory) await check(path);
      }
    }
    await check(retained);
  }
  if (complete) {
    for (const profile of ["student", "full"]) {
      if (await exists(privateCaptureOutput(s, profile))) {
        fail("uncleared capture output: " + profile);
      }
    }
  }
  const path = projectionManifestPath(s.root);
  if (
    !Object.keys(s.captureProjections).length && !s.captureProjectionHash &&
    !complete
  ) return;
  if (!await exists(path)) fail(path);
  await noLinks(s.root, path);
  if (
    await digestFile(path) !== s.captureProjectionHash ||
    JSON.stringify(JSON.parse(await Deno.readTextFile(path))) !==
      JSON.stringify(manifest(s))
  ) fail(path);
}
/** Pure geometry check; callers must first bind the selected HTML writer to complete current owner evidence. */
export function sameSourceProjectionArtifact(
  p: CaptureProjection,
  owner: string,
  source: string,
  artifact: {
    format: string;
    member: string;
    source: string;
    native: { path: string; sha256: string };
    stage: { path: string; sha256: string };
  },
  target: string,
  hash: string,
) {
  return artifact.format === "html" && p.root === owner &&
    artifact.member === owner &&
    artifact.source === source && p.source === source &&
    artifact.native.path === p.native.artifact &&
    artifact.stage.path === target && artifact.native.sha256 === hash &&
    artifact.stage.sha256 === hash && p.sha256 === hash;
}
