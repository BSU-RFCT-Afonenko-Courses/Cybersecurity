import { finish } from "../infrastructure/runtime.ts";
const count=await finish(await Deno.realPath(Deno.cwd()));
console.log(`Подготовлено архивов материалов: ${count}`);
