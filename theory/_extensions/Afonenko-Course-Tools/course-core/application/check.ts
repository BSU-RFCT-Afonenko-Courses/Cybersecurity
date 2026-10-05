import type { Adapter, Course, Fragment } from "../domain/model.ts";
import { assemble } from "../domain/assemble.ts";
export interface CheckPorts {
  prepare(): Promise<Adapter[]>;
  render(): Promise<void>;
  extract(adapters: Adapter[]): Promise<{ selected: string[]; fragments: Map<string, Fragment> }>;
  validate(model: Course, adapters: Adapter[]): Promise<void>;
  save(model: Course): Promise<string>;
}
export async function check(ports: CheckPorts): Promise<{ model: Course; path: string }> {
  const adapters = await ports.prepare();
  await ports.render();
  const facts = await ports.extract(adapters);
  const model = assemble(facts.selected, facts.fragments, adapters);
  await ports.validate(model, adapters);
  return { model, path: await ports.save(model) };
}
