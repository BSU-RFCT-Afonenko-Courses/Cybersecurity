import { dirname, fromFileUrl, join, toFileUrl } from "stdlib/path";
import { diagnostic } from "../diagnostics.ts";
import { zip } from "../domain/zip.ts";

/**
 * Один ZIP из публичного inventory Core без чтения проекта и изменения README.
 * Currentness и финальный source fence принадлежат вызывающей композиции Core.
 */
export async function packageArtifact(value: unknown): Promise<Uint8Array> {
  let supplied;
  try {
    // До lazy import тоже нельзя отдавать caller право изменить будущий ZIP.
    supplied = structuredClone(value);
  } catch (cause) {
    throw diagnostic(
      "DOWNLOAD.INVENTORY_INVALID",
      "Inventory нельзя зафиксировать",
      { field: "inventory" },
      cause,
    );
  }
  const extension = dirname(dirname(fromFileUrl(import.meta.url)));
  const core = await import(
    toFileUrl(join(dirname(extension), "course-core/public.ts")).href
  );
  let inventory;
  try {
    inventory = core.ArtifactInventorySchema.parse(supplied);
  } catch (cause) {
    throw diagnostic(
      "DOWNLOAD.INVENTORY_INVALID",
      "Core inventory не соответствует публичной схеме",
      { field: "inventory" },
      cause,
    );
  }
  // Все заимствованные bytes фиксируются до первого await проверки хешей.
  const files = inventory.files.map((file: {
    target: string;
    bytes: Uint8Array;
    size: number;
    sha256: string;
    audience: string;
  }) => ({ ...file, bytes: new Uint8Array(file.bytes) }));
  const names = new Set<string>();
  for (const file of files) {
    if (names.has(file.target) || file.audience !== inventory.audience) {
      throw diagnostic(
        "DOWNLOAD.INVENTORY_INVALID",
        "Повторный target или чужая аудитория файла inventory",
        { id: file.target, field: "target/audience" },
      );
    }
    names.add(file.target);
  }
  for (const name of names) {
    const parts = name.split("/");
    while (parts.length > 1) {
      parts.pop();
      if (names.has(parts.join("/"))) {
        throw diagnostic(
          "DOWNLOAD.INVENTORY_INVALID",
          "Файл inventory пересекается с каталогом другого файла",
          { id: name, field: "target" },
        );
      }
    }
  }
  for (const file of files) {
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", file.bytes)),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
    if (file.bytes.byteLength !== file.size || digest !== file.sha256) {
      throw diagnostic(
        "DOWNLOAD.INVENTORY_INVALID",
        "Размер или SHA256 файла inventory не совпадает с байтами",
        { id: file.target, field: "size/sha256" },
      );
    }
  }
  files.sort((a: { target: string }, b: { target: string }) =>
    a.target < b.target ? -1 : a.target > b.target ? 1 : 0
  );
  return zip(files.map((file: { target: string; bytes: Uint8Array }) => ({
    name: file.target,
    bytes: file.bytes,
  })));
}
