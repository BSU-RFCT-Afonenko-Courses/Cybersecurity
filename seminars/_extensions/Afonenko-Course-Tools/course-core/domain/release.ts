import { diagnostic, type DiagnosticContext } from "./diagnostics.ts";
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
  const fail = (code: string, detail: string, context: DiagnosticContext = {}): never => {
    throw diagnostic(code, detail, context);
  };
  if (
    !expectedSources.length || expectedSources.some((source) => !source) ||
    new Set(expectedSources).size !== expectedSources.length
  ) {
    fail(
      "RELEASE.EXPECTED_SOURCES_INVALID",
      "Требуется непустой уникальный список входных документов",
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
      fail("RELEASE.DOCUMENT_INVALID", "Некорректный результат документа", {source: result.source, field: "document"});
    }
    if (!expected.has(result.source)) {
      fail("RELEASE.UNEXPECTED_DOCUMENT", "Документ не входит в выбранную сборку", {source: result.source, field: "document"});
    }
    if (fragments.has(result.source)) {
      fail("RELEASE.DUPLICATE_DOCUMENT", "Документ извлечён повторно", {source: result.source, field: "document"});
    }
    fragments.set(result.source, result);
  }
  for (const source of expectedSources) {
    if (!fragments.has(source)) fail("RELEASE.MISSING_DOCUMENT", "Не найден текущий результат выбранного документа", {source: source, field: "document"});
  }
  const ordered = expectedSources.map((source) => fragments.get(source)!);
  const first = ordered[0];
  for (const result of ordered) {
    if (result.course.id !== first.course.id) {
      fail("RELEASE.MIXED_COURSE", "Документы относятся к разным курсам", {source: result.source, field: "document"});
    }
    if (result.course.view !== first.course.view) {
      fail("RELEASE.MIXED_VIEW", "Документы используют разные представления курса", {source: result.source, field: "document"});
    }
    if (
      JSON.stringify(result.document.profiles) !==
        JSON.stringify(first.document.profiles)
    ) fail("RELEASE.MIXED_PROFILES", "Документы используют разные функциональные профили", {source: result.source, field: "document"});
  }
  if (
    first.course.view !== expectation.view ||
    JSON.stringify(first.document.profiles) !==
      JSON.stringify(expectation.profiles) ||
    expectation.format && first.document.format !== expectation.format
  ) fail("RELEASE.EXPECTATION_MISMATCH", "Сборка не соответствует выбранному представлению и профилям", {source: first.source, field: "document"});
  const model = assemble(expectedSources, fragments, adapters);
  const exercises = new Map<string, string>(), assessments = new Map<string, string>();
  for (const exercise of model.exercises) {
    if (exercises.has(exercise.id)) {
      fail("CORE.DUPLICATE_EXERCISE", "Повторный идентификатор упражнения", {source: exercise.source, id: exercise.id, field: "id", related: [{source: exercises.get(exercise.id), id: exercise.id}], hint: "Назначьте уникальный ID"});
    }
    exercises.set(exercise.id, exercise.source);
    if (exercise.target && !model.registeredTargets.includes(exercise.target)) {
      fail("CORE.UNKNOWN_TARGET", "Не установлен выбранный адаптер", {source: exercise.source, id: exercise.id, field: "target", related: [{id: exercise.target}]});
    }
  }
  for (const assessment of model.assessments) {
    if (assessments.has(assessment.id)) {
      fail("CORE.DUPLICATE_ASSESSMENT", "Повторный идентификатор работы", {source: assessment.source, id: assessment.id, field: "id", related: [{source: assessments.get(assessment.id), id: assessment.id}], hint: "Назначьте уникальный ID"});
    }
    assessments.set(assessment.id, assessment.source);
    for (const member of assessment.items) {
      if (!exercises.has(member)) {
        fail("CORE.UNKNOWN_MEMBER", "Участник работы отсутствует в текущем курсе", {source: assessment.source, id: assessment.id, field: "items", related: [{id: member}], hint: "Проверьте ID и состав текущей сборки"});
      }
    }
  }
  return { scope: "release", documents: ordered, model };
}
