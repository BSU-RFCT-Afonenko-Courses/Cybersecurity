// Инертный data-only I3 reader. Prior P и до-import проверка ROOT вне Core.
// @deno-types="../vendor/zod/v4/index.d.ts"
import { z } from "../vendor/zod/v4/index.js";
import { dirname, fromFileUrl, join, relative, resolve } from "stdlib/path";
import { fail } from "../contracts/project.ts";
import { hash, signature } from "./source-snapshot.ts";
import { AssignmentProducerProfileSchema } from "./assignment-producer-profiles.ts";
import type { AssignmentProducerProfile } from "./assignment-producer-profiles.ts";
const locationPath = fromFileUrl(
  new URL("./assignment-authority-location.json", import.meta.url),
);
function bad(s: string): never {
  return fail("BODY.PRODUCER_INPUT_UNQUALIFIED", s);
}
const changed = (s: string): never => fail("BODY.PRODUCER_INPUT_CHANGED", s);
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const frozen = <T>(v: T): T => {
  if (v && typeof v === "object") {
    Object.values(v).forEach(frozen);
    Object.freeze(v);
  }
  return v;
};
const sha = z.string().regex(/^[a-f0-9]{64}$/),
  documentSize = z.number().int().positive().max(64 * 1024 * 1024),
  graphFileSize = z.number().int().positive().max(256 * 1024 * 1024),
  epoch = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
const absolute = z.string().min(1).max(4096).refine((p) =>
  p.startsWith("/") && resolve(p) === p && !p.includes("\0")
);
const digest = z.strictObject({ sha256: sha, size: documentSize });
const L = z.strictObject({
  schema: z.literal("course-assignment-authority-location-v1"),
  root: absolute,
  epoch,
});
const R = z.strictObject({
  schema: z.literal("course-assignment-profiles-v1"),
  epoch,
  profiles: z.array(AssignmentProducerProfileSchema).min(1).max(32),
});
const M = z.strictObject({
  schema: z.literal("course-assignment-authority-manifest-v1"),
  epoch,
  files: z.tuple([
    z.literal("anchor.json"),
    z.literal("manifest.json"),
    z.literal("profiles.json"),
  ]),
  mode: z.literal(292),
  profiles: digest,
});
const E = z.strictObject({
  schema: z.literal("course-assignment-authority-anchor-v1"),
  epoch,
  root: absolute,
  manifest: digest,
  graph: z.strictObject({
    files: z.array(
      z.strictObject({
        path: absolute,
        sha256: sha,
        size: graphFileSize,
        mode: z.number().int().min(0).max(511),
      }),
    ).min(1).max(32768),
    directories: z.array(
      z.strictObject({ path: absolute, names: z.array(z.string()) }),
    ).max(8192),
    absent: z.array(absolute).max(8192),
  }),
  launches: z.array(z.strictObject({
    entrypoint: z.string().startsWith("file:///"),
    executable: absolute,
    cwd: absolute,
    arguments: z.array(z.string()).max(4096),
    runtimeArguments: z.array(z.string()).max(256),
    environment: z.record(z.string(), z.string().nullable()),
  })).min(1).max(2),
});
export const AssignmentAuthorityIdentitySchema = z.strictObject({
  root: absolute,
  epoch,
  locationSha256: sha,
  anchorSha256: sha,
  manifestSha256: sha,
  profilesSha256: sha,
});
export type AssignmentAuthorityIdentity = z.output<
  typeof AssignmentAuthorityIdentitySchema
>;
export const authorityCounterNames = [
  "authorityDataReads",
  "authorityHashBytes",
  "authorityGraphHashReads",
  "authorityGraphHashBytes",
  "authorityPathReads",
  "authorityDirectoryReads",
  "authorityTopologyBytes",
] as const;
export type AuthorityMetrics = {
  [K in typeof authorityCounterNames[number]]: number;
};
export const emptyAuthorityMetrics = (): AuthorityMetrics =>
  Object.fromEntries(
    authorityCounterNames.map((key) => [key, 0]),
  ) as AuthorityMetrics;
const add = (
  metrics: Partial<AuthorityMetrics> | undefined,
  key: typeof authorityCounterNames[number],
  value = 1,
) => {
  if (metrics) metrics[key] = (metrics[key] ?? 0) + value;
};
export function addAuthorityMetrics(
  target: Partial<AuthorityMetrics> | undefined,
  cost: AuthorityMetrics,
) {
  for (const key of authorityCounterNames) add(target, key, cost[key]);
}
type File = {
  path: string;
  signature: string;
  sha256: string;
  size: number;
  identity: string;
};
type Handle = Readonly<
  {
    identity: AssignmentAuthorityIdentity;
    profiles: readonly AssignmentProducerProfile[];
    files: readonly File[];
    capsuleSignature: string;
    topology: string;
    graph: z.output<typeof E>["graph"];
    graphFiles: readonly { path: string; signature: string }[];
    launches: z.output<typeof E>["launches"];
    cost: AuthorityMetrics;
  }
