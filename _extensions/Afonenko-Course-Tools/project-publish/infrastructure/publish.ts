import type { BuildState, Workspace } from "../domain/model.ts";
import {
  copyTree,
  dirname,
  exists,
  files,
  join,
  relative,
  safeDirectory,
  within,
} from "./files.ts";
import { integrations } from "./integrations.ts";
import { context, owned } from "./attempt.ts";
import { unchangedPortal } from "./portal.ts";
import { unchanged } from "../domain/attempt.ts";
import {
  failureError,
  failureMessage,
  type FailurePoint,
  logFailure,
  notifyFailure,
} from "./failure.ts";
export async function publish(
  w: Workspace,
  state: BuildState,
  rename: (from: string, to: string) => Promise<void> = Deno.rename,
): Promise<void> {
  owned(state, w.root);
  let point: FailurePoint = { phase: "publication", operation: "stage" };
  try {
    unchanged(w, state);
    await unchangedPortal(state);
    if (w.portal) {
      await safeDirectory(w.root, join(w.root, ".project-publish"));
      await safeDirectory(w.root, w.output);
    }
    const stage = join(w.root, ".project-publish", "publish-" + state.id);
    const backup = join(w.root, ".project-publish", "output-" + state.id);
    if (w.portal) {
      await safeDirectory(w.root, state.portal!.output);
      await safeDirectory(w.root, stage);
      await safeDirectory(w.root, backup);
    }
    let backedUp = false;
    let committed = false;
    point = { ...point, stage };
    try {
      await Deno.mkdir(stage, { recursive: true });
      if (state.portal) await copyTree(state.portal.output, stage);
      else if (!w.home && await exists(w.output)) {
        await copyTree(w.output, stage);
      }
      // Не допускаем публикацию результатов других профилей как ресурсов корня.
      for (const name of w.outputs) {
        if (!name || !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(name)) continue;
        const old = join(stage, name);
        if (await exists(old)) await Deno.remove(old, { recursive: true });
      }
      for (const member of w.members) {
        const sourceCopy = join(stage, relative(w.root, member.path));
        if (await exists(sourceCopy)) {
          await Deno.remove(sourceCopy, { recursive: true });
        }
      }
      const ordered = [...state.members].sort((a, b) =>
        Number(b.mount === "") - Number(a.mount === "")
      );
      for (const member of ordered) {
        const dest = member.mount ? within(stage, member.mount) : stage;
        if (member.mount && await exists(dest)) {
          throw new Error(`Публикация: конфликт размещения ${member.mount}`);
        }
        if (member.format === "pdf") {
          const pdfs = (await files(member.output)).filter((path) =>
            path.endsWith(".pdf")
          );
          if (!pdfs.length) {
            throw new Error(
              `Публикация: проект ${member.namespace} не создал PDF`,
            );
          }
          for (const path of pdfs) {
            const target = join(dest, relative(member.output, path));
            await Deno.mkdir(dirname(target), { recursive: true });
            await Deno.copyFile(path, target);
          }
        } else await copyTree(member.output, dest);
      }
      if (!await exists(join(stage, "index.html"))) {
        throw new Error(
          "Публикация должна содержать index.html; проверьте главный проект",
        );
      }
      point = { ...point, operation: "finalize" };
      for (
        const adapter of await integrations(state.workspace, state.sourceRoot)
      ) {
        await adapter.finalize?.({
          ...context(state),
          stage,
          quarto: state.quarto,
        });
      }
      await Deno.writeTextFile(join(stage, ".nojekyll"), "");
      point = { ...point, operation: "commit" };
      const hadOutput = await exists(w.output);
      await unchangedPortal(state);
      if (w.portal) {
        await safeDirectory(w.root, join(w.root, ".project-publish"));
        await safeDirectory(w.root, w.output);
        await safeDirectory(w.root, stage);
        await safeDirectory(w.root, backup);
        await files(stage);
      }
      if (hadOutput) {
        await rename(w.output, backup);
        backedUp = true;
      }
      // Managed backup — последний проверенный выпуск; legacy backup — native output.
      await rename(stage, w.output);
      committed = true;
      if (hadOutput) {
        if (w.portal) {
          try {
            await Deno.remove(backup, { recursive: true });
          } catch (error) {
            logFailure(
              `Публикация новый выпуск committed; очистка старого backup ${backup} отказала`,
              error,
            );
          }
        } else await Deno.remove(backup, { recursive: true });
      }
    } catch (error) {
      const failures = await notifyFailure(state, error, point);
      let recoveryMessage: string | undefined;
      try {
        if (w.portal) {
          if (backedUp && !committed) {
            if (await exists(w.output)) {
              await Deno.remove(w.output, { recursive: true });
            }
            if (await exists(backup)) {
              try {
                await rename(backup, w.output);
              } catch (rollback) {
                failures.push(rollback);
                recoveryMessage =
                  `Публикация восстановление отказало; прежний выпуск сохранён в ${backup}: ${
                    failureMessage(error)
                  }; ${failureMessage(rollback)}`;
              }
            }
          }
        } else {
          if (await exists(w.output)) {
            await Deno.remove(w.output, { recursive: true });
          }
          if (await exists(backup)) {
            await Deno.remove(backup, { recursive: true });
          }
        }
      } catch (recovery) {
        failures.push(recovery);
      }
      try {
        if (await exists(stage)) {
          await Deno.remove(stage, { recursive: true });
        }
      } catch (cleanup) {
        failures.push(cleanup);
        logFailure(
          `Публикация очистка private stage ${stage} отказала`,
          cleanup,
        );
      }
      throw failureError(error, failures, recoveryMessage);
    }
  } catch (error) {
    throw failureError(error, await notifyFailure(state, error, point));
  }
}
