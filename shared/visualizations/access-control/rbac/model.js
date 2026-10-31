// Учебные назначения без наследования и запретов: в A Анна — преподаватель, в B — студент.
export const rbacQueries=[
 {subject:'anna',context:'A',operation:'grade',label:'Анна: проверять в курсе А'},
 {subject:'anna',context:'B',operation:'grade',label:'Анна: проверять в курсе Б'},
 {subject:'anna',context:'B',operation:'view',label:'Анна: смотреть в курсе Б'}
];
export function rbacTrace({subject,context,operation,assignments={anna:{A:['teacher'],B:['student']}},permissions={teacher:['view','grade'],student:['view']}}) {
 if(subject!=='anna'||!['A','B'].includes(context)||!['view','grade'].includes(operation)) throw Error('Неизвестный субъект, контекст или операция');
 const roles=assignments[subject]?.[context]||[];
 const result=roles.some(role=>(permissions[role]||[]).includes(operation))?'allow':'deny';
 return [
 {name:'request',label:'Запрос в контексте',model:['subject','context','object','request-flow'],algorithm:['request']},
 {name:'roles',label:'Назначенные роли',model:['subject','context','teacher','student'],algorithm:['roles']},
 {name:'permission',label:'Разрешение роли',model:['teacher','student','permission','monitor','policy-flow'],algorithm:['permission']},
 {name:'result',label:result==='allow'?'Разрешить':'Отказать',model:['monitor','object','access-flow'],algorithm:[result],result}
 ];
}
