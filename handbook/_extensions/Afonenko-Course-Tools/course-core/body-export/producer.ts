import { dirname, join, relative, resolve } from "stdlib/path";
import {
  activeOwner,
  assertFrozen,
  preparedSession,
} from "../owner-preflight/owner.ts";
import { OwnerFailure } from "../owner-preflight/owner/failure.ts";
import { digestFile, invoke, sha } from "../owner-preflight/owner/runtime.ts";
import type {
  Audit,
  Invocation,
  PreparedOwner,
  Session,
} from "../owner-preflight/owner/protocol.ts";
import {
  type OwnerResourceFile,
  resolveResourceEvidence,
  resourceHash,
  resourceNoLinks,
  resourceObservations,
  resourcePolicy,
  type ResourceSeal,
  sourceResourceFiles,
  validateOwnerResources,
} from "../owner-preflight/resources.ts";
import { projectChoice, validateAnswer } from "./answer.ts";
import type {
  BodyPackage,
  BodyQuestion,
  BodyReceipt,
  BodySeal,
  BodySelection,
  NativeAnswerProjection,
  Node,
  OwnerBodyHandle,
  PublicBodyPackage,
} from "./model.ts";
export type {
  BodyPackage,
  BodyReceipt,
  OwnerBodyHandle,
  PublicBodyPackage,
} from "./model.ts";

function fail(code: string, detail: unknown): never {
  throw new OwnerFailure(code, detail);
}
const canonical = (path: unknown): path is string =>
  typeof path === "string" && !!path && !/[\\\x00]/.test(path) &&
  !path.startsWith("/") && !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(path) &&
  !path.split("/").some((part) => ["", ".", ".."].includes(part));

export async function selectBodies(
  audit: Audit,
  option: { sources: string[]; release?: string } | undefined,
  attemptId: string,
): Promise<BodySelection | undefined> {
  if (option === undefined) return;
  if (
    !option ||
    Object.keys(option).some((key) => !["sources", "release"].includes(key)) ||
    !Array.isArray(option.sources) || !option.sources.length ||
    new Set(option.sources).size !== option.sources.length ||
    option.sources.some((source) =>
      !canonical(source) || !source.endsWith(".qmd") ||
      audit.coverage[source]?.kind !== "root" ||
      !(["student", "full"] as const).every((profile) =>
        audit.coverage[source].profiles?.includes(profile)
      )
    )
  ) {
    fail("BODY.SELECTION_INVALID", option);
  }
  if (
    Object.values(audit.profiles).some((p) => {
      const project = p.config?.project;
      return !project || typeof project !== "object" ||
        Array.isArray(project) ||
        !["default", "book"].includes(
          project.type === undefined ? "default" : project.type,
        );
    })
  ) {
    fail(
      "BODY.PROJECT_UNSUPPORTED",
      "body export requires a same-owner native default or book project",
    );
  }
  for (const profile of ["student", "full"]) {
    for (const source of option.sources) {
      const metadata = audit.profiles[profile].fileInformation?.[source]
        ?.metadata;
      if (
        metadata?.jupyter || metadata?.engine && metadata.engine !== "knitr"
      ) {
        fail("BODY.ENGINE_UNSUPPORTED", { source, profile });
      }
    }
  }
  const release = option.release ?? attemptId;
  if (typeof release !== "string" || !release.trim()) {
    fail("BODY.RELEASE_INVALID", release);
  }
  const selection = { sources: [...option.sources], release };
  return { ...selection, selectionHash: await resourceHash(selection) };
}

export async function validateBodySelection(
  selection: BodySelection,
  audit: Audit,
  attemptId: string,
) {
  const expected = await selectBodies(audit, {
    sources: selection.sources,
    release: selection.release,
  }, attemptId);
  if (!expected || JSON.stringify(selection) !== JSON.stringify(expected)) {
    fail("BODY.SELECTION_CHANGED", selection);
  }
}

