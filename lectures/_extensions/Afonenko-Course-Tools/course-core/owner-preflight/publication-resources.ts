/** Scoped delivery receipt. Native artifact provenance does not certify child pedagogy. */
import {
  dirname,
  fromFileUrl,
  isAbsolute,
  join,
  relative,
  resolve,
} from "stdlib/path";
import { parse } from "./vendor/parse5/dist/index.js";
import { activeOwner, assertFrozen, preparedSession } from "./owner.ts";
import { OwnerFailure } from "./owner/failure.ts";
import { digestFile, exists, inspect, invoke } from "./owner/runtime.ts";
import type { PreparedOwner, Session } from "./owner/protocol.ts";
import {
  type OwnerResourceIndex,
  resourceHash,
  resourceNoLinks,
  resourceRelative,
  type RuntimeDeclaration,
  runtimeDeclarations,
  validateOwnerResources,
} from "./resources.ts";

import { sameSourceProjectionArtifact } from "./capture-projections.ts";
import { nativeListingPublicationGrants } from "./native-listing-addresses.ts";
export interface NavigationPublicationMember {
  path: string;
  mount: string;
  format: string;
  /** Actual native metadata context output, before mounting or QRC stage rewriting. */
  output: string;
  owner?: PreparedOwner;
}
export interface NavigationPublicationOptions {
  output: string;
  members: NavigationPublicationMember[];
}
interface FileWitness {
  path: string;
  sha256: string;
}
interface Grant extends FileWitness {
  kind: "owner" | "runtime" | "runtime-manifest" | "native-listing";
  member: string;
  source: string;
  proof: unknown;
}
type PublicationRuntimeDeclaration = Omit<RuntimeDeclaration, "kind"> & {
  kind: RuntimeDeclaration["kind"] | "manifest";
};
const here = dirname(fromFileUrl(import.meta.url));
function runtimeGrant(grant: Grant) {
  return grant.kind === "runtime" || grant.kind === "runtime-manifest";
}
export interface NavigationPublicationResourceReceipt {
  protocol: 1;
  root: string;
  attemptId: string;
  profile: "student" | "full";
  sessionId: string;
  sessionHash: string;
  navigationIndexHash: string;
  options: NavigationPublicationOptions;
  upstream: { member: string; indexHash: string; invocationId: string }[];
  artifacts: {
    member: string;
    source: string;
    native: FileWitness;
    stage: FileWitness;
  }[];
  grants: Grant[];
  files: FileWitness[];
  receiptHash: string;
}
function fail(code: string, cause: unknown): never {
  throw new OwnerFailure(code, cause);
}
function contains(root: string, path: string) {
  const rel = relative(root, path);
  return rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel);
}
async function canonicalDirectory(path: string) {
  if (
    !isAbsolute(path) || resolve(path) !== path || !await exists(path) ||
    await Deno.realPath(path) !== path || !(await Deno.stat(path)).isDirectory
  ) fail("RESOURCE.PUBLICATION_CONTEXT_INVALID", path);
  await resourceNoLinks("/", path);
}
async function fileTree(root: string): Promise<FileWitness[]> {
  await canonicalDirectory(root);
  const rows: FileWitness[] = [];
  async function visit(dir: string) {
    for await (const entry of Deno.readDir(dir)) {
      const path = join(dir, entry.name);
      if (entry.isSymlink) fail("RESOURCE.SYMLINK_UNSUPPORTED", path);
      if (entry.isDirectory) await visit(path);
      else if (entry.isFile) {
        rows.push({
          path: resourceRelative(root, path),
          sha256: await digestFile(path),
        });
      } else fail("RESOURCE.PUBLICATION_CONTEXT_INVALID", path);
    }
  }
  await visit(root);
  return rows.sort((a, b) => a.path.localeCompare(b.path));
}
interface HtmlElement {
  tagName: string;
  attrs: { name: string; value: string }[];
  childNodes?: HtmlElement[];
}
function tags(html: string): HtmlElement[] {
  const result: HtmlElement[] = [];
  function visit(node: any) {
    if (node.tagName) result.push(node);
    for (const child of node.childNodes || []) visit(child);
  }
  visit(parse(html, {}));
  return result;
}
function attr(node: HtmlElement, key: string) {
  return node.attrs.find((a) => a.name === key)?.value;
}
function runtimeTarget(output: string, html: string, uri: string | undefined) {
  if (!uri) fail("RESOURCE.RUNTIME_NATIVE_TARGET_INVALID", uri);
  let decoded: string;
  try {
    decoded = decodeURIComponent(uri.split(/[?#]/, 1)[0]);
  } catch {
    fail("RESOURCE.RUNTIME_NATIVE_TARGET_INVALID", uri);
  }
  if (
    !decoded || decoded.startsWith("/") || decoded.includes("\\") ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(decoded)
  ) fail("RESOURCE.RUNTIME_NATIVE_TARGET_INVALID", uri);
  return resourceRelative(output, resolve(dirname(html), decoded));
}
function memberSession(s: Session, path: string, native: any): Session {
  const prefix = resourceRelative(s.root, path) + "/";
  return {
    ...s,
    root: path,
    files: Object.fromEntries(
      Object.entries(s.files).filter(([key]) => key.startsWith(prefix)).map((
        [key, value],
      ) => [key.slice(prefix.length), value]),
    ),
    audit: { ...s.audit, root: path, profiles: { [s.profile]: native } },
  };
}
async function pluginDeclarations(
  s: Session,
  native: any,
): Promise<PublicationRuntimeDeclaration[]> {
  const extensions = (native.extensions || []).filter((x: any) =>
    x.id?.name === "course-navigation"
  );
  if (extensions.length > 1) {
    fail("RESOURCE.RUNTIME_PROVIDER_AMBIGUOUS", extensions);
  }
  const result: PublicationRuntimeDeclaration[] = [];
  for (const extension of extensions) {
    const dirs = extension.contributes?.["revealjs-plugins"] || [];
    if (dirs.length !== 1) {
      fail("RESOURCE.RUNTIME_DECLARATION_UNSUPPORTED", dirs);
    }
    const base = resolve(s.root, dirs[0]),
      descriptorPath = resourceRelative(s.root, join(base, "plugin.yml")),
      registrationPath = resourceRelative(
        s.root,
        join(extension.path, "_extension.yml"),
      );
    if (!s.files[descriptorPath] || !s.files[registrationPath]) {
      fail("RESOURCE.RUNTIME_DECLARATION_UNSUPPORTED", descriptorPath);
    }
    const descriptor = await readPublicNavigationManifest(
      join(s.root, descriptorPath),
    );
    if (
      descriptor.name !== "CourseNavigation" ||
      !Array.isArray(descriptor.script) ||
      !Array.isArray(descriptor.stylesheet) ||
      Object.keys(descriptor).some((k) =>
        !["name", "script", "stylesheet", "config"].includes(k)
      )
    ) fail("RESOURCE.RUNTIME_DECLARATION_UNSUPPORTED", descriptor);
    for (
      const [key, kind] of [["script", "script"], [
        "stylesheet",
        "stylesheet",
      ]] as const
    ) {
      for (const asset of descriptor[key]) {
        if (
          typeof asset !== "string" ||
          resourceRelative(base, resolve(base, asset)) !== asset
        ) fail("RESOURCE.RUNTIME_DECLARATION_UNSUPPORTED", asset);
        const source = resourceRelative(s.root, join(base, asset));
        if (!s.files[source]) fail("RESOURCE.RUNTIME_SOURCE_UNPROVEN", source);
        result.push({
          source,
          sourceSha256: s.files[source],
          producer: "course-navigation",
          dependency: descriptor.name,
          version: String(extension.version?.version || ""),
          asset,
          kind,
          descriptorPath,
          descriptorSha256: s.files[descriptorPath],
          registrationPath,
          registrationSha256: s.files[registrationPath],
          markerProvider: "",
          markerAsset: "",
        });
      }
    }
    result.push({
      source: descriptorPath,
      sourceSha256: s.files[descriptorPath],
      producer: "course-navigation",
      dependency: descriptor.name,
      version: String(extension.version?.version || ""),
      asset: "plugin.yml",
      kind: "manifest",
      descriptorPath,
      descriptorSha256: s.files[descriptorPath],
      registrationPath,
      registrationSha256: s.files[registrationPath],
      markerProvider: "",
      markerAsset: "",
    });
  }
  return result;
}
/** Fixed public transport reader; this alone grants no owner/publication capability. */
export async function readPublicNavigationManifest(path: string) {
  await resourceNoLinks("/", path);
  const cue = Deno.env.get("CUE") || "cue";
  const checked = await invoke(cue, [
    "vet",
    join(here, "navigation-runtime.cue"),
    path,
    "-d",
    "#PublicNavigationPlugin",
    "-c",
  ], dirname(path));
  if (checked.exitCode) {
    fail("RESOURCE.RUNTIME_DECLARATION_UNSUPPORTED", checked);
  }
  const parsed = await invoke(
    cue,
    ["export", path, "--out", "json"],
    dirname(path),
  );
  if (parsed.exitCode) fail("RESOURCE.RUNTIME_DECLARATION_UNSUPPORTED", parsed);
  const value = JSON.parse(parsed.stdout);
  const canonical = JSON.stringify({
    name: value.name,
    script: value.script,
    stylesheet: value.stylesheet,
    config: {
      scrollActivationWidth: value.config.scrollActivationWidth,
      courseNav: { sidebar: value.config.courseNav.sidebar },
    },
  }) + "\n";
  const bytes = await Deno.readFile(path),
    expected = new TextEncoder().encode(canonical);
  if (
    bytes.length !== expected.length ||
    bytes.some((value, index) => value !== expected[index])
  ) {
    fail("RESOURCE.RUNTIME_MANIFEST_NONCANONICAL", path);
  }
  return value;
}
async function finiteRuntime(s: Session, native: any) {
  return [
    ...await runtimeDeclarations(s),
    ...await pluginDeclarations(s, native),
  ];
}
async function runtimeWitnesses(
  s: Session,
  native: any,
  member: NavigationPublicationMember,
  artifacts: { source: string; path: string; document?: any }[],
  stage: string,
): Promise<Grant[]> {
  const rows = await finiteRuntime(s, native), result: Grant[] = [];
  for (const artifact of artifacts) {
    if (!artifact.path.endsWith(".html")) continue;
    const htmlPath = join(member.output, artifact.path),
      nodes = tags(await Deno.readTextFile(htmlPath));
    if (nodes.some((n) => n.tagName === "base")) {
      fail("RESOURCE.RUNTIME_NATIVE_TARGET_INVALID", htmlPath);
    }
    const current = artifact.document?.formats?.[member.format] ||
      artifact.document?.formats?.html;
    const configuredPlugin = (current?.metadata?.["revealjs-plugins"] ||
      current?.pandoc?.["revealjs-plugins"] ||
      native.config.format?.revealjs?.["revealjs-plugins"] ||
      native.config["revealjs-plugins"] || []).includes("course-navigation");
    for (const row of rows) {
      const presentation = row.producer === "course-presentation";
      if (
        presentation && !native.config.filters?.includes("course-presentation")
      ) continue;
      if (
        !presentation && (member.format !== "revealjs" || !configuredPlugin)
      ) continue;
      if (
        presentation &&
        (row.markerProvider !== row.producer || row.markerAsset !== row.asset ||
          row.dependency !== row.producer)
      ) fail("RESOURCE.RUNTIME_DECLARATION_UNSUPPORTED", row);
      if (row.kind === "manifest") {
        const runtime = result.filter((g) =>
          g.kind === "runtime" && g.member === member.path &&
          (g.proof as any).producer === row.producer &&
          (g.proof as any).nativeHtml === artifact.path
        );
        const directories = [
          ...new Set(
            runtime.map((g) => dirname((g.proof as any).nativeTarget)),
          ),
        ];
        if (runtime.length !== 4 || directories.length !== 1) {
          fail("RESOURCE.RUNTIME_NATIVE_WITNESS_REQUIRED", row);
        }
        const path = resourceRelative(
            member.output,
            join(member.output, directories[0], "plugin.yml"),
          ),
          actual = join(member.output, path),
          mounted = join(stage, member.mount, path);
        await resourceNoLinks(member.output, actual);
        await resourceNoLinks(stage, mounted);
        if (
          !await exists(actual) || !await exists(mounted) ||
          await digestFile(actual) !== row.sourceSha256 ||
          await digestFile(mounted) !== row.sourceSha256
        ) fail("RESOURCE.RUNTIME_NATIVE_BYTES_CHANGED", path);
        result.push({
          path: resourceRelative(stage, mounted),
          sha256: row.sourceSha256,
          kind: "runtime-manifest",
          member: member.path,
          source: row.source,
          proof: {
            ...row,
            nativeHtml: artifact.path,
            nativeHtmlSha256: await digestFile(htmlPath),
            nativeTarget: path,
            registeredAssets: runtime.map((g) => ({
              path: (g.proof as any).nativeTarget,
              sha256: g.sha256,
            })),
          },
        });
        continue;
      }
      const found = nodes.filter((node) => {
        if (node.tagName !== (row.kind === "script" ? "script" : "link")) {
          return false;
        }
        if (
          row.kind === "stylesheet" &&
          !(attr(node, "rel") || "").split(/\s+/).includes("stylesheet")
        ) return false;
        if (presentation) {
          return attr(node, "data-course-runtime-provider") === row.producer &&
            attr(node, "data-course-runtime-asset") === row.asset;
        }
        const uri = attr(node, row.kind === "script" ? "src" : "href");
        if (!uri) return false;
        const target = runtimeTarget(member.output, htmlPath, uri);
        // Public native registration gives the exact producer directory; native
        // revealjs writes that directory under its documented plugin carrier.
        return target.endsWith(
          "/revealjs/plugin/course-navigation/" + row.asset,
        );
      });
      if (found.length !== 1) {
        fail("RESOURCE.RUNTIME_NATIVE_WITNESS_REQUIRED", {
          htmlPath,
          row,
          count: found.length,
        });
      }
      const path = runtimeTarget(
        member.output,
        htmlPath,
        attr(found[0], row.kind === "script" ? "src" : "href"),
      );
      const actual = join(member.output, path),
        mounted = join(stage, member.mount, path);
      await resourceNoLinks(member.output, actual);
      await resourceNoLinks(stage, mounted);
      if (
        !await exists(actual) || !await exists(mounted) ||
        await digestFile(actual) !== row.sourceSha256 ||
        await digestFile(mounted) !== row.sourceSha256
      ) fail("RESOURCE.RUNTIME_NATIVE_BYTES_CHANGED", path);
      result.push({
        path: resourceRelative(stage, mounted),
        sha256: row.sourceSha256,
        kind: "runtime",
        member: member.path,
        source: row.source,
        proof: {
          ...row,
          nativeHtml: artifact.path,
          nativeHtmlSha256: await digestFile(htmlPath),
          nativeTarget: path,
        },
      });
    }
    for (const node of nodes) {
      if (
        attr(node, "data-course-runtime-provider") ||
        attr(node, "data-course-runtime-asset")
      ) {
        if (
          !rows.some((r) =>
            r.producer === "course-presentation" &&
            r.markerProvider === attr(node, "data-course-runtime-provider") &&
            r.markerAsset === attr(node, "data-course-runtime-asset")
          )
        ) fail("RESOURCE.RUNTIME_DECLARATION_UNSUPPORTED", node.attrs);
      }
    }
  }
  return result;
}
/** Existing HTML runtime registration proof, reused by a current Listing owner. */
export async function ownerHtmlRuntimeWitnesses(
  s: Session,
  output: string,
  artifacts: { source: string; path: string }[],
) {
  const active = await activeOwner(s.root);
  if (
    !active || active.phase !== "render" || active.output !== output ||
    !s.validated
  ) {
    fail(
      "RESOURCE.RUNTIME_NATIVE_WITNESS_REQUIRED",
      "current owner invocation",
    );
  }
  const expected = new Map<string, string>();
  for (
    const plan of Object.values(s.nativeListingPlans || {}).filter((plan) =>
      plan.profile === active.profile
    )
  ) {
    for (const writer of plan.selectedWriters) {
      expected.set(writer.source, writer.artifact);
    }
  }
  if (
    !expected.size || artifacts.length !== expected.size ||
    new Set(artifacts.map((artifact) => artifact.source)).size !==
      artifacts.length ||
    artifacts.some((artifact) =>
      expected.get(artifact.source) !== artifact.path
    )
  ) {
    fail(
      "RESOURCE.RUNTIME_NATIVE_WITNESS_REQUIRED",
      "selected current HTML writers",
    );
  }
  return await runtimeWitnesses(
    s,
    s.audit.profiles[active.profile],
    {
      path: s.root,
      mount: "",
      format: "html",
      output,
    },
    artifacts,
    output,
  );
}
async function build(p: PreparedOwner, options: NavigationPublicationOptions) {
  const s = await preparedSession(p);
  if (!s.audit.navigation) fail("RESOURCE.NAVIGATION_REQUIRED", p);
  const navIndex = await validateOwnerResources(p);
  const completion = JSON.parse(
    await Deno.readTextFile(
      join(p.root, ".course-owner/navigation-addresses.json"),
    ),
  );
  if (completion.publicationOutput !== options.output) {
    fail(
      "RESOURCE.PUBLICATION_CONTEXT_INVALID",
      "stage differs from finished navigation owner",
    );
  }
  await canonicalDirectory(options.output);
  if (
    contains(s.root, options.output) || contains(options.output, s.root) ||
    contains(s.audit.navigation.scope.portal.output, options.output) ||
    contains(options.output, s.audit.navigation.scope.portal.output)
  ) fail("RESOURCE.PUBLICATION_CONTEXT_INVALID", "overlapping stage");
  if (
    !Array.isArray(options.members) ||
    options.members.length !== s.audit.navigation.scope.members.length
  ) fail("RESOURCE.PUBLICATION_CONTEXT_INVALID", options);
  const grants: Grant[] = [],
    upstream: NavigationPublicationResourceReceipt["upstream"] = [],
    artifacts: NavigationPublicationResourceReceipt["artifacts"] = [],
    collisionArtifacts:
      (NavigationPublicationResourceReceipt["artifacts"][number] & {
        format: "html";
      })[] = [],
    indices: {
      path: string;
      index: OwnerResourceIndex;
      runtimeRoles: PublicationRuntimeDeclaration[];
    }[] = [];
  const used = new Set<string>();
  const destinations: NavigationPublicationMember[] = [];
  for (const member of options.members) {
    const declared = s.audit.navigation.scope.members.find((x) =>
        x.path === member.path
      ),
      facts = s.audit.navigation.members.find((x) =>
        join(s.root, x.path) === member.path
      );
    if (
      !declared || !facts || used.has(member.path) ||
      member.mount !== (declared.mount || facts.path) ||
      member.format !== (declared.format || "html") ||
      resourceRelative(options.output, join(options.output, member.mount)) !==
        member.mount
    ) fail("RESOURCE.PUBLICATION_CONTEXT_INVALID", member);
    used.add(member.path);
    if (
      destinations.some((previous) =>
        contains(previous.output, member.output) ||
        contains(member.output, previous.output) ||
        contains(
          join(options.output, previous.mount),
          join(options.output, member.mount),
        ) ||
        contains(
          join(options.output, member.mount),
          join(options.output, previous.mount),
        )
      )
    ) {
      fail(
        "RESOURCE.PUBLICATION_CONTEXT_INVALID",
        "overlapping member output/mount",
      );
    }
    destinations.push(member);
    await canonicalDirectory(member.output);
    if (
      contains(s.root, member.output) || contains(member.output, s.root) ||
      contains(options.output, member.output) ||
      contains(member.output, options.output) ||
      member.output === s.audit.navigation.scope.portal.output
    ) fail("RESOURCE.PUBLICATION_CONTEXT_INVALID", member.output);
    const childSession = memberSession(s, member.path, facts.native),
      memberArtifacts: NavigationPublicationResourceReceipt["artifacts"] = [],
      nativeArtifacts: { source: string; path: string; document: any }[] = [];
    for (const source of facts.native.files.input) {
      const document = await inspect(source, p.profile),
        format = document.formats?.[member.format] ||
          ((member.format === "html" || member.format === "revealjs")
            ? document.formats?.html
            : undefined),
        file = format?.pandoc?.["output-file"];
      if (typeof file !== "string" || !file) {
        fail("RESOURCE.NATIVE_ARTIFACT_UNSUPPORTED", {
          source,
          format: member.format,
        });
      }
      const path = resourceRelative(
          member.path,
          resolve(dirname(source), file),
        ),
        actual = join(member.output, path),
        mounted = join(options.output, member.mount, path);
      if (!await exists(actual) || !await exists(mounted)) {
        fail("RESOURCE.NATIVE_ARTIFACT_MISSING", { source, path });
      }
      await resourceNoLinks(member.output, actual);
      await resourceNoLinks(options.output, mounted);
      const artifact = {
        member: member.path,
        source: resourceRelative(member.path, source),
        native: { path, sha256: await digestFile(actual) },
        stage: {
          path: resourceRelative(options.output, mounted),
          sha256: await digestFile(mounted),
        },
      };
      artifacts.push(artifact);
      memberArtifacts.push(artifact);
      nativeArtifacts.push({ source, path, document });
    }
    grants.push(
      ...await runtimeWitnesses(
        childSession,
        facts.native,
        member,
        nativeArtifacts,
        options.output,
      ),
    );
    if (member.owner) {
      const child = await preparedSession(member.owner),
        index = await validateOwnerResources(member.owner),
        active = await activeOwner(member.path);
      if (
        child.root !== member.path || child.attemptId !== p.attemptId ||
        child.profile !== p.profile || !active ||
        active.output !== member.output
      ) fail("RESOURCE.PUBLICATION_OWNER_CONTEXT_INVALID", member);
      // Provenance rows alone cannot override a private projection denial.
      // Only this completed current HTML owner binds their actual output.
      if (member.format === "html") {
        collisionArtifacts.push(
          ...memberArtifacts.map((artifact) => ({
            ...artifact,
            format: "html" as const,
          })),
        );
      }
      upstream.push({
        member: member.path,
        indexHash: index.indexHash,
        invocationId: index.invocationId,
      });
      indices.push({
        path: member.path,
        index,
        runtimeRoles: await finiteRuntime(childSession, facts.native),
      });
      grants.push(
        ...(await nativeListingPublicationGrants(member.owner)).map((
          grant,
        ) => ({
          ...grant,
          kind: "native-listing" as const,
        })),
      );
      for (const policy of index.policy.files.filter((x) => x.allowed)) {
        const source = index.files.find((x) =>
          x.path === policy.path && x.sha256 === policy.sha256
        );
        if (!source) fail("RESOURCE.INVALID_INDEX", policy);
        const actual = join(member.output, policy.path),
          mounted = join(options.output, member.mount, policy.path);
        if (!await exists(actual) || !await exists(mounted)) continue;
        await resourceNoLinks(member.output, actual);
        await resourceNoLinks(options.output, mounted);
        if (
          await digestFile(actual) !== policy.sha256 ||
          await digestFile(mounted) !== policy.sha256
        ) fail("RESOURCE.PUBLICATION_OWNER_BYTES_CHANGED", policy.path);
        grants.push({
          path: resourceRelative(options.output, mounted),
          sha256: policy.sha256,
          kind: "owner",
          member: member.path,
          source: policy.path,
          proof: {
            indexHash: index.indexHash,
            invocationId: index.invocationId,
          },
        });
      }
    }
  }
  const rootRuntime = await finiteRuntime(s, s.audit.profiles[p.profile]),
    files = await fileTree(options.output);
  // An index cannot include its own serialized bytes. Its public accessor has
  // already validated these finite producer receipts; they remain private here.
  const privateReceipts: { path: string; sha256: string }[] = [];
  for (const root of [p.root, ...indices.map((scope) => scope.path)]) {
    for (
      const name of [
        "resources.json",
        "finished.json",
        "native-listing-addresses.json",
      ]
    ) {
      const path = join(root, ".course-owner", name);
      if (name === "native-listing-addresses.json" && !await exists(path)) {
        continue;
      }
      await resourceNoLinks(root, path);
      privateReceipts.push({ path, sha256: await digestFile(path) });
    }
  }
  const ownReceipt = receiptPath(p);
  if (await exists(ownReceipt)) {
    await resourceNoLinks(p.root, ownReceipt);
    privateReceipts.push({
      path: ownReceipt,
      sha256: await digestFile(ownReceipt),
    });
  }
  const portalPath = resourceRelative(
    completion.portalOutput,
    completion.portalArtifact.path,
  );
  const portalStage = join(options.output, portalPath);
  if (!await exists(portalStage)) {
    fail("RESOURCE.NATIVE_ARTIFACT_MISSING", portalPath);
  }
  await resourceNoLinks(options.output, portalStage);
  const portalArtifact = {
    member: p.root,
    source: resourceRelative(p.root, s.audit.navigation.scope.portal.input),
    native: { path: portalPath, sha256: completion.portalArtifact.sha256 },
    stage: { path: portalPath, sha256: await digestFile(portalStage) },
  };
  artifacts.push(portalArtifact);
  // validateOwnerResources already rechecks the completed native HTML portal.
  collisionArtifacts.push({ ...portalArtifact, format: "html" });
  const foreignRuntimeRoles = new Map<
    string,
    PublicationRuntimeDeclaration[]
  >();
  for (const file of files) {
    const privateReceipt = privateReceipts.find((receipt) =>
      receipt.sha256 === file.sha256
    );
    if (privateReceipt) {
      fail("RESOURCE.PUBLICATION_DENIED_BYTES", {
        source: privateReceipt.path,
        target: file.path,
      });
    }
    const exact = grants.filter((g) =>
      g.path === file.path && g.sha256 === file.sha256
    );
    for (
      const denied of navIndex.policy.files.filter((x) =>
        !x.allowed && x.sha256 === file.sha256
      )
    ) {
      const projection = navIndex.files.find((x) =>
        x.path === denied.path && x.sha256 === denied.sha256
      )?.captureProjection;
      if (
        projection && !denied.baselineClosedOnly && denied.reasons.every((r) =>
          r === "service"
        ) && collisionArtifacts.some((a) =>
          sameSourceProjectionArtifact(
            projection,
            projection.root,
            projection.source,
            a,
            file.path,
            file.sha256,
          )
        )
      ) continue;
      const foreignScope = [
        ...s.audit.navigation.members,
        ...s.audit.navigation.dormant,
      ].find((x) => denied.path.startsWith(x.path + "/"));
      const foreign = !!foreignScope;
      let foreignGrant = false;
      if (foreignScope) {
        foreignGrant = exact.some((g) =>
          g.kind === "owner" &&
          resourceRelative(s.root, join(g.member, g.source)) === denied.path
        );
        if (
          !denied.baselineClosedOnly &&
          denied.reasons.every((reason) => reason === "service")
        ) {
          foreignGrant ||= exact.some((grant) =>
            grant.kind === "native-listing" &&
            grant.member === join(s.root, foreignScope.path) &&
            grant.source.startsWith(".course-owner/native-listing/provider/") &&
            foreignScope.path + "/" + grant.source === denied.path
          );
        }
        for (const grant of exact.filter(runtimeGrant)) {
          const producer = (grant.proof as RuntimeDeclaration).producer;
          const key = foreignScope.path + ":" + producer;
          if (!foreignRuntimeRoles.has(key)) {
            const foreignSession = memberSession(
              s,
              join(s.root, foreignScope.path),
              foreignScope.native,
            );
            let roles: PublicationRuntimeDeclaration[] = [];
            try {
              roles = producer === "course-navigation"
                ? await pluginDeclarations(foreignSession, foreignScope.native)
                : await runtimeDeclarations(foreignSession);
            } catch (error) {
              if (
                !(error instanceof OwnerFailure) ||
                !error.code.startsWith("RESOURCE.RUNTIME_")
              ) throw error;
            }
            foreignRuntimeRoles.set(key, roles);
          }
          if (
            foreignRuntimeRoles.get(key)!.some((role) =>
              foreignScope.path + "/" + role.source === denied.path &&
              role.sourceSha256 === file.sha256 && role.producer === producer &&
              role.asset === (grant.proof as RuntimeDeclaration).asset
            )
          ) foreignGrant = true;
        }
      }
      const runtimeRole = rootRuntime.find((r) =>
        r.source === denied.path && r.sourceSha256 === file.sha256
      );
      if (
        !(foreign ? foreignGrant : runtimeRole && !denied.baselineClosedOnly &&
          denied.reasons.every((reason) => reason === "service") &&
          exact.some((g) =>
            runtimeGrant(g) &&
            (g.proof as any).producer === runtimeRole.producer &&
            (g.proof as any).asset === runtimeRole.asset
          ))
      ) {
        fail("RESOURCE.PUBLICATION_DENIED_BYTES", {
          source: denied.path,
          target: file.path,
        });
      }
    }
    for (const scope of indices) {
      for (
        const denied of scope.index.policy.files.filter((x) =>
          !x.allowed && x.sha256 === file.sha256
        )
      ) {
        if (
          !denied.baselineClosedOnly && denied.reasons.every((reason) =>
            reason === "service"
          ) && exact.some((grant) =>
            grant.kind === "native-listing" && grant.member === scope.path &&
            grant.source.startsWith(".course-owner/native-listing/provider/") &&
            grant.source === denied.path
          )
        ) continue;
        const projection = scope.index.files.find((x) =>
          x.path === denied.path && x.sha256 === denied.sha256
        )?.captureProjection;
        if (
          projection && !denied.baselineClosedOnly &&
          denied.reasons.every((r) => r === "service") &&
          collisionArtifacts.some((a) =>
            sameSourceProjectionArtifact(
              projection,
              scope.path,
              projection.source,
              a,
              file.path,
              file.sha256,
            )
          )
        ) {
          continue;
        }
        const runtime = scope.runtimeRoles.find((r) =>
          r.source === denied.path &&
          r.sourceSha256 === file.sha256
        );
        if (
          !runtime || denied.baselineClosedOnly ||
          denied.reasons.some((reason) => reason !== "service") ||
          !exact.some((g) =>
            runtimeGrant(g) &&
            (g.proof as any).producer === runtime.producer &&
            (g.proof as any).asset === runtime.asset
          )
        ) {
          fail("RESOURCE.PUBLICATION_DENIED_BYTES", {
            source: denied.path,
            target: file.path,
            owner: scope.path,
          });
        }
      }
    }
    // Public root bytes also remain bound to their observed path; no digest grant.
    for (
      const allowed of navIndex.policy.files.filter((x) =>
        x.allowed && x.sha256 === file.sha256
      )
    ) {
      if (allowed.path !== file.path && !exact.length) {
        fail("RESOURCE.PUBLICATION_DENIED_BYTES", {
          source: allowed.path,
          target: file.path,
        });
      }
    }
  }
  const unique = new Map<string, Grant>();
  for (const grant of grants) {
    const previous = unique.get(grant.path);
    if (previous && previous.sha256 !== grant.sha256) {
      fail("RESOURCE.PUBLICATION_CONTEXT_INVALID", grant);
    }
    unique.set(grant.path, grant);
  }
  return {
    protocol: 1 as const,
    root: p.root,
    attemptId: p.attemptId,
    profile: p.profile,
    sessionId: p.sessionId,
    sessionHash: p.sessionHash,
    navigationIndexHash: navIndex.indexHash,
    options,
    upstream,
    artifacts,
    grants: [...unique.values()].sort((a, b) => a.path.localeCompare(b.path)),
    files,
  };
}
function receiptPath(p: PreparedOwner) {
  return join(p.root, ".course-owner/publication-resources.json");
}
/** Call after current native children, QRC and owner finish; creates one producer-owned seal. */
export async function sealNavigationPublicationResources(
  p: PreparedOwner,
  options: NavigationPublicationOptions,
): Promise<NavigationPublicationResourceReceipt> {
  const body = await build(p, options),
    receipt = { ...body, receiptHash: await resourceHash(body) };
  await resourceNoLinks(p.root, receiptPath(p));
  await Deno.writeTextFile(receiptPath(p), JSON.stringify(receipt), {
    createNew: true,
  });
  return receipt;
}
/** Rechecks every sealed stage path/SHA and the current source/config/owner/runtime proofs. */
export async function validateNavigationPublicationResources(
  p: PreparedOwner,
): Promise<NavigationPublicationResourceReceipt> {
  await preparedSession(p);
  await assertFrozen(p.sessionPath);
  const path = receiptPath(p);
  await resourceNoLinks(p.root, path);
  if (!await exists(path)) {
    fail("RESOURCE.PUBLICATION_SEAL_REQUIRED", p.sessionId);
  }
  const receipt = JSON.parse(
      await Deno.readTextFile(path),
    ) as NavigationPublicationResourceReceipt,
    { receiptHash, ...body } = receipt;
  if (
    await resourceHash(body) !== receiptHash ||
    ["root", "attemptId", "profile", "sessionId", "sessionHash"].some((k) =>
      (receipt as any)[k] !== (p as any)[k]
    )
  ) fail("RESOURCE.PUBLICATION_RECEIPT_CHANGED", path);
  if (
    await resourceHash(await fileTree(receipt.options.output)) !==
      await resourceHash(receipt.files)
  ) fail("RESOURCE.PUBLICATION_STAGE_CHANGED", receipt.options.output);
  if (
    await resourceHash(await build(p, receipt.options)) !==
      await resourceHash(body)
  ) fail("RESOURCE.PUBLICATION_UPSTREAM_CHANGED", path);
  return receipt;
}
