// The final configured callback rechecks current provider evidence before commit.
import type { Integration } from "../_extensions/Afonenko-Course-Tools/project-publish/domain/model.ts";
import { validateNavigationPublicationResources } from "../_extensions/Afonenko-Course-Tools/course-core/owner-preflight/publication-resources.ts";
import { assert, load } from "./state.ts";
export default {
  async finalize(ctx) {
    const state = await load(ctx);
    assert(state.publication, "current publication receipt required");
    await validateNavigationPublicationResources(state.navigation);
  },
} satisfies Integration;
