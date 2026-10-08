import { diagnostic, type DiagnosticContext } from "../domain/diagnostics.ts";
import { relative, resolve } from "stdlib/path";
import type { DocumentResult, ReleaseResult } from "../domain/model.ts";
import type {
  BodyPackage,
  BodyQuestion,
  Node,
  PublicBodyPackage,
} from "./model.ts";
import { projectChoice, validateAnswer } from "./answer.ts";
import { evaluateResources } from "../infrastructure/resources.ts";
import { command } from "../infrastructure/process.ts";
export type { BodyPackage, PublicBodyPackage } from "./model.ts";
const attr = (n: Node) =>
  n.t === "Header"
    ? n.c[1]
    : ["Div", "Span", "CodeBlock", "Code", "Link", "Image"].includes(n.t)
    ? n.c[0]
    : undefined;
const classes = (n: Node) => attr(n)?.[1] || [];
const solution = (n: Node) =>
  n.t === "Div" &&
  (classes(n).includes("solution") || attr(n)?.[0]?.startsWith("sol-"));
const omitted = Symbol("omitted");
function partition(value: any, banks: Node[], solutions: Node[]): any {
  if (Array.isArray(value)) {
    return value.map((v) => partition(v, banks, solutions)).filter((v) =>
      v !== omitted
    );
  }
  if (!value || typeof value !== "object") return value;
  if (
    value.t === "CodeBlock" && classes(value).includes("answer-spec") ||
    value.t === "Div" && classes(value).includes("answer")
  ) {
    banks.push(value);
    return omitted;
  }
  if (solution(value)) {
    solutions.push(...value.c[1]);
    return omitted;
  }
  if (value.t === "Div" && classes(value).includes("grading-notes")) {
    return omitted;
  }
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, partition(v, banks, solutions)]),
  );
}
const supported = new Set(
  "Str Space SoftBreak LineBreak Emph Strong Underline Strikeout Superscript Subscript SmallCaps Quoted Code Math Link Image Span Para Plain BlockQuote OrderedList BulletList DefinitionList HorizontalRule Table Figure Header Div CodeBlock AlignLeft AlignRight AlignCenter AlignDefault ColWidth ColWidthDefault Decimal DefaultStyle DefaultDelim Period OneParen TwoParens InlineMath DisplayMath SingleQuote DoubleQuote"
    .split(" "),
);
function assertSupported(value: any, context: DiagnosticContext) {
  if (Array.isArray(value)) {
    value.forEach(v => assertSupported(v, context));
    return;
  }
  if (!value || typeof value !== "object") return;
  const reference = attr(value)?.[2]?.find((pair: string[]) => pair[0] === "data-qrc-ref")?.[1];
  if (reference) throw diagnostic("BODY.QRC_REFERENCE_UNRESOLVED", reference + "; Ссылка QRC не разрешена", context);
  if (value.t && !supported.has(value.t)) {
    throw diagnostic("BODY.CAPABILITY_UNSUPPORTED", "Body не поддерживает этот тип узла: " + value.t, context);
  }
  if (
    value.t &&
    classes(value).some((c: string) =>
      ["answer-spec", "correct", "grading-notes", "solution"].includes(c)
    )
  ) throw diagnostic("BODY.UNPARTITIONED_PRIVATE_ROLE", "Закрытый блок остался в публичном теле", context);
  Object.values(value).forEach(v => assertSupported(v, context));
}
export async function buildBodies(
  result: DocumentResult | ReleaseResult,
  options: {
    projectRoot: string;
    release?: string;
    sources?: string[];
    includeClosed?: boolean;
    courseId?: string;
    work?: string;
  },
): Promise<{ package: BodyPackage; publicPackage: PublicBodyPackage }> {
  const all = result.scope === "document" ? [result] : result.documents;
  const sources = options.sources ?? all.map((d) => d.source);
  if (
    !sources.length || new Set(sources).size !== sources.length ||
    sources.some((s) => !all.some((d) => d.source === s))
  ) throw diagnostic("BODY.SELECTION_INVALID", "Выберите непустой уникальный набор текущих документов", {source: options.projectRoot, id: options.work});
  const documents = sources.map((s) => all.find((d) => d.source === s)!);
  if (options.includeClosed && documents.some((d) => d.course.view !== "full")) {
    throw diagnostic("BODY.FULL_FACTS_REQUIRED", "Для закрытого пакета требуются факты full", {source: options.projectRoot, id: options.work});
  }
  const owner = options.courseId ?? documents[0].course.id;
  if (!owner || !/^[a-z][a-z0-9-]*$/.test(owner)) throw diagnostic("BODY.COURSE_ID_REQUIRED", "Требуется корректный идентификатор курса", {source: options.projectRoot, id: options.work});
  const bank = new Map<string, {doc: DocumentResult; exercise: DocumentResult["exercises"][number]}>();
  const works = new Map<string, NonNullable<DocumentResult["assessment"]> & {source: string}>();
  for (const doc of documents) {
    for (const exercise of doc.exercises) {
      if (bank.has(exercise.id)) throw diagnostic("BODY.DUPLICATE_EXERCISE", "Повторный идентификатор вопроса: " + exercise.id, {source: doc.source, id: exercise.id, field: "id", related: [{source: bank.get(exercise.id)!.doc.source, id: exercise.id}]});
      bank.set(exercise.id, {doc, exercise});
    }
    if (doc.assessment) {
      if (works.has(doc.assessment.id)) throw diagnostic("BODY.DUPLICATE_WORK", "Повторный идентификатор работы: " + doc.assessment.id, {source: doc.source, id: doc.assessment.id, field: "id", related: [{source: works.get(doc.assessment.id)!.source, id: doc.assessment.id}]});
      works.set(doc.assessment.id, {...doc.assessment, source: doc.source});
    }
  }
  const selectedId = options.work?.replace(owner + "/", "") ?? (works.size === 1 ? [...works.keys()][0] : undefined);
  if (!selectedId) throw diagnostic("BODY.WORK_REQUIRED", "Явно выберите работу", {source: options.projectRoot, id: options.work});
  const work = works.get(selectedId);
  if (!work) throw diagnostic("BODY.WORK_MISSING", "Выбранная работа отсутствует: " + selectedId, {source: options.projectRoot, id: options.work});
  if (new Set(work.items).size !== work.items.length) throw diagnostic("BODY.DUPLICATE_MEMBER", "Участник работы указан повторно", {source: work.source, id: work.id, field: "items"});
  for (const id of work.items) if (!bank.has(id)) throw diagnostic("BODY.EXERCISE_MISSING", "Участник работы отсутствует в банке: " + id, {source: work.source, id: work.id, field: "items", related: [{id}]});
  const pkg: BodyPackage = {
    schema: "course-body-package-v1",
    owner,
    release: options.release || "native",
    apiVersion: [],
    questions: [],
    works: [],
    resources: [],
  };
  for (const id of work.items) {
      const {doc, exercise: current} = bank.get(id)!;
      // Export conditions come from the selected complete source, independently
      // of whether the page/question participates in a public HTML projection.
      const e = current;
      const projected = doc.body?.publicExercises.find(item => item.id === e.id);
      if (doc.body && !projected) throw diagnostic("BODY.PUBLIC_FACTS_REQUIRED", "Отсутствует публичная проекция вопроса: " + e.id, {source: doc.source, id: e.id, field: "body"});
      const publicBody = JSON.parse(projected?.bodyJson ?? e.bodyJson),
        fullBody = JSON.parse(current.bodyJson);
      if (
        pkg.apiVersion.length &&
        JSON.stringify(pkg.apiVersion) !==
          JSON.stringify(publicBody["pandoc-api-version"])
      ) throw diagnostic("BODY.API_MISMATCH", "Версии Pandoc API выбранных тел не совпадают", {source: doc.source, id: e.id, field: "body"});
      pkg.apiVersion = publicBody["pandoc-api-version"];
      const banks: Node[] = [], nested: Node[] = [];
      partition(fullBody.blocks, banks, nested);
      const condition = partition(publicBody.blocks, [], []);
      let answer: any = {
        answerType: "manual",
        publicAnswer: [{
          t: "Para",
          c: [{
            t: "Str",
            c: "Ответ: ________________________________________",
          }],
        }],
        closedKey: null,
      };
      if (banks.length > 1) throw diagnostic("BODY.MULTIPLE_ANSWERS", "У вопроса более одного банка ответов", {source: doc.source, id: e.id, field: "body"});
      const normalized = doc.body?.fullAnswers?.[e.id];
      if (normalized) {
        answer={answerType:normalized.answerType,publicAnswer:JSON.parse(normalized.publicAnswerJson).blocks,closedKey:normalized.closedKey};
      } else if (banks.length && doc.course.view === "full") {
        answer = banks[0].t === "CodeBlock"
          ? await validateAnswer(banks[0].c[1], {source: doc.source, id: e.id})
          : await projectChoice(banks[0], {source: doc.source, id: e.id});
      }
      const publicAnswer = doc.body?.publicAnswers?.[e.id];
      if (publicAnswer) {
        answer = {
          ...answer,
          answerType: publicAnswer.answerType,
          publicAnswer: JSON.parse(publicAnswer.publicAnswerJson).blocks,
        };
      }
      // Student facts carry no banks/keys. Their already projected answer remains condition content.
      const q: BodyQuestion = {
        owner,
        id: e.id,
        key: owner + "/" + e.id,
        source: doc.source,
        visibility: "public",
        statementVisibility: e.statementVisibility, purpose:e.purpose, hasPublicSolution:e.hasPublicSolution,
        condition,
        ...answer,
        closedKey: options.includeClosed ? answer.closedKey : null,
        solution: [],
        gradingNotes: [],
      };
      if (options.includeClosed) {
        q.solution = nested;
        const nestedText = JSON.stringify(nested);
        for (const p of doc.pedagogy?.elements ?? []) {
          if (p.kind === "solution" && p.exercise === e.id) {
            const blocks = JSON.parse(p.bodyJson).blocks;
            if (
              !blocks.every((b: Node) => nestedText.includes(JSON.stringify(b)))
            ) q.solution.push(...blocks);
          }
        }
        q.gradingNotes = (current.gradingNotesJson ?? []).flatMap((s) =>
          JSON.parse(s).blocks
        );
      }
      assertSupported(q.condition, {source: doc.source, id: e.id, field: "condition"});
      assertSupported(q.publicAnswer, {source: doc.source, id: e.id, field: "publicAnswer"});
      pkg.questions.push(q);
  }
  pkg.works.push({
    owner, id: work.id, key: owner + "/" + work.id, source: work.source,
    kind: work.kind, title: work.title, items: work.items.map((id) => owner + "/" + id),
    assignments:Object.fromEntries(work.items.map(id=>[owner+"/"+id,work.assignments[id]])),
    ...(work.theoryTime!==undefined ? {theoryTime:work.theoryTime} : {}),
  });
  const facts = documents.flatMap((d) => d.resources ? [d.resources] : []);
  const selected: string[] = [];
  const scan = (v: any, source: string, targets?: Map<string, string>) => {
    if (Array.isArray(v)) v.forEach((x) => scan(x, source, targets));
    else if (v && typeof v === "object") {
      if (["Image", "Link"].includes(v.t)) {
        const u = v.c[2][0];
        if (
          !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(u) &&
          !/\.(?:qmd|html)(?:[#?]|$)/i.test(u)
        ) {
          const fact = facts.find((f) => f.source === source);
          if (!fact) throw diagnostic("BODY.RESOURCE_CONTEXT_REQUIRED", "Не найден контекст ресурса выбранного вопроса", {source, field: "resource"});
          const localPath = decodeURIComponent(u.split(/[?#]/)[0]);
          const absolute = localPath.startsWith("/")
            ? resolve(options.projectRoot, localPath.slice(1))
            : resolve(fact.effectiveBase, localPath);
          if (targets) {
            const target = targets.get(absolute);
            if (target) v.c[2][0] = target + u.slice(u.split(/[?#]/)[0].length);
          } else selected.push(relative(options.projectRoot, absolute));
        }
      }
      Object.values(v).forEach((x) => scan(x, source, targets));
    }
  };
  for (const q of pkg.questions) {
    scan(q.condition, q.source);
    scan(q.publicAnswer, q.source);
  }
  const resources = await evaluateResources({
    facts,
    selected,
    projectRoot: options.projectRoot,
  });
  const targets = new Map(
    resources.files.map(
      (resource) => [
        resolve(options.projectRoot, resource.target),
        resource.target,
      ],
    ),
  );
  for (const q of pkg.questions) {
    scan(q.condition, q.source, targets);
    scan(q.publicAnswer, q.source, targets);
    scan(q.solution, q.source, targets);
    scan(q.gradingNotes, q.source, targets);
  }
  for (const resource of resources.files) {
    const bytes = await Deno.readFile(resource.path);
    const hash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    ).map((b) => b.toString(16).padStart(2, "0")).join("");
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    pkg.resources.push({
      owner,
      source: resource.source,
      effectiveBase: resource.effectiveBase,
      target: resource.target,
      sha256: hash,
      data: btoa(binary),
      visibility: "public",
    });
  }
  const file = await Deno.makeTempFile({ dir:options.projectRoot, prefix:".course-body-validation-",suffix: ".json" });
  try {
    await Deno.writeTextFile(file, JSON.stringify({ packageData: pkg }));
    await command(Deno.env.get("CUE") || "cue", [
      "vet",
      new URL("./package.cue", import.meta.url).pathname,
      file,
      "-c",
    ], options.projectRoot);
  } finally {
    await Deno.remove(file);
  }
  const publicPackage: PublicBodyPackage = {
    ...pkg,
    questions: pkg.questions.map((
      { closedKey, solution, gradingNotes, ...q },
    ) => q),
  };
  return { package: pkg, publicPackage };
}
