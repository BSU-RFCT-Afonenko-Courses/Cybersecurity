import test from 'node:test';
import assert from 'node:assert/strict';
const load = path => import('../../shared/visualizations/'+path);
test('DAC различает чтение и запись; отзыв разрешения действует на новый запрос', async () => {
 const {dacTrace}=await load('access-control/dac/model.js');
 assert.equal(dacTrace({subject:'bob',operation:'read'}).at(-1).result,'allow');
 assert.equal(dacTrace({subject:'bob',operation:'write'}).at(-1).result,'deny');
 assert.equal(dacTrace({subject:'bob',operation:'read',acl:{}}).at(-1).result,'deny');
 const alice=dacTrace({subject:'alice',operation:'write'});
 assert.equal(alice.at(-1).result,'allow');
 assert.ok(alice[0].model.includes('subject-alice'));
 assert.ok(alice.at(-1).model.includes('subject-alice'));
 assert.ok(dacTrace({subject:'bob',operation:'write'})[0].model.includes('subject-bob'));
});
test('RBAC применяет назначения только в данном контексте и не меняет другие трассы', async () => {
 const {rbacTrace}=await load('access-control/rbac/model.js');
 const a=rbacTrace({subject:'anna',context:'A',operation:'grade'}), snapshot=structuredClone(a);
 assert.equal(a.at(-1).result,'allow');
 const b=rbacTrace({subject:'anna',context:'B',operation:'grade'});
 assert.equal(b.at(-1).result,'deny'); b[0].model.push('x'); assert.deepEqual(a,snapshot);
});
test('LCG вычисляет полный следующий выход; Цезарь и XOR обратимы', async () => {
 const {lcgSequence,caesar,xorBytes}=await load('crypto/model.js');
 assert.deepEqual(lcgSequence(3,5,1,16,4),[0,1,6,15]);
 assert.equal(caesar(caesar('ABC XYZ',3),-3),'ABC XYZ');
 assert.deepEqual(xorBytes(xorBytes([65,66,255],42),42),[65,66,255]);
 assert.throws(()=>lcgSequence(1,5,1,0,3)); assert.throws(()=>xorBytes([256],42));
});
test('Простая сумма допускает коллизию; XOR восстанавливает один известный потерянный блок', async () => {
 const {byteSum,xorParity,recoverBlock,backupCopies,sha256}=await load('data-integrity/model.js');
 assert.equal(byteSum([10,20]),byteSum([11,19]));
 const parity=xorParity([[1,2],[3,4],[5,6]]);
 assert.deepEqual(recoverBlock([null,[3,4],[5,6]],parity),[1,2]);
 assert.throws(()=>recoverBlock([null,null,[5,6]],parity));
 const copies=backupCopies({A:2,B:3,C:5},[['A'],['B'],['A']]);
 assert.deepEqual(copies.full.map(d=>d.size),[10,10,10,10]);
 assert.deepEqual(copies.incremental.map(d=>d.size),[10,2,3,2]);
 assert.deepEqual(copies.differential.map(d=>d.size),[10,2,5,5]);
 assert.deepEqual(copies.differential[3].files,['A','B']);
 assert.notEqual(await sha256([10,20]),await sha256([11,19]));
});
