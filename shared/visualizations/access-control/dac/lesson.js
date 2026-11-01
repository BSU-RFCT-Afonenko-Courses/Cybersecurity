import {dacTrace,dacQueries} from './model.js';
import {createControls} from '../../common/runtime.js';
import {assets,display,key} from '../display.js';
const source=assets(import.meta.url);
export function dacControls(options={}){return createControls(dacTrace,dacQueries,options);}
export async function dacDiagram(selected,notes={}){const [model,algorithm]=await source;return display(selected,model,algorithm,notes,(svg,{query,index})=>{if(query.grant&&index>=1){key(svg,'matrix-boris').querySelector('text').textContent='r, w';key(svg,'acl-boris').querySelector('text').textContent='Борис: r, w';}});}
