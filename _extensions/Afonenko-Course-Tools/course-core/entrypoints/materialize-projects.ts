import {resolve} from 'stdlib/path';
import {materializeProjects} from '../artifacts/materialize.ts';
import {withLoadedNativeRun} from '../infrastructure/native-run.ts';
import {diagnostic} from '../domain/diagnostics.ts';
import {runCli} from './diagnostics.ts';
export async function main(args=Deno.args){
 if(args[0]==='--')args=args.slice(1);
 const values:Record<string,string>={},tasks:string[]=[];let mode='';
 const invalid=():never=>{throw diagnostic('ARTIFACT.ARGUMENTS_INVALID','Укажите --root OWNER --model current-native-run.json --output-root FRESH --audience student|grading --task ID [--task ID] --write|--check [--teacher-root ROOT]')};
 for(let i=0;i<args.length;i++){
  const key=args[i];
  if(key==='--write'||key==='--check'){if(mode)invalid();mode=key;continue}
  if(!['--root','--model','--output-root','--audience','--task','--teacher-root'].includes(key)||!args[i+1]||args[i+1].startsWith('--'))invalid();
  const value=args[++i];if(key==='--task')tasks.push(value);else{if(values[key])invalid();values[key]=value}
 }
 if(!mode||!tasks.length||['--root','--model','--output-root','--audience'].some(key=>!values[key])||!['student','grading'].includes(values['--audience']))invalid();
 const root=await Deno.realPath(resolve(values['--root']));
 await withLoadedNativeRun(root,{},async run=>{
 const supplied=JSON.parse(await Deno.readTextFile(resolve(values['--model'])));
 // Compare to the current persisted capture, including the complete document set.
 const normalized={...run,adapters:run.adapters.map(a=>({...a,fragments:[...a.fragments.values()]}))};
 if(JSON.stringify(supplied)!==JSON.stringify(normalized))throw diagnostic('NATIVE.RUN_NOT_CURRENT','--model не совпадает с текущим NativeRun');
 const manifest=await materializeProjects({nativeRun:run,sourceRoot:root,outputRoot:resolve(values['--output-root']),exerciseIds:tasks,audience:values['--audience'] as 'student'|'grading',teacherRoot:values['--teacher-root']?resolve(values['--teacher-root']):undefined,checkOnly:mode==='--check'});
 console.log(`${mode==='--check'?'Проверено':'Материализовано'}: ${manifest.exerciseIds.length} проектов, ${manifest.files.length} файлов`);
 });
}
if(import.meta.main)await runCli(main);
