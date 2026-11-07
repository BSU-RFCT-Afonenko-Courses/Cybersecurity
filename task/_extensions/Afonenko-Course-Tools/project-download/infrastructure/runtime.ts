import { createMetrics as __createMetrics } from "../observability/bridge.ts";
const __metrics = __createMetrics("project-download");
import { inspectOwnedRequests } from "../ownership.ts";
import { diagnostic, externalFailure, progress, reportProgress } from "../diagnostics.ts";
import {
  dirname,
  fromFileUrl,
  join,
  relative,
  resolve,
  toFileUrl,
} from "stdlib/path";
import { configuration, RESOURCE_ID } from "../domain/config.ts";
import { publish, type Request } from "../application/publish.ts";
import {
  child,
  exists,
  noSymlinks,
  resourceFiles,
  resourcePaths,
} from "./files.ts";
const manifestName = ".project-download-manifest.json";
async function sha256(bytes: Uint8Array): Promise<string> {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)),
    ),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
}
async function inspect(root: string) {
  const executable = Deno.env.get("QUARTO") ||
    Deno.env.get("QUARTO_BIN_PATH") &&
      join(Deno.env.get("QUARTO_BIN_PATH")!, "quarto") ||
    "quarto";
  let result: Deno.CommandOutput;
  try {
    result = await new Deno.Command(executable, {
      args: ["inspect", root],
      cwd: root,
      env: __metrics.childEnv({}),
      stdout: "piped",
      stderr: "piped",
    }).output();
  } catch (cause) {
    if (!Object.values(Deno.errors).some((kind) => cause instanceof kind)) {
      throw cause;
    }
    throw externalFailure(executable, undefined, cause);
  }
  if (!result.success) throw externalFailure(executable, result);
  if (result.stderr.length) await Deno.stderr.write(result.stderr);
  return JSON.parse(new TextDecoder().decode(result.stdout));
}
function archiveName(name: string): boolean {
  return name.endsWith(".zip") && RESOURCE_ID.test(name.slice(0, -4));
}
export async function clearOwned(root: string, output: string): Promise<void> {
  const outputRoot = resolve(root, output);
  const directory = child(outputRoot, "_downloads");
  if (!await exists(directory)) return;
  if ((await Deno.lstat(outputRoot)).isSymlink) {
    throw diagnostic(
      "DOWNLOAD.PATH_INVALID",
      "Каталог вывода не должен быть символической ссылкой",
      { source: outputRoot, field: "output-dir" },
    );
  }
  await noSymlinks(outputRoot, directory);
  const manifest = join(directory, manifestName);
  if (!await exists(manifest)) return;
  await noSymlinks(outputRoot, manifest);
  const files = JSON.parse(await Deno.readTextFile(manifest));
  if (
    !Array.isArray(files) ||
    files.some((name) => typeof name !== "string" || !archiveName(name))
  ) {
    throw diagnostic(
      "DOWNLOAD.REQUEST_INVALID",
      "Повреждён перечень файлов project-download",
      { source: manifest, field: "manifest" },
    );
  }
  for (const name of files) {
    const path = join(directory, name);
    if (await exists(path)) {
      await noSymlinks(outputRoot, path);
      await Deno.remove(path);
    }
  }
  await Deno.remove(manifest);
}
export async function prepare(root: string): Promise<void> {
  return await progress(`Подготовка материалов: ${root}`, () => prepareInternal(root));
}
async function prepareInternal(root: string): Promise<void> {
  const inspected = Deno.env.get("QUARTO_PROJECT_OUTPUT_DIR")
    ? undefined
    : await inspect(root);
  if (inspected) configuration(inspected.config["project-download"]);
  const output = Deno.env.get("QUARTO_PROJECT_OUTPUT_DIR") ||
    inspected?.config.project?.["output-dir"] || ".";
  await clearOwned(root, output);
  const receipt = child(
    root,
    "_generated/project-download/artifacts-receipt.json",
  );
  if (await exists(receipt)) {
    await noSymlinks(root, receipt);
    const value = JSON.parse(await Deno.readTextFile(receipt));
    if (
      !["project-download-artifacts-v1", "project-download-artifacts-v2"]
        .includes(value?.schema)
    ) {
      throw diagnostic(
        "DOWNLOAD.OUTPUT_CONFLICT",
        "Чужой файл на пути receipt",
        { source: receipt, field: "receipt" },
      );
    }
    await Deno.remove(receipt);
  }
  const requests = child(root, "_generated/project-download/requests");
  if (await exists(requests)) {
    await noSymlinks(root, requests);
    await Deno.remove(requests, { recursive: true });
  }
}
export interface FinishOptions {
  native?: boolean;
  observeOperation?(catalog: unknown, release: unknown): void | Promise<void>;
  projection?: "student" | "author";
  profiles?: string[];
  expectedDocuments?: { source: string; format: "html" | "revealjs" }[];
  outputDirectory?: string;
  destinationDirectory?: string;
  baseUrl?: string;
  catalogBaseUrl?: string;
  referenceCatalog?: unknown;
  submission?: {
    files: { name: string; starterPath?: string }[];
    instructions: string;
  };
}
async function sibling(name: string) {
  const extension = dirname(dirname(fromFileUrl(import.meta.url)));
  return await import(
    toFileUrl(join(dirname(extension), name, "public.ts")).href
  );
}
async function inputFiles(root: string) {
  const file = Deno.env.get("QUARTO_USE_FILE_FOR_PROJECT_INPUT_FILES");
  return (file
    ? await Deno.readTextFile(file)
    : Deno.env.get("QUARTO_PROJECT_INPUT_FILES") || "").split(/\r?\n/).filter(
      Boolean,
    ).map((path) => relative(root, resolve(root, path)).replaceAll("\\", "/"));
}
/** Публичная текущая операция Core; публикация выполняется после её final fence. */
async function validateRelease(operation: any, Core: any) {
  let PL: any;
  const extension = dirname(dirname(fromFileUrl(import.meta.url)));
  const path = join(dirname(extension), "course-prairielearn", "public.ts");
  try {
    await Deno.stat(path);
    PL = await import(toFileUrl(path).href);
  } catch (cause) {
    if (!(cause instanceof Deno.errors.NotFound)) throw cause;
  }
  const request = {
    expectedSources: operation.catalog.documents.map((d: any) => d.source),
  };
  const before = operation.metrics;
  let proof;
  if (PL) {
    const publication = await PL.inspectPublication(Core, operation, request);
    proof = Core.NativeReleaseProofSchema.parse(publication.proof);
  } else {
    proof = await operation.validateRelease(request, []);
  }
  return {
    proof,
    validationPasses: 1,
    metricsBefore: before,
    metricsAfter: operation.metrics,
  };
}
export async function finish(
  root: string,
  options: FinishOptions = {},
): Promise<number> {
  return await progress(`Финализация материалов: ${root}`, async () => {
    const count = await finishInternal(root, options);
    reportProgress(`Финализация материалов — archives=${count}`);
    return count;
  });
}
async function finishInternal(root: string, options: FinishOptions): Promise<number> {
  const directory = join(root, "_generated/project-download/requests");
  let native = options.native === true;
  if (await exists(directory)) {
    await noSymlinks(root, directory);
    for await (const file of Deno.readDir(directory)) {
      const path = join(directory, file.name);
      await noSymlinks(root, path);
      const request = JSON.parse(await Deno.readTextFile(path));
      native ||= request.native === true || request.courseProcessed === true;
    }
  }
  let archives: { name: string; bytes: Uint8Array }[] = [],
    receiptText = "",
    ownedSignature = "";
  const output = options.outputDirectory ||
    Deno.env.get("QUARTO_PROJECT_OUTPUT_DIR");
  const profiles = options.profiles ??
    (Deno.env.get("QUARTO_PROFILE") || "").split(",").filter(
      Boolean,
    );
  let resolvedOutput = output;
  const collect = async (operation?: any, Core?: any): Promise<number> => {
    const release = operation
      ? await validateRelease(operation, Core)
      : undefined;
    if (operation) await options.observeOperation?.(operation.catalog, release);
    let sources = operation?.catalog.documents.map((d: any) => d.source) ??
      await inputFiles(root);
    let inspected: Awaited<ReturnType<typeof inspect>> | undefined;
    // Standalone без native hook env сохраняет обычный independent сценарий.
    if (!operation || !sources.length || !resolvedOutput) {
      inspected = await inspect(root);
      sources = inspected.files.input.map((path: string) =>
        relative(root, path).replaceAll("\\", "/")
      );
      resolvedOutput ||= inspected.config.project?.["output-dir"] || ".";
    }
    const authoredInputs = new Set<string>(
      sources.map((source: string) => resolve(root, source)),
    );
    if (inspected) {
      for (
        const value of [
          inspected.config.project?.["pre-render"],
          inspected.config.project?.["post-render"],
          inspected.config.filters,
        ]
      ) {
        for (
          const declaration of Array.isArray(value)
            ? value
            : value
            ? [value]
            : []
        ) {
          const command = typeof declaration === "string"
            ? declaration
            : declaration?.path;
          if (typeof command !== "string") continue;
          const paths = typeof declaration === "string"
            ? [
              command,
              ...(command.match(/"[^"]*"|'[^']*'|[^\s]+/g) ?? []).map((
                token: string,
              ) => token.replace(/^["']|["']$/g, "")),
            ]
            : [command];
          for (const path of paths) {
            if (await exists(resolve(root, path))) {
              authoredInputs.add(resolve(root, path));
            }
          }
        }
      }
    }
    const owned = await inspectOwnedRequests(root, sources);
    ownedSignature = JSON.stringify(owned);
    const requests: Request[] = [];
    for (const file of owned.files) {
      requests.push(JSON.parse(await Deno.readTextFile(file.path)));
    }
    const configs = requests.map((request) =>
      configuration(
        request.configuration ?? inspected?.config["project-download"],
      )
    );
    const config = configuration({
      resources: {},
      "course-model": configs.some((c) => c["course-model"]),
    });
    for (const item of configs) {
      for (const [id, resource] of Object.entries(item.resources)) {
        if (
          config.resources[id] &&
          JSON.stringify(config.resources[id]) !== JSON.stringify(resource)
        ) {
          throw diagnostic(
            "DOWNLOAD.REQUEST_INVALID",
            "Несогласованные native resource declarations",
            { id, field: "resources" },
          );
        }
        config.resources[id] = resource;
      }
    }
    const artifacts = requests.flatMap((request) =>
      (request.artifacts ?? []).map((artifact) => ({
        ...artifact,
        source: request.source,
      }))
    );
    const authorStarter = operation?.identity.projection === "author"
      ? artifacts.find((request) => request.kind === "starter")
      : undefined;
    if (authorStarter) {
      throw diagnostic(
        "DOWNLOAD.STARTER_UNQUALIFIED",
        "Заготовка требует настоящую student-проекцию; author condition не даёт student inventory",
        {
          source: authorStarter.source,
          id: authorStarter.exerciseId,
          field: "kind",
        },
      );
    }
    const contexts = new Map<string, any>(), plans = new Map<string, any>();
    const pack = async () =>
      await publish(config, profiles, {
        requests: () => Promise.resolve(requests),
        courseResource: (id, source) => {
          return Promise.reject(diagnostic(
            "DOWNLOAD.REQUEST_INVALID",
            "Учебный проект требует typed artifact request",
            { id, source, field: "artifacts" },
          ));
        },
        async modelArtifact(request, source) {
          if (!operation || !Core) {
            throw diagnostic(
              "DOWNLOAD.CONFIG_INVALID",
              "Модельный комплект требует текущую публичную операцию Core",
              { source, field: "course-model" },
            );
          }
          if (
            !configs[requests.findIndex((r) => r.source === source)]
              ?.["course-model"]
          ) {
            throw diagnostic(
              "DOWNLOAD.CONFIG_INVALID",
              "Модельный комплект не включён в native документе",
              { source },
            );
          }
          const document = operation.document({ source }),
            declaration = document.definitions[request.exerciseId];
          const condition = operation.condition({
            source,
            exerciseId: request.exerciseId,
            view: operation.identity.projection,
          });
          if (
            request.kind === "full" &&
            operation.identity.projection === "student" &&
            !(declaration?.["course-role"] === "demonstration" &&
              declaration?.["statement-visibility"] === "open" &&
              document.hasPublicSolution[request.exerciseId])
          ) {
            throw diagnostic(
              "DOWNLOAD.FULL_UNQUALIFIED",
              "Full artifact в student требует открытой demonstration с фактическим публичным решением; actual full projection ждёт Core owner",
              { source, id: request.exerciseId, field: "kind" },
            );
          }
          const catalogDocument = operation.catalog.documents.find((d: any) =>
            d.source === source
          );
          const exercise = catalogDocument.exercises.find((e: any) =>
            e.id === request.exerciseId
          );
          const context = contexts.get(
            catalogDocument.format + ":" + exercise?.project,
          );
          if (!context) {
            throw diagnostic(
              "DOWNLOAD.RESOURCE_UNAVAILABLE",
              "Нет публичного кодового project context",
              { source, id: request.exerciseId, field: "project" },
            );
          }
          const audience = request.kind === "full" ||
                operation.identity.projection === "author"
              ? "full"
              : "student",
            key = catalogDocument.format + ":" + exercise.project + ":" +
              audience;
          if (!plans.has(key)) {
            plans.set(key, await Core.planProject(context, { audience }));
          }
          const QRC = await sibling("reference-catalog");
          const baseUrl = options.baseUrl ||
            Deno.env.get("COURSE_SITE_PUBLICATION_BASE") || configs.find((c) =>
              c["base-url"]
            )?.["base-url"];
          if (!baseUrl) {
            throw diagnostic(
              "DOWNLOAD.PUBLICATION_REQUIRED",
              "Модельному README нужен конечный base-url",
              { source, field: "base-url" },
            );
          }
          const closure = await Core.materializationClosure(
            plans.get(key),
            condition,
          );
          const destination = {
            catalog: options.referenceCatalog ??
              {
                schema: "quarto-reference-catalog",
                generator: { quarto: "1.11.5" },
                targets: {},
              },
            baseUrl,
            catalogBaseUrl: options.catalogBaseUrl,
            sources: Object.fromEntries(
              operation.catalog.documents.map((d: any) => [d.source, d.output]),
            ),
          };
          const linksBySource: Record<string, Record<string, string>> = {};
          const referencesBySource: Record<
            string,
            Record<string, { href: string; label: string }>
          > = {};
          const references = QRC.createBodyLinks({
            ...destination,
            baseUrl: destination.catalogBaseUrl ?? baseUrl,
          });
          for (const fragment of closure.fragments) {
            const urls: Record<string, string> = {},
              resourceLinks: string[] = [];
            for (const link of fragment.links) {
              const pathname = link.split(/[?#]/)[0],
                target = pathname.split("/").pop();
              if (
                artifacts.some((a) =>
                  a.exerciseId + "-" + a.kind + ".zip" === target
                ) || Object.keys(config.resources).some((id) =>
                  id + ".zip" === target
                )
              ) {
                urls[link] = "_downloads/" + target +
                  (link.match(/[?#].*$/)?.[0] ?? "");
              } else if (
                !/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(link) &&
                !/\.(?:qmd|html)(?:[?#]|$)/i.test(link)
              ) resourceLinks.push(link);
            }
            const refs = Object.fromEntries(
              fragment.references.map((
                r: any,
              ) => [r.token, { key: r.key, style: r.style }]),
            );
            linksBySource[fragment.source] = QRC.bindConditionLinks({
              context: { input: fragment.source },
              links: fragment.links,
            }, { ...destination, urls, resourceLinks, references: refs });
            referencesBySource[fragment.source] = Object.fromEntries(
              fragment.references.map((
                r: any,
              ) => [
                r.token,
                references.resolve(r.key, r.style, fragment.source),
              ]),
            );
          }
          const materialize = request.kind === "conditions"
            ? Core.materializeCondition
            : Core.materializeProject;
          const inventory = await materialize(plans.get(key), condition, {
            linksBySource,
            referencesBySource,
            submission: options.submission ??
              {
                files: [],
                instructions:
                  "Сдайте исходники способом, указанным преподавателем.",
              },
          });
          const { packageArtifact } = await import(
            "../application/package-artifact.ts"
          );
          return {
            kind: request.kind,
            files: inventory.files.map((f: any) => ({
              name: f.target,
              bytes: f.bytes,
            })),
            package: () => packageArtifact(inventory),
          };
        },
        async files(resource) {
          if (operation) {
            const selected = await resourcePaths(root, resource);
            const inventory = await operation.resourceInventory({
              files: selected.map((f) => ({
                source: f.source,
                target: f.name,
              })),
            });
            return inventory.files.map((f: any) => ({
              name: f.target,
              bytes: f.bytes,
            }));
          }
          const files = await resourceFiles(root, resource);
          for (const file of files) {
            const path = join(resource.path.replace(/^\//, ""), file.name);
            if (
              /(^|\/)(?:\.[^/]+|_extensions|_freeze|_generated|reference|solutions?|tests|closed-tests)(\/|$)/
                .test(path) ||
              /\.(?:qmd|rmd|ipynb)$/i.test(path) ||
              /(^|\/)(?:_quarto(?:[-.][^/]*)?|_metadata\.ya?ml)$/i.test(path) ||
              authoredInputs.has(resolve(root, path))
            ) {
              throw diagnostic(
                "RESOURCE.PRIVATE_OR_SOURCE",
                "Ресурс содержит закрытый материал или авторский исходник",
                { source: path, field: "resources" },
              );
            }
          }
          return files;
        },
        async save(value) {
          archives = value.map((archive) => ({
            ...archive,
            bytes: new Uint8Array(archive.bytes),
          }));
          const entries = [];
          for (const archive of archives) {
            const request = artifacts.find((a) =>
              a.exerciseId + "-" + a.kind + ".zip" === archive.name
            );
            entries.push({
              name: archive.name,
              sha256: await sha256(archive.bytes),
              audience: operation
                ? (operation.identity.projection === "author"
                  ? "full"
                  : "student")
                : null,
              ...request,
            });
          }
          receiptText = JSON.stringify(
            {
              schema: "project-download-artifacts-v2",
              audience: operation
                ? (operation.identity.projection === "author"
                  ? "full"
                  : "student")
                : null,
              audiences: operation
                ? [
                  operation.identity.projection === "author"
                    ? "full"
                    : "student",
                ]
                : [],
              profiles,
              operation: operation?.identity.operation ?? null,
              identity: operation?.identity ?? null,
              release,
              archives: entries,
            },
            null,
            2,
          ) + "\n";
        },
      });
    const projectRequests = new Map<string, Set<string>>();
    for (const artifact of artifacts) {
      const doc = operation?.catalog.documents.find((d: any) =>
        d.source === artifact.source
      );
      for (
        const exercise of doc?.exercises.filter((e: any) =>
          e.id === artifact.exerciseId
        ) ?? []
      ) {
        if (exercise.project) {
          if (!projectRequests.has(doc.format)) {
            projectRequests.set(doc.format, new Set());
          }
          projectRequests.get(doc.format)!.add(
            exercise.project + "/native-input.qmd",
          );
        }
      }
    }
    if (projectRequests.size) {
      return await operation.withProjectContracts(
        [...projectRequests].map(([format, inputs]) => ({
          owner: root,
          inputs: [...inputs],
          profiles,
          format,
        })),
        async (batch: any) => {
          for (const group of batch.groups) {
            for (const context of group.contexts) {
              contexts.set(
                context.format + ":" +
                  relative(root, dirname(context.input)).replaceAll("\\", "/"),
                context,
              );
            }
          }
          return await pack();
        },
      );
    }
    return await pack();
  };
  let count: number;
  if (native) {
    if (!resolvedOutput) {
      throw diagnostic(
        "DOWNLOAD.REQUEST_INVALID",
        "Native hook не передал текущий output",
        { source: root, field: "outputDirectory" },
      );
    }
    const Core = await sibling("course-core");
    count = await Core.withCurrentNativeOperation({
      root,
      profiles,
      projection: options.projection ?? "student",
      ...(options.expectedDocuments
        ? { expectedDocuments: options.expectedDocuments }
        : {}),
      outputDirectory: resolve(root, resolvedOutput),
    }, async (operation: any) => await collect(operation, Core));
  } else count = await collect();
  const sources = JSON.parse(ownedSignature).files.map((f: any) => f.source);
  if (
    JSON.stringify(await inspectOwnedRequests(root, sources)) !== ownedSignature
  ) {
    throw diagnostic(
      "DOWNLOAD.REQUEST_INVALID",
      "Заявки изменены перед публикацией",
      { source: root, field: "requests" },
    );
  }
  await publishArchives(
    root,
    options.destinationDirectory || resolvedOutput!,
    archives,
    receiptText,
  );
  return count;
}
async function publishArchives(
  root: string,
  output: string,
  archives: { name: string; bytes: Uint8Array }[],
  receiptText: string,
) {
  const receiptPath = child(
    root,
    "_generated/project-download/artifacts-receipt.json",
  );
  // Даже отсутствующий receipt не разрешает запись через linked parent.
  let receiptParent = dirname(receiptPath);
  while (!await exists(receiptParent)) {
    receiptParent = dirname(receiptParent);
  }
  if (resolve(receiptParent) !== resolve(root)) {
    await noSymlinks(root, receiptParent);
  }
  if (await exists(receiptPath)) {
    await noSymlinks(root, receiptPath);
    const previous = JSON.parse(await Deno.readTextFile(receiptPath));
    if (
      !["project-download-artifacts-v1", "project-download-artifacts-v2"]
        .includes(previous?.schema)
    ) {
      throw diagnostic(
        "DOWNLOAD.OUTPUT_CONFLICT",
        "Чужой файл на пути receipt",
        { source: receiptPath, field: "receipt" },
      );
    }
  }
  let existingParent = resolve(root, output);
  while (!await exists(existingParent)) {
    existingParent = dirname(existingParent);
  }
  await noSymlinks("/", existingParent);
  await clearOwned(root, output);
  if (!archives.length) return;
  const outputRoot = resolve(root, output);
  const directory = child(outputRoot, "_downloads");
  if (
    await exists(outputRoot) && (await Deno.lstat(outputRoot)).isSymlink
  ) {
    throw diagnostic(
      "DOWNLOAD.PATH_INVALID",
      "Каталог вывода не должен быть символической ссылкой",
      { source: outputRoot, field: "output-dir" },
    );
  }
  await Deno.mkdir(directory, { recursive: true });
  if ((await Deno.lstat(outputRoot)).isSymlink) {
    throw diagnostic(
      "DOWNLOAD.PATH_INVALID",
      "Каталог вывода не должен быть символической ссылкой",
      { source: outputRoot, field: "output-dir" },
    );
  }
  await noSymlinks("/", outputRoot);
  await noSymlinks(outputRoot, directory);
  // Нельзя перезаписывать файл, которым это расширение не владело.
  for (const archive of archives) {
    if (await exists(join(directory, archive.name))) {
      throw diagnostic(
        "DOWNLOAD.OUTPUT_CONFLICT",
        `Посторонний файл мешает публикации архива: ${archive.name}`,
        {
          source: join(directory, archive.name),
          id: archive.name,
          field: "output",
          hint: "Выберите свободный путь или переместите посторонний архив.",
        },
      );
    }
  }
  // Манифест записывается первым: следующая сборка очистит и прерванную запись.
  await Deno.writeTextFile(
    join(directory, manifestName),
    JSON.stringify(archives.map((item) => item.name)) + "\n",
  );
  for (const archive of archives) {
    await Deno.writeFile(join(directory, archive.name), archive.bytes, {
      createNew: true,
    });
  }
  await Deno.mkdir(dirname(receiptPath), { recursive: true });
  if (await exists(receiptPath)) {
    await noSymlinks(root, receiptPath);
    const previous = JSON.parse(await Deno.readTextFile(receiptPath));
    if (
      !["project-download-artifacts-v1", "project-download-artifacts-v2"]
        .includes(previous?.schema)
    ) {
      throw diagnostic(
        "DOWNLOAD.OUTPUT_CONFLICT",
        "Чужой файл на пути receipt",
        { source: receiptPath, field: "receipt" },
      );
    }
    await Deno.remove(receiptPath);
  }
  await Deno.writeTextFile(receiptPath, receiptText, {
    createNew: true,
  });
}

// @ts-expect-error JS binding сохраняет публичную сигнатуру для Performance ABI.
clearOwned = __metrics.wrapAsync({
  id: "project-download.infrastructure.runtime.clearOwned",
  kind: "io",
}, clearOwned);
// @ts-expect-error JS binding сохраняет публичную сигнатуру для Performance ABI.
prepare = __metrics.wrapAsync({
  id: "project-download.infrastructure.runtime.prepare",
  kind: "io",
}, prepare);
// @ts-expect-error JS binding сохраняет публичную сигнатуру для Performance ABI.
finish = __metrics.wrapAsync({
  id: "project-download.infrastructure.runtime.finish",
  kind: "io",
}, finish);
