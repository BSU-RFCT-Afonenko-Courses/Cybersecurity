import vocabulary from "../contract-vocabulary.json" with { type: "json" };
import { fail } from "../contracts/project.ts";
import type {
  EarlyDocument,
  FinalizedDocument,
} from "../document/contracts.ts";
import { decode } from "../document/contracts.ts";
import { immutable } from "../document/condition.ts";
import {
  NativeAdapterValidationInputSchema,
  NativeAdapterValidationResultSchema,
  NativeMetadataReadSetSchema,
  NativeReleaseProofSchema,
  NativeReleaseRequestSchema,
} from "./contracts.ts";
import type {
  NativeAdapterValidator,
  NativeReleaseRequest,
} from "./contracts.ts";
export async function validateNativeRelease(
  documents: readonly {
    source: string;
    early: Pick<EarlyDocument, "context" | "definitions" | "release">;
    final: Pick<FinalizedDocument, "hasPublicSolution">;
  }[],
  identity: {
    operation: string;
    projection: "student" | "author";
    profiles: string[];
  },
  requestValue: NativeReleaseRequest,
  validators: readonly NativeAdapterValidator[],
  installed: readonly string[],
  checkPath: (
    source: string,
    path: string,
    kind?: "file" | "directory",
  ) => Promise<void>,
  guard: () => Promise<void>,
) {
  // Snapshot executable descriptors before the first await; later mutation cannot change authority.
  validators = validators.map((v) => ({
    name: v.name,
    validate: v.validate,
    nativeMetadataReadSet: immutable(
      decode(
        NativeMetadataReadSetSchema,
        v.nativeMetadataReadSet,
        "CORE.ADAPTER_INVALID",
      ),
    ),
  }));
  identity = {
    operation: identity.operation,
    projection: identity.projection,
    profiles: identity.profiles,
  };
  await guard();
  const request = decode(
    NativeReleaseRequestSchema,
    requestValue,
    "RELEASE.EXPECTED_SOURCES_INVALID",
  );
  const expected = new Set(request.expectedSources);
  if (expected.size !== request.expectedSources.length) {
    fail("RELEASE.EXPECTED_SOURCES_INVALID", "Повторные expected sources");
  }
  if (
    documents.length !== expected.size ||
    documents.some((d) => !expected.has(d.source))
  ) fail("RELEASE.COVERAGE", "Missing/unexpected current document");
  const facts = new Map<
      string,
      {
        source: string;
        declaration: EarlyDocument["definitions"][string];
        hasPublicSolution: boolean;
      }
    >(),
    assessments = new Set<string>(),
    bindings = new Set<string>();
  const first = documents[0].early.release;
  if (!first) {
    fail("RELEASE.METADATA_MISSING", "Нет current ранних release facts");
  }
  const course = first.course;
  const view = identity.projection === "student" ? "student" : "full";
  if (request.courseId !== undefined && course.id !== request.courseId) {
    fail("RELEASE.MIXED_COURSE", "Неожиданный course.id");
  }
  if (course.id && course.view !== view) {
    fail(
      "RELEASE.EXPECTATION_MISMATCH",
      "course.view отличается от native projection",
    );
  }
  const byName = new Map(validators.map((v) => [v.name, v]));
  if (
    byName.size !== validators.length ||
    validators.some((v) => typeof v.validate !== "function")
  ) fail("CORE.ADAPTER_INVALID", "Повторный/неисполнимый adapter validator");
  for (const doc of documents) {
    const release = doc.early.release;
    if (!release) {
      fail("RELEASE.METADATA_MISSING", "Нет current release facts", doc.source);
    }
    if (JSON.stringify(release.course) !== JSON.stringify(course)) {
      fail("RELEASE.MIXED_COURSE", "Разные course/view/adapters", doc.source);
    }
    for (const item of release.declarations) {
      if (facts.has(item.id)) fail("CORE.DUPLICATE_EXERCISE", item.id);
      const declaration = doc.early.definitions[item.id];
      if (!declaration) {
        fail("CORE.METADATA_INVALID", "Нет декларации", doc.source, item.id);
      }
      const allowed = new Set([
        ...vocabulary.exerciseAttributes,
        ...vocabulary.pedagogyAttributes.filter((k) =>
          !["for", "requirement", "work-mode"].includes(k)
        ),
        "name",
        "when-profile",
        "unless-profile",
        "when-format",
        "unless-format",
        "when-meta",
        "unless-meta",
      ]);
      for (const key of Object.keys(item.attributes)) {
        if (
          !allowed.has(key) &&
          !course.adapters.some((name) => key.startsWith(name + "-"))
        ) {
          fail(
            "CORE.EXERCISE_INVALID",
            "Неизвестный атрибут упражнения: " + key,
            doc.source,
            item.id,
          );
        }
      }
      if (
        item.target &&
        (!item.head || item.head.level < 1 || item.head.level > 6 ||
          !item.head.title.trim())
      ) {
        fail(
          "CORE.EXERCISE_INVALID",
          "Упражнение с target требует непустой заголовок уровня 1–6",
          doc.source,
          item.id,
        );
      }
      facts.set(item.id, {
        source: doc.source,
        declaration,
        hasPublicSolution: doc.final.hasPublicSolution[item.id] === true,
      });
      if (
        item.target && item.target !== "manual" &&
        (!course.adapters.includes(item.target) ||
          !installed.includes(item.target))
      ) {
        fail(
          "CORE.UNKNOWN_TARGET",
          "Не установлен объявленный adapter " + item.target,
          doc.source,
          item.id,
        );
      }
      if (item.project) {
        if (bindings.has(item.id)) fail("CORE.PROJECT_CONFLICT", item.id);
        bindings.add(item.id);
        await checkPath(doc.source, item.project);
      }
    }
  }
  for (const doc of documents) {
    const release = doc.early.release!;
    const a = release.assessment;
    if (a) {
      if (assessments.has(a.id)) fail("CORE.DUPLICATE_ASSESSMENT", a.id);
      assessments.add(a.id);
      if (a.relatedExercise && !facts.has(a.relatedExercise)) {
        fail("CORE.RELATED_EXERCISE_MISSING", a.relatedExercise);
      }
      for (const slot of a.slots) {
        for (const member of slot.candidates) {
          const fact = facts.get(member);
          if (!fact) fail("CORE.UNKNOWN_MEMBER", member);
          const d = fact.declaration;
          if (
            (a.kind === "test" || a.kind === "practical") &&
            d["statement-visibility"] !== "restricted"
          ) {
            fail(
              "CORE.ASSESSMENT_INVALID",
              "test/practical требуют restricted",
              doc.source,
              member,
            );
          }
          if (
            slot.assignment.stage === "demonstration" &&
            (d["statement-visibility"] !== "open" ||
              d["course-role"] !== "demonstration" || !fact.hasPublicSolution)
          ) {
            fail(
              "CORE.ASSESSMENT_INVALID",
              "demonstration требует open, purpose и actual public solution",
              doc.source,
              member,
            );
          }
        }
      }
    }
    for (const name of course.adapters) {
      if (!installed.includes(name)) {
        fail("CORE.ADAPTER_INVALID", "Нет установленного adapter " + name);
      }
      const validator = byName.get(name);
      if (!validator) {
        fail(
          "RELEASE.ADAPTER_UNQUALIFIED",
          "Нет исполняемого owner validator " + name,
        );
      }
      await guard();
      const result = decode(
        NativeAdapterValidationResultSchema,
        await validator.validate(
          immutable(NativeAdapterValidationInputSchema.parse({
            origin: {
              ...identity,
              captureWitness: doc.early.context.captureWitness,
              source: doc.source,
              format: doc.early.context.format,
            },
            course,
            nativeMetadata: {
              readSet: validator.nativeMetadataReadSet,
              values: Object.fromEntries(
                validator.nativeMetadataReadSet.flatMap((slot) => {
                  const source =
                    slot === "configuration" || slot === "assessment"
                      ? release.nativeMetadata.adapters[name] ?? {}
                      : release.nativeMetadata;
                  return Object.hasOwn(source, slot)
                    ? [[slot, source[slot as keyof typeof source]]]
                    : [];
                }),
              ),
            },
            declarations: release.declarations.filter((d) => d.target === name)
              .map((d) => ({
                id: d.id,
                attributes: d.attributes,
                ...(d.answer ? { answer: d.answer } : {}),
              })),
            ...(a ? { assessment: a } : {}),
          })),
        ),
        "RELEASE.ADAPTER_UNQUALIFIED",
      );
      for (const input of result.sources) {
        await checkPath("", input.path, input.kind);
      }
      await guard();
    }
  }
  await guard();
  return immutable(NativeReleaseProofSchema.parse({
    schema: "course-native-release-proof-v1",
    ...identity,
    course,
    documents: documents.map((d) => ({
      source: d.source,
      format: d.early.context.format,
    })),
    exerciseIds: [...facts.keys()],
    assessmentIds: [...assessments],
    validatedAdapters: course.adapters,
  }));
}
