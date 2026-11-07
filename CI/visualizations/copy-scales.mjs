// Декларативный DOT из той же предметной функции, которую проверяет тест.
import {backupExample} from '../../shared/visualizations/data-integrity/examples.js';
import {backupCopies} from '../../shared/visualizations/data-integrity/model.js';
const copies=backupCopies(backupExample.sizes,backupExample.changes);
const rows=[['full','Полная'],['incremental','Инкрементная'],['differential','Дифференциальная']];
const lines=['digraph G {','graph [rankdir=LR,bgcolor="transparent",nodesep=0.35,ranksep=0.4];','node [shape=box,style="rounded,filled",fillcolor="#eef4fa",fontname="DejaVu Sans",fontsize=16];','edge [fontname="DejaVu Sans",fontsize=12];'];
let index=0;
for(const [kind,label] of rows){const keys=[];for(const [day,copy] of copies[kind].entries()){const key='n'+index++;keys.push(key);const change=day?'правка '+backupExample.changes[day-1].join(', '):'начальная полная';lines.push(`${key} [id="${key}",label=${JSON.stringify(label+' · '+backupExample.days[day]+'\n'+change+'\n'+copy.files.join(', ')+': '+copy.size+' МБ')}];`);}for(let i=1;i<keys.length;i++)lines.push(`${keys[i-1]} -> ${keys[i]} [label="время →"];`);}
lines.push('}');console.log(lines.join('\n'));
