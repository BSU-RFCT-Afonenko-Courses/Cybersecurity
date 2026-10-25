/** Внутренний мост Lua: выбранная строка и owned pre-writer намерение. */
import {commonPathDocument,bindNativeJsonDocument} from '../infrastructure/native-run.ts';
import {runCli} from './diagnostics.ts';
async function main(){
 let args=Deno.args;if(args[0]==='--')args=args.slice(1);
 if(![6,10].includes(args.length)||args[0]!=='--root'||args[2]!=='--source'||args[4]!=='--format'||args.length===10&&(args[6]!=='--native-output'||args[8]!=='--document-output'))throw Error('Некорректный private common binding запрос');
 console.log(JSON.stringify(args.length===10?await bindNativeJsonDocument(args[1],args[3],args[5],args[7],args[9]):await commonPathDocument(args[1],args[3],args[5])));
}
if(import.meta.main)await runCli(main);