export async function bodyServicePaths(
  s: Session,
  invocation?: Invocation,
): Promise<string[]> {
  if (!s.body || !invocation) return [];
  return [
    ".course-owner/body/package.json",
    ".course-owner/body/public.json",
    ".course-owner/body/receipt.json",
    ...await Promise.all(
      s.body.sources.map(async (source) =>
        `.course-owner/body/seal-${await sha(
          invocation.profile + ":" + source,
        )}.json`
      ),
    ),
  ];
}

function attributes(node: any): any[] | undefined {
  if (node?.t === "Header") return node.c[1];
  if (
    ["Div", "Span", "Code", "CodeBlock", "Link", "Image", "Table", "Figure"]
      .includes(node?.t)
  ) return node.c[0];
}
function visit(value: any, callback: (node: Node) => void) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item) => visit(item, callback));
    return;
  }
  if (value.t) callback(value);
  for (const child of Object.values(value)) {
    if (child && typeof child === "object") visit(child, callback);
  }
}
const allowed = new Set(
  "Str Space SoftBreak LineBreak Emph Strong Underline Strikeout Superscript Subscript SmallCaps Quoted Code Math Link Image Span Para Plain BlockQuote OrderedList BulletList DefinitionList HorizontalRule Table Figure Header Div CodeBlock AlignLeft AlignRight AlignCenter AlignDefault ColWidth ColWidthDefault Decimal DefaultStyle DefaultDelim Period OneParen TwoParens InlineMath DisplayMath SingleQuote DoubleQuote"
    .split(" "),
);
function assertSupported(value: any) {
  visit(value, (node) => {
    if (!allowed.has(node.t)) fail("BODY.CAPABILITY_UNSUPPORTED", node.t);
    const attr = attributes(node);
    if (
      attr && (attr[0] || attr[1].some((name: string) =>
        [
          "correct",
          "answer-spec",
          "grading-notes",
          "solution",
          "demo-sol",
          "control",
        ].includes(name) ||
        name.startsWith("quarto-shortcode") || /^(when-|unless-)/.test(name) ||
        ["content-visible", "content-hidden"].includes(name)
      ))
    ) {
      fail(
        "BODY.CAPABILITY_UNSUPPORTED",
        "authored anchor, closed marker or unclaimed carrier",
      );
    }
    if (node.t === "Math" && /\\label\s*\{|#eq-|\\ref\s*\{/.test(node.c[1])) {
      fail("BODY.CAPABILITY_UNSUPPORTED", "labelled math");
    }
    if (node.t === "Link" || node.t === "Image") {
      const target = node.c[2][0];
      if (node.t === "Link" && /^https?:\/\//.test(target)) return;
      if (!canonical(target) || /[?#]/.test(target)) {
        fail("BODY.CAPABILITY_UNSUPPORTED", target);
      }
    }
  });
}

async function cue(
  s: Session,
  file: string,
  value: unknown,
  expression?: string,
) {
  const path = join(
    s.root,
    ".course-owner",
    `body-cue-${crypto.randomUUID()}.json`,
  );
  await Deno.writeTextFile(path, JSON.stringify(value));
  const schema = join(s.root, s.extension, "body-export", file),
    executable = Deno.env.get("CUE") || "cue";
  try {
    const checked = await invoke(
      executable,
      ["vet", schema, path, "-c"],
      s.root,
    );
    if (checked.exitCode) fail("BODY.CONTRACT_INVALID", checked);
    if (expression) {
      const exported = await invoke(executable, [
        "export",
        schema,
        path,
        "-e",
        expression,
        "--out",
        "json",
      ], s.root);
      if (exported.exitCode) fail("BODY.CONTRACT_INVALID", exported);
      return JSON.parse(exported.stdout);
    }
  } finally {
    await Deno.remove(path);
  }
}

// Restore ordinary native Header IDs, then clear only the aligned, sealed
// no-auto reader's empty IDs. Authored IDs are retained and fail public capability.
async function nativeDocument(s: Session, observed: any, profile: string) {
  const key = profile + ":" + observed.source;
  const identity = JSON.parse(await Deno.readTextFile(s.identities[key]));
  const normal = observed.occurrences.filter((row: any) =>
    row.kind === "Header"
  );
  const noAuto = identity.occurrences.filter((row: any) =>
    row.kind === "Header"
  );
  const doc = JSON.parse(observed.readerShape);
  let ordinal = 0;
  visit(doc.blocks, (node) => {
    if (node.t !== "Header") return;
    const index = ordinal++, raw = normal[index], proof = noAuto[index];
    if (
      !raw || !proof || raw.level !== node.c[0] || proof.level !== raw.level
    ) fail("BODY.HEADER_PROOF_INVALID", observed.source);
    node.c[1][0] = raw.id;
    if (proof.id === "") node.c[1][0] = "";
    else if (
      !s.headers.some((header) =>
        header.source.rootQmd === observed.source &&
        header.source.owner === observed.owner &&
        header.ordinal === index + 1 && header.id === proof.id &&
        header.id === raw.id
      )
    ) {
      fail("BODY.HEADER_PROOF_INVALID", {
        source: observed.source,
        ordinal: index + 1,
      });
    }
  });
  if (ordinal !== normal.length || ordinal !== noAuto.length) {
    fail("BODY.HEADER_PROOF_INVALID", observed.source);
  }
  return doc;
}

interface Component {
  path: string;
  role: string;
  id: string;
  owner: string;
  owners: string[];
  privateParents: string[];
  native: string;
  parents: unknown[];
}
export interface BodyPartition {
  source: string;
  owner: string;
  apiVersion: number[];
  signatures: unknown[];
  questions: BodyQuestion[];
  work: BodyPackage["works"][number] | null;
  projection: NativeAnswerProjection;
}

export async function partitionBody(
  s: Session,
  observed: any,
  profile: string,
  before?: unknown[],
): Promise<BodyPartition> {
  if (
    !s.body?.sources.includes(observed.source) ||
    observed.owner !== s.audit.profiles[profile].config.course.id
  ) fail("BODY.OWNER_INVALID", observed.source);
  const doc = await nativeDocument(s, observed, profile), nodes: any[] = [];
  const byPath = new Map<string, any>();
  function scan(value: any, path: string, parents: any[]) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => scan(item, path + "." + index, parents));
      return;
    }
    let next = parents;
    const attr = attributes(value);
    if (attr) {
      const parent = {
        kind: value.t,
        id: attr[0],
        classes: attr[1],
        attributes: attr[2].map(([key, v]: string[]) => ({ key, value: v })),
      };
      const kinds: string[] = [], sizes: number[] = [], items: string[] = [];
      if (value.t === "Div") {
        for (const block of value.c[1]) {
          kinds.push(block.t);
          const rows = block.t === "BulletList"
            ? block.c
            : block.t === "OrderedList"
            ? block.c[1]
            : [];
          for (const row of rows) {
            let count = 0;
            visit(row, (node) => {
              if (node.t === "Cite") {
                for (const cite of node.c[0]) {
                  items.push(observed.owner + "/" + cite.citationId);
                  count++;
                }
              }
            });
            sizes.push(count);
          }
        }
      }
      nodes.push({
        ...parent,
        path,
        ancestors: parents,
        firstKind: value.t === "Div" ? value.c[1][0]?.t || "Missing" : "",
        firstLevel: value.t === "Div" && value.c[1][0]?.t === "Header"
          ? value.c[1][0].c[0]
          : 0,
        json: JSON.stringify(value),
        memberKinds: kinds,
        memberSizes: sizes,
        items,
      });
      byPath.set(path, value);
      if (value.t === "Div") next = [...parents, parent];
    }
    for (const [key, child] of Object.entries(value)) {
      if (child && typeof child === "object") {
        scan(child, path + "." + key, next);
      }
    }
  }
  scan(doc.blocks, "blocks", []);
  const rawHeaders = observed.occurrences.filter((row: any) =>
    row.kind === "Header"
  );
  const firstIndex = rawHeaders.findIndex((row: any) => row.topLevel);
  const first = rawHeaders[firstIndex];
  const authored = s.headers.find((header) =>
    header.source.rootQmd === observed.source &&
    header.source.owner === observed.owner &&
    header.ordinal === firstIndex + 1 && header.topLevel &&
    header.id === first?.id
  );
  const meta = JSON.parse(observed.assessment).meta.assessment;
  const kind = meta?.c?.kind;
  const kindText = kind?.t === "MetaString"
    ? kind.c
    : kind?.t === "MetaInlines" && kind.c.length === 1 && kind.c[0].t === "Str"
    ? kind.c[0].c
    : "";
  const report = await cue(s, "components.cue", {
    input: {
      owner: observed.owner,
      source: observed.source,
      nodes,
      compare: before !== undefined,
      before: before || [],
      signatures: [],
      assessment: { enabled: observed.assessmentFacts.enabled, kind: kindText },
      firstHeader: {
        id: first?.id || "",
        title: authored?.title || "",
        authored: !!authored,
        topLevel: !!first?.topLevel,
      },
    },
  }, "report");
  const components: Component[] = report.nodes;
  const decisions = new Map(
    components.map((component) => [component.path, component]),
  );
  const questions: BodyQuestion[] = [],
    projection: NativeAnswerProjection = {
      schema: "course-answer-projection-v1",
      source: observed.source,
      profile: "student",
      questions: [],
    };
  const omitted = Symbol("closed");
  for (
    const entry of components.filter((component) =>
      component.role === "question"
    )
  ) {
    const q: BodyQuestion = {
      owner: observed.owner,
      id: entry.id,
      key: observed.owner + "/" + entry.id,
      source: observed.source,
      visibility: "public",
      answerType: "manual",
      condition: [],
      publicAnswer: [],
      closedKey: null,
      solution: [],
      gradingNotes: [],
    };
    const banks: any[] = [];
    const split = (value: any, path: string, mode: string): any => {
      if (!value || typeof value !== "object") return value;
      if (Array.isArray(value)) {
        return value.map((child, index) =>
          split(child, path + "." + index, mode)
        ).filter((child) => child !== omitted);
      }
      const decision = decisions.get(path);
      if (decision?.role === "bank") {
        banks.push(value);
        return omitted;
      }
      if (decision?.role === "solution") {
        q.solution.push(...split(value.c[1], path + ".c.1", "solution"));
        return omitted;
      }
      if (decision?.role === "notes") {
        q.gradingNotes.push(...split(value.c[1], path + ".c.1", "notes"));
        return omitted;
      }
      return Object.fromEntries(
        Object.entries(value).map((
          [key, child],
        ) => [key, split(child, path + "." + key, mode)]),
      );
    };
    const node = byPath.get(entry.path);
    q.condition = split(node.c[1], entry.path + ".c.1", "condition");
    for (
      const sibling of components.filter((component) =>
        component.role === "solution" && component.owner === entry.id &&
        !component.owners.length
      )
    ) {
      split(byPath.get(sibling.path), sibling.path, "condition");
    }
    try {
      if (banks.length) {
        Object.assign(
          q,
          banks[0].t === "CodeBlock"
            ? await validateAnswer(banks[0].c[1])
            : await projectChoice(banks[0]),
        );
      } else {q.publicAnswer = [{
          t: "Para",
          c: [{
            t: "Str",
            c: "Response: ________________________________________",
          }],
        }];}
    } catch (error) {
      fail("BODY.ANSWER_INVALID", String(error));
    }
    assertSupported(q.condition);
    assertSupported(q.publicAnswer);
    questions.push(q);
    projection.questions.push({
      id: entry.id,
      answerSpecCount: banks[0]?.t === "CodeBlock" ? 1 : 0,
      correctMarkerCount: components.filter((component) =>
        component.role === "correct" && component.owner === entry.id
      ).length,
    });
  }
  const work = report.work
    ? {
      owner: observed.owner,
      id: report.work.id,
      key: observed.owner + "/" + report.work.id,
      source: observed.source,
      kind: report.work.kind,
      title: report.work.title,
      items: report.work.items,
    }
    : null;
  return {
    source: observed.source,
    owner: observed.owner,
    apiVersion: doc["pandoc-api-version"],
    signatures: report.signatures,
    questions,
    work,
    projection,
  };
}

