/** Публичная упаковка готовых артефактов; ordinary ZIP не требует Core. */
export { packageArtifact } from "./application/package-artifact.ts";
export { zip } from "./domain/zip.ts";
export type { ArchiveEntry } from "./domain/zip.ts";
export {
  finish as finishDownloads,
  prepare as prepareDownloads,
} from "./infrastructure/runtime.ts";
export type { FinishOptions } from "./infrastructure/runtime.ts";
