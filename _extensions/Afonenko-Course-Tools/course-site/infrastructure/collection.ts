import { diagnostic } from "./diagnostics.ts";
import { files, resolve, safePath, within } from "./files.ts";
export interface Record {
  id: string;
  projectRoot: string;
  outputDir: string;
  profiles: string[];
  nativeOutputs: string[];
  files: string[];
}
export async function publicOutputs(
  root: string,
  outputDir: string,
): Promise<string[]> {
  const file = Deno.env.get("QUARTO_USE_FILE_FOR_PROJECT_OUTPUT_FILES");
  const text = file
    ? await Deno.readTextFile(resolve(root, file))
    : Deno.env.get("QUARTO_PROJECT_OUTPUT_FILES");
  if (text === undefined) {
    throw diagnostic(
      "SITE.COLLECTION_INVALID",
      "Не получен список текущих результатов Quarto",
      {
        source: root,
        field: "QUARTO_PROJECT_OUTPUT_FILES",
        hint: "Запускайте collect последним post-render hook.",
      },
    );
  }
  const outputs = text.split(/\r?\n/).filter(Boolean).map((path) =>
    resolve(root, path)
  );
  if (new Set(outputs).size !== outputs.length) {
    throw diagnostic(
      "SITE.COLLECTION_INVALID",
      "Список результатов содержит повторяющиеся пути",
      {
        source: root,
        field: "nativeOutputs",
        hint: "Проверьте post-render окружение Quarto.",
      },
    );
  }
  for (const path of outputs) {
    within(outputDir, path);
    await safePath(root, path);
    let stat: Deno.FileInfo;
    try {
      stat = await Deno.lstat(path);
    } catch (cause) {
      if (!(cause instanceof Deno.errors.NotFound)) throw cause;
      throw diagnostic(
        "SITE.CURRENT_RESULT_MISSING",
        "Файл текущего результата отсутствует",
        { source: root, field: "nativeOutputs", related: [{ source: path }] },
        cause,
      );
    }
    if (!stat.isFile) {
      throw diagnostic(
        "SITE.CURRENT_RESULT_MISSING",
        "Текущий результат Quarto отсутствует",
        {
          source: root,
          field: "nativeOutputs",
          related: [{ source: path }],
          hint: "Повторите успешную сборку.",
        },
      );
    }
  }
  return outputs;
}
export async function collect(): Promise<void> {
  const destination = Deno.env.get("COURSE_SITE_COLLECTION");
  if (!destination) return;
  const root = Deno.cwd(),
    outputDir = resolve(root, Deno.env.get("QUARTO_PROJECT_OUTPUT_DIR") || "");
  if (outputDir === root) {
    throw diagnostic(
      "SITE.COLLECTION_INVALID",
      "Не задан каталог текущего результата",
      {
        source: root,
        field: "QUARTO_PROJECT_OUTPUT_DIR",
        hint: "Задайте native project.output-dir.",
      },
    );
  }
  const record: Record = {
    id: Deno.env.get("COURSE_SITE_PROJECT")!,
    projectRoot: root,
    outputDir,
    profiles: (Deno.env.get("QUARTO_PROFILE") || "").split(",").filter(Boolean),
    nativeOutputs: await publicOutputs(root, outputDir),
    files: await files(outputDir),
  };
  await Deno.writeTextFile(destination, JSON.stringify(record));
}
export async function readCollection(
  path: string,
  id: string,
  projectRoot: string,
  outputDir: string,
  profiles: string[],
  // Quarto's post-render environment is the authority for implicit child
  // defaults/groups; only explicitly requested profiles are known beforehand.
  nativeProfileContext = false,
): Promise<Record> {
  let value: any;
  try {
    value = JSON.parse(await Deno.readTextFile(path));
  } catch (cause) {
    if (
      !(cause instanceof Deno.errors.NotFound) &&
      !(cause instanceof SyntaxError)
    ) throw cause;
    throw diagnostic(
      cause instanceof SyntaxError
        ? "SITE.COLLECTION_INVALID"
        : "SITE.CURRENT_RESULT_MISSING",
      "Не удалось прочитать текущую коллекцию",
      {
        source: projectRoot,
        id,
        field: "collection",
        related: [{ source: path }],
        hint: "Подключите collect последним hook и повторите сборку.",
      },
      cause,
    );
  }
  if (
    value.id !== id || value.projectRoot !== projectRoot ||
    value.outputDir !== outputDir ||
    !Array.isArray(value.profiles) ||
    value.profiles.some((profile: any) =>
      typeof profile !== "string" || !/^[\w][\w.-]*$/.test(profile)
    ) || new Set(value.profiles).size !== value.profiles.length ||
    JSON.stringify(
        nativeProfileContext
          ? value.profiles.filter((profile: string) =>
            profiles.includes(profile)
          )
          : value.profiles,
      ) !== JSON.stringify(profiles) ||
    !Array.isArray(value.nativeOutputs) || !Array.isArray(value.files)
  ) {
    throw diagnostic(
      "SITE.COLLECTION_INVALID",
      "Коллекция не соответствует текущему компоненту, каталогам или профилям",
      {
        source: projectRoot,
        id,
        field: "id/projectRoot/outputDir/profiles/nativeOutputs/files",
        related: [{ source: path }, { source: outputDir }],
        hint: "Подключите collect последним hook и повторите сборку.",
      },
    );
  }
  for (const path of [...value.nativeOutputs, ...value.files]) {
    within(outputDir, path);
    await safePath(projectRoot, path);
    let stat: Deno.FileInfo;
    try {
      stat = await Deno.lstat(path);
    } catch (cause) {
      if (!(cause instanceof Deno.errors.NotFound)) throw cause;
      throw diagnostic(
        "SITE.CURRENT_RESULT_MISSING",
        "Файл текущей коллекции отсутствует",
        {
          source: projectRoot,
          id,
          field: "files/nativeOutputs",
          related: [{ source: path }],
        },
        cause,
      );
    }
    if (!stat.isFile) {
      throw diagnostic(
        "SITE.CURRENT_RESULT_MISSING",
        "Файл текущей коллекции отсутствует",
        {
          source: projectRoot,
          id,
          field: "files/nativeOutputs",
          related: [{ source: path }],
          hint: "Повторите успешную сборку компонента.",
        },
      );
    }
  }
  return value;
}