>;
const handles = new WeakSet<object>();
async function canonical(path: string, metrics?: Partial<AuthorityMetrics>) {
  if (!path.startsWith("/") || resolve(path) !== path) {
    bad("Неканонический authority path");
  }
  let current = "/";
  for (const name of path.split("/").filter(Boolean)) {
    current = join(current, name);
    add(metrics, "authorityPathReads");
    const s = await Deno.lstat(current);
    if (s.isSymlink) bad("Authority symlink " + current);
  }
  if (await Deno.realPath(path) !== path) bad("Authority realpath " + path);
  const s = await Deno.lstat(path);
  if (!s.isFile && !s.isDirectory) bad("Authority file type " + path);
  return s;
}
async function names(path: string, metrics?: Partial<AuthorityMetrics>) {
  add(metrics, "authorityDirectoryReads");
  const result = [];
  for await (const entry of Deno.readDir(path)) result.push(entry.name);
  return result.sort();
}
async function absent(path: string, metrics?: Partial<AuthorityMetrics>) {
  let current = path;
  while (true) {
    try {
      await canonical(current, metrics);
      return current !== path;
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) throw e;
    }
    const p = dirname(current);
    if (p === current) return false;
    current = p;
  }
}
async function file(
  path: string,
  limit: number,
  metrics: Partial<AuthorityMetrics>,
  readText = false,
): Promise<{ fact: File; text: string }> {
  const s = await canonical(path, metrics);
  if (
    !s.isFile || (s.mode! & 0o777) !== 0o444 || s.size > limit || s.size === 0
  ) bad("Authority mode/size/type " + path);
  // Text call is deliberate: fixed missing L is an observable single optional read.
  const text = readText
    ? await Deno.readTextFile(path)
    : new TextDecoder("utf-8", { fatal: true }).decode(
      await Deno.readFile(path),
    );
  add(metrics, "authorityDataReads");
  const bytes = new TextEncoder().encode(text);
  add(metrics, "authorityHashBytes", bytes.length);
  if (
    bytes.length !== s.size ||
    signature(await canonical(path, metrics)) !== signature(s)
  ) changed("Authority file changed " + path);
  return {
    fact: {
      path,
      signature: signature(s),
      sha256: await hash(bytes),
      size: bytes.length,
      identity: JSON.stringify([s.dev, s.ino]),
    },
    text,
  };
}
function parse<T>(schema: z.ZodType<T>, text: string): T {
  try {
    const result = schema.safeParse(JSON.parse(text));
    if (!result.success) {
      bad("Неизвестная authority schema " + result.error.issues[0]?.message);
    }
    return result.data;
  } catch (e) {
    if (e instanceof SyntaxError) bad("Malformed authority JSON");
    throw e;
  }
}
const contains = (a: string, b: string) => a === b || b.startsWith(a + "/");
function overlaps(a: string, b: string) {
  return contains(a, b) || contains(b, a);
}
const unescapeMount = (s: string) =>
  s.replace(/\\([0-7]{3})/g, (_, n) => String.fromCharCode(parseInt(n, 8)));
