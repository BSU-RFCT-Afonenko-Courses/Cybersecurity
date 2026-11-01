export {lcgTrainer,publicHashChain} from './random-experiments.js';
export {hashBitExperiment,truncatedHashCollision,fileHashExperiment} from './hash-experiments.js';
export {passwordExperiment,passwordSearchCalculator} from './password-experiments.js';
export {caesarTrainer,xorTrainer} from './cipher-experiments.js';
import {caesarTrainer,xorTrainer} from './cipher-experiments.js';
import {diagram} from '../common/diagram.js';
// Совместимость прежних импортов; новые страницы показывают опыты раздельно.
export function caesarXorTrainer(){const view=document.createElement('div');view.append(caesarTrainer(),xorTrainer());return view;}
export function seedDiagram(){return diagram(new URL('./static/seed.svg',import.meta.url));}
export function symmetricDiagram(){return diagram(new URL('./static/symmetric.svg',import.meta.url));}
export function hashDiagram(){return diagram(new URL('./static/hash.svg',import.meta.url));}
