import { resolveDownloadRequests } from "../domain/request.ts";
import { diagnostic } from "../diagnostics.ts";
const ast = JSON.parse(await new Response(Deno.stdin.readable).text()),
  field = ast.meta?.["project-download-native-batch"];
if (field?.t !== "MetaString" || typeof field.c !== "string") {
  throw diagnostic(
    "DOWNLOAD.REQUEST_INVALID",
    "Отсутствует native Download batch",
  );
}
const result = resolveDownloadRequests(JSON.parse(field.c));
await Deno.stdout.write(
  new TextEncoder().encode(
    JSON.stringify({
      "pandoc-api-version": ast["pandoc-api-version"],
      meta: {
        "project-download-native-result": {
          t: "MetaString",
          c: JSON.stringify(result),
        },
      },
      blocks: [],
    }),
  ),
);
