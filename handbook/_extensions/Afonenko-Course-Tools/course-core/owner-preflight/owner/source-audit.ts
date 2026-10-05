/** Sorted source inventory and current native audit; receives the facade locator explicitly. */
import { dirname, isAbsolute, join, relative, resolve } from "stdlib/path";
import type { View } from "../../domain/vocabulary.ts";
import {
  auditNativeListings,
  NativeListingFailure,
  type NativeListingPlans,
} from "../native-listing.ts";
import {
  type NativeListingProviderBinding,
  NativeListingProviderFailure,
  resolveNativeListingProvider,
} from "../native-listing-provider.ts";
import { OwnerFailure } from "./failure.ts";
import { digestFile, exists, inside, inspect, quarto } from "./runtime.ts";
import type { Audit, Coverage, DownloadOwnership } from "./protocol.ts";

export interface SourceAuditLocation {
  freezeGuardPath: string;
  extensionPath: string;
}
export type InspectDownloads = (
  root: string,
  extension: string,
  coverage: Record<string, Coverage>,
) => Promise<{ helper: string; state: DownloadOwnership }>;

export async function fileList(
  root: string,
  excluded: string[],
): Promise<string[]> {
  const paths: string[] = [];
  async function visit(dir: string) {
    for await (const entry of Deno.readDir(dir)) {
      const path = join(dir, entry.name), rel = inside(root, path);
      if (excluded.some((x) => rel === x || rel.startsWith(x + "/"))) continue;
      if (entry.isSymlink) {
        throw new OwnerFailure("SOURCE.SYMLINK_UNSUPPORTED", rel);
      }
      if (entry.isDirectory) await visit(path);
      else if (entry.isFile) paths.push(rel);
    }
  }
  await visit(root);
  return paths.sort();
}
export async function auditSource(
  input: string,
  delivery: string | undefined,
  location: SourceAuditLocation,
  inspectDownloads: InspectDownloads,
): Promise<Audit> {
  const root = await Deno.realPath(input);
  const profiles: Record<string, any> = {},
    coverage: Record<string, Coverage> = {};
  const documents: Record<string, Record<string, any>> = {};
  const excluded = [
    ".git",
    ".quarto",
    "_freeze",
    ".course-owner",
    "_generated/course-spec",
  ];
  for (const profile of ["student", "full"] as const) {
    if (!await exists(join(root, `_quarto-${profile}.yml`))) {
      throw new OwnerFailure("SOURCE.MISSING_PROFILE", profile);
    }
    const info = await inspect(root, profile);
    profiles[profile] = info;
    documents[profile] = {};
    if (info.config.course?.view !== profile) {
      throw new OwnerFailure("SOURCE.PROFILE_VIEW_MISMATCH", {
        profile,
        view: info.config.course?.view,
      });
    }
    const project = info.config.project;
    if (!["default", "website", "book"].includes(project.type || "default")) {
      throw new OwnerFailure("SOURCE.PROJECT_TYPE_UNSUPPORTED", project.type);
    }
    if (project["output-dir"]) {
      const out = inside(root, project["output-dir"]);
      if (!out) throw new OwnerFailure("SOURCE.UNISOLATED_OUTPUT", out);
      excluded.push(out);
    } else throw new OwnerFailure("SOURCE.OUTPUT_DIR_REQUIRED", profile);
    const hooks = project["pre-render"] || [];
    const guard = delivery
      ? delivery + "/entrypoints/owner-freeze.ts"
      : relative(root, location.freezeGuardPath).replaceAll(
        "\\",
        "/",
      );
    // The facade supplies its installed location. Never add/reorder hooks silently.
    if (
      hooks.at(-1) !== guard ||
      hooks.filter((x: string) => x === guard).length !== 1
    ) {
      throw new OwnerFailure("SOURCE.FREEZE_GUARD_NOT_LAST", {
        profile,
        expected: guard,
        hooks,
      });
    }
    const filters = info.config.filters || [];
    // These adapters retain their own target/CUE declarations. Only their
    // known author chains are admitted; arbitrary installed filters stay closed.
    const adapterChain = [
      { filter: "course-cloud", adapter: "cloud" },
      { filter: "course-prairielearn", adapter: "prairielearn" },
    ].some(({ filter, adapter }) =>
      JSON.stringify(info.config.course?.adapters) ===
        JSON.stringify([adapter]) &&
      [
        ["course-core", filter],
        ["course-core", filter, "course-presentation"],
      ].some((chain) => JSON.stringify(filters) === JSON.stringify(chain))
    );
    if (
      JSON.stringify(filters) !==
        JSON.stringify(["course-core", "course-presentation"]) &&
      JSON.stringify(filters) !== JSON.stringify(["course-core"]) &&
      JSON.stringify(filters) !==
        JSON.stringify([
          "course-core",
          "course-presentation",
          "project-download",
        ]) &&
      !adapterChain
    ) throw new OwnerFailure("SOURCE.FILTER_ORDER_UNSUPPORTED", filters);
    for (const path of info.files.input) {
      const rel = inside(root, path);
      if (!rel.endsWith(".qmd")) {
        throw new OwnerFailure("SOURCE.INPUT_FORMAT_UNSUPPORTED", rel);
      }
      const resolvedDocument = await inspect(path, profile);
      documents[profile][rel] = resolvedDocument;
      const documentFilters = resolvedDocument.formats?.html?.pandoc?.filters;
      if (JSON.stringify(documentFilters) !== JSON.stringify(filters)) {
        throw new OwnerFailure("SOURCE.DOCUMENT_FILTERS_UNSUPPORTED", {
          source: rel,
          profile,
          filters: documentFilters,
        });
      }
      const previous = coverage[rel];
      if (previous && previous.kind !== "root") {
        throw new OwnerFailure("SOURCE.AMBIGUOUS_QMD", rel);
      }
      coverage[rel] = {
        kind: "root",
        profiles: [...(previous?.profiles || []), profile],
        evidence: "quarto inspect files.input",
      };
    }
  }
  // Register all roots first; then resolve only native inspect include/resource edges.
  for (const [profile, info] of Object.entries(profiles)) {
    for (const facts of Object.values(info.fileInformation) as any[]) {
      for (const edge of facts.includeMap || []) {
        const source = resolve(root, edge.source),
          target = resolve(dirname(source), edge.target),
          rel = inside(root, target);
        if (!await exists(target)) {
          throw new OwnerFailure("SOURCE.INCLUDE_NOT_RESOLVED", edge);
        }
        if (coverage[rel]?.kind === "root") {
          throw new OwnerFailure("SOURCE.AMBIGUOUS_QMD", {
            path: rel,
            roles: ["root", "include"],
          });
        }
        coverage[rel] = { kind: "include", evidence: { profile, edge } };
      }
    }
    for (const path of info.files.resources || []) {
      const rel = inside(root, path), actual = join(root, rel);
      if (!await exists(actual)) {
        throw new OwnerFailure("SOURCE.RESOURCE_NOT_RESOLVED", path);
      }
      const entries = (await Deno.stat(actual)).isDirectory
        ? await fileList(actual, [])
        : [""];
      for (const child of entries) {
        const resource = child ? inside(root, join(actual, child)) : rel;
        if (!resource.endsWith(".qmd")) continue;
        // Raw delivery is a separate native edge. Keep canonical navigation identity;
        // the CUE early gate rejects selecting these source bytes.
        if (coverage[resource] && coverage[resource].kind !== "resource") {
          continue;
        }
        coverage[resource] = { kind: "resource", evidence: { profile, path } };
      }
    }
  }
  // Freeze every externally located file exposed by the public inspect dependency list.
  // Runtime packages and arbitrary dynamic reads are outside this finite dependency proof.
  const dependencies: Record<string, string> = {};
  for (const info of Object.values(profiles)) {
    for (const path of info.files.config || []) inside(root, path);
    for (const path of info.files.configResources || []) {
      const actual = resolve(root, path);
      if (!(await Deno.stat(actual)).isFile) {
        throw new OwnerFailure("SOURCE.DEPENDENCY_NOT_FILE", actual);
      }
      dependencies[actual] = await digestFile(actual);
    }
  }
  const installedPayloads: string[] = [];
  for (const info of Object.values(profiles)) {
    for (const extension of info.extensions || []) {
      const rel = relative(root, resolve(root, extension.path));
      if (rel && rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel)) {
        installedPayloads.push(rel.replaceAll("\\", "/"));
      }
    }
  }
  let download: Audit["download"];
  if (
    Object.values(profiles).some((p: any) =>
      p.config.filters?.includes("project-download")
    )
  ) {
    const extension = delivery || inside(root, location.extensionPath);
    const owned = await inspectDownloads(root, extension, coverage);
    download = {
      helper: inside(root, owned.helper),
      directory: inside(root, owned.state.directory),
    };
    excluded.push(download.directory);
  }
  const uniqueExcluded = [...new Set(excluded)];
  for (const path of await fileList(root, uniqueExcluded)) {
    if (installedPayloads.some((p) => path.startsWith(p + "/"))) continue; // native installed payload, frozen by bytes below
    if (path.endsWith(".qmd") && !coverage[path]) {
      throw new OwnerFailure("SOURCE.UNCOVERED_QMD", path);
    }
  }
  let nativeListingProvider: NativeListingProviderBinding | undefined;
  let nativeListingPlans: NativeListingPlans | undefined;
  if (
    Object.values(documents).some((profile) =>
      Object.values(profile).some((document) =>
        document.formats?.html?.metadata?.listing !== undefined
      )
    )
  ) {
    try {
      nativeListingProvider = await resolveNativeListingProvider(quarto, {
        cwd: root,
      });
    } catch (error) {
      if (error instanceof NativeListingProviderFailure) {
        throw new OwnerFailure(error.code, error.message);
      }
      throw error;
    }
    nativeListingPlans = {};
    for (const [profile, project] of Object.entries(profiles)) {
      try {
        Object.assign(
          nativeListingPlans,
          await auditNativeListings({
            root,
            profile: profile as View,
            project,
            documents: documents[profile],
            provider: nativeListingProvider,
          }),
        );
      } catch (error) {
        if (error instanceof NativeListingFailure) {
          throw new OwnerFailure(error.code, error.cause);
        }
        throw error;
      }
    }
  }
  return {
    root,
    profiles,
    coverage,
    excluded: uniqueExcluded,
    dependencies,
    ...(nativeListingPlans
      ? { nativeListingPlans, nativeListingProvider }
      : {}),
    ...(download ? { download } : {}),
  };
}
export async function fingerprint(audit: Audit) {
  const files: Record<string, string> = {};
  for (const path of await fileList(audit.root, audit.excluded)) {
    files[path] = Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          await Deno.readFile(join(audit.root, path)),
        ),
      ),
    ).map((n) => n.toString(16).padStart(2, "0")).join("");
  }
  return files;
}
