import type { AssessmentKind } from "../domain/vocabulary.ts";
export type Node = { t: string; c?: any };
export interface BodyQuestion {
  owner: string;
  id: string;
  key: string;
  source: string;
  visibility: "public";
  answerType: "manual" | "single-choice" | "numeric" | "multipart" | "matching";
  condition: Node[];
  publicAnswer: Node[];
  closedKey: unknown;
  solution: Node[];
  gradingNotes: Node[];
}
export interface BodyPackage {
  schema: "course-body-package-v1";
  owner: string;
  release: string;
  apiVersion: number[];
  questions: BodyQuestion[];
  works: {
    owner: string;
    id: string;
    key: string;
    source: string;
    kind: AssessmentKind;
    title: string;
    items: string[];
    requirements?: Record<string, "required" | "optional">;
  }[];
  resources: {
    owner: string;
    source: string;
    effectiveBase: string;
    target: string;
    sha256: string;
    data: string;
    visibility: "public";
  }[];
}
export type PublicBodyPackage = Omit<BodyPackage, "questions"> & {
  questions: Omit<BodyQuestion, "closedKey" | "solution" | "gradingNotes">[];
};
