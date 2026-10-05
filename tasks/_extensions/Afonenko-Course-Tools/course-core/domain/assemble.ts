import type { Adapter, Assessment, Body, Course, Exercise, Extracted, Fragment, Json } from "./model.ts";
function withBody<T>(item: Extracted<T>): Omit<Extracted<T>, "bodyJson" | "gradingNotesJson"> & { body: Body; gradingNotes?: Body[] } {
  const { bodyJson, gradingNotesJson, ...rest } = item;
  return { ...rest, body: JSON.parse(bodyJson), ...(gradingNotesJson?.length ? { gradingNotes: gradingNotesJson.map(value => JSON.parse(value)) } : {}) };
}
/** Объединение независимых фактов AST без правил файловой системы и платформ. */
export function assemble(selected: string[], fragments: Map<string, Fragment>, adapters: Adapter[]): Course {
  if (!selected.length) throw new Error("В курсе не выбраны документы для сборки");
  const result: Course = { course: { id: "" }, registeredTargets: ["manual", ...adapters.map(a => a.contract.name)], exercises: [], assessments: [] };
  for (const source of selected) {
    const part = fragments.get(source);
    if (!part) throw new Error(`Выполните сборку всех выбранных документов с course-core; отсутствует ${source}`);
    if ("schema" in part.course) throw new Error(`Поле course.schema не поддерживается; пересоберите документы текущим расширением (${source})`);
    if (result.course.id && result.course.id !== part.course.id) throw new Error(`Несогласованный идентификатор курса в ${source}`);
    if (result.course.id && result.course.view !== part.course.view) throw new Error(`Несогласованное представление курса в ${source}`);
    result.course = { id: part.course.id, ...(part.course.view ? { view: part.course.view } : {}) };
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
        if (matches.length > 1) throw new Error(`Повторный фрагмент адаптера: ${exercise.id}`);
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
