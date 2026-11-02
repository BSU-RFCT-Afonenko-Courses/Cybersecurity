import { createMetrics as __createMetrics } from "../observability/bridge.ts";
const __metrics = __createMetrics("project-download");
import { diagnostic, progress, reportProgress } from "../diagnostics.ts";
import {
  type Configuration,
  type Resource,
  RESOURCE_ID,
} from "../domain/config.ts";
import { type ArchiveEntry, zip } from "../domain/zip.ts";
import {
  ARTIFACT_KINDS,
  type resolveDownloadRequests,
} from "../domain/request.ts";
export type ArtifactKind = typeof ARTIFACT_KINDS[number];
type NativeRequest = ReturnType<typeof resolveDownloadRequests>["request"];
export type ArtifactRequest = NonNullable<NativeRequest["artifacts"]>[number];
// Старый public port допускает отсутствие native/configuration; типы полей
// выводятся из исполняемого owner batch, отдельного ручного DTO нет.
export type Request =
  & Pick<NativeRequest, "source" | "resources">
  & Partial<Omit<NativeRequest, "source" | "resources">>;
export interface PublishPorts {
  requests(): Promise<Request[]>;
  courseResource(id: string, source: string): Promise<Resource>;
  modelArtifact?(
    request: ArtifactRequest,
    source: string,
  ): Promise<
    {
      kind: ArtifactKind;
      files: ArchiveEntry[];
      package?(): Promise<Uint8Array>;
    }
  >;
  files(resource: Resource): Promise<ArchiveEntry[]>;
  save(archives: { name: string; bytes: Uint8Array }[]): Promise<void>;
}
export async function publish(
  config: Configuration,
  profiles: string[],
  ports: PublishPorts,
): Promise<number> {
  return await progress("Сборка материалов и ZIP", () => publishInternal(config, profiles, ports));
}
async function publishInternal(config: Configuration, profiles: string[], ports: PublishPorts): Promise<number> {
  const selected = new Map<string, Resource>();
  const model = new Map<
    string,
    { files: ArchiveEntry[]; package?: () => Promise<Uint8Array> }
  >();
  for (const request of await ports.requests()) {
    for (const artifact of request.artifacts ?? []) {
      if (
        !RESOURCE_ID.test(artifact.exerciseId) ||
        !ARTIFACT_KINDS.includes(artifact.kind) ||
        Object.keys(artifact).some((k) => !["exerciseId", "kind"].includes(k))
      ) {
        throw diagnostic(
          "DOWNLOAD.REQUEST_INVALID",
          "Недопустимая модельная заявка",
          { source: request.source, field: "artifacts" },
        );
      }
      if (!config["course-model"] || !ports.modelArtifact) {
        throw diagnostic(
          "DOWNLOAD.CONFIG_INVALID",
          "Модельный комплект требует подключения Core",
          {
            source: request.source,
            id: artifact.exerciseId,
            field: "course-model",
          },
        );
      }
      const resolved = await ports.modelArtifact(artifact, request.source);
      if (resolved.kind !== artifact.kind) {
        throw diagnostic(
          "DOWNLOAD.REQUEST_INVALID",
          "Разрешённый комплект не совпадает с текущей ссылкой",
          { source: request.source, id: artifact.exerciseId, field: "kind" },
        );
      }
      const name = artifact.exerciseId + "-" + resolved.kind + ".zip";
      const files = [...resolved.files].sort((a, b) =>
        a.name < b.name ? -1 : a.name > b.name ? 1 : 0
      );
      const previous = model.get(name);
      if (previous && !equalFiles(previous.files, files)) {
        throw diagnostic(
          "DOWNLOAD.REQUEST_INVALID",
          "Несогласованные модельные комплекты",
          {
            source: request.source,
            id: artifact.exerciseId,
            field: "artifacts",
          },
        );
      }
      if (!previous) model.set(name, { files, package: resolved.package });
    }
    for (const id of request.resources) {
      if (!RESOURCE_ID.test(id)) {
        throw diagnostic(
          "DOWNLOAD.REQUEST_INVALID",
          `Недопустимый идентификатор заявки: ${id}`,
          { source: request.source, id, field: "resources" },
        );
      }
      const resource = config.resources[id] ??
        (config["course-model"] && id.startsWith("exr-")
          ? await ports.courseResource(id, request.source)
          : undefined);
      if (!resource) {
        throw diagnostic(
          "DOWNLOAD.RESOURCE_UNAVAILABLE",
          `Не объявлен ресурс: ${id}`,
          {
            source: request.source,
            id,
            field: "resources",
            hint: "Объявите ресурс в project-download.resources.",
          },
        );
      }
      if (
        resource.profiles &&
        !resource.profiles.some((profile) => profiles.includes(profile))
      ) {
        throw diagnostic(
          "DOWNLOAD.RESOURCE_UNAVAILABLE",
          `Ресурс ${id} недоступен для текущего профиля: ${
            profiles.join(", ")
          }; скройте ссылку тем же условием`,
          {
            source: request.source,
            id,
            field: "profiles",
            hint: "Согласуйте видимость ссылки с профилями ресурса.",
          },
        );
      }
      const prior = selected.get(id);
      if (prior && JSON.stringify(prior) !== JSON.stringify(resource)) {
        throw diagnostic(
          "DOWNLOAD.REQUEST_INVALID",
          `Несогласованные определения ресурса: ${id}`,
          { source: request.source, id, field: "resources" },
        );
      }
      selected.set(id, resource);
    }
  }
  reportProgress(`Сборка материалов и ZIP — resources=${selected.size}, model=${model.size}`);
  const archives = [];
  for (
    const [id, resource] of [...selected].sort(([a], [b]) => a < b ? -1 : 1)
  ) {
    const name = id + ".zip";
    if (model.has(name)) {
      throw diagnostic(
        "DOWNLOAD.OUTPUT_CONFLICT",
        "Обычный ресурс конфликтует с модельным комплектом",
        { id, field: "output" },
      );
    }
    archives.push({ name, bytes: zip(await ports.files(resource)) });
  }
  for (
    const [name, artifact] of [...model].sort(([a], [b]) => a < b ? -1 : 1)
  ) {
    archives.push({
      name,
      bytes: artifact.package ? await artifact.package() : zip(artifact.files),
    });
  }
  reportProgress(`Публикация материалов — archives=${archives.length}`);
  await ports.save(archives);
  return archives.length;
}
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// @ts-expect-error JS допускает замену function binding; сигнатура публичного API сохраняется.
publish = __metrics.wrapAsync({
  id: "project-download.application.publish.publish",
  kind: "phase",
}, publish);

function equalFiles(a: ArchiveEntry[], b: ArchiveEntry[]): boolean {
  return a.length === b.length &&
    a.every((file, i) =>
      file.name === b[i].name && equalBytes(file.bytes, b[i].bytes)
    );
}
