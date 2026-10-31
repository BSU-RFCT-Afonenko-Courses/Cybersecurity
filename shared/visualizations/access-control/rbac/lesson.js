import {rbacTrace,rbacQueries} from './model.js';
import {createControls,renderStage} from '../../common/runtime.js';
const assets=Promise.all(['model','algorithm'].map(async name=>{const response=await fetch(new URL(`./static/${name}.svg`,import.meta.url));if(!response.ok)throw Error('Не удалось загрузить схему');return response.text();}));
export function rbacControls(options={}){return createControls(rbacTrace,rbacQueries,options);}
export async function rbacDiagram(selected,notes={}){const [model,algorithm]=await assets;return renderStage({selected,notes,model,algorithm});}
