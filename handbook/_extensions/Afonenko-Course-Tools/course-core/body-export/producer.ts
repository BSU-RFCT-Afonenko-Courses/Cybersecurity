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
function assertSupported(value: any) {
  if (Array.isArray(value)) {
    value.forEach(assertSupported);
    return;
  }
  if (!value || typeof value !== "object") return;
  if (value.t && !supported.has(value.t)) {
    throw Error("BODY.CAPABILITY_UNSUPPORTED: " + value.t);
  }
  if (
    value.t &&
    classes(value).some((c: string) =>
      ["answer-spec", "correct", "grading-notes", "solution"].includes(c)
    )
  ) throw Error("BODY.UNPARTITIONED_PRIVATE_ROLE");
  Object.values(value).forEach(assertSupported);
}
export async function buildBodies(
  result: DocumentResult | ReleaseResult,
  options: {
    projectRoot: string;
    release?: string;
    sources?: string[];
    includeClosed?: boolean;
  },
): Promise<{ package: BodyPackage; publicPackage: PublicBodyPackage }> {
  const all = result.scope === "document" ? [result] : result.documents;
  const sources = options.sources ?? all.map((d) => d.source);
  if (
    !sources.length || new Set(sources).size !== sources.length ||
    sources.some((s) => !all.some((d) => d.source === s))
  ) throw Error("BODY.SELECTION_INVALID");
  const documents = sources.map((s) => all.find((d) => d.source === s)!);
  if (
    options.includeClosed && documents.some((d) => d.course.view !== "full")
  ) throw Error("BODY.FULL_FACTS_REQUIRED");
  const owner = documents[0].course.id;
  if (documents.some((d) => d.course.id !== owner)) {
    throw Error("BODY.MIXED_OWNER");
  }
  const pkg: BodyPackage = {
    schema: "course-body-package-v1",
    owner,
    release: options.release || "native",
    apiVersion: [],
    questions: [],
    works: [],
    resources: [],
  };
  for (const doc of documents) {
    if (doc.course.view === "full" && !doc.body) {
      throw Error("BODY.PUBLIC_FACTS_REQUIRED");
    }
    const publicExercises = doc.body?.publicExercises ?? doc.exercises;
    for (const e of publicExercises) {
      if (e.target !== "manual") {
        throw Error("BODY.TARGET_UNSUPPORTED: " + e.target);
      }
      const current = doc.exercises.find((x) => x.id === e.id);
      if (!current) throw Error("BODY.EXERCISE_MISSING");
      const publicBody = JSON.parse(e.bodyJson),
        fullBody = JSON.parse(current.bodyJson);
      if (
        pkg.apiVersion.length &&
        JSON.stringify(pkg.apiVersion) !==
          JSON.stringify(publicBody["pandoc-api-version"])
      ) throw Error("BODY.API_MISMATCH");
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
            c: "Response: ________________________________________",
          }],
        }],
        closedKey: null,
      };
      if (banks.length > 1) throw Error("BODY.MULTIPLE_ANSWERS");
      if (banks.length && doc.course.view === "full") {
        answer = banks[0].t === "CodeBlock"
          ? await validateAnswer(banks[0].c[1])
          : await projectChoice(banks[0]);
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
      assertSupported(q.condition);
      assertSupported(q.publicAnswer);
      pkg.questions.push(q);
    }
    const work = doc.body?.publicAssessment ??
      (doc.course.view === "full" ? null : doc.assessment);
    if (work) {
      pkg.works.push({
        owner,
        id: work.id,
        key: owner + "/" + work.id,
        source: doc.source,
        kind: work.kind,
        title: work.title,
        items: work.items.map((id) => owner + "/" + id),
      });
    }
  }
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
          if (!fact) throw Error("BODY.RESOURCE_CONTEXT_REQUIRED");
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
  const file = await Deno.makeTempFile({ suffix: ".json" });
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
