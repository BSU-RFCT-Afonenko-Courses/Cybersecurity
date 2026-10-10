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
  const declarations=model.declarations ?? model.exercises;
  const facts=new Map<string,typeof declarations[number]>();
  for(const exercise of declarations){
    if(facts.has(exercise.id))fail("CORE.DUPLICATE_EXERCISE","Повторный идентификатор упражнения",{source:exercise.source,id:exercise.id,field:"id",related:[{source:facts.get(exercise.id)!.source,id:exercise.id}]});
    if(!["introductory","intermediate","advanced"].includes(exercise.difficulty) || !Number.isInteger(exercise.time) || !Number.isFinite(exercise.time) || exercise.time<=0 || !["open","restricted"].includes(exercise.statementVisibility) || typeof exercise.hasSolution!=="boolean" || typeof exercise.hasPublicSolution!=="boolean") {
      fail("CORE.METADATA_INVALID","Декларация требует собственные difficulty/time и явную политику условия",{source:exercise.source,id:exercise.id,field:"declarations"});
    }
    facts.set(exercise.id,exercise);
  }
  for (const assessment of model.assessmentCompositions ?? model.assessments) {
    if (assessments.has(assessment.id)) {
      fail("CORE.DUPLICATE_ASSESSMENT", "Повторный идентификатор работы", {source: assessment.source, id: assessment.id, field: "id", related: [{source: assessments.get(assessment.id), id: assessment.id}], hint: "Назначьте уникальный ID"});
    }
    assessments.set(assessment.id, assessment.source);
    if(!["lab","seminar","practical","test"].includes(assessment.kind) || assessment.theoryTime!==undefined && (!Number.isFinite(assessment.theoryTime)||assessment.theoryTime<=0) || new Set(assessment.items).size!==assessment.items.length) {
      fail("CORE.ASSESSMENT_INVALID","Некорректный вид, время или состав работы",{source:assessment.source,id:assessment.id,field:"assessment"});
    }
    if(assessment.relatedExercise!==undefined && !facts.has(assessment.relatedExercise)) fail("CORE.RELATED_EXERCISE_MISSING","Связанное упражнение отсутствует в текущих декларациях",{source:assessment.source,id:assessment.id,field:"related-exercise",related:[{id:assessment.relatedExercise}]});
    for (const member of assessment.items) {
      if (!facts.has(member)) {
        fail("CORE.UNKNOWN_MEMBER", "Участник работы отсутствует в текущем курсе", {source: assessment.source, id: assessment.id, field: "items", related: [{id: member}], hint: "Проверьте ID и состав текущей сборки"});
      }
      const fact=facts.get(member)!,assignment=assessment.assignments?.[member];
      if(!assignment || !["required","optional"].includes(assignment.requirement) || !["individual","pair","group"].includes(assignment.workMode) || assignment.stage!==undefined && !["demonstration","classroom","homework"].includes(assignment.stage)) {
        fail("CORE.ASSESSMENT_INVALID","Некорректные поля назначения",{source:assessment.source,id:assessment.id,field:"assignments",related:[{id:member}]});
      }
      if((assessment.kind==="test" || assessment.kind==="practical") && fact.statementVisibility!=="restricted") {
        fail("CORE.ASSESSMENT_INVALID","test и practical назначают только restricted условия",{source:assessment.source,id:assessment.id,field:"statementVisibility",related:[{source:fact.source,id:member}]});
      }
      if(assignment.stage==="demonstration" && (fact.statementVisibility!=="open" || fact.purpose!=="demonstration" || !fact.hasPublicSolution)) {
        fail("CORE.ASSESSMENT_INVALID","Stage demonstration требует open условия, роли demonstration и фактического решения",{source:assessment.source,id:assessment.id,field:"stage",related:[{source:fact.source,id:member}]});
      }
    }
  }
  for(const assessment of model.assessmentCompositions??model.assessments){
    if(Object.keys(assessment.assignments??{}).some(id=>!assessment.items.includes(id)))fail("CORE.ASSESSMENT_INVALID","Карта назначений содержит посторонний ID",{source:assessment.source,id:assessment.id,field:"assignments"});
  }
  const projectIds=new Map<string,string>();
  for(const fact of model.projects??[]){
    if(projectIds.has(fact.exerciseId))fail("CORE.PROJECT_CONFLICT","Повторная декларация project/check",{source:fact.source,id:fact.exerciseId,field:"projects"});
    projectIds.set(fact.exerciseId,fact.source);
  }
  return { scope: "release", documents: ordered, model };
}
