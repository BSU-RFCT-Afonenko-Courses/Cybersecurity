/** Navigation-only owner; finite native artifact addresses, no child pedagogy certificate. */
import { dirname, isAbsolute, join, relative, resolve } from "stdlib/path";
import {
  activateOwner,
  activeOwner,
  assertFrozen,
  downloadOwnership,
  finishOwner,
  preparedSession,
  prepareOwnerSession,
} from "./owner.ts";
import { OwnerFailure } from "./owner/failure.ts";
import { digestFile, exists, inspect, sha } from "./owner/runtime.ts";
import type { Audit, PreparedOwner, Session } from "./owner/protocol.ts";
import {
  resolveResourceTarget,
  resourceHash,
  resourceNoLinks,
  type ResourceObservation,
} from "./resources.ts";
export { validateOwnerResources } from "./resources.ts";
export interface NavigationSelection {
  input: string;
  output: string;
  renderProfiles: string[];
  control: string;
  controlHash: string;
  configHashes: Record<string, string>;
}
export interface NavigationScope {
  portal: NavigationSelection;
  members: { path: string; format?: string; mount?: string }[];
}
export type PreparedNavigationOwner = PreparedOwner;
function fail(code: string, cause: unknown): never {
  throw new OwnerFailure(code, cause);
}
function local(root: string, path: string) {
  const rel = relative(root, resolve(root, path)).replaceAll("\\", "/");
  if (!rel || rel === ".." || rel.startsWith("../") || isAbsolute(rel)) {
    fail("SOURCE.NAVIGATION_DESCRIPTOR_INVALID", path);
  }
  return rel;
}
function contains(root: string, path: string) {
  const rel = relative(root, path);
  return rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel);
}
async function nativeDownload(
  path: string,
  native: any,
  profile: "student" | "full",
) {
  if (!native.config.filters?.includes("project-download")) return;
  const core = native.extensions?.find((x: any) =>
    x.id?.name === "course-core"
  );
  if (!core) fail("SOURCE.DOWNLOAD_OWNERSHIP_UNSUPPORTED", path);
  const coverage = Object.fromEntries(
    native.files.input.map((
      source: string,
    ) => [local(path, source), {
      kind: "root",
      profiles: [profile],
      evidence: "native member input",
    }]),
  );
  return await downloadOwnership(path, local(path, core.path), coverage);
}
/** Current mutable child producer files, obtained only from its public ownership API. */
export async function navigationDownloads(session: Session) {
  const result: { path: string; sha256: string }[] = [];
  const nav = session.audit.navigation;
  if (!nav) return result;
  for (const scope of nav.members) {
    const owned = await nativeDownload(
      join(session.root, scope.path),
      scope.native,
      session.profile,
    );
    if (owned) result.push(...owned.state.files);
  }
  return result;
}
async function files(root: string, excluded: string[]): Promise<string[]> {
  const result: string[] = [];
  async function visit(dir: string) {
    for await (const entry of Deno.readDir(dir)) {
      const path = join(dir, entry.name), rel = local(root, path);
      if (excluded.some((x) => rel === x || rel.startsWith(x + "/"))) continue;
      if (entry.isSymlink) fail("SOURCE.SYMLINK_UNSUPPORTED", rel);
      if (entry.isDirectory) await visit(path);
      else if (entry.isFile) result.push(rel);
    }
  }
  await visit(root);
  return result.sort();
}
export async function auditNavigation(
  root: string,
  extension: string,
  profile: "student" | "full",
  scope: NavigationScope,
): Promise<Audit> {
  const p = scope?.portal;
  if (
    !p || !Array.isArray(p.renderProfiles) ||
    p.renderProfiles.join(",") !== `${profile},publish-portal` ||
    !Array.isArray(scope.members) || !p.configHashes ||
    typeof p.configHashes !== "object" || Array.isArray(p.configHashes)
  ) fail("SOURCE.NAVIGATION_DESCRIPTOR_INVALID", scope);
  for (
    const path of [p.input, p.control, p.output, ...Object.keys(p.configHashes)]
  ) {
    if (
      typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path
    ) fail("SOURCE.NAVIGATION_DESCRIPTOR_INVALID", path);
  }
  const input = local(root, p.input), control = local(root, p.control);
  if (
    !input.endsWith(".qmd") || dirname(input) !== "." ||
    control !== "_quarto-publish-portal.yml" ||
    p.controlHash !== p.configHashes[p.control] ||
    await digestFile(p.control) !== p.controlHash
  ) fail("SOURCE.NAVIGATION_DESCRIPTOR_INVALID", p);
  if (contains(root, p.output) || contains(p.output, root)) {
    fail("SOURCE.UNISOLATED_OUTPUT", p.output);
  }
  await resourceNoLinks("/", p.output);
  await resourceNoLinks("/", p.output + "-capture");
  const original = await inspect(root, profile),
    info = await inspect(root, p.renderProfiles.join(","));
  if (
    original.files.input.length ||
    original.config.project["output-dir"] !== ".project-publish/native" ||
    info.config.project["output-dir"] !==
      original.config.project["output-dir"] ||
    info.dir !== root ||
    JSON.stringify(info.files.input) !== JSON.stringify([p.input]) ||
    info.config.course?.view !== profile || !info.config.course?.id
  ) {
    fail("SOURCE.NAVIGATION_SELECTION_MISMATCH", {
      original: original.files.input,
      actual: info.files.input,
    });
  }
  if (!["default", "website"].includes(info.config.project.type || "default")) {
    fail("SOURCE.PROJECT_TYPE_UNSUPPORTED", info.config.project.type);
  }
  if (info.engines?.some((engine: string) => engine !== "markdown")) {
    fail("SOURCE.NAVIGATION_COMPUTED_UNSUPPORTED", info.engines);
  }
  if (
    JSON.stringify(Object.keys(p.configHashes).sort()) !==
      JSON.stringify([...info.files.config].sort())
  ) fail("SOURCE.NAVIGATION_DESCRIPTOR_INVALID", "native config set");
  for (const [path, sha] of Object.entries(p.configHashes)) {
    local(root, path);
    if (!/^[0-9a-f]{64}$/.test(sha) || await digestFile(path) !== sha) {
      fail("SOURCE.NAVIGATION_DESCRIPTOR_INVALID", path);
    }
  }
  const filterSets = [["course-core"], ["course-core", "reference-catalog"]];
  if (
    !filterSets.some((chain) =>
      JSON.stringify(chain) === JSON.stringify(info.config.filters)
    )
  ) fail("SOURCE.FILTER_ORDER_UNSUPPORTED", info.config.filters);
  const installed = (info.extensions || []).filter((x: any) =>
    x.path && relative(root, x.path) !== ".." &&
    !relative(root, x.path).startsWith("../") &&
    !isAbsolute(relative(root, x.path))
  );
  const core = installed.find((x: any) =>
    x.id?.name === "course-core" && local(root, x.path) === extension
  );
  if (!core) fail("SOURCE.NAVIGATION_PROVIDER_MISSING", extension);
  const publisher = installed.find((x: any) =>
      x.id?.name === "project-publish"
    ),
    qrc = installed.find((x: any) => x.id?.name === "reference-catalog");
  if (
    info.config.filters.includes("reference-catalog") &&
    (!qrc ||
      JSON.stringify(
          qrc.contributes?.filters?.map((x: any) => ({
            path: local(root, x.path),
            at: x.at,
          })),
        ) !==
        JSON.stringify([{
          path: local(root, join(qrc.path, "lua/requests.lua")),
          at: "pre-ast",
        }, {
          path: local(root, join(qrc.path, "lua/probes.lua")),
          at: "post-ast",
        }]))
  ) fail("SOURCE.NAVIGATION_PROVIDER_MISSING", "reference-catalog");
  const guard = extension + "/entrypoints/owner-freeze.ts";
  const pre = info.config.project["pre-render"] || [],
    post = info.config.project["post-render"] || [];
  const allowedPre = [
    extension + "/entrypoints/pre.ts",
    ...(publisher ? [local(root, publisher.path) + "/entrypoints/pre.ts"] : []),
    guard,
  ];
  const allowedPost = [
    extension + "/entrypoints/post.ts",
    ...(publisher
      ? [local(root, publisher.path) + "/entrypoints/post.ts"]
      : []),
  ];
  if (
    !Array.isArray(pre) || pre.at(-1) !== guard ||
    new Set(pre).size !== pre.length ||
    pre.some((x: string) => !allowedPre.includes(x)) || !Array.isArray(post) ||
    new Set(post).size !== post.length ||
    post.some((x: string) => !allowedPost.includes(x))
  ) fail("SOURCE.NAVIGATION_HOOKS_UNSUPPORTED", { pre, post });
  const doc = await inspect(p.input, p.renderProfiles.join(","));
  if (
    JSON.stringify(doc.formats?.html?.pandoc?.filters) !==
      JSON.stringify(info.config.filters)
  ) {
    fail(
      "SOURCE.DOCUMENT_FILTERS_UNSUPPORTED",
      doc.formats?.html?.pandoc?.filters,
    );
  }
  const coverage: Audit["coverage"] = {
    [input]: {
      kind: "root",
      profiles: [profile],
      evidence: "actual composite quarto inspect files.input",
    },
  };
  const dependencies: Record<string, string> = {};
  const excluded = [
    ".git",
    ".quarto",
    "_freeze",
    ".course-owner",
    "_generated/course-spec",
    ".project-publish/native",
  ];
  const memberFacts: any[] = [],
    addresses: {
      target: string;
      member: string;
      source: string;
      format: string;
    }[] = [],
    rootAddresses: NonNullable<Audit["navigation"]>["rootAddresses"] = [];
  for (const member of scope.members) {
    if (!member || typeof member.path !== "string") {
      fail("SOURCE.NAVIGATION_DESCRIPTOR_INVALID", member);
    }
    const path = resolve(root, member.path), rel = local(root, path);
    if (
      await Deno.realPath(path) !== path || memberFacts.some((x) =>
        rel === x.path || rel.startsWith(x.path + "/") ||
        x.path.startsWith(rel + "/")
      ) || installed.some((x: any) =>
        rel === local(root, x.path) || rel.startsWith(local(root, x.path) + "/")
      ) ||
      !await exists(join(path, "_quarto.yml")) &&
        !await exists(join(path, "_quarto.yaml"))
    ) {
      fail("SOURCE.NAVIGATION_MEMBER_BOUNDARY_INVALID", rel);
    }
    const native = await inspect(path, profile);
    if (
      native.dir !== path ||
      !native.files.config.some((x: string) =>
        dirname(x) === path &&
        ["_quarto.yml", "_quarto.yaml"].includes(x.slice(path.length + 1))
      )
    ) {
      fail("SOURCE.NAVIGATION_MEMBER_BOUNDARY_INVALID", rel);
    }
    const known = new Set<string>(
      native.files.input.map((x: string) =>
        local(root, x)
      ),
    );
    if (member.format && ["html", "pdf"].includes(member.format)) {
      if (
        typeof member.mount !== "string" ||
        member.mount !== local(root, resolve(root, member.mount))
      ) fail("SOURCE.NAVIGATION_MEMBER_BOUNDARY_INVALID", member);
      for (const source of native.files.input) {
        const resolved = await inspect(source, profile),
          file = resolved.formats?.[member.format]?.pandoc?.["output-file"];
        // Nested native members remain in the frozen scope; QRC certifies their
        // addresses. The initial plain-Link seam binds only top-level artifacts.
        if (
          typeof file !== "string" || !file || isAbsolute(file) ||
          local(path, resolve(path, file)) !== file ||
          dirname(local(path, source)) !== "."
        ) continue;
        const target = member.mount + "/" + file;
        if (
          addresses.some((x) =>
            x.target === target && (x.member !== rel || x.source !== source)
          )
        ) fail("SOURCE.NAVIGATION_ADDRESS_AMBIGUOUS", target);
        addresses.push({ target, member: rel, source, format: member.format });
      }
    }
    // Root Links can name every finite mounted native writer. Keep the
    // original top-level HTML/PDF addresses above for child foreign transport.
    if (member.format && ["html", "pdf", "revealjs"].includes(member.format)) {
      if (
        typeof member.mount !== "string" ||
        member.mount !== local(root, resolve(root, member.mount))
      ) fail("SOURCE.NAVIGATION_MEMBER_BOUNDARY_INVALID", member);
      for (const source of native.files.input) {
        if (
          typeof source !== "string" || !isAbsolute(source) ||
          resolve(source) !== source || !contains(path, source) ||
          await Deno.realPath(source) !== source ||
          !(await Deno.lstat(source)).isFile
        ) fail("SOURCE.NAVIGATION_MEMBER_BOUNDARY_INVALID", source);
        const document = await inspect(source, profile),
          format = document.formats?.[member.format] ||
            ((member.format === "html" || member.format === "revealjs")
              ? document.formats?.html
              : undefined),
          file = format?.pandoc?.["output-file"];
        if (
          typeof file !== "string" || !file || isAbsolute(file) ||
          file.includes("\\") ||
          file.split("/").some((part: string) =>
            !part || part === "." || part === ".."
          )
        ) fail("SOURCE.NAVIGATION_ADDRESS_UNSUPPORTED", { source, file });
        const writer = resolve(dirname(source), file);
        if (!contains(path, writer)) {
          fail("SOURCE.NAVIGATION_MEMBER_BOUNDARY_INVALID", writer);
        }
        const target = member.mount + "/" + local(path, writer);
        if (rootAddresses.some((x) => x.target === target)) {
          fail("SOURCE.NAVIGATION_ADDRESS_AMBIGUOUS", target);
        }
        rootAddresses.push({
          target,
          member: rel,
          source,
          format: member.format,
        });
      }
    }
    for (const x of Object.values(native.fileInformation || {}) as any[]) {
      for (const edge of x.includeMap || []) {
        known.add(
          local(
            root,
            resolve(dirname(resolve(path, edge.source)), edge.target),
          ),
        );
      }
    }
    for (const resource of native.files.resources || []) {
      const absolute = resolve(path, resource);
      const child = (await Deno.stat(absolute)).isDirectory
        ? await files(absolute, [])
        : [""];
      for (const file of child) {
        known.add(local(root, file ? join(absolute, file) : absolute));
      }
    }
    const payloads = (native.extensions || []).map((x: any) =>
      resolve(path, x.path)
    );
    const memberExcluded = [
      ".git",
      ".quarto",
      "_freeze",
      ".course-owner",
      "_generated/course-spec",
    ];
    const owned = await nativeDownload(path, native, profile);
    const download = owned
      ? {
        helper: local(root, owned.helper),
        directory: local(root, owned.state.directory),
      }
      : undefined;
    if (download) excluded.push(download.directory);
    if (owned) memberExcluded.push(local(path, owned.state.directory));
    excluded.push(...memberExcluded.map((x) => rel + "/" + x));
    if (native.config.project["output-dir"]) {
      const out = local(
        path,
        resolve(path, native.config.project["output-dir"]),
      );
      memberExcluded.push(out);
      excluded.push(rel + "/" + out);
    }
    for (const file of await files(path, memberExcluded)) {
      if (
        file.endsWith(".qmd") && !known.has(rel + "/" + file) &&
        !payloads.some((x: string) => join(path, file).startsWith(x + "/"))
      ) fail("SOURCE.UNCOVERED_QMD", rel + "/" + file);
    }
    for (const dependency of native.files.configResources || []) {
      const actual = resolve(path, dependency);
      if (!(await Deno.stat(actual)).isFile) {
        fail("SOURCE.DEPENDENCY_NOT_FILE", actual);
      }
      dependencies[actual] = await digestFile(actual);
    }
    memberFacts.push({
      path: rel,
      native,
      configHashes: Object.fromEntries(
        await Promise.all(
          native.files.config.map(async (
            x: string,
          ) => [x, await digestFile(x)]),
        ),
      ),
      ...(download ? { download } : {}),
    });
  }
  for (const facts of Object.values(info.fileInformation || {}) as any[]) {
    if (facts.codeCells?.length || facts.metadata?.engine) {
      fail("SOURCE.NAVIGATION_COMPUTED_UNSUPPORTED", facts);
    }
    for (const edge of facts.includeMap || []) {
      const target = local(
        root,
        resolve(dirname(resolve(root, edge.source)), edge.target),
      );
      const targetProject =
        (await inspect(join(root, target), profile)).project;
      const nativeRoot = targetProject?.dir
        ? (await inspect(targetProject.dir, profile)).dir
        : undefined;
      if (nativeRoot !== root) {
        fail("SOURCE.NAVIGATION_INCLUDE_BOUNDARY_INVALID", {
          target,
          nativeRoot,
        });
      }
      if (coverage[target]?.kind === "root") {
        fail("SOURCE.AMBIGUOUS_QMD", target);
      }
      coverage[target] = { kind: "include", evidence: edge };
    }
  }
  for (const path of info.files.configResources || []) {
    const actual = resolve(root, path);
    if (!(await Deno.stat(actual)).isFile) {
      fail("SOURCE.DEPENDENCY_NOT_FILE", actual);
    }
    dependencies[actual] = await digestFile(actual);
  }
  for (const resource of info.files.resources || []) {
    const absolute = resolve(root, resource);
    local(root, absolute);
    const child = (await Deno.stat(absolute)).isDirectory
      ? await files(absolute, [])
      : [""];
    for (const file of child) {
      const path = local(root, file ? join(absolute, file) : absolute);
      if (path.endsWith(".qmd") && !coverage[path]) {
        // A native resource edge cannot promote an independent project to this
        // root's source coverage or suppress dormant boundary discovery.
        const documentRoot = (await inspect(join(root, path), profile)).project
          ?.dir;
        const nativeRoot = documentRoot
          ? (await inspect(documentRoot, profile)).dir
          : undefined;
        if (nativeRoot === root) {
          coverage[path] = { kind: "resource", evidence: resource };
        }
      }
    }
  }
  const dormant: any[] = [];
  for (const path of await files(root, excluded)) {
    if (
      !path.endsWith(".qmd") || coverage[path] || memberFacts.some((x) =>
        path.startsWith(x.path + "/")
      ) ||
      installed.some((x: any) => path.startsWith(local(root, x.path) + "/")) ||
      excluded.some((x) => path.startsWith(x + "/"))
    ) continue;
    const resolved = await inspect(join(root, path), profile),
      documentProject = resolved.project;
    if (
      typeof documentProject?.dir !== "string" ||
      !isAbsolute(documentProject.dir) ||
      resolve(documentProject.dir) !== documentProject.dir ||
      documentProject.dir === root || !contains(root, documentProject.dir) ||
      await Deno.realPath(documentProject.dir) !== documentProject.dir
    ) fail("SOURCE.UNCOVERED_QMD", path);
    // Excluded documents have a reduced standalone project envelope. Resolve
    // that public dir with project inspect. Its owning native root can be an
    // ancestor; only its actual config proves the independent dormant boundary.
    const native = await inspect(documentProject.dir, profile);
    const nativeConfig = Array.isArray(native.files?.config)
      ? native.files.config.find((x: unknown) =>
        typeof x === "string" && isAbsolute(x) && resolve(x) === x &&
        dirname(x) === native.dir &&
        ["_quarto.yml", "_quarto.yaml"].includes(x.slice(native.dir.length + 1))
      )
      : undefined;
    if (
      typeof native.dir !== "string" || !isAbsolute(native.dir) ||
      resolve(native.dir) !== native.dir || native.dir === root ||
      !contains(root, native.dir) ||
      !contains(native.dir, documentProject.dir) ||
      !contains(native.dir, join(root, path)) ||
      await Deno.realPath(native.dir) !== native.dir ||
      !nativeConfig || await Deno.realPath(nativeConfig) !== nativeConfig ||
      !(await Deno.lstat(nativeConfig)).isFile
    ) fail("SOURCE.UNCOVERED_QMD", path);
    const rel = local(root, native.dir);
    if (
      memberFacts.some((x) =>
        contains(join(root, x.path), native.dir) ||
        contains(native.dir, join(root, x.path))
      )
    ) fail("SOURCE.NAVIGATION_MEMBER_BOUNDARY_INVALID", rel);
    if (!dormant.some((x) => x.path === rel)) {
      const identity = {
        path: rel,
        native,
        configHashes: Object.fromEntries(
          await Promise.all(
            native.files.config.map(async (
              x: string,
            ) => [x, await digestFile(x)]),
          ),
        ),
      };
      // Dormant projects do not execute in this attempt. Freeze their producer
      // state as source bytes; no mutable exemption or installed provider needed.
      dormant.push(identity);
      excluded.push(
        ...[".git", ".quarto", "_freeze"].map((x) => rel + "/" + x),
      );
      for (const dependency of native.files.configResources || []) {
        const actual = resolve(native.dir, dependency);
        if (!(await Deno.stat(actual)).isFile) {
          fail("SOURCE.DEPENDENCY_NOT_FILE", actual);
        }
        dependencies[actual] = await digestFile(actual);
      }
    }
  }
  dormant.sort((a, b) => a.path.localeCompare(b.path));
  return {
    root,
    profiles: { [profile]: info },
    coverage,
    excluded: [...new Set(excluded)].sort(),
    dependencies,
    navigation: {
      profile,
      scope,
      document: doc,
      members: memberFacts,
      dormant,
      addresses,
      rootAddresses,
    },
  };
}
export async function prepareNavigationOwner(
  root: string,
  options: {
    attemptId: string;
    profile: "student" | "full";
    extension?: string;
    portal: NavigationSelection;
    members: NavigationScope["members"];
  },
): Promise<PreparedNavigationOwner> {
  return prepareOwnerSession(root, {
    attemptId: options.attemptId,
    profile: options.profile,
    extension: options.extension,
    navigation: { portal: options.portal, members: options.members },
  });
}
export async function activateNavigationOwner(handle: PreparedNavigationOwner) {
  const session = await preparedSession(handle);
  if (!session.audit.navigation) {
    fail("SOURCE.NAVIGATION_DESCRIPTOR_INVALID", "ordinary owner handle");
  }
  return activateOwner(handle, {
    output: session.audit.navigation.scope.portal.output,
  });
}
export async function finishNavigationOwner(
  handle: PreparedNavigationOwner,
  options: { output?: string } = {},
) {
  const session = await preparedSession(handle),
    nav = session.audit.navigation,
    active = await activeOwner(handle.root);
  if (!nav || !active || active.phase !== "render") {
    fail(
      "SOURCE.NAVIGATION_DESCRIPTOR_INVALID",
      "missing actual navigation invocation",
    );
  }
  await assertFrozen(handle.sessionPath);
  if (
    options.output !== undefined &&
    (typeof options.output !== "string" || !isAbsolute(options.output) ||
      resolve(options.output) !== options.output ||
      await Deno.realPath(options.output) !== options.output)
  ) {
    fail("SOURCE.NAVIGATION_ADDRESS_MISSING", "publication stage identity");
  }
  const actual = join(
    handle.root,
    ".course-owner/render",
    handle.profile,
    await sha(local(handle.root, nav.scope.portal.input)) + ".json",
  );
  if (!await exists(actual)) {
    fail("SOURCE.RECONCILIATION_MISSING", nav.scope.portal.input);
  }
  const observation = JSON.parse(await Deno.readTextFile(actual))
    .resources as ResourceObservation;
  if (typeof observation.outputFile !== "string") {
    fail("SOURCE.NAVIGATION_ADDRESS_MISSING", "native portal output-file");
  }
  const nativeFile = nav.document.formats?.html?.pandoc?.["output-file"];
  if (
    typeof nativeFile !== "string" || !nativeFile || isAbsolute(nativeFile) ||
    local(handle.root, resolve(handle.root, nativeFile)) !== nativeFile ||
    ![
      resolve(handle.root, nativeFile),
      resolve(active.output, nativeFile),
    ].includes(resolve(handle.root, observation.outputFile))
  ) {
    fail(
      "SOURCE.NAVIGATION_ADDRESS_MISSING",
      "native portal output-file mismatch",
    );
  }
  // Native quarto.doc.output_file may identify the source-relative writer file;
  // output_directory supplies its actual --output-dir destination.
  const portalArtifact = resolve(active.output, nativeFile);
  local(active.output, portalArtifact);
  await resourceNoLinks(active.output, portalArtifact);
  if (
    !await exists(portalArtifact) || !(await Deno.stat(portalArtifact)).isFile
  ) fail("SOURCE.NAVIGATION_ADDRESS_MISSING", "native portal artifact");
  const bindings: {
    target: string;
    member: string;
    source: string;
    format: string;
    sha256: string;
  }[] = [];
  for (const use of observation.projected) {
    const localTarget = await resolveResourceTarget(
        handle.root,
        observation,
        use,
      ),
      address = use.kind === "Link" &&
        nav.rootAddresses.find((x) => x.target === localTarget?.path);
    if (!address || bindings.some((x) => x.target === address.target)) continue;
    if (
      typeof options.output !== "string" || !isAbsolute(options.output) ||
      resolve(options.output) !== options.output ||
      await Deno.realPath(options.output) !== options.output
    ) fail("SOURCE.NAVIGATION_ADDRESS_MISSING", address.target);
    const path = join(options.output, address.target);
    local(options.output, path);
    await resourceNoLinks(options.output, path);
    if (!await exists(path) || !(await Deno.stat(path)).isFile) {
      fail("SOURCE.NAVIGATION_ADDRESS_MISSING", address.target);
    }
    bindings.push({ ...address, sha256: await digestFile(path) });
  }
  const receipt = {
    ...handle,
    invocationId: active.invocationId,
    portalOutput: active.output,
    portalArtifact: {
      path: portalArtifact,
      sha256: await digestFile(portalArtifact),
    },
    descriptorHash: await resourceHash(nav),
    actualHash: await digestFile(actual),
    publicationOutput: options.output || null,
    bindings,
  };
  const receiptPath = join(
    handle.root,
    ".course-owner/navigation-addresses.json",
  );
  await Deno.writeTextFile(receiptPath, JSON.stringify(receipt), {
    createNew: true,
  });
  return finishOwner(handle);
}
/** Called by the common finish/resource lifecycle, including ordinary public accessors. */
export async function validateNavigationCompletion(handle: PreparedOwner) {
  const session = await preparedSession(handle), nav = session.audit.navigation;
  if (!nav) return;
  const active = await activeOwner(handle.root),
    path = join(handle.root, ".course-owner/navigation-addresses.json");
  if (!active || !await exists(path)) {
    fail("SOURCE.NAVIGATION_FINISH_REQUIRED", handle.sessionId);
  }
  await resourceNoLinks(handle.root, path);
  const receipt = JSON.parse(await Deno.readTextFile(path));
  const actual = join(
    handle.root,
    ".course-owner/render",
    handle.profile,
    await sha(local(handle.root, nav.scope.portal.input)) + ".json",
  );
  if (
    Object.keys(handle).some((k) =>
      receipt[k] !== handle[k as keyof PreparedOwner]
    ) || receipt.invocationId !== active.invocationId ||
    receipt.portalOutput !== active.output ||
    receipt.descriptorHash !== await resourceHash(nav) ||
    receipt.actualHash !== await digestFile(actual) ||
    !Array.isArray(receipt.bindings)
  ) fail("SOURCE.NAVIGATION_ADDRESS_CHANGED", path);
  if (
    !receipt.portalArtifact ||
    typeof receipt.portalArtifact.path !== "string" ||
    !contains(active.output, receipt.portalArtifact.path)
  ) fail("SOURCE.NAVIGATION_ADDRESS_CHANGED", "portal artifact");
  await resourceNoLinks(active.output, receipt.portalArtifact.path);
  if (
    !await exists(receipt.portalArtifact.path) ||
    await digestFile(receipt.portalArtifact.path) !==
      receipt.portalArtifact.sha256
  ) fail("SOURCE.NAVIGATION_ADDRESS_CHANGED", "portal artifact");
  for (const binding of receipt.bindings) {
    if (
      !nav.rootAddresses.some((x) =>
        x.target === binding.target && x.member === binding.member &&
        x.source === binding.source && x.format === binding.format
      ) || typeof receipt.publicationOutput !== "string"
    ) fail("SOURCE.NAVIGATION_ADDRESS_CHANGED", binding);
    const file = join(receipt.publicationOutput, binding.target);
    local(receipt.publicationOutput, file);
    await resourceNoLinks(receipt.publicationOutput, file);
    if (
      !await exists(file) ||
      await Deno.realPath(receipt.publicationOutput) !==
        receipt.publicationOutput ||
      await digestFile(file) !== binding.sha256
    ) fail("SOURCE.NAVIGATION_ADDRESS_CHANGED", binding.target);
  }
}
