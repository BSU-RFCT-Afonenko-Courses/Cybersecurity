// Configured after QRC: source completion precedes Navigation's current inventory.
import type { Integration } from "../_extensions/Afonenko-Course-Tools/project-publish/domain/model.ts";
import {
  finishOwner,
  validateOwnerResources,
} from "../_extensions/Afonenko-Course-Tools/course-core/owner-preflight/owner.ts";
import { finishNavigationOwner } from "../_extensions/Afonenko-Course-Tools/course-core/owner-preflight/navigation.ts";
import { sealNavigationPublicationResources } from "../_extensions/Afonenko-Course-Tools/course-core/owner-preflight/publication-resources.ts";
import { assert, load, members, save } from "./state.ts";
export default {
  async finalize(ctx) {
    const state = await load(ctx), current = members(ctx, state);
    const addresses = current.map(({ path, mount, format, output }) => ({
      path,
      mount,
      format,
      output,
    }));
    for (const name of ["tasks"]) {
      const result = await finishOwner(state.owners[name], {
        publicationAddresses: { output: ctx.stage, members: addresses },
      });
      assert(
        result.exitCode === 0,
        `current child completion refused: ${name}`,
      );
      await validateOwnerResources(state.owners[name]);
    }
    const result = await finishNavigationOwner(state.navigation, {
      output: ctx.stage,
    });
    assert(result.exitCode === 0, "current navigation completion refused");
    state.publication = await sealNavigationPublicationResources(
      state.navigation,
      { output: ctx.stage, members: current },
    );
    await save(ctx, state);
  },
} satisfies Integration;