function packageFrom(s: Session, partitions: BodyPartition[]): BodyPackage {
  const first = partitions[0];
  if (
    !s.body || !first || partitions.some((part) =>
      part.owner !== first.owner ||
      JSON.stringify(part.apiVersion) !== JSON.stringify(first.apiVersion)
    )
  ) fail("BODY.OWNER_INVALID", "inconsistent selected native corpus");
  return {
    schema: "course-body-package-v1",
    owner: first.owner,
    release: s.body.release,
    apiVersion: first.apiVersion,
    questions: partitions.flatMap((part) => part.questions),
    works: partitions.flatMap((part) => part.work ? [part.work] : []),
    resources: [],
  };
}

export async function prepareBodies(s: Session) {
  if (!s.body) return;
  for (const profile of ["student", "full"] as const) {
    const partitions = [];
    for (const source of s.body.sources) {
      const observed = JSON.parse(
        await Deno.readTextFile(s.captures[profile + ":" + source]),
      );
      partitions.push(await partitionBody(s, observed, profile));
    }
    await cue(s, "package.cue", { packageData: packageFrom(s, partitions) });
  }
}

export async function sealBody(
  s: Session,
  a: Invocation,
  observed: any,
  actualHash: string,
  resourceSealHash: string,
) {
  if (!s.body?.sources.includes(observed.source)) return;
  const key = a.profile + ":" + observed.source;
  const baseline = JSON.parse(await Deno.readTextFile(s.captures[key]));
  const before = await partitionBody(s, baseline, a.profile);
  const current = await partitionBody(
    s,
    observed,
    a.profile,
    before.signatures,
  );
  const seal: BodySeal = {
    schema: "course-body-seal-v1",
    source: observed.source,
    invocationId: a.invocationId,
    selectionHash: s.body.selectionHash,
    actualHash,
    captureHash: s.captureHashes[key],
    identityHash: s.identityHashes[key],
    resourceSealHash,
    partitionHash: await resourceHash(current),
  };
  const path = join(
    s.root,
    ".course-owner/body",
    `seal-${await sha(key)}.json`,
  );
  await Deno.mkdir(dirname(path), { recursive: true });
  await Deno.writeTextFile(path, JSON.stringify(seal), { createNew: true });
  return {
    bodySealHash: await digestFile(path),
    bodyProjection: a.profile === "student" ? current.projection : undefined,
  };
}

