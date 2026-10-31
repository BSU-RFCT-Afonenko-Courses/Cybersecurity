// Учебная ACL: владелец alice, bob читает; дополнительных полномочий нет.
export const dacQueries = [
 {subject:'bob',operation:'read',label:'Боб: читать файл'},
 {subject:'bob',operation:'write',label:'Боб: изменить файл'},
 {subject:'alice',operation:'write',label:'Алиса: изменить файл'}
];
export function dacTrace({subject,operation,acl={alice:['read','write'],bob:['read']}}) {
 if (!['alice','bob'].includes(subject)||!['read','write'].includes(operation)) throw Error('Неизвестный субъект или операция');
 const result=(acl[subject]||[]).includes(operation)?'allow':'deny';
 const subjectKey='subject-'+subject;
 return [
 {name:'request',label:'Запрос',model:[subjectKey,'object','monitor','request-flow-'+subject],algorithm:['request']},
 {name:'acl',label:'Права субъекта',model:[subjectKey,'acl','owner'],algorithm:['acl']},
 {name:'operation',label:'Запрошенная операция',model:['acl','monitor','policy-flow'],algorithm:['operation']},
 {name:'result',label:result==='allow'?'Разрешить':'Отказать',model:[subjectKey,'request-flow-'+subject,'monitor','object','access-flow'],algorithm:[result],result}
 ];
}
