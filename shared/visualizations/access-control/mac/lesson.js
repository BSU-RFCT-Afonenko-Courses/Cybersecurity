import {macTrace, macQueries} from './model.js';
import {createControls, renderStage} from '../../common/runtime.js';
const assets = Promise.all(['model','algorithm'].map(async name => {
  const response = await fetch(new URL(`./static/${name}.svg`,import.meta.url));
  if (!response.ok) throw new Error(`Не удалось загрузить SVG: ${name}`);
  return response.text();
}));
export function macControls(options = {}) { return createControls(macTrace, macQueries, options); }
export async function macDiagram(selected, notes = {}) {
  const [model,algorithm] = await assets;
  return renderStage({selected,notes,model,algorithm});
}
