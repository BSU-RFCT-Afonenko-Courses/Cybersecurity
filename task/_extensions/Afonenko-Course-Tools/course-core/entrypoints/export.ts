import { diagnostic } from "../domain/diagnostics.ts";
import { runCli } from "./diagnostics.ts";
import { resolve, dirname } from "stdlib/path";
import { collectExport } from "../body-export/collect.ts";
import { buildBodies } from "../body-export/producer.ts";
export async function main(args = Deno.args) {
  if (args[0] === "--") args=args.slice(1);
  const values: Record<string,string> = {};
  for (let i=0;i<args.length;i+=2) {
    if (!["--book","--work","--output","--profile"].includes(args[i]) || !args[i+1] || values[args[i]]) throw diagnostic("EXPORT.ARGUMENTS_INVALID", "Укажите --book BANK --work ID --output PACKAGE.json [--profile FEATURE,...]", {field: "arguments"});
    values[args[i]]=args[i+1];
  }
  if (!values["--book"] || !values["--work"] || !values["--output"]) throw diagnostic("EXPORT.BOOK_WORK_OUTPUT_REQUIRED", "Укажите --book, --work и --output", {field: "arguments"});
  const root=await Deno.realPath(Deno.cwd());
  const output=resolve(root,values["--output"]);
  if (!output.endsWith(".json")) throw diagnostic("EXPORT.JSON_OUTPUT_REQUIRED", "Путь выходного пакета должен оканчиваться на .json", {field: "arguments"});
  // Quarto consumes its native --profile flag before forwarding script args.
  // Explicit script arguments (after --) and the native environment both work.
  const profiles=(values["--profile"] ?? Deno.env.get("QUARTO_PROFILE") ?? "")
    .split(",").filter(p => p && !["student", "full"].includes(p));
  const collected=await collectExport(root,{book:values["--book"],work:values["--work"],profiles});
  const bodies=await buildBodies(collected.result,{projectRoot:collected.projectRoot,courseId:collected.courseId,work:collected.work,includeClosed:true});
  await Deno.mkdir(dirname(output), {recursive:true});
  await Deno.writeTextFile(output,JSON.stringify(bodies.package,null,2)+"\n");
  await Deno.writeTextFile(output.slice(0,-5)+".public.json",JSON.stringify(bodies.publicPackage,null,2)+"\n");
  console.log(`Экспорт: ${bodies.package.questions.length} вопросов, ${collected.courseId}/${collected.work}`);
}
if (import.meta.main) await runCli(main);
