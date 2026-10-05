export async function quarto(
  args: string[],
  cwd: string,
  extra: Record<string, string> = {},
  output: "capture" | "forward" = "capture",
): Promise<string> {
  const command = Deno.env.get("QUARTO") ||
    Deno.env.get("PROJECT_PUBLISH_QUARTO") || "quarto";
  const native = new Deno.Command(command, {
    args,
    cwd,
    env: extra,
    stdout: "piped",
    stderr: "piped",
  });
  let result: Deno.CommandOutput;
  let forwarded: PromiseSettledResult<void>[] = [];
  if (output === "forward") {
    const child = native.spawn();
    const [stdout, liveOut] = child.stdout.tee();
    const [stderr, liveErr] = child.stderr.tee();
    // Keep both diagnostic captures while forwarding actual bytes during render.
    // Settle forwarding separately so a broken sink cannot replace child failure.
    const forwarding = Promise.allSettled([
      liveOut.pipeTo(Deno.stdout.writable, { preventClose: true }),
      liveErr.pipeTo(Deno.stderr.writable, { preventClose: true }),
    ]);
    const [status, out, err] = await Promise.all([
      child.status,
      new Response(stdout).arrayBuffer(),
      new Response(stderr).arrayBuffer(),
    ]);
    result = {
      ...status,
      stdout: new Uint8Array(out),
      stderr: new Uint8Array(err),
    };
    forwarded = await forwarding;
  } else {
    result = await native.output();
  }
  const out = new TextDecoder().decode(result.stdout);
  const err = new TextDecoder().decode(result.stderr);
  if (!result.success) {
    throw new Error(
      `Публикация команда quarto ${
        args[0]
      } завершилась с кодом ${result.code}\n${out}\n${err}`,
    );
  }
  if (args[0] === "render" && /(?:WARNING|WARN:)/.test(err)) {
    throw new Error(`Публикация предупреждения при сборке\n${err}`);
  }
  for (const stream of forwarded) {
    if (stream.status === "rejected") throw stream.reason;
  }
  return out;
}