async function checkedPartitions(s: Session, a: Invocation) {
  if (!s.body) fail("BODY.SELECTION_REQUIRED", s.root);
  const partitions: BodyPartition[] = [],
    sealHashes: Record<string, string> = {};
  for (const source of s.body.sources) {
    const key = a.profile + ":" + source,
      path = join(s.root, ".course-owner/body", `seal-${await sha(key)}.json`);
    await resourceNoLinks(s.root, path);
    const seal = JSON.parse(await Deno.readTextFile(path)) as BodySeal;
    const actualPath = join(
      s.root,
      ".course-owner/render",
      a.profile,
      await sha(source) + ".json",
    );
    await resourceNoLinks(s.root, actualPath);
    const observed = JSON.parse(await Deno.readTextFile(actualPath));
    const baseline = await partitionBody(
      s,
      JSON.parse(await Deno.readTextFile(s.captures[key])),
      a.profile,
    );
    const current = await partitionBody(
      s,
      observed,
      a.profile,
      baseline.signatures,
    );
    const expected: BodySeal = {
      schema: "course-body-seal-v1",
      source,
      invocationId: a.invocationId,
      selectionHash: s.body.selectionHash,
      actualHash: await digestFile(actualPath),
      captureHash: s.captureHashes[key],
      identityHash: s.identityHashes[key],
      resourceSealHash: await digestFile(
        join(s.root, ".course-owner", `resource-seal-${await sha(key)}.json`),
      ),
      partitionHash: await resourceHash(current),
    };
    const receipt = JSON.parse(
      await Deno.readTextFile(
        join(s.root, ".course-owner", `result-${await sha(key)}.json`),
      ),
    );
    const sealHash = await digestFile(path);
    if (
      JSON.stringify(seal) !== JSON.stringify(expected) ||
      receipt.status !== "ok" || receipt.bodySealHash !== sealHash ||
      receipt.actualHash !== expected.actualHash ||
      receipt.resourceSealHash !== expected.resourceSealHash
    ) fail("BODY.SEAL_CHANGED", source);
    partitions.push(current);
    sealHashes[source] = sealHash;
  }
  return { partitions, sealHashes };
}

