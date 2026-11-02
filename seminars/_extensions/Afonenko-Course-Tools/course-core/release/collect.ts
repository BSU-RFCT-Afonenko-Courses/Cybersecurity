import type { AnswerFacts } from "../document/answer-contracts.ts";
import { fail } from "../contracts/project.ts";
import { decode } from "../document/contracts.ts";
import type {
  DocumentContext,
  ExerciseDeclaration,
} from "../document/contracts.ts";
import { NativeReleaseFactsSchema } from "./contracts.ts";
import type { NativeReleaseFacts } from "./contracts.ts";
type Node = { t?: string; c?: unknown };
const obj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
function text(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(text).join("");
  if (obj(v)) {
    if (v.t === "Str") return String(v.c);
    if (v.t === "Space" || v.t === "SoftBreak") return " ";
    return text(v.c);
  }
  return "";
}
export function nativeMetadata(v: unknown): unknown {
  if (!obj(v)) return v;
  switch (v.t) {
    case "MetaMap":
      return Object.fromEntries(
        Object.entries(v.c as Record<string, unknown>).map((
          [k, x],
        ) => [k, nativeMetadata(x)]),
      );
    case "MetaList":
      return (v.c as unknown[]).map(nativeMetadata);
    case "MetaBool":
    case "MetaString":
      return v.c;
    case "MetaInlines":
    case "MetaBlocks":
      return text(v.c);
    default:
      return v;
  }
}
/** Только native Meta-формы: неизвестный узел не превращается в произвольный JSON. */
function adapterMetadata(v: unknown): unknown {
  if (!obj(v)) fail("CORE.ADAPTER_METADATA", "Требуется native metadata node");
  if (v.t === "MetaMap" && obj(v.c)) {
    return Object.fromEntries(
      Object.entries(v.c).map(([k, value]) => [k, adapterMetadata(value)]),
    );
  }
  if (v.t === "MetaList" && Array.isArray(v.c)) return v.c.map(adapterMetadata);
  if (
    v.t === "MetaBool" && typeof v.c === "boolean" ||
    v.t === "MetaString" && typeof v.c === "string"
  ) return v.c;
  if ((v.t === "MetaInlines" || v.t === "MetaBlocks") && Array.isArray(v.c)) {
    return text(v.c);
  }
  fail("CORE.ADAPTER_METADATA", "Неподдержанная native metadata форма");
}
const attrs = (v: Record<string, unknown>) => {
  const c = v.c as unknown[];
  const a = c[0] as [string, string[], [string, string][]];
  return { id: a[0], classes: a[1], values: Object.fromEntries(a[2]) };
};
function visit(v: unknown, use: (node: Record<string, unknown>) => void) {
  if (Array.isArray(v)) { for (const x of v) visit(x, use); }
  else if (obj(v)) {
    use(v);
    for (const child of Object.values(v)) visit(child, use);
  }
}
export function collectReleaseFacts(
  ast: { meta: Record<string, unknown>; blocks: unknown[] },
  context: DocumentContext,
  definitions: Record<string, ExerciseDeclaration>,
  answers: Record<string, AnswerFacts> = {},
) {
  const course = nativeMetadata(ast.meta.course) ?? {};
  if (!obj(course)) fail("CORE.COURSE_INVALID", "course требует карту");
  if (course.schema !== undefined) {
    fail("CORE.SCHEMA_INVALID", "Поле course.schema не поддерживается");
  }
  if (
    course["assessment-time"] !== undefined &&
    typeof course["assessment-time"] !== "boolean"
  ) {
    fail("CORE.COURSE_INVALID", "course.assessment-time требует boolean");
  }
  const config = nativeMetadata(ast.meta.assessment);
  const containers: Record<string, unknown>[] = [];
  const declarations = new Map<
    string,
    NativeReleaseFacts["declarations"][number]
  >();
  visit(ast.blocks, (node) => {
    if (node.t !== "Div") return;
    const a = attrs(node);
    if (a.classes.includes("task-items")) containers.push(node);
    if (Object.hasOwn(definitions, a.id)) {
      const previous = declarations.get(a.id);
      const next = {
        id: a.id,
        hasSolution: false,
        ...(answers[a.id] ? { answer: answers[a.id] } : {}),
        ...(() => {
          const first = ((node.c as unknown[])[1] as Node[])[0];
          return first?.t === "Header"
            ? {
              head: {
                level: (first.c as unknown[])[0] as number,
                title: text((first.c as unknown[])[2]).trim(),
              },
            }
            : {};
        })(),
        ...(definitions[a.id].target
          ? { target: definitions[a.id].target }
          : {}),
        ...(definitions[a.id].project
          ? { project: definitions[a.id].project }
          : {}),
        ...(definitions[a.id]["project-check"]
          ? { check: definitions[a.id]["project-check"] }
          : {}),
        // Core владеет effective defaults; adapter получает их без второго resolver.
        // Остальные authored/native attrs сохраняются, включая adapter-prefixed поля.
        attributes: {
          ...a.values,
          ...Object.fromEntries(
            Object.entries(definitions[a.id]).filter(([, value]) =>
              value !== undefined
            ).map(([key, value]) => [key, String(value)]),
          ),
        },
      };
      if (
        previous &&
        JSON.stringify(previous.attributes) !== JSON.stringify(next.attributes)
      ) fail("CORE.DUPLICATE_EXERCISE", "Разные декларации одного упражнения");
      declarations.set(a.id, next);
    }
  });
  function solution(v: unknown, parent?: string) {
    if (Array.isArray(v)) {
      for (const x of v) solution(x, parent);
      return;
    }
    if (!obj(v)) return;
    let next = parent;
    if (v.t === "Div") {
      const a = attrs(v);
      if (declarations.has(a.id)) next = a.id;
      if (a.classes.includes("solution") || a.id.startsWith("sol-")) {
        const id = a.id.startsWith("sol-") ? "exr-" + a.id.slice(4) : parent;
        if (id && declarations.has(id)) {
          declarations.get(id)!.hasSolution = true;
        }
      }
    }
    for (const child of Object.values(v)) solution(child, next);
  }
  solution(ast.blocks);
  let assessment: unknown;
  if (config !== undefined || containers.length) {
    if (!obj(config)) {
      fail("CORE.ASSESSMENT_INVALID", "Требуется assessment.kind");
    }
    if (
      config["theory-time"] !== undefined &&
      !["string", "number"].includes(typeof config["theory-time"])
    ) {
      fail(
        "CORE.ASSESSMENT_INVALID",
        "theory-time требует положительное число минут",
      );
    }
    let title = text(ast.meta.title);
    let id = typeof config.id === "string" ? config.id : "";
    visit(ast.blocks, (n) => {
      if (n.t === "Header") {
        const c = n.c as unknown[];
        if (!title) title = text(c[2]);
        if (!id) id = (c[1] as [string])[0];
      }
    });
    const slots: unknown[] = [],
      memberKinds: string[] = [],
      memberSizes: number[] = [];
    for (const container of containers) {
      const a = attrs(container),
        body = (container.c as unknown[])[1] as Node[];
      if (
        body.length !== 1 ||
        !["BulletList", "OrderedList"].includes(body[0].t ?? "")
      ) fail("CORE.ASSESSMENT_INVALID", "task-items требует один список");
      for (const k of Object.keys(a.values)) {
        if (
          ![
            "stage",
            "requirement",
            "work-mode",
            "when-format",
            "unless-format",
            "when-profile",
            "unless-profile",
            "when-meta",
            "unless-meta",
          ].includes(k)
        ) {
          fail(
            "CORE.ASSESSMENT_INVALID",
            "Неизвестный task-items атрибут " + k,
          );
        }
      }
      memberKinds.push(body[0].t!);
      const items = body[0].t === "OrderedList"
        ? (body[0].c as unknown[])[1] as unknown[]
        : body[0].c as unknown[];
      for (const item of items) {
        if (
          !Array.isArray(item) || item.length !== 1 ||
          !["Plain", "Para"].includes((item[0] as Node).t ?? "")
        ) fail("CORE.ASSESSMENT_INVALID", "Позиция требует один абзац");
        let group: ReturnType<typeof attrs> | undefined,
          groupNode: Record<string, unknown> | undefined;
        const candidates: string[] = [];
        let requirement: string | undefined, workMode: string | undefined;
        visit(item, (node) => {
          if (node.t === "Cite") {
            for (
              const cite of (node.c as unknown[])[0] as Record<
                string,
                unknown
              >[]
            ) candidates.push(String(cite.citationId));
          }
          if (node.t === "Span") {
            const span = attrs(node);
            if (span.values.stage) {
              fail("CORE.ASSESSMENT_INVALID", "stage принадлежит task-items");
            }
            if (span.classes.includes("task-alternatives")) {
              if (group) {
                fail(
                  "CORE.ASSESSMENT_INVALID",
                  "Повторная группа alternatives",
                );
              }
              group = span;
              groupNode = node;
              if (
                !/^alt-[a-z0-9][a-z0-9-]*$/.test(span.id) ||
                !["random", "choice"].includes(span.values.selection)
              ) {
                fail(
                  "CORE.ASSESSMENT_INVALID",
                  "Группа требует alt-* и selection=random|choice",
                );
              }
              visit((node.c as unknown[])[1], (candidate) => {
                if (candidate.t === "Span") {
                  const values = attrs(candidate).values;
                  if (
                    values.requirement !== undefined ||
                    values["work-mode"] !== undefined
                  ) {
                    fail(
                      "CORE.ASSESSMENT_INVALID",
                      "Назначение принадлежит позиции, не кандидату группы",
                    );
                  }
                }
              });
            }
            if (
              span.values.requirement !== undefined ||
              span.values["work-mode"] !== undefined
            ) {
              let count = 0;
              visit((node.c as unknown[])[1], (child) => {
                if (child.t === "Cite") {
                  count += ((child.c as unknown[])[0] as unknown[]).length;
                }
              });
              if (!span.classes.includes("task-alternatives") && count !== 1) {
                fail(
                  "CORE.ASSESSMENT_INVALID",
                  "Назначение требует Span позиции",
                );
              }
              if (span.values.requirement !== undefined) {
                if (requirement !== undefined) {
                  fail("CORE.ASSESSMENT_INVALID", "Повторный requirement");
                }
                requirement = span.values.requirement;
              }
              if (span.values["work-mode"] !== undefined) {
                if (workMode !== undefined) {
                  fail("CORE.ASSESSMENT_INVALID", "Повторный work-mode");
                }
                workMode = span.values["work-mode"];
              }
            }
            for (const key of Object.keys(span.values)) {
              if (
                ![
                  ...(span.classes.includes("task-alternatives")
                    ? ["selection"]
                    : []),
                  "requirement",
                  "work-mode",
                  "when-format",
                  "unless-format",
                  "when-profile",
                  "unless-profile",
                  "when-meta",
                  "unless-meta",
                ].includes(key)
              ) {
                fail(
                  "CORE.ASSESSMENT_INVALID",
                  "Неизвестный Span атрибут " + key,
                );
              }
            }
          }
        });
        if (group) {
          const inside: string[] = [];
          visit((groupNode!.c as unknown[])[1], (x) => {
            if (x.t === "Cite") {
              for (
                const cite of (x.c as unknown[])[0] as Record<string, unknown>[]
              ) inside.push(String(cite.citationId));
            }
          });
          if (inside.length !== candidates.length) {
            fail("CORE.ASSESSMENT_INVALID", "Группа не охватывает всю позицию");
          }
        }
        slots.push({
          id: group?.id ?? candidates[0],
          selection: group?.values.selection ?? "fixed",
          candidates,
          assignment: {
            ...(a.values.stage ? { stage: a.values.stage } : {}),
            requirement: requirement ?? a.values.requirement ?? "required",
            workMode: workMode ?? a.values["work-mode"] ?? "individual",
          },
        });
        memberSizes.push(1);
      }
    }
    assessment = {
      id,
      title,
      kind: config.kind,
      slots,
      ...(config["theory-time"] !== undefined
        ? { theoryTime: Number(config["theory-time"]) }
        : {}),
      ...(config["related-exercise"] !== undefined
        ? { relatedExercise: config["related-exercise"] }
        : {}),
      memberContainers: containers.length,
      memberKinds,
      memberSizes,
    };
  }
  return decode(
    NativeReleaseFactsSchema,
    {
      course: {
        ...(course.id !== undefined ? { id: course.id } : {}),
        view: course.view ?? (context.projection === "author" ? "full" : "student"),
        adapters: course.adapters ?? [],
      },
      nativeMetadata: {
        adapters: Object.fromEntries(
          (Array.isArray(course.adapters) ? course.adapters : []).filter((
            name,
          ): name is string => typeof name === "string")
            .map((name) => [name, {
              ...(Object.hasOwn(ast.meta, name)
                ? { configuration: adapterMetadata(ast.meta[name]) }
                : {}),
              ...(obj(ast.meta.assessment) && obj(ast.meta.assessment.c) &&
                  Object.hasOwn(ast.meta.assessment.c, name)
                ? { assessment: adapterMetadata(ast.meta.assessment.c[name]) }
                : {}),
            }]),
        ),
        ...(Object.hasOwn(ast.meta, "project-checks")
          ? { projectChecks: adapterMetadata(ast.meta["project-checks"]) }
          : {}),
        ...(Object.hasOwn(ast.meta, "project-materialization")
          ? {
            projectMaterialization: adapterMetadata(
              ast.meta["project-materialization"],
            ),
          }
          : {}),
      },
      ...(assessment ? { assessment } : {}),
      declarations: [...declarations.values()],
    },
    "CORE.RELEASE_METADATA",
    context.input,
  );
}
