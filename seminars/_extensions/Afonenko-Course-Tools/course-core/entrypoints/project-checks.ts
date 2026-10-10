import { collectProjectChecks } from "../project-checks/collect.ts";
import { runCli } from "./diagnostics.ts";
import { diagnostic } from "../domain/diagnostics.ts";
import { dirname, resolve } from "stdlib/path";
export async function main(args=Deno.args){
 if(args[0]==="--")args=args.slice(1);
 const values:Record<string,string>={};
 for(let i=0;i<args.length;i+=2){
  if(!["--book","--output","--profile"].includes(args[i])||!args[i+1]||values[args[i]])throw diagnostic("CHECKS.ARGUMENTS_INVALID","Укажите --book NAME --output checks.json [--profile FEATURES]");
  values[args[i]]=args[i+1];
 }
 if(!values['--book']||!values['--output'])throw diagnostic("CHECKS.ARGUMENTS_INVALID","Требуются --book и --output");
 const root=await Deno.realPath(Deno.cwd());const output=resolve(root,values['--output']);
 if(!output.endsWith('.json'))throw diagnostic("CHECKS.ARGUMENTS_INVALID","Output должен быть JSON");
 const profiles=(values['--profile']??Deno.env.get('QUARTO_PROFILE')??'').split(',').filter(p=>p&&!['student','full'].includes(p));
 const manifest=await collectProjectChecks(root,{book:values['--book'],profiles});
 await Deno.mkdir(dirname(output),{recursive:true});
 await Deno.writeTextFile(output,JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
 console.log(`Проверки: ${manifest.projects.length} явно подключённых проектов`);
}
if(import.meta.main)await runCli(main);
