// Maintained common answer contract promoted from Core #8, exact 4f5caf9a15b9bd36476cad8a646e81521fbd29d1.
// Native CodeBlock answer data only; no QMD reader/resource producer.
import { isAlias, parseDocument } from "./vendor/libraries.js";
import type { Node } from "./model.ts";
import { command } from "../infrastructure/process.ts";
async function run(cmd: string, args: string[]): Promise<string> {
  return await command(Deno.env.get("CUE") || cmd, args, Deno.cwd());
}
const para = (s: string): Node => ({ t: "Para", c: [{ t: "Str", c: s }] });
async function vet(answer: any) {
  const dir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(dir + "/input.json", JSON.stringify({ answer }));
    await run("cue", [
      "vet",
      new URL("answer.cue", import.meta.url).pathname,
      dir + "/input.json",
    ]);
  } catch {
    throw new Error("ANSWER_INVALID: CUE rejected answer contract");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}
export async function validateAnswer(
  source: string,
): Promise<{ publicAnswer: Node[]; closedKey: any; answerType: string }> {
  let data: any;
  try {
    const doc = parseDocument(source, { uniqueKeys: true, version: "1.2" });
    if (!doc || doc.errors.length || doc.warnings.length) {
      throw Error("invalid YAML");
    }
    const inspect = (v: any) => {
      if (!v || typeof v !== "object") return;
      if (isAlias(v) || v.tag) throw Error("aliases/tags unsupported");
      for (const x of v.items ?? []) {
        inspect(x);
        inspect(x.key);
        inspect(x.value);
      }
    };
    inspect(doc.contents);
    data = doc.toJS({ maxAliasCount: 0 });
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw Error("mapping required");
    }
  } catch {
    throw new Error(
      "ANSWER_YAML: single mapping, no duplicate keys, aliases or custom tags",
    );
  }
  await vet(data);
  const project = (a: any): Node[] =>
    a.type === "numeric"
      ? [para("Answer: ____________________")]
      : a.type === "manual"
      ? [para("Response: ________________________________________")]
      : a.type === "multipart"
      ? a.parts.flatMap((p: any) => [para(p.label), ...project(p)])
      : a.type === "matching"
      ? [
        para("Prompts"),
        { t: "BulletList", c: a.prompts.map((p: string) => [para(p)]) },
        para("Options"),
        { t: "BulletList", c: a.options.map((p: string) => [para(p)]) },
        para("Matches: ____________________"),
      ]
      : [];
  return {
    publicAnswer: project(data),
    closedKey: data,
    answerType: data.type,
  };
}

export async function projectChoice(b: Node) {
  if (
    !b.c[0][2].some((x: any) => x[0] === "type" && x[1] === "single-choice") ||
    b.c[1].length !== 1 || b.c[1][0].t !== "BulletList"
  ) throw Error("ADAPTER: unsupported answer body");
  let correct = -1, count = 0;
  const strip = (v: any, index: number): any => {
    if (Array.isArray(v)) {
      return v.flatMap((x) => {
        if (x?.t === "Span" && x.c[0][1].includes("correct")) {
          correct = index;
          count++;
          return strip(x.c[1], index);
        }
        return [strip(x, index)];
      });
    }
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v).map(([k, x]) => [k, strip(x, index)]),
      );
    }
    return v;
  };
  const clean = b.c[1][0].c.map((c: any, i: number) => strip(c, i));
  await vet({
    type: "single-choice",
    count: clean.length,
    correct,
    markedCount: count,
  });
  return {
    answerType: "single-choice",
    closedKey: { correct },
    publicAnswer: [{ t: "BulletList", c: clean }],
  };
}
