import { diagnostic } from "./diagnostics.ts";
import type { Adapter, Assessment, Body, Course, Exercise, Extracted, Fragment, Json } from "./model.ts";
function withBody<T>(item: Extracted<T>): Omit<Extracted<T>, "bodyJson" | "gradingNotesJson"> & { body: Body; gradingNotes?: Body[] } {
  const { bodyJson, gradingNotesJson, ...rest } = item;
  return { ...rest, body: JSON.parse(bodyJson), ...(gradingNotesJson?.length ? { gradingNotes: gradingNotesJson.map(value => JSON.parse(value)) } : {}) };
}
/** Объединение независимых фактов AST без правил файловой системы и платформ. */
export function assemble(selected: string[], fragments: Map<string, Fragment>, adapters: Adapter[]): Course {
  if (!selected.length) throw diagnostic("RELEASE.EXPECTED_SOURCES_INVALID", "В курсе не выбраны документы для сборки", {field: "sources"});
  const result: Course = { course: {}, registeredTargets: ["manual", ...adapters.map(a => a.contract.name)], exercises: [], assessments: [] };
  if(selected.some(source=>fragments.get(source)?.declarations)) result.declarations=[];
  if(selected.some(source=>fragments.get(source)?.rawAssessment)) result.assessmentCompositions=[];
  for (const source of selected) {
    const part = fragments.get(source);
    if (!part) throw diagnostic("RELEASE.MISSING_DOCUMENT", `Выполните сборку всех выбранных документов с course-core; отсутствует ${source}`, {source, field: "document"});
    if ("schema" in part.course) throw diagnostic("CORE.SCHEMA_INVALID", `Поле course.schema не поддерживается; пересоберите документы текущим расширением (${source})`, {source, field: "course.schema"});
    if (result.course.id && result.course.id !== part.course.id) throw diagnostic("RELEASE.MIXED_COURSE", `Несогласованный идентификатор курса в ${source}`, {source, field: "course.id"});
    if (result.course.id && result.course.view !== part.course.view) throw diagnostic("RELEASE.MIXED_VIEW", `Несогласованное представление курса в ${source}`, {source, field: "course.view"});
    result.course = { id: part.course.id, ...(part.course.view ? { view: part.course.view } : {}) };
    if(part.projects){result.projects??=[];result.projects.push(...part.projects);}
    if(part.topic){result.topics??=[];result.topics.push(part.topic);}
    if (part.declarations) {
      result.declarations ??= [];
      result.declarations.push(...part.declarations);
    } else if (result.declarations) {
      result.declarations.push(...part.exercises.map(e=>({id:e.id,source,difficulty:e.difficulty,time:e.time,statementVisibility:e.statementVisibility,purpose:e.purpose,hasSolution:e.hasSolution,hasPublicSolution:e.hasPublicSolution})));
    }
    if (part.rawAssessment) {
      result.assessmentCompositions ??= [];
      result.assessmentCompositions.push({...part.rawAssessment,source});
    } else if (part.assessment && result.assessmentCompositions) {
      const {bodyJson,gradingNotesJson,...composition}=part.assessment;
      result.assessmentCompositions.push({...composition,source});
    }
    if (part.pedagogy) {
      result.pedagogy ??= { elements: [], documents: [] };
      for (const { bodyJson, ...element } of part.pedagogy.elements) {
        result.pedagogy.elements.push({ ...element, source, body: JSON.parse(bodyJson) });
      }
      if (part.pedagogy.defaults) {
        result.pedagogy.documents!.push({ source, defaults: part.pedagogy.defaults });
      }
    }
    for (const exercise of part.exercises) {
      const extensions: Record<string, Json> = {};
      for (const adapter of adapters) {
        const matches = (adapter.fragments.get(source)?.exercises ?? []).filter(e => e.id === exercise.id);
        if (matches.length > 1) throw diagnostic("ADAPTER", `Повторный фрагмент адаптера: ${exercise.id}`, {source, id: exercise.id, field: adapter.contract.name});
        if (matches.length) extensions[adapter.contract.name] = matches[0].payload;
      }
      result.exercises.push({ ...withBody<Exercise>(exercise), source, extensions });
    }
    if (part.assessment) {
      const extensions: Record<string, Json> = {};
      for (const adapter of adapters) {
        const value = adapter.fragments.get(source)?.assessment;
        if (value != null) extensions[adapter.contract.name] = value;
      }
      result.assessments.push({ ...withBody<Assessment>(part.assessment), source, extensions });
    }
  }
  return result;
}
