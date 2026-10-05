import { ignoredDirectories, mimeTypes as mime } from "../domain/contract.ts";
import { workspace } from "../infrastructure/config.ts";
import { safeRender } from "./render.ts";
import { quarto } from "../infrastructure/process.ts";
import { profileArguments } from "../infrastructure/profiles.ts";
import {
  copyTree,
  exists,
  join,
  relative,
  resolve,
} from "../infrastructure/files.ts";
const w = await workspace(Deno.cwd());
const option = (name: string, fallback: string) => {
  const index = Deno.args.indexOf(name);
  return index >= 0 ? Deno.args[index + 1] : fallback;
};
const port = Number(option("--port", "4200")),
  hostname = option("--host", "127.0.0.1");
const served = join(w.root, ".project-publish/preview-site");
async function snapshot() {
  const next = served + "-next";
  if (await exists(next)) await Deno.remove(next, { recursive: true });
  await copyTree(w.output, next);
  if (await exists(served)) await Deno.remove(served, { recursive: true });
  await Deno.rename(next, served);
}
await snapshot();
const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
const encoder = new TextEncoder();
const reloadScript =
  '<script>new EventSource("/__project_publish/events").onmessage=()=>location.reload();</script>';
Deno.serve({
  port,
  hostname,
  onListen: () =>
    console.log(`Публикация предпросмотр готов http://${hostname}:${port}`),
}, async (request) => {
  const url = new URL(request.url);
  if (url.pathname === "/__project_publish/events") {
    let controller: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
        clients.add(c);
        c.enqueue(encoder.encode(": connected\n\n"));
      },
      cancel() {
        clients.delete(controller);
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
      },
    });
  }
  try {
    const path = resolve(served, "." + decodeURIComponent(url.pathname));
    if (relative(served, path).startsWith("..")) {
      return new Response("Доступ запрещён", { status: 403 });
    }
    const file = (await Deno.stat(path)).isDirectory
      ? join(path, "index.html")
      : path;
    const type = mime[file.split(".").pop()!] || "application/octet-stream";
    const bytes = type.startsWith("text/html")
      ? (await Deno.readTextFile(file)).replace(
        "</body>",
        reloadScript + "</body>",
      )
      : await Deno.readFile(file);
    return new Response(bytes, {
      headers: { "content-type": type, "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return new Response("Страница не найдена", { status: 404 });
    }
    return new Response("Ошибка предпросмотра", { status: 500 });
  }
});
let timer: number | undefined, running = false, dirty = false;
async function rebuild() {
  if (running) {
    dirty = true;
    return;
  }
  running = true;
  do {
    dirty = false;
    try {
      console.log("Публикация пересборка составного проекта");
      if (w.portal) await safeRender(w.root, w.profiles);
      else {await quarto(
          ["render", ".", ...profileArguments(w.profiles)],
          w.root,
        );}
      await snapshot();
      for (const client of clients) {
        try {
          client.enqueue(encoder.encode("data: reload\n\n"));
        } catch {
          clients.delete(client);
        }
      }
      console.log("Публикация предпросмотр обновлён");
    } catch (error) {
      console.error(String(error));
      console.error(
        "Публикация предпросмотр продолжает показывать последнюю успешную сборку",
      );
    }
  } while (dirty);
  running = false;
}
const outputRelative = relative(w.root, w.output).split(/[\\/]/)[0];
const ignored = new Set([...ignoredDirectories, outputRelative, ...w.outputs]);
for await (const event of Deno.watchFs(w.root, { recursive: true })) {
  const changed = event.paths.some((path) =>
    !relative(w.root, path).split(/[\\/]/).some((part) =>
      ignored.has(part) || part.endsWith("_files") || part === "__pycache__"
    )
  );
  if (!changed || event.kind === "access") continue;
  clearTimeout(timer);
  timer = setTimeout(() => {
    void rebuild();
  }, 250);
}
