import type { Format } from "./contract.ts";
export interface Member {
  namespace: string;
  path: string;
  mount: string;
  format: Format;
}
export interface Workspace {
  root: string;
  output: string;
  /** Декларативный native output корня; managed portal никогда не рендерится в public. */
  nativeOutput: string;
  portal?: string;
  members: Member[];
  profiles: string[];
  outputs: string[];
  home?: string;
  integrations: string[];
  config: Record<string, unknown>;
}
/** Фактический portal child текущей попытки. */
export interface PortalSelection {
  input: string;
  output: string;
  renderProfiles: string[];
  control: string;
  controlHash: string;
  /** Native inspect перечисляет все реально подключённые author/control configs снимка. */
  configHashes: Record<string, string>;
}
export interface BuildState {
  id: string;
  quarto: string;
  sourceRoot: string;
  workspace: Workspace;
  /** Документированный override Quarto, зафиксированный при подготовке. */
  outputOverride?: string;
  portal?: PortalSelection;
  members: {
    namespace: string;
    format: Format;
    mount: string;
    output: string;
  }[];
  /** Ordered configured callbacks registered before rendering; no ownership grant. */
  failureIntegrations?: string[];
}
/** Проверка фиксированного снимка до рендера; path участников находится в sourceRoot. */
export interface BeforeRenderContext {
  root: string;
  sourceRoot: string;
  attemptId: string;
  profiles: string[];
  config: Record<string, unknown>;
  members: Member[];
  portal?: PortalSelection;
}
/** Результат уже собран, но ещё не опубликован. */
export interface PublicationContext extends BeforeRenderContext {
  stage: string;
  quarto: string;
}
export interface RenderContext extends BeforeRenderContext {
  /** Фактический абсолютный каталог output текущего подпроекта для native render. */
  output: string;
  /** У portal отсутствует member namespace; его определяет собственная конфигурация интеграции. */
  namespace?: string;
  format: Format;
}
export interface FailureContext extends BeforeRenderContext {
  failure: {
    phase: "preparation" | "render" | "publication";
    operation:
      | "before-render"
      | "metadata"
      | "portal-render"
      | "member-render"
      | "save-state"
      | "preview"
      | "workspace"
      | "stage"
      | "finalize"
      | "commit";
    error: { name: string; message: string };
  };
  namespace?: string;
  format?: Format;
  output?: string;
  stage?: string;
}
export interface Integration {
  beforeRender?(context: BeforeRenderContext): Promise<void> | void;
  metadata?(
    context: RenderContext,
  ): Promise<Record<string, unknown>> | Record<string, unknown>;
  finalize?(context: PublicationContext): Promise<void>;
  /** Awaited diagnostics before attempt cleanup; return values cannot veto failure. */
  onFailure?(context: FailureContext): Promise<void> | void;
}
