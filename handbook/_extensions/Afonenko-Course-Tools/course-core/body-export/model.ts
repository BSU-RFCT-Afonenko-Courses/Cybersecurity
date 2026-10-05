import type { AssessmentKind, View } from "../domain/vocabulary.ts";
export type Node = { t: string; c?: any };
export interface BodySelection {
  sources: string[];
  release: string;
  selectionHash: string;
}
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
export interface NativeAnswerProjection {
  schema: "course-answer-projection-v1";
  source: string;
  profile: "student";
  questions: {
    id: string;
    answerSpecCount: number;
    correctMarkerCount: number;
  }[];
}
export interface BodySeal {
  schema: "course-body-seal-v1";
  source: string;
  invocationId: string;
  selectionHash: string;
  actualHash: string;
  captureHash: string;
  identityHash: string;
  resourceSealHash: string;
  partitionHash: string;
}
export interface BodyReceipt {
  schema: "course-body-receipt-v1";
  root: string;
  attemptId: string;
  profile: View;
  sessionId: string;
  sessionHash: string;
  invocationId: string;
  selection: BodySelection;
  packageHash: string;
  publicHash: string;
  modules: Record<string, string>;
  seals: Record<string, string>;
  resources: {
    source: string;
    sha256: string;
    target: string;
    effectiveBase: string;
  }[];
}
export interface OwnerBodyHandle {
  schema: "course-body-handle-v1";
  root: string;
  attemptId: string;
  profile: View;
  sessionId: string;
  sessionHash: string;
  invocationId: string;
  selectionHash: string;
  packagePath: string;
  packageHash: string;
  publicPath: string;
  publicHash: string;
  receiptPath: string;
  receiptHash: string;
  indexHash: string;
}
