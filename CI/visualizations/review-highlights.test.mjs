import test from 'node:test';
import assert from 'node:assert/strict';
import {rbacTrace} from '../../shared/visualizations/access-control/rbac/model.js';
import {dacTrace} from '../../shared/visualizations/access-control/dac/model.js';
test('RBAC подсвечивает только назначенную роль и применимый путь к разрешению в курсе А',()=>{
 for(const [subject,operation,active,inactive,result] of [
  ['boris','grade','teacher','student','allow'],
  ['lena','grade','student','teacher','deny'],
  ['lena','submit','student','teacher','allow']
 ]){
 const trace=rbacTrace({subject,context:'A',operation});
 assert.equal(trace.at(-1).result,result);
 for(const name of ['roles','permission']){
  const stage=trace.find(s=>s.name===name);
  assert.ok(stage.model.includes(active));assert.ok(!stage.model.includes(inactive));
  assert.ok(stage.model.includes(`assignment-${subject}-${active}`));
  assert.ok(!stage.model.some(key=>key.startsWith('assignment-')&&key.endsWith('-'+inactive)));
 }
 const permission=trace.find(s=>s.name==='permission');
 assert.ok(permission.model.includes(`permission-${operation}`));
 assert.equal(permission.model.includes(`grant-${active}-${operation}`),result==='allow');
 assert.ok(!permission.model.includes(`grant-${inactive}-${operation}`));
 }
});
test('DAC связывает отказ с выбранной строкой ACL, а выдачу права — с владельцем',()=>{
 const denied=dacTrace({subject:'boris',operation:'write'}).at(-1);
 assert.equal(denied.result,'deny');assert.deepEqual(denied.algorithm,['deny']);
 for(const key of ['subject-boris','matrix-boris','acl-boris'])assert.ok(denied.model.includes(key));
 assert.ok(!denied.model.includes('acl-anna'));assert.ok(!denied.model.includes('acl-vera'));
 const allowed=dacTrace({subject:'anna',operation:'write'}).at(-1);
 assert.equal(allowed.result,'allow');assert.deepEqual(allowed.algorithm,['allow']);
 assert.ok(allowed.model.includes('acl-anna'));assert.ok(!allowed.model.includes('acl-boris'));
 const granted=dacTrace({subject:'boris',operation:'write',grant:true});
 assert.ok(granted.find(s=>s.name==='acl').model.includes('owner'));
 assert.equal(granted.at(-1).result,'allow');
});
