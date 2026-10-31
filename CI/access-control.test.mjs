import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dacInitial,dacGrant,dacRevoke,dacCan,macDecision,rbacPaths,sessionRequest} from '../theory/assets/access-control/model.mjs';
test('DAC: редактор не приглашает, приглашение даёт только чтение, отзыв без каскада',()=>{
 let s=dacInitial(); assert.equal(dacGrant(s,'Борис','Дима','r').allowed,false); assert.equal(dacGrant(s,'Вера','Дима','w').allowed,false); assert.equal(dacGrant(s,'Вера','Дима','s').allowed,false);
 const g=dacGrant(s,'Вера','Дима','r'); assert.equal(g.allowed,true);s=g.state;assert.equal(dacCan(s,'Дима','r'),true);
 s=dacRevoke(s,'Анна','Вера','s').state;assert.equal(dacCan(s,'Дима','r'),true);assert.equal(dacGrant(s,'Вера','Дима','r').allowed,false);
 s=dacRevoke(s,'Анна','Дима','r').state;assert.equal(dacCan(s,'Дима','r'),false);assert.equal(dacRevoke(s,'Борис','Вера','r').allowed,false);
});
test('MAC: полная матрица уровней и обе операции, редактирование требует обе',()=>{for(let p=0;p<3;p++)for(let o=0;o<3;o++){
 assert.equal(macDecision(p,o,'read').allowed,p>=o);assert.equal(macDecision(p,o,'write').allowed,p<=o);assert.equal(macDecision(p,o,'edit').allowed,p===o);
}});
test('RBAC: все пути и минимальные два удаления назначений',()=>{
 const roles=['course','reviewer','auditor'];assert.equal(rbacPaths(roles,'materials').length,3);assert.equal(rbacPaths(roles,'grades').length,2);assert.equal(rbacPaths(roles,'journal').length,1);
 assert.deepEqual(rbacPaths(roles,'grades'),[['course','reviewer'],['reviewer']]);
 assert.deepEqual(rbacPaths(roles,'materials'),[['course','reviewer','reader'],['reviewer','reader'],['auditor','reader']]);
 const solutions=[];for(let mask=0;mask<8;mask++){const kept=roles.filter((_,i)=>mask&(1<<i));if(rbacPaths(kept,'materials').length&&rbacPaths(kept,'journal').length&&!rbacPaths(kept,'grades').length&&!rbacPaths(kept,'review').length&&!rbacPaths(kept,'members').length)solutions.push(kept);}
 assert.deepEqual(solutions,[['auditor']]);
});
test('Сеанс: обе границы, активность, отзыв и политика пароля',()=>{
 let s={login:0,last:0,revoked:false};for(const now of [6,12,21]){const r=sessionRequest(s,now);assert.equal(r.allowed,true);s=r.state;}assert.equal(sessionRequest(s,30).reason,'absolute');
 const after12=sessionRequest(sessionRequest({login:0,last:0},6).state,12).state;assert.equal(sessionRequest(after12,22).reason,'idle');assert.equal(sessionRequest(after12,21).allowed,true);
 assert.equal(sessionRequest({login:0,last:0},10).reason,'idle');assert.equal(sessionRequest({login:0,last:29},30).reason,'absolute');
 assert.equal(sessionRequest({login:0,last:6,revoked:true},12).reason,'revoked');assert.equal(sessionRequest({login:0,last:6,passwordChanged:true},12).allowed,true);
 const denied=sessionRequest(after12,22);assert.equal(denied.state.last,12);
});

test('Архитектура: успешный вход не обходит авторизацию и исполнение отказа',async()=>{
 const model=await import('../theory/assets/access-control/model.mjs');assert.equal(typeof model.architectureDecision,'function');
 assert.deepEqual(model.architectureDecision(true,'reader','grades'),{allowed:false,reason:'permission'});
 assert.deepEqual(model.architectureDecision(false,'reviewer','grades'),{allowed:false,reason:'session'});
 assert.deepEqual(model.architectureDecision(true,'reviewer','grades'),{allowed:true,reason:null});
 assert.equal(model.architectureDecision(true,'reader','materials').allowed,true);
});
test('Сеанс: полные независимые линии времени без фоновой активности',async()=>{
 const {sessionScenario}=await import('../theory/assets/access-control/model.mjs');
 const normal=sessionScenario();assert.deepEqual(normal.map(e=>e.time),[0,6,7,12,21,30]);
 assert.equal(normal[2].last,6);assert.equal(normal.at(-1).reason,'absolute');assert.equal(normal.at(-1).state.last,21);
 assert.equal(sessionScenario('idle').at(-1).reason,'idle');assert.equal(sessionScenario('revoke').at(-1).reason,'revoked');assert.equal(sessionScenario('password').at(-1).allowed,true);
});
test('DAC: отзыв черновика не влияет на независимое чтение материалов',()=>{
 let state=dacInitial();assert.equal(dacCan(state,'Дима','r','draft'),false);assert.equal(dacCan(state,'Дима','r','materials'),true);
 state=dacGrant(state,'Вера','Дима','r').state;state=dacRevoke(state,'Анна','Вера','s').state;assert.equal(dacCan(state,'Дима','r'),true);
 state=dacRevoke(state,'Анна','Дима','r').state;assert.equal(dacCan(state,'Дима','r'),false);assert.equal(dacCan(state,'Дима','r','materials'),true);
});

test('DAC: s достаточно для приглашения; собственное чтение не требуется',()=>{
 let state=dacInitial();state=dacRevoke(state,'Анна','Вера','r').state;
 assert.equal(dacCan(state,'Вера','r'),false);assert.equal(dacGrant(state,'Вера','Дима','r').allowed,true);
});
test('DAC: отзыв указанного источника сохраняет независимую выдачу',()=>{
 let state=dacGrant(dacInitial(),'Вера','Дима','r').state;state=dacGrant(state,'Анна','Дима','r').state;
 const ambiguous=dacRevoke(state,'Анна','Дима','r');assert.equal(ambiguous.allowed,false);assert.equal(dacCan(ambiguous.state,'Дима','r'),true);
 state=dacRevoke(state,'Анна','Дима','r','draft','Вера').state;assert.equal(dacCan(state,'Дима','r'),true);assert.equal(state.some(g=>g.to==='Дима'&&g.object==='draft'&&g.by==='Вера'),false);
 state=dacRevoke(state,'Анна','Дима','r','draft','Анна').state;assert.equal(dacCan(state,'Дима','r'),false);assert.equal(dacCan(state,'Дима','r','materials'),true);
});
