import {dacTrace,dacQueries} from './model.js';
import {createControls,renderStage} from '../../common/runtime.js';
const assets=Promise.all(['model','algorithm'].map(async name=>{const response=await fetch(new URL(`./static/${name}.svg`,import.meta.url));if(!response.ok)throw Error('Не удалось загрузить схему');return response.text();}));
export function dacControls(options={}){return createControls(dacTrace,dacQueries,options);}
export async function dacDiagram(selected,notes={}){const [model,algorithm]=await assets;return renderStage({selected,notes,model,algorithm});}
