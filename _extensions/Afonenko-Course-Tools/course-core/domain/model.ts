export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface Body { "pandoc-api-version": number[]; meta: Record<string, Json>; blocks: Json[] }
export interface Exercise {
  id: string; target?: string; authoredTarget?: string; project: string;
  purpose?: ExercisePurpose; difficulty: Difficulty; time: number; statementVisibility: StatementVisibility; hasSolution: boolean; hasPublicSolution: boolean;
  sourceTopic?: { id: string; owner?: string; rootQmd: string };
  head: { kind: string; level: number; title: string };
  nested: number; unknownAttributes: string[];
  body: Body; gradingNotes?: Body[]; source: string; extensions: Record<string, Json>;
}
export interface Assessment {
  id: string; kind: AssessmentKind; title: string; body: Body; items: string[]; assignments: Record<string, Assignment>; theoryTime?: number;
  relatedExercise?: string;
  memberContainers: number; memberKinds: string[]; memberSizes: number[];
  source: string; extensions: Record<string, Json>;
}
import type { AssessmentKind, ExercisePurpose, PedagogicalKind, Difficulty, WorkMode, Requirement, View, Stage, StatementVisibility } from "./vocabulary.ts";
export type { PedagogicalKind, ExercisePurpose } from "./vocabulary.ts";
export interface Assignment { stage?: Stage; requirement: "required" | "optional"; workMode: WorkMode }
export interface ExerciseDeclaration { id: string; source: string; difficulty: Difficulty; time: number; statementVisibility: StatementVisibility; purpose?: ExercisePurpose; hasSolution: boolean; hasPublicSolution: boolean }
export type AssessmentComposition = Omit<Assessment, "body" | "source" | "extensions">;
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
export interface TopicFact { source: string; semester?: string; categories: string[] }
export interface SourceProfile {mode:"implementation"|"student-tests";root:string;include:string[]}
export interface ResolvedProjectCheck {profile:string; runtime:string; sourceProfile:SourceProfile; "source-profile":string; tests:string[]; references?:{name:string;root:string;optional:boolean}[]; [key:string]: unknown}
export interface ProjectFact {exerciseId:string;source:string;projectRoot:string;bankMember:boolean;purpose?:ExercisePurpose;statementVisibility:StatementVisibility;artifactPolicy:{student?:"starter"|"full";full:"full";conditions:boolean};check?:ResolvedProjectCheck}
export interface Fragment {
  projects?: ProjectFact[]; topic?: TopicFact;
  source: string; course: { id?: string; view?: View };
  declarations?: ExerciseDeclaration[]; rawAssessment?: AssessmentComposition | null;
  exercises: Extracted<Exercise>[]; assessment?: Extracted<Assessment> | null;
  pedagogy?: {
    elements: (Omit<PedagogicalElement, "body" | "source"> & { bodyJson: string })[];
    defaults?: PedagogicalMetadata;
  };
}
export interface DocumentResult extends Fragment {
  scope: "document";
  body?: { publicExercises: Fragment["exercises"]; publicAssessment?: Fragment["assessment"]; publicAnswers?: Record<string, {answerType: string; publicAnswerJson: string}>; fullAnswers?: Record<string, {answerType: string; publicAnswerJson: string; closedKey: unknown}> };
  resources?: import("../infrastructure/resources.ts").ResourceFacts;
  document: { source: string; format: string; output: string; profiles: string[]; exportContext?: boolean };
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
  course: { id?: string; view?: View }; registeredTargets: string[];
  projects?: ProjectFact[]; topics?: TopicFact[];
  exercises: Exercise[]; assessments: Assessment[];
  declarations?: ExerciseDeclaration[]; assessmentCompositions?: (AssessmentComposition & {source: string})[];
  pedagogy?: Pedagogy;
}
