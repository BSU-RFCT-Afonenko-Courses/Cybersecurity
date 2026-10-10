import type { AssessmentKind, StatementVisibility, ExercisePurpose } from "../domain/vocabulary.ts";
export type Node = { t: string; c?: any };
export interface BodyQuestion {
  owner: string;
  id: string;
  key: string;
  source: string;
  visibility: "public";
  statementVisibility: StatementVisibility;
  purpose?: ExercisePurpose;
  hasPublicSolution: boolean;
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
    assignments: Record<string, import("../domain/model.ts").Assignment>;
    theoryTime?: number; relatedExercise?: string;
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
