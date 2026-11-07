// Источник примера: матрица Анны, Бориса и Веры; владелец черновика — Анна.
export const dacQueries=[
 {subject:'boris',operation:'read',label:'Борис: читать черновик'},
 {subject:'boris',operation:'write',label:'Борис: изменить черновик'},
 {subject:'anna',operation:'write',label:'Анна: изменить черновик'},
 {subject:'vera',operation:'read',label:'Вера: читать черновик'},
 {subject:'boris',operation:'write',grant:true,label:'Анна выдала Борису w: изменить черновик'}
];
export function dacTrace({subject,operation,grant=false,acl={anna:['read','write'],boris:['read'],vera:[]}}){
 if(!['anna','boris','vera'].includes(subject)||!['read','write'].includes(operation))throw Error('Неизвестный субъект или операция');
 const rights=[...(acl[subject]||[])];if(grant&&subject==='boris')rights.push('write');
 const result=rights.includes(operation)?'allow':'deny',entity=[`subject-${subject}`,`matrix-${subject}`];
 return [
 {name:'request',label:'Запрос к черновику',model:[...entity,'matrix-column'],algorithm:['request'],explanation:'Субъект запрашивает доступ к черновику.'},
 {name:'acl',label:grant?'Владелец меняет ACL':'ACL черновика',model:[...entity,'acl',`acl-${subject}`,...(grant?['owner','owner-label']:[])],algorithm:['acl'],explanation:grant?'Анна как владелец добавила Борису запись w в ACL черновика.':'Столбец черновика задаёт ACL этого объекта. Право записи содержимого не даёт права менять ACL.'},
 {name:'operation',label:'Проверка операции',model:[...entity,`acl-${subject}`],algorithm:['operation'],explanation:`Проверяем, выдано ли ${operation==='read'?'чтение r':'изменение w'} выбранному субъекту.`},
 {name:'result',label:result==='allow'?'Разрешить':'Отказать',model:[...entity,`acl-${subject}`],algorithm:[result],result,explanation:result==='allow'?'В ACL черновика найдено запрошенное право.':'Запрошенного права в ACL черновика нет.'}
 ];
}