async function topology(
  owner: string,
  capsule: string,
  metrics: Partial<AuthorityMetrics>,
) {
  const a = await canonical(owner, metrics),
    b = await canonical(capsule, metrics);
  if (!a.isDirectory || !b.isDirectory || overlaps(owner, capsule)) {
    bad("Capsule пересекает owner, включая excluded cache");
  }
  if (Deno.build.os !== "linux") bad("Неподдержанная mount topology");
  const text = await Deno.readTextFile("/proc/self/mountinfo");
  add(metrics, "authorityTopologyBytes", new TextEncoder().encode(text).length);
  const mounts = text.trim().split("\n").map((line) => {
    const p = line.split(" ");
    if (p.length < 10 || !p.includes("-")) bad("Неизвестная mount topology");
    return {
      id: p[0],
      device: p[2],
      root: unescapeMount(p[3]),
      point: unescapeMount(p[4]),
    };
  });
  const physical = (path: string) => {
    const matches = mounts.filter((m) =>
      m.point === "/" || contains(m.point, path)
    ).sort((a, b) => b.point.length - a.point.length);
    const m = matches[0];
    if (!m) bad("Нет mount boundary");
    return { ...m, path: resolve(m.root, relative(m.point, path)) };
  };
  const po = physical(owner), pc = physical(capsule);
  if (po.device === pc.device && overlaps(po.path, pc.path)) {
    bad("Capsule physical mount alias owner");
  }
  for (const [leaf, path] of [[a, capsule], [b, owner]] as const) {
    let p = path;
    while (true) {
      const info = await canonical(p, metrics);
      if (info.dev === leaf.dev && info.ino === leaf.ino) {
        bad("Capsule ancestor/physical directory alias");
      }
      const next = dirname(p);
      if (next === p) break;
      p = next;
    }
  }
  return JSON.stringify([po, pc]);
}
async function graph(
  graph: Handle["graph"],
  metrics: Partial<AuthorityMetrics>,
  content: boolean,
  previous: readonly { path: string; signature: string }[] = [],
  forbidden = new Set<string>(),
) {
  const facts: { path: string; signature: string }[] = [];
  for (const row of graph.files) {
    const s = await canonical(row.path, metrics);
    if (forbidden.has(JSON.stringify([s.dev, s.ino]))) {
      bad("Capsule physical alias in G");
    }
    const old = previous.find((f) => f.path === row.path);
    if (old && old.signature !== signature(s)) {
      changed("Bootstrap G identity changed " + row.path);
    }
    facts.push({ path: row.path, signature: signature(s) });
    if (!s.isFile || (s.mode! & 0o777) !== row.mode || s.size !== row.size) {
      changed("Bootstrap G changed " + row.path);
    }
    if (content) {
      const bytes = await Deno.readFile(row.path);
      add(metrics, "authorityGraphHashReads");
      add(metrics, "authorityGraphHashBytes", bytes.length);
      if (
        await hash(bytes) !== row.sha256 ||
        signature(await canonical(row.path, metrics)) !== signature(s)
      ) changed("Bootstrap G bytes changed " + row.path);
    }
  }
  for (const row of graph.directories) {
    await canonical(row.path, metrics);
    if (!same(await names(row.path, metrics), row.names)) {
      changed("Bootstrap G corridor changed " + row.path);
    }
  }
  for (const path of graph.absent) {
    if (!await absent(path, metrics)) {
      changed("Bootstrap G candidate appeared " + path);
    }
  }
  return facts;
}
/** Fixed installation location only. Does not observe or manufacture ROOT's prior P. */
export async function openAssignmentAuthority(owner: string): Promise<Handle> {
  const cost = emptyAuthorityMetrics();
  try {
    // The only optional read, and only when assignment explicitly enters this reader.
    const lf = await file(locationPath, 16384, cost, true),
      location = parse(L, lf.text);
    const rootInfo = await canonical(location.root, cost);
    if (!rootInfo.isDirectory || (rootInfo.mode! & 0o777) !== 0o555) {
      bad("Capsule directory must be frozen");
    }
    const expected = ["anchor.json", "manifest.json", "profiles.json"];
    if (!same(await names(location.root, cost), expected)) {
      bad("Capsule exact composition");
    }
    const ef = await file(
        join(location.root, "anchor.json"),
        8 * 1024 * 1024,
        cost,
      ),
      anchor = parse(E, ef.text);
    const mf = await file(join(location.root, "manifest.json"), 65536, cost),
      manifest = parse(M, mf.text);
    const rf = await file(
        join(location.root, "profiles.json"),
        64 * 1024 * 1024,
        cost,
      ),
      registry = parse(R, rf.text);
    if (
      anchor.root !== location.root ||
      [anchor.epoch, manifest.epoch, registry.epoch].some((e) =>
        e !== location.epoch
      ) ||
      !same(anchor.manifest, { sha256: mf.fact.sha256, size: mf.fact.size }) ||
      !same(manifest.profiles, { sha256: rf.fact.sha256, size: rf.fact.size })
    ) bad("Capsule epoch/root/digest mismatch");
    const ids = new Set<string>(), launches = new Set<string>();
    for (const p of registry.profiles) {
      const key = p.root + "\0" + p.id,
        launch = p.root + "\0" + p.launcher.entrypoint;
      if (ids.has(key) || launches.has(launch)) bad("Ambiguous profile");
      ids.add(key);
      launches.add(launch);
      if (
        overlaps(p.root, location.root) || p.runtime.files.some((f) =>
          contains(location.root, f.path)
        ) || p.runtime.directories.some((f) =>
          overlaps(location.root, f.path)
        ) || p.runtime.absent.some((f) => contains(location.root, f))
      ) bad("Capsule is part of claimed S/K");
    }
    if (
      anchor.graph.files.some((row) => contains(location.root, row.path)) ||
      !anchor.graph.files.some((row) => row.path === locationPath)
    ) bad("Capsule in G or fixed L absent from G");
    const graphFiles = await graph(
      anchor.graph,
      cost,
      true,
      [],
      new Set([ef.fact, mf.fact, rf.fact].map((f) => f.identity)),
    );
    const handle = frozen({
      identity: {
        root: location.root,
        epoch: location.epoch,
        locationSha256: lf.fact.sha256,
        anchorSha256: ef.fact.sha256,
        manifestSha256: mf.fact.sha256,
        profilesSha256: rf.fact.sha256,
      },
      profiles: registry.profiles as readonly AssignmentProducerProfile[],
      files: [lf.fact, ef.fact, mf.fact, rf.fact],
      capsuleSignature: signature(rootInfo),
      topology: await topology(owner, location.root, cost),
      graph: anchor.graph,
      graphFiles,
      launches: anchor.launches,
      cost,
    });
    handles.add(handle);
    return handle;
  } catch (e) {
    if (
      e instanceof Deno.errors.NotFound ||
      e instanceof Deno.errors.PermissionDenied
    ) bad("Authority unavailable");
    throw e;
  }
}
export function authorityProfile(
  handle: Handle,
  id: string | undefined,
  owner: string,
) {
  if (!handles.has(handle)) bad("Copied authority handle");
  const rows = handle.profiles.filter((p) =>
    p.root === owner &&
    (id === undefined ? p.launcher.entrypoint === Deno.mainModule : p.id === id)
  );
  if (rows.length !== 1) bad("Нет independently qualified producer profile");
  return rows[0];
}
export function assertAuthorityHost(
  handle: Handle,
  profile: AssignmentProducerProfile,
) {
  if (!handles.has(handle)) bad("Copied authority handle");
  const sorted = (v: Record<string, unknown>) =>
    Object.entries(v).filter(([, v]) => v !== null).sort(([a], [b]) =>
      a.localeCompare(b)
    );
  if (
    !handle.launches.some((row) =>
      row.entrypoint === Deno.mainModule &&
      row.entrypoint === profile.launcher.entrypoint &&
      row.executable === Deno.execPath() && row.cwd === Deno.cwd() &&
      row.cwd === profile.root && same(row.arguments, Deno.args) &&
      same(sorted(row.environment), sorted(Deno.env.toObject()))
    )
  ) bad("Наблюдаемый launcher/cwd/argv/env вне E");
}
export function assertCapsuleIndependent(
  handle: Handle,
  files: readonly { path: string; signature: string }[],
) {
  if (!handles.has(handle)) bad("Copied authority handle");
  const capsuleIds = new Set(handle.files.slice(1).map((row) => row.identity));
  if (
    files.some((row) =>
      capsuleIds.has(JSON.stringify(JSON.parse(row.signature).slice(0, 2)))
    )
  ) bad("Capsule hardlink alias in S/K");
}
export async function assertAssignmentAuthority(
  handle: Handle,
  owner: string,
  metrics?: Partial<AuthorityMetrics>,
  full = false,
) {
  if (!handles.has(handle)) bad("Copied authority handle");
  try {
    if (
      signature(await canonical(handle.identity.root, metrics)) !==
        handle.capsuleSignature ||
      !same(await names(handle.identity.root, metrics), [
        "anchor.json",
        "manifest.json",
        "profiles.json",
      ])
    ) changed("Capsule composition changed");
    for (const row of handle.files) {
      if (signature(await canonical(row.path, metrics)) !== row.signature) {
        changed("Authority file changed " + row.path);
      }
      if (full) {
        const actual = await file(
          row.path,
          row.size,
          metrics ?? emptyAuthorityMetrics(),
        );
        if (actual.fact.sha256 !== row.sha256) {
          changed("Authority bytes changed " + row.path);
        }
      }
    }
    if (
      await topology(
        owner,
        handle.identity.root,
        metrics ?? emptyAuthorityMetrics(),
      ) !== handle.topology
    ) changed("Authority topology changed");
    await graph(
      handle.graph,
      metrics ?? emptyAuthorityMetrics(),
      full,
      handle.graphFiles,
    );
  } catch (e) {
    if (
      e instanceof Deno.errors.NotFound ||
      e instanceof Deno.errors.PermissionDenied
    ) changed("Authority disappeared");
    throw e;
  }
}
