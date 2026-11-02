import type { BodyPackage, BodyQuestion } from "./package-contracts.ts";
export type { BodyPackage, BodyQuestion } from "./package-contracts.ts";
export type Node = { t: string; c?: any };
export type PublicBodyPackage = Omit<BodyPackage, "questions"> & {
  questions: Omit<BodyQuestion, "closedKey" | "solution" | "gradingNotes">[];
};
