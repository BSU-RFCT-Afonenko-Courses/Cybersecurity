import { diagnostic } from "../diagnostics.ts";
import { configuration, RESOURCE_ID } from "./config.ts";
export const ARTIFACT_KINDS = ["starter", "full", "conditions"] as const;
export type ArtifactKind = typeof ARTIFACT_KINDS[number];
function syntax(
  message: string,
  source: string,
  id?: string,
  field?: string,
): never {
  throw diagnostic("DOWNLOAD.REQUEST_INVALID", message, { source, id, field });
}

function record(value: unknown, source: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    syntax("Запрос должен быть словарём", source);
  }
  return value as Record<string, unknown>;
}
function keys(
  value: Record<string, unknown>,
  allowed: string[],
  source: string,
) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      syntax(`Неизвестное поле запроса: ${key}`, source, undefined, key);
    }
  }
}
/** Единственный syntax decoder для literal и actual native callbacks. */
export function decodeDownloadRequest(value: unknown, source: string) {
  const v = record(value, source);
  keys(v, ["positional", "named"], source);
  if (
    !Array.isArray(v.positional) || v.positional.length !== 1 ||
    typeof v.positional[0] !== "string"
  ) {
    syntax(
      "project-download принимает один идентификатор ресурса",
      source,
      undefined,
      "resource",
    );
  }
  const resource = v.positional[0];
  if (!RESOURCE_ID.test(resource)) {
    syntax(
      "Недопустимый идентификатор ресурса project-download",
      source,
      resource,
      "resource",
    );
  }
  if (!Array.isArray(v.named)) {
    syntax("Именованные параметры должны быть списком", source, resource);
  }
  const seen = new Set<string>();
  let text = "", kind: ArtifactKind | undefined;
  for (const raw of v.named) {
    const arg = record(raw, source);
    keys(arg, ["key", "value"], source);
    if (
      typeof arg.key !== "string" || typeof arg.value !== "string" ||
      seen.has(arg.key)
    ) {
      syntax(
        "Неоднозначный именованный параметр project-download",
        source,
        resource,
      );
    }
    seen.add(arg.key);
    if (arg.key === "text") text = arg.value;
    else if (arg.key === "kind") {
      if (!ARTIFACT_KINDS.includes(arg.value as ArtifactKind)) {
        syntax("Неизвестный вид комплекта", source, resource, "kind");
      }
      kind = arg.value as ArtifactKind;
    } else {syntax(
        `Неизвестный параметр project-download: ${arg.key}`,
        source,
        resource,
        arg.key,
      );}
  }
  return { resource, text, ...(kind === undefined ? {} : { kind }) };
}
function artifact(exerciseId: string, kind: ArtifactKind) {
  return { exerciseId, kind };
}
function invocation(value: unknown, source: string) {
  const v = record(value, source);
  keys(v, ["ordinal", "positional", "named", "inline"], source);
  if (
    !Number.isSafeInteger(v.ordinal) || (v.ordinal as number) < 0 ||
    typeof v.inline !== "boolean"
  ) syntax("Недопустимый ordinal или признак inline", source);
  return {
    ordinal: v.ordinal as number,
    inline: v.inline,
    decoded: decodeDownloadRequest(
      { positional: v.positional, named: v.named },
      source,
    ),
  };
}
/** Одна document-local native batch. Не читает файлы/metadata и не создаёт ZIP. */
export function resolveDownloadRequests(value: unknown) {
  const v = record(value, "");
  keys(v, [
    "source",
    "view",
    "configuration",
    "native",
    "courseProcessed",
    "exercises",
    "artifactContext",
    "requests",
  ], "");
  if (
    typeof v.source !== "string" || !v.source ||
    (v.view !== undefined && typeof v.view !== "string") ||
    typeof v.native !== "boolean" || typeof v.courseProcessed !== "boolean" ||
    !Array.isArray(v.requests)
  ) {
    syntax(
      "Неполный native batch",
      typeof v.source === "string" ? v.source : "",
    );
  }
  const source = v.source,
    exercises = record(v.exercises, source),
    contexts = record(v.artifactContext, source);
  // G1: syntax всех callbacks раньше любого config/resource/default решения.
  const calls = v.requests.map((request) => invocation(request, source));
  if (new Set(calls.map((r) => r.ordinal)).size !== calls.length) {
    syntax("Повторный ordinal", source);
  }
  const resources: string[] = [],
    artifacts: ReturnType<typeof artifact>[] = [],
    links: { ordinal: number; href: string; text: string }[] = [],
    seen = new Set<string>();
  const config = calls.some((r) => r.inline)
    ? v.configuration == null || v.configuration === false
      ? (() => {
        throw diagnostic(
          "DOWNLOAD.CONFIG_INVALID",
          "Для project-download требуется явная конфигурация ресурсов",
          { source, field: "project-download" },
        );
      })()
      : configuration(v.configuration)
    : undefined;
  const captions = {
    starter: "Скачать заготовку",
    full: "Скачать полный проект",
    conditions: "Скачать условие",
  };
  for (const call of calls) {
    if (!call.inline) continue;
    const { resource: id, text, kind: explicitKind } = call.decoded;
    const declared = Object.hasOwn(config!.resources, id) ? config!.resources[id] : undefined,
      context = contexts[id],
      observed = exercises[id];
    const model = config!["course-model"] === true && id.startsWith("exr-") &&
      (context || observed);
    if (
      !(declared || config!["course-model"] === true && id.startsWith("exr-"))
    ) {
      throw diagnostic(
        "DOWNLOAD.RESOURCE_UNAVAILABLE",
        `Не объявлен ресурс project-download: ${id}`,
        { source, id, field: "resources" },
      );
    }
    let kind: ArtifactKind | undefined, name: string;
    if (declared && !model) {
      if (explicitKind !== undefined) {
        syntax(
          "kind доступен только модельному упражнению",
          source,
          id,
          "kind",
        );
      }
      name = id;
    } else {
      let exercise: Record<string, unknown> | undefined = observed == null
        ? undefined
        : record(observed, source);
      if (context != null) {
        const actual = record(context, source);
        exercise = {
          "course-role": actual.purpose ?? "",
          "statement-visibility": actual.statementVisibility ?? "",
        };
      }
      if (!exercise && v.native) {
        if (explicitKind === undefined) {
          throw diagnostic(
            "DOWNLOAD.KIND_UNQUALIFIED",
            "Native custom appearance требует явный kind до owner artifact-context",
            { source, id, field: "kind" },
          );
        }
        exercise = {};
      }
      if (!exercise) {
        throw diagnostic(
          "DOWNLOAD.RESOURCE_UNAVAILABLE",
          "Нет видимого упражнения в текущем документе",
          { source, id, field: "exerciseId" },
        );
      }
      const demo = exercise["course-role"] === "demonstration" &&
        exercise["statement-visibility"] === "open";
      kind = explicitKind ?? (v.view === "full" || demo ? "full" : "starter");
      name = id + "-" + kind;
    }
    const identity = kind ? `artifact:${id}:${kind}` : `resource:${id}`;
    if (!seen.has(identity)) {
      if (kind) artifacts.push(artifact(id, kind));
      else resources.push(id);
      seen.add(identity);
    }
    // Lua %s — ASCII whitespace; не расширять его до JS Unicode \s.
    links.push({
      ordinal: call.ordinal,
      href: "../".repeat((source.match(/[\/\\]/g) ?? []).length) +
        "_downloads/" + name + ".zip",
      text: /^[ \f\n\r\t\v]*$/.test(text)
        ? kind ? captions[kind] : "Скачать материалы"
        : text,
    });
  }
  return {
    source,
    links,
    request: {
      source,
      resources,
      configuration: v.configuration ?? {},
      native: v.native,
      ...(artifacts.length ? { artifacts } : {}),
      ...(v.courseProcessed ? { courseProcessed: true } : {}),
    },
  };
}
