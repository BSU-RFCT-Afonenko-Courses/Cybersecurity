import { assemble } from "./assemble.ts";
import type { Adapter, DocumentResult, ReleaseResult } from "./model.ts";

/** Domain aggregation only. The caller supplies this successful build's results. */
export function assembleRelease(
  expectedSources: string[],
  documents: DocumentResult[],
  adapters: Adapter[],
  expectation: {
    view: "student" | "full" | undefined;
    profiles: string[];
    format?: string;
  },
): ReleaseResult {
  const fail = (code: string, detail: string): never => {
    throw new Error(`${code}: ${detail}`);
  };
  if (
    !expectedSources.length || expectedSources.some((source) => !source) ||
    new Set(expectedSources).size !== expectedSources.length
  ) {
    fail(
      "RELEASE.EXPECTED_SOURCES_INVALID",
      "expected nonempty unique sources",
    );
  }
  const expected = new Set(expectedSources),
    fragments = new Map<string, DocumentResult>();
  for (const result of documents) {
    if (
      result.scope !== "document" ||
      result.source !== result.document?.source || !result.document.format ||
      !result.document.output || !Array.isArray(result.document.profiles) ||
      result.document.profiles.some((profile) =>
        typeof profile !== "string" || !profile
      )
    ) {
      fail("RELEASE.DOCUMENT_INVALID", result.source);
    }
    if (!expected.has(result.source)) {
      fail("RELEASE.UNEXPECTED_DOCUMENT", result.source);
    }
    if (fragments.has(result.source)) {
      fail("RELEASE.DUPLICATE_DOCUMENT", result.source);
    }
    fragments.set(result.source, result);
  }
  for (const source of expectedSources) {
    if (!fragments.has(source)) fail("RELEASE.MISSING_DOCUMENT", source);
  }
  const ordered = expectedSources.map((source) => fragments.get(source)!);
  const first = ordered[0];
  for (const result of ordered) {
    if (result.course.id !== first.course.id) {
      fail("RELEASE.MIXED_COURSE", result.source);
    }
    if (result.course.view !== first.course.view) {
      fail("RELEASE.MIXED_VIEW", result.source);
    }
    if (result.document.format !== first.document.format) {
      fail("RELEASE.MIXED_FORMAT", result.source);
    }
    if (
      JSON.stringify(result.document.profiles) !==
        JSON.stringify(first.document.profiles)
    ) fail("RELEASE.MIXED_PROFILES", result.source);
  }
  if (
    first.course.view !== expectation.view ||
    JSON.stringify(first.document.profiles) !==
      JSON.stringify(expectation.profiles) ||
    expectation.format && first.document.format !== expectation.format
  ) fail("RELEASE.EXPECTATION_MISMATCH", first.source);
  const model = assemble(expectedSources, fragments, adapters);
  const exercises = new Set<string>(), assessments = new Set<string>();
  for (const exercise of model.exercises) {
    if (exercises.has(exercise.id)) {
      fail("CORE.DUPLICATE_EXERCISE", exercise.id);
    }
    exercises.add(exercise.id);
    if (!model.registeredTargets.includes(exercise.target)) {
      fail("CORE.UNKNOWN_TARGET", exercise.id + "/" + exercise.target);
    }
  }
  for (const assessment of model.assessments) {
    if (assessments.has(assessment.id)) {
      fail("CORE.DUPLICATE_ASSESSMENT", assessment.id);
    }
    assessments.add(assessment.id);
    for (const member of assessment.items) {
      if (!exercises.has(member)) {
        fail("CORE.UNKNOWN_MEMBER", assessment.id + "/" + member);
      }
    }
  }
  return { scope: "release", documents: ordered, model };
}
