import { reconcile } from "../owner-preflight/owner.ts";
import { OwnerFailure } from "../owner-preflight/owner/failure.ts";
try {
  console.log(
    JSON.stringify(
      await reconcile(Deno.args[0], Deno.args[1], Deno.args[2], Deno.args[3]),
    ),
  );
} catch (error) {
  console.log(
    JSON.stringify({
      status: "failure",
      code: error instanceof OwnerFailure
        ? error.code
        : "INTERNAL.RECONCILIATION",
      cause: error instanceof OwnerFailure ? error.cause : String(error),
    }),
  );
  Deno.exit(2);
}
