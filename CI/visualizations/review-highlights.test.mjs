import test from 'node:test';
import assert from 'node:assert/strict';
import {rbacTrace} from '../../shared/visualizations/access-control/rbac/model.js';
import {dacTrace} from '../../shared/visualizations/access-control/dac/model.js';
test('RBAC подсвечивает роль и связи только выбранного контекста',()=>{
 for(const [context,active,inactive,result] of [['A','teacher','student','allow'],['B','student','teacher','deny']]){
 const trace=rbacTrace({subject:'anna',context,operation:'grade'});
 assert.equal(trace.at(-1).result,result);
 for(const name of ['roles','permission']){
 const stage=trace.find(s=>s.name===name);
 assert.ok(stage.model.includes(active));assert.ok(!stage.model.includes(inactive));
 assert.ok(stage.model.includes(`assignment-${context}-${active}`));
 }
 const permission=trace.find(s=>s.name==='permission');
 assert.ok(permission.model.includes(`permission-${active}`));
 assert.ok(!permission.model.includes(`permission-${inactive}`));
 }
});
test('DAC не исполняет разрешённый поток при отказе, но сохраняет субъект и решение',()=>{
 const denied=dacTrace({subject:'bob',operation:'write'}).at(-1);
 assert.equal(denied.result,'deny');assert.ok(!denied.model.includes('access-flow'));
 assert.ok(denied.model.includes('subject-bob'));assert.deepEqual(denied.algorithm,['deny']);
 assert.ok(dacTrace({subject:'alice',operation:'write'}).at(-1).model.includes('access-flow'));
});
