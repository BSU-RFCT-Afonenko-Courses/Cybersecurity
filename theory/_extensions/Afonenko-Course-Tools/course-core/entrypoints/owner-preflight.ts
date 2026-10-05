import { runOwner } from "../owner-preflight/owner.ts";
const [root = ".", profile = "student"] = Deno.args;
const result = await runOwner(root, profile as "student" | "full");
console.log(JSON.stringify(result, null, 2));
Deno.exit(result.exitCode);
