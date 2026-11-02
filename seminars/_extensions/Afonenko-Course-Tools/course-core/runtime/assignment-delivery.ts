import type { PublicBodyPackage } from "../body-export/model.ts";
import type { BodyReferenceContext } from "../body-export/links.ts";
import type { NativeAssignmentCondition } from "../artifacts/contracts.ts";
import type { NativeOperationIdentity } from "./contracts.ts";
import type { NativeAssignmentProjectPlans } from "./assignment-roles.ts";
export type NativeAssignmentRequest = { source: string; assessmentId: string };
export type NativeAssignmentDeliveryOptions = {
  projectPlans: readonly NativeAssignmentProjectPlans[];
  references?: BodyReferenceContext;
};
export type NativeAssignmentDelivery = Readonly<{
  schema: "course-native-assignment-delivery-v1";
  origin: NativeOperationIdentity & {
    assessments: readonly { source: string; id: string }[];
  };
  assessment: Readonly<{ source: string; id: string }>;
  publicPackage: PublicBodyPackage;
  conditions: Readonly<Record<string, NativeAssignmentCondition>>;
}>;
