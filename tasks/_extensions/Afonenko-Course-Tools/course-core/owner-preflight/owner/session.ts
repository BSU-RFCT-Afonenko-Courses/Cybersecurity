/** Read-only session envelopes and evidence hashes; lifecycle services stay in the facade. */
import { dirname, join, relative, resolve } from "stdlib/path";
import { OwnerFailure } from "./failure.ts";
import { digest, digestFile, exists, inside, noLink, sha } from "./runtime.ts";
import type { Audit, Session } from "./protocol.ts";

export interface SessionEvidenceValidators {
  assertCaptureProjections(session: Session): Promise<void>;
  assertNativeListingEvidenceMaps(session: Session): Promise<void>;
  validateBodySelection(
    selection: NonNullable<Session["body"]>,
    audit: Audit,
    attemptId: string,
  ): Promise<void>;
}

export function invalid(cause: unknown): never {
  throw new OwnerFailure("SOURCE.INVALID_ATTEMPT", cause);
}
export async function noStateLinks(root: string, path: string) {
  const rel = inside(root, path);
  let current = root;
  for (const component of rel.split("/")) {
    current = join(current, component);
    await noLink(current);
  }
}
export function record(value: any): boolean {
  return value && typeof value === "object" && !Array.isArray(value);
}
function hashes(value: any): boolean {
  return record(value) &&
    Object.values(value).every((v) =>
      typeof v === "string" && /^[a-f0-9]{64}$/.test(v)
    );
}
export async function digestStateFile(root: string, path: string) {
  await noStateLinks(root, path);
  return digestFile(path);
}
export async function readSession(
  path: string,
  validators: SessionEvidenceValidators,
): Promise<Session> {
  try {
    await noLink(dirname(path));
    await noLink(path);
    const s = JSON.parse(await Deno.readTextFile(path));
    if (
      s.protocol !== 1 || !["student", "full"].includes(s.profile) ||
      typeof s.attemptId !== "string" || !s.attemptId ||
      typeof s.sessionId !== "string" || !s.sessionId ||
      typeof s.quarto !== "string" || !s.quarto || !hashes(s.files) ||
      !record(s.audit) || !record(s.captures) || !hashes(s.captureHashes) ||
      !record(s.captureProjections) ||
      typeof s.captureProjectionHash !== "string" ||
      !record(s.identities) || !hashes(s.identityHashes) ||
      !Array.isArray(s.headers) || !record(s.identityReaders) ||
      !record(s.identityReplays) ||
      !record(s.readerInputs) || !hashes(s.readerInputHashes) ||
      Object.values(s.identityReplays).some((value) => value !== true) ||
      Object.values(s.identityReaders).some((reader) =>
        typeof reader !== "string" || !reader.endsWith("-auto_identifiers")
      ) ||
      typeof s.validated !== "boolean" || typeof s.extension !== "string"
    ) invalid("missing fields");
    if (
      await Deno.realPath(s.root) !== s.root || s.audit.root !== s.root ||
      !["session.json", "preparation.json"].includes(
        relative(join(s.root, ".course-owner"), resolve(path)),
      )
    ) invalid("wrong owner session path");
    if (
      !inside(s.root, s.extension) ||
      inside(s.root, s.extension) !== s.extension
    ) invalid("escaping extension");
    const inputs = Object.entries(s.audit.coverage).filter((
      [, v]: [string, any],
    ) => v.kind === "root");
    const expected = inputs.flatMap(([source, v]: [string, any]) =>
      v.profiles.map((profile: string) => profile + ":" + source)
    ).sort();
    if (Object.keys(s.identityReplays).some((key) => !expected.includes(key))) {
      invalid("foreign native reader replay");
    }
    for (const [key, input] of Object.entries(s.readerInputs)) {
      if (
        !s.identityReplays[key] || input !== join(
            s.root,
            ".course-owner",
            "reader-input",
            key.split(":")[0],
            await sha(key.slice(key.indexOf(":") + 1)) + ".md",
          )
      ) invalid("foreign native reader input");
    }
    for (const [key, capture] of Object.entries(s.captures)) {
      if (
        !expected.includes(key) ||
        capture !==
          join(
            s.root,
            ".course-owner",
            "capture",
            key.split(":")[0],
            await sha(key.slice(key.indexOf(":") + 1)) + ".json",
          )
      ) invalid("foreign capture");
    }
    for (const [key, capture] of Object.entries(s.identities)) {
      if (
        !expected.includes(key) || capture !== join(
            s.root,
            ".course-owner",
            "identity",
            key.split(":")[0],
            await sha(key.slice(key.indexOf(":") + 1)) + ".json",
          )
      ) invalid("foreign Header identity capture");
    }
    if (
      s.validated &&
      JSON.stringify(Object.keys(s.captures).sort()) !==
        JSON.stringify(expected)
    ) invalid("incomplete baselines");
    if (
      s.validated &&
      [s.identities, s.identityHashes, s.identityReaders].some((map) =>
        JSON.stringify(Object.keys(map).sort()) !== JSON.stringify(expected)
      )
    ) invalid("incomplete Header identity evidence");
    if (
      s.validated &&
      [s.readerInputs, s.readerInputHashes].some((map) =>
        JSON.stringify(Object.keys(map).sort()) !==
          JSON.stringify(Object.keys(s.identityReplays).sort())
      )
    ) invalid("incomplete native reader input evidence");
    await validators.assertCaptureProjections(s);
    await validators.assertNativeListingEvidenceMaps(s);
    if (s.body !== undefined) {
      await validators.validateBodySelection(s.body, s.audit, s.attemptId);
    }
    return s;
  } catch (error) {
    if (error instanceof OwnerFailure) throw error;
    invalid(String(error));
  }
}
export async function assertSessionCaptures(
  s: Session,
  assertCaptureProjections:
    SessionEvidenceValidators["assertCaptureProjections"],
) {
  await assertCaptureProjections(s);
  if (!s.validated) return;
  for (const [key, path] of Object.entries(s.captures)) {
    if (await exists(path)) await noStateLinks(s.root, path);
    if (
      !s.captureHashes[key] || !await exists(path) ||
      await digestFile(path) !== s.captureHashes[key]
    ) throw new OwnerFailure("SOURCE.BASELINE_CHANGED", key);
  }
  for (const [key, path] of Object.entries(s.identities)) {
    if (await exists(path)) await noStateLinks(s.root, path);
    if (
      !s.identityHashes[key] || !await exists(path) ||
      await digestFile(path) !== s.identityHashes[key]
    ) {
      throw new OwnerFailure("SOURCE.HEADER_IDENTITY_CHANGED", key);
    }
  }
  for (const [key, path] of Object.entries(s.readerInputs)) {
    if (await exists(path)) await noStateLinks(s.root, path);
    if (
      !await exists(path) || await digestFile(path) !== s.readerInputHashes[key]
    ) {
      throw new OwnerFailure("SOURCE.HEADER_IDENTITY_CHANGED", key);
    }
    const proof =
      JSON.parse(await Deno.readTextFile(s.identities[key])).readerReplay;
    if (
      proof?.inputPath !== path ||
      proof?.inputHash !== s.readerInputHashes[key] ||
      typeof proof?.input !== "string" ||
      await digest(new TextEncoder().encode(proof.input)) !==
        s.readerInputHashes[key]
    ) throw new OwnerFailure("SOURCE.HEADER_IDENTITY_CHANGED", key);
  }
}
