export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface Body { "pandoc-api-version": number[]; meta: Record<string, Json>; blocks: Json[] }
export interface Exercise {
  id: string; target: string; authoredTarget?: string; project: string;
  purpose: ExercisePurpose; difficulty: Difficulty; time?: number; workMode?: WorkMode;
  sourceTopic: { id: string; owner: string; rootQmd: string };
  head: { kind: string; level: number; title: string };
  nested: number; unknownAttributes: string[];
  body: Body; gradingNotes?: Body[]; source: string; extensions: Record<string, Json>;
}
export interface Assessment {
  id: string; kind: AssessmentKind; title: string; body: Body; items: string[];
  memberContainers: number; memberKinds: string[]; memberSizes: number[];
  source: string; extensions: Record<string, Json>;
}
import type { AssessmentKind, ExercisePurpose, PedagogicalKind, Difficulty, WorkMode, Requirement, View } from "./vocabulary.ts";
export type { PedagogicalKind } from "./vocabulary.ts";
export interface PedagogicalMetadata {
  difficulty?: Difficulty; time?: number; workMode?: WorkMode; requirement?: Requirement;
}
export interface PedagogicalElement {
  kind: PedagogicalKind; id?: string; exercise?: string; title?: string;
  metadata?: PedagogicalMetadata; order: number; body: Body; source: string;
}
export interface Pedagogy {
  elements: PedagogicalElement[];
  documents?: { source: string; defaults: PedagogicalMetadata }[];
}
export type Extracted<T> = Omit<T, "body" | "gradingNotes" | "source" | "extensions"> & { bodyJson: string; gradingNotesJson?: string[] };
export interface Fragment {
  source: string; course: { id: string; view?: View };
  exercises: Extracted<Exercise>[]; assessment?: Extracted<Assessment> | null;
  pedagogy?: {
    elements: (Omit<PedagogicalElement, "body" | "source"> & { bodyJson: string })[];
    defaults?: PedagogicalMetadata;
  };
}
export interface DocumentResult extends Fragment {
  scope: "document";
  body?: { publicExercises: Fragment["exercises"]; publicAssessment?: Fragment["assessment"]; publicAnswers?: Record<string, {answerType: string; publicAnswerJson: string}> };
  resources?: import("../infrastructure/resources.ts").ResourceFacts;
  document: { source: string; format: string; output: string; profiles: string[] };
}
export interface ReleaseResult {
  scope: "release";
  documents: DocumentResult[];
  model: Course;
}
export interface AdapterFragment { source: string; exercises: { id: string; payload: Json }[]; assessment?: Json }
export interface Contract { name: string; rules: string }
export interface Adapter { directory: string; contract: Contract; fragments: Map<string, AdapterFragment> }
export interface Course {
  course: { id: string; view?: View }; registeredTargets: string[];
  exercises: Exercise[]; assessments: Assessment[];
  pedagogy?: Pedagogy;
}
