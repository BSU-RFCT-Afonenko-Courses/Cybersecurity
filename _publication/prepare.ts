import type { Integration } from "../_extensions/Afonenko-Course-Tools/project-publish/domain/model.ts";
import {
  activateNavigationOwner,
  prepareNavigationOwner,
} from "../_extensions/Afonenko-Course-Tools/course-core/owner-preflight/navigation.ts";
import {
  activateOwner,
  type PreparedOwner,
  prepareOwner,
} from "../_extensions/Afonenko-Course-Tools/course-core/owner-preflight/owner.ts";
import { assert, load, save } from "./state.ts";
export default {
  async beforeRender(ctx) {
    const profile = ctx.profiles[0];
    assert(
      ctx.portal && ctx.profiles.length === 1 &&
        (profile === "student" || profile === "full"),
      "one managed portal audience required",
    );
    const navigation = await prepareNavigationOwner(ctx.sourceRoot, {
      attemptId: ctx.attemptId,
      profile,
      extension: "_extensions/Afonenko-Course-Tools/course-core",
      portal: ctx.portal,
      members: ctx.members,
    });
    const owners: Record<string, PreparedOwner> = {};
    for (const name of ["tasks"]) {
      const member = ctx.members.find((m) => m.namespace === name);
      assert(member?.format === "html", `unsupported current owner: ${name}`);
      owners[name] = await prepareOwner(member.path, {
        attemptId: ctx.attemptId,
        profile,
        extension: "_extensions/Afonenko-Course-Tools/course-core",
        publicationAddresses: { navigation },
      });
    }
    await save(ctx, {
      attemptId: ctx.attemptId,
      sourceRoot: ctx.sourceRoot,
      navigation,
      owners,
      nativeMembers: {},
    });
  },
  async metadata(ctx) {
    const state = await load(ctx);
    if (ctx.namespace === undefined) {
      assert(
        ctx.portal && ctx.output === ctx.portal.output && ctx.format === "html",
        "actual namespace-less portal required",
      );
      return await activateNavigationOwner(state.navigation);
    }
    const member = ctx.members.find((m) => m.namespace === ctx.namespace);
    assert(
      member && member.format === ctx.format &&
        !state.nativeMembers[ctx.namespace],
      "missing/repeated current native member",
    );
    state.nativeMembers[ctx.namespace] = {
      output: ctx.output,
      format: ctx.format,
    };
    await save(ctx, state);
    return state.owners[ctx.namespace]
      ? await activateOwner(state.owners[ctx.namespace], { output: ctx.output })
      : {};
  },
} satisfies Integration;
