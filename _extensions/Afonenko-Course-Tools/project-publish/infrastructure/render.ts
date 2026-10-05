import type { BuildState, Workspace } from "../domain/model.ts";
import { ignoredDirectories } from "../domain/contract.ts";
import { copySources, join, relative } from "./files.ts";
import { quarto } from "./process.ts";
import { profileArguments } from "./profiles.ts";
import { integrations } from "./integrations.ts";
import { context } from "./attempt.ts";
import { preparePortal, unchangedPortal } from "./portal.ts";
import {
  failureError,
  type FailurePoint,
  notifyFailure,
  registerFailureIntegrations,
} from "./failure.ts";
export async function renderMembers(w: Workspace): Promise<BuildState> {
  const id = crypto.randomUUID();
  const snapshot = join(w.root, ".project-publish", "builds", id, "sources");
  const state: BuildState = {
    id,
    quarto: (await quarto(["--version"], w.root)).trim(),
    sourceRoot: snapshot,
    workspace: structuredClone(w),
    outputOverride: Deno.env.get("QUARTO_PROJECT_OUTPUT_DIR") || undefined,
    members: [],
  };
  let point: FailurePoint = {
    phase: "preparation",
    operation: "before-render",
  };
  try {
    await copySources(
      w.root,
      snapshot,
      new Set([...ignoredDirectories, ...w.outputs]),
    );
    await preparePortal(state);
    const adapters = await integrations(state.workspace, snapshot);
    registerFailureIntegrations(state, adapters);
    for (const adapter of adapters) {
      await adapter.beforeRender?.(context(state));
    }
    await unchangedPortal(state);
    if (state.portal) {
      const args = [
        "render",
        ".",
        "--to",
        "html",
        "--output-dir",
        relative(snapshot, state.portal.output),
      ];
      const outputOverlay = join(
        w.root,
        ".project-publish",
        "builds",
        id,
        "portal-output-metadata.json",
      );
      await Deno.writeTextFile(
        outputOverlay,
        JSON.stringify({ "output-file": "index.html" }),
      );
      args.push("--metadata-file", outputOverlay);
      for (let index = 0; index < adapters.length; index++) {
        if (!adapters[index].metadata) continue;
        point = {
          phase: "preparation",
          operation: "metadata",
          format: "html",
          output: state.portal.output,
        };
        const overlay = join(
          w.root,
          ".project-publish",
          "builds",
          id,
          `portal-${index}-metadata.json`,
        );
        await Deno.writeTextFile(
          overlay,
          JSON.stringify(
            await adapters[index].metadata!({
              ...context(state),
              format: "html",
              output: state.portal.output,
            }),
          ),
        );
        args.push("--metadata-file", overlay);
      }
      console.log("Публикация: сборка portal (html)");
      point = {
        phase: "render",
        operation: "portal-render",
        format: "html",
        output: state.portal.output,
      };
      await unchangedPortal(state);
      await quarto(
        [
          ...args,
          "--fail-if-warnings",
          ...profileArguments(state.portal.renderProfiles),
        ],
        snapshot,
        {
          PROJECT_PUBLISH_MEMBER: "1",
          QUARTO_PROJECT_OUTPUT_DIR: "",
          QUARTO_PROFILE: "",
        },
      );
      await unchangedPortal(state);
    }
    for (const member of w.members) {
      const output = join(
        w.root,
        ".project-publish",
        "builds",
        id,
        "output",
        member.namespace,
      );
      const source = join(snapshot, relative(w.root, member.path));
      const args = [
        "render",
        ".",
        "--to",
        member.format,
        "--output-dir",
        relative(source, output),
      ];
      for (let index = 0; index < adapters.length; index++) {
        if (!adapters[index].metadata) continue;
        point = {
          phase: "preparation",
          operation: "metadata",
          namespace: member.namespace,
          format: member.format,
          output,
        };
        const overlay = join(
          w.root,
          ".project-publish",
          "builds",
          id,
          `${member.namespace}-${index}-metadata.json`,
        );
        await Deno.writeTextFile(
          overlay,
          JSON.stringify(
            await adapters[index].metadata!({
              ...context(state),
              namespace: member.namespace,
              format: member.format,
              output,
            }),
          ),
        );
        args.push("--metadata-file", overlay);
      }
      console.log(`Публикация: сборка ${member.namespace} (${member.format})`);
      point = {
        phase: "render",
        operation: "member-render",
        namespace: member.namespace,
        format: member.format,
        output,
      };
      await quarto(
        [...args, "--fail-if-warnings", ...profileArguments(w.profiles)],
        source,
        { PROJECT_PUBLISH_MEMBER: "1" },
      );
      state.members.push({
        namespace: member.namespace,
        format: member.format,
        mount: member.mount,
        output,
      });
    }
    return state;
  } catch (error) {
    throw failureError(error, await notifyFailure(state, error, point));
  }
}