async function bindResources(
  s: Session,
  a: Invocation,
  p: BodyPackage,
  seals: ResourceSeal[],
) {
  const baseline = await resolveResourceEvidence(
      s,
      await resourceObservations(s),
    ),
    actual = seals.flatMap((seal) => seal.actual);
  const files: OwnerResourceFile[] = [
    ...await sourceResourceFiles(s),
    ...seals.flatMap((seal) => seal.generated),
  ];
  const checked = await resourcePolicy(
    "student",
    baseline,
    actual,
    files,
    [],
    join(s.root, ".course-owner"),
    join(s.root, s.extension, "owner-preflight/resource-policy.cue"),
  );
  if (checked.diagnostics.length) {
    fail("BODY.RESOURCE_DENIED", checked.diagnostics);
  }
  for (const question of p.questions) {
    const nodes: Node[] = [];
    visit([question.condition, question.publicAnswer], (node) => {
      if (node.t === "Link" || node.t === "Image") nodes.push(node);
    });
    for (const node of nodes) {
      const target = node.c[2][0];
      if (node.t === "Link" && /^https?:\/\//.test(target)) continue;
      const uses = actual.filter((use) =>
        use.source === question.source && use.target === target &&
        use.kind === node.t && use.projection === "projected"
      );
      const paths = new Set(uses.map((use) => use.path));
      if (paths.size !== 1) {
        fail("BODY.RESOURCE_UNPROVEN", { source: question.source, target });
      }
      const path = [...paths][0],
        file = files.find((file) => file.path === path),
        policy = checked.files.find((policy) => policy.path === path);
      if (
        !file || !policy?.allowed ||
        !(policy.baselinePublic || policy.actualPublic) ||
        file.origin === "service"
      ) fail("BODY.RESOURCE_DENIED", path);
      await resourceNoLinks(
        file.origin === "generated" ? a.output : s.root,
        file.actualPath,
      );
      if (await digestFile(file.actualPath) !== file.sha256) {
        fail("BODY.RESOURCE_CHANGED", path);
      }
      const out = `resources/${p.owner}/${path}`,
        existing = p.resources.find((resource) => resource.target === out);
      if (!/^resources\/[A-Za-z0-9._/-]+$/.test(out)) {
        fail("BODY.CAPABILITY_UNSUPPORTED", out);
      }
      if (existing && existing.sha256 !== file.sha256) {
        fail("BODY.RESOURCE_COLLISION", out);
      }
      if (!existing) {
        const bytes = await Deno.readFile(file.actualPath);
        let encoded = "";
        for (let offset = 0; offset < bytes.length; offset += 8192) {
          encoded += String.fromCharCode(
            ...bytes.subarray(offset, offset + 8192),
          );
        }
        p.resources.push({
          owner: p.owner,
          source: path,
          effectiveBase: question.source,
          target: out,
          sha256: file.sha256,
          data: btoa(encoded),
          visibility: "public",
        });
      }
      node.c[2][0] = out;
    }
  }
}

function publicPackage(p: BodyPackage): PublicBodyPackage {
  return {
    ...p,
    questions: p.questions.map((
      {
        closedKey: _key,
        solution: _solution,
        gradingNotes: _notes,
        ...question
      },
    ) => question),
  };
}

async function modules(s: Session) {
  const ownerModules = [
    "failure.ts",
    "protocol.ts",
    "runtime.ts",
    "source-audit.ts",
    "session.ts",
  ].map((name) => s.extension + "/owner-preflight/owner/" + name);
  const prefix = s.extension + "/body-export/",
    result: Record<string, string> = {};
  for (const [path, hash] of Object.entries(s.files)) {
    if (
      path.startsWith(prefix) ||
      path === s.extension + "/owner-preflight/owner.ts" ||
      ownerModules.includes(path) ||
      [
        "filter.lua",
        "visibility.lua",
        "grading.lua",
        "exercises.lua",
        "pedagogy/contract.lua",
        "pedagogy/collect.lua",
        "contract-vocabulary.json",
        "vocabulary.lua",
        "domain/vocabulary.ts",
        "spec/core.cue",
      ].some((name) => path === s.extension + "/" + name) ||
      path === s.extension + "/owner-preflight/resources.ts" ||
      path === s.extension + "/owner-preflight/occurrences.lua" ||
      path === s.extension + "/owner-preflight/filter.lua" ||
      path === s.extension + "/owner-preflight/reader.lua" ||
      path === s.extension + "/owner-preflight/reconcile.cue"
    ) {
      if (await digestFile(join(s.root, path)) !== hash) {
        fail("BODY.MODULE_CHANGED", path);
      }
      result[path] = hash;
    }
  }
  if (
    !result[prefix + "producer.ts"] || !result[prefix + "answer.ts"] ||
    !result[prefix + "vendor/libraries.js"] ||
    ownerModules.some((path) => !result[path])
  ) fail("BODY.MODULE_UNPROVEN", prefix);
  return result;
}

// Called only by finishOwner after its caller has observed native process exit zero.
export async function finishBodies(
  p: PreparedOwner,
  s: Session,
  a: Invocation,
  seals: ResourceSeal[],
) {
  if (!s.body) return;
  const { partitions, sealHashes } = await checkedPartitions(s, a),
    bundle = packageFrom(s, partitions);
  await bindResources(s, a, bundle, seals);
  await cue(s, "package.cue", { packageData: bundle });
  const projection = publicPackage(bundle),
    directory = join(s.root, ".course-owner/body");
  const packagePath = join(directory, "package.json"),
    publicPath = join(directory, "public.json"),
    receiptPath = join(directory, "receipt.json");
  await Deno.writeTextFile(packagePath, JSON.stringify(bundle), {
    createNew: true,
  });
  await Deno.writeTextFile(publicPath, JSON.stringify(projection), {
    createNew: true,
  });
  const packageHash = await digestFile(packagePath),
    publicHash = await digestFile(publicPath);
  const receipt: BodyReceipt = {
    schema: "course-body-receipt-v1",
    root: p.root,
    attemptId: p.attemptId,
    profile: p.profile,
    sessionId: p.sessionId,
    sessionHash: p.sessionHash,
    invocationId: a.invocationId,
    selection: s.body,
    packageHash,
    publicHash,
    modules: await modules(s),
    seals: sealHashes,
    resources: bundle.resources.map((
      { source, sha256, target, effectiveBase },
    ) => ({ source, sha256, target, effectiveBase })),
  };
  await Deno.writeTextFile(receiptPath, JSON.stringify(receipt), {
    createNew: true,
  });
  return {
    schema: "course-body-handle-v1" as const,
    root: p.root,
    attemptId: p.attemptId,
    profile: p.profile,
    sessionId: p.sessionId,
    sessionHash: p.sessionHash,
    invocationId: a.invocationId,
    selectionHash: s.body.selectionHash,
    packagePath,
    packageHash,
    publicPath,
    publicHash,
    receiptPath,
    receiptHash: await digestFile(receiptPath),
  };
}

export async function validateOwnerBodies(
  p: PreparedOwner,
  handle: OwnerBodyHandle,
  options: { works?: string[] } = {},
) {
  const s = await preparedSession(p), a = await activeOwner(p.root);
  if (!s.body || !a || a.phase !== "render") {
    fail("BODY.FINISH_REQUIRED", p.root);
  }
  const index = await validateOwnerResources(p);
  const expected = {
    schema: "course-body-handle-v1",
    root: p.root,
    attemptId: p.attemptId,
    profile: p.profile,
    sessionId: p.sessionId,
    sessionHash: p.sessionHash,
    invocationId: a.invocationId,
    selectionHash: s.body.selectionHash,
    packagePath: join(p.root, ".course-owner/body/package.json"),
    packageHash: handle?.packageHash,
    publicPath: join(p.root, ".course-owner/body/public.json"),
    publicHash: handle?.publicHash,
    receiptPath: join(p.root, ".course-owner/body/receipt.json"),
    receiptHash: handle?.receiptHash,
    indexHash: index.indexHash,
  };
  if (
    !handle || typeof handle !== "object" || Array.isArray(handle) ||
    Object.keys(handle).sort().join(",") !==
      Object.keys(expected).sort().join(",") ||
    Object.entries(expected).some(([key, value]) =>
      (handle as any)[key] !== value
    ) ||
    [handle.packageHash, handle.publicHash, handle.receiptHash].some((hash) =>
      typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash)
    )
  ) {
    fail("BODY.HANDLE_INVALID", handle);
  }
  for (
    const [path, hash] of [[handle.packagePath, handle.packageHash], [
      handle.publicPath,
      handle.publicHash,
    ], [handle.receiptPath, handle.receiptHash]]
  ) {
    await resourceNoLinks(p.root, path);
    if (
      await digestFile(path) !== hash ||
      !index.files.some((file) =>
        file.path === relative(p.root, path).replaceAll("\\", "/") &&
        file.origin === "service" && file.sha256 === hash
      )
    ) fail("BODY.PACKAGE_CHANGED", path);
  }
  await assertFrozen(p.sessionPath);
  const receipt = JSON.parse(
    await Deno.readTextFile(handle.receiptPath),
  ) as BodyReceipt;
  const { partitions, sealHashes } = await checkedPartitions(s, a);
  const bundle = JSON.parse(
    await Deno.readTextFile(handle.packagePath),
  ) as BodyPackage;
  const projection = JSON.parse(
    await Deno.readTextFile(handle.publicPath),
  ) as PublicBodyPackage;
  const seals = await Promise.all(
    s.body.sources.map(async (source) =>
      JSON.parse(
        await Deno.readTextFile(
          join(
            s.root,
            ".course-owner",
            `resource-seal-${await sha(a.profile + ":" + source)}.json`,
          ),
        ),
      ) as ResourceSeal
    ),
  );
  const rebuilt = packageFrom(s, partitions);
  await bindResources(s, a, rebuilt, seals);
  await cue(s, "package.cue", { packageData: rebuilt });
  const expectedReceipt: BodyReceipt = {
    schema: "course-body-receipt-v1",
    root: p.root,
    attemptId: p.attemptId,
    profile: p.profile,
    sessionId: p.sessionId,
    sessionHash: p.sessionHash,
    invocationId: a.invocationId,
    selection: s.body,
    packageHash: handle.packageHash,
    publicHash: handle.publicHash,
    modules: await modules(s),
    seals: sealHashes,
    resources: rebuilt.resources.map((
      { source, sha256, target, effectiveBase },
    ) => ({ source, sha256, target, effectiveBase })),
  };
  if (
    JSON.stringify(receipt) !== JSON.stringify(expectedReceipt) ||
    JSON.stringify(bundle) !== JSON.stringify(rebuilt) ||
    JSON.stringify(projection) !== JSON.stringify(publicPackage(rebuilt))
  ) fail("BODY.PACKAGE_CHANGED", "current producer reconstruction differs");
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    fail("BODY.WORK_SELECTION_INVALID", options);
  }
  const selected = options.works;
  if (
    Object.keys(options).some((key) => key !== "works") ||
    selected !== undefined &&
      (!Array.isArray(selected) || !selected.length ||
        new Set(selected).size !== selected.length ||
        selected.some((key) =>
          !projection.works.some((work) => work.key === key)
        ))
  ) fail("BODY.WORK_SELECTION_INVALID", options);
  const publicResult = structuredClone(projection);
  if (selected) {
    publicResult.works = selected.map((key) =>
      publicResult.works.find((work) => work.key === key)!
    );
    const keys = new Set(publicResult.works.flatMap((work) => work.items));
    publicResult.questions = publicResult.questions.filter((question) =>
      keys.has(question.key)
    );
    const targets = new Set<string>();
    visit(publicResult.questions, (node) => {
      if (node.t === "Link" || node.t === "Image") targets.add(node.c[2][0]);
    });
    publicResult.resources = publicResult.resources.filter((resource) =>
      targets.has(resource.target)
    );
  }
  return {
    publicPackage: publicResult,
    privatePackage: structuredClone(bundle),
    receipt: structuredClone(receipt),
  };
}
