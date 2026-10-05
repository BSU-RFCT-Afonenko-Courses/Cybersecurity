import { referenceStyles } from "./contract.ts";
export type ReferenceStyle = typeof referenceStyles[number];
export interface Target {
  namespace: string;
  id: string;
  page: string;
  fragment: string;
  slide?: string;
  labelHtml: string;
  numberHtml: string;
  label: string;
  number: string;
  baseUrl?: string;
  title?: string;
  /** Настройки представления у потребителя; в экспорт не входят. */
  sourceTitle?: string;
  defaultStyle?: ReferenceStyle;
}
export interface Reference {
  key: string;
  style: ReferenceStyle;
  custom: boolean;
}
export interface Catalog {
  schema: "quarto-reference-catalog";
  generator: { quarto: string };
  publication?: { title: string };
  targets: Record<string, Target>;
}
export interface Import {
  namespace: string; source: string; sourceNamespace: string; baseUrl: string;
  title?: string; style?: ReferenceStyle;
}
/** Публикуются только явно выбранные цели; отсутствие настройки означает пустой каталог. */
export type Exports = Record<string, "*" | string[]>;
