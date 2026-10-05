import { freezeOwner } from "../owner-preflight/owner.ts";
import { OwnerFailure } from "../owner-preflight/owner/failure.ts";
try {
  await freezeOwner(await Deno.realPath(Deno.cwd()));
} catch (error) {
  const report = {
    status: "failure",
    code: error instanceof OwnerFailure ? error.code : "INTERNAL.OWNER_GUARD",
    cause: error instanceof OwnerFailure ? error.cause : String(error),
  };
  // Present malformed state fails; an absent locator preserves ordinary rendering.
  await Deno.writeTextFile(
    ".course-owner/guard-failure.json",
    JSON.stringify(report),
  );
  console.error(JSON.stringify(report));
  Deno.exit(2);
}
