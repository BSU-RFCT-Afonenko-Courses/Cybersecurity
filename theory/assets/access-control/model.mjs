// Модель учебного примера; политика портала задаётся явно.
export function architectureDecision(sessionValid,role,operation){const reason=!sessionValid?'session':operation==='grades'&&role!=='reviewer'?'permission':null;return {allowed:!reason,reason};}
export function dacInitial(){return [
 {by:'Анна',to:'Борис',right:'r',object:'draft'},{by:'Анна',to:'Борис',right:'w',object:'draft'},
 {by:'Анна',to:'Вера',right:'r',object:'draft'},{by:'Анна',to:'Вера',right:'s',object:'draft'},
 ...['Борис','Вера','Дима'].map(to=>({by:'Анна',to,right:'r',object:'materials'}))
];}
export function dacCan(state,user,right,object='draft'){return user==='Анна'||state.some(g=>g.to===user&&g.right===right&&g.object===object);}
export function dacGrant(state,by,to,right,object='draft'){const allowed=by==='Анна'||(right==='r'&&dacCan(state,by,'s',object));return {allowed,state:allowed?[...state.filter(g=>!(g.by===by&&g.to===to&&g.right===right&&g.object===object)),{by,to,right,object}]:state};}
export function dacRevoke(state,by,to,right,object='draft',source=null){
 const matches=state.filter(g=>g.to===to&&g.right===right&&g.object===object&&(source===null||g.by===source));
 const allowed=by==='Анна'&&(source!==null||matches.length<=1);
 return {allowed,state:allowed?state.filter(g=>!matches.includes(g)):state};
}
export function macDecision(process,object,operation){
 const read=object<=process,write=object>=process;
 const allowed=operation==='read'?read:operation==='write'?write:read&&write;
 const reason=allowed?(operation==='edit'?'Обе проверки пройдены: метки равны.':operation==='read'?'Метка объекта не выше метки процесса.':'Метка объекта не ниже метки процесса.'):(operation==='read'?'Чтение вверх запрещено.':operation==='write'?'Запись вниз запрещена.':`Редактирование требует чтения и записи: ${!read?'чтение вверх запрещено':'запись вниз запрещена'}.`);
 return {allowed,reason};
}
export const roleNames={reader:'Читатель',reviewer:'Проверяющий',course:'Ответственный за курс',auditor:'Аудитор'};
export const permissionNames={materials:'Чтение материалов',review:'Проверка работ',grades:'Изменение оценок',members:'Управление участниками',journal:'Чтение журнала'};
export const roleParents={reader:[],reviewer:['reader'],course:['reviewer'],auditor:['reader']};
export const rolePermissions={reader:['materials'],reviewer:['review','grades'],course:['members'],auditor:['journal']};
export function rbacPaths(assignments,permission){const paths=[];function visit(role,path){const next=[...path,role];if(rolePermissions[role].includes(permission))paths.push(next);for(const p of roleParents[role])visit(p,next);}for(const r of assignments)visit(r,[]);return paths;}
export function sessionRequest(state,now){const reason=state.revoked?'revoked':now-state.login>=30?'absolute':now-state.last>=10?'idle':null;return {allowed:!reason,reason,state:reason?{...state}:{...state,last:now}};}
export function sessionScenario(variant='normal'){
 let state={login:0,last:0,revoked:false};const events=[{time:0,event:'Вход',allowed:true,last:0},{time:6,event:'Запрос',...sessionRequest(state,6)}];state=events[1].state;
 events.push({time:7,event:'Вкладка закрыта; cookie сохраняется',last:state.last});
 if(variant==='revoke'){state={...state,revoked:true};events.push({time:8,event:'Серверный сеанс отозван',last:state.last});}
 if(variant==='password')events.push({time:8,event:'Пароль изменён; сеанс не отзывается по политике',last:state.last});
 const times=variant==='idle'?[12,22]:variant==='normal'?[12,21,30]:[12];
 for(const time of times){const result=sessionRequest(state,time);events.push({time,event:'Запрос',...result,last:result.state.last});state=result.state;}
 return events;
}
