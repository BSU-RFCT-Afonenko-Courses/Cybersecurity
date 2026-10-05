import { join } from "stdlib/path";
import type {
  BeforeRenderContext,
  PublicationContext,
} from "../_extensions/Afonenko-Course-Tools/project-publish/domain/model.ts";
import type { PreparedOwner } from "../_extensions/Afonenko-Course-Tools/course-core/owner-preflight/owner.ts";
import type { NavigationPublicationResourceReceipt } from "../_extensions/Afonenko-Course-Tools/course-core/owner-preflight/publication-resources.ts";
export interface State {
  attemptId: string;
  sourceRoot: string;
  navigation: PreparedOwner;
  owners: Record<string, PreparedOwner>;
  nativeMembers: Record<string, { output: string; format: string }>;
  publication?: NavigationPublicationResourceReceipt;
}
export function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`COURSE_PUBLICATION: ${message}`);
}
const file = (ctx: BeforeRenderContext) =>
  join(
    ctx.root,
    ".project-publish/builds",
    ctx.attemptId,
    "course-publication.json",
  );
export async function load(ctx: BeforeRenderContext): Promise<State> {
  const state: State = JSON.parse(await Deno.readTextFile(file(ctx)));
  assert(
    state.attemptId === ctx.attemptId && state.sourceRoot === ctx.sourceRoot,
    "current source/attempt required",
  );
  return state;
}
export async function save(ctx: BeforeRenderContext, state: State) {
  await Deno.writeTextFile(file(ctx), JSON.stringify(state));
}
export function members(ctx: PublicationContext, state: State) {
  return ctx.members.map((member) => {
    const current = state.nativeMembers[member.namespace];
    assert(
      current && current.format === member.format,
      `current native output absent: ${member.namespace}`,
    );
    return {
      path: member.path,
      mount: member.mount,
      format: member.format,
      output: current.output,
      ...(state.owners[member.namespace]
        ? { owner: state.owners[member.namespace] }
        : {}),
    };
  });
}
