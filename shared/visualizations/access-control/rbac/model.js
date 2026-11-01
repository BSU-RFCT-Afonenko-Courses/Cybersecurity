// Подтверждённый учебный пример Moodle: общие роли в контексте курса А.
export const people={lena:'Лена',ilya:'Илья',boris:'Борис'};
export const permissions={view:'Открыть задание',submit:'Отправить работу',grade:'Оценить работу'};
export const rolePermissions={student:['view','submit'],teacher:['view','grade']};
export const assignments={lena:['student'],ilya:['student'],boris:['teacher']};
export const rbacQueries=[
 {subject:'lena',context:'A',operation:'grade',label:'Лена: оценить работу — курс А'},
 {subject:'lena',context:'A',operation:'view',label:'Лена: открыть задание — курс А'},
 {subject:'lena',context:'A',operation:'submit',label:'Лена: отправить работу — курс А'},
 {subject:'boris',context:'A',operation:'grade',label:'Борис: оценить работу — курс А'},
 {subject:'boris',context:'A',operation:'submit',label:'Борис: отправить работу — курс А'}
];
export function rbacTrace({subject,context='A',operation,roles=assignments[subject]}){
 if(!people[subject]||context!=='A'||!permissions[operation]||!Array.isArray(roles))throw Error('Неизвестный субъект, контекст или операция');
 const through=roles.find(r=>rolePermissions[r]?.includes(operation)),result=through?'allow':'deny';
 const person=[`subject-${subject}`,`subject-label-${subject}`],roleKeys=roles.flatMap(r=>[r,`role-label-${r}`,`assignment-${subject}-${r}`]),permission=[`permission-${operation}`,`permission-label-${operation}`];
 const edges=roles.filter(r=>rolePermissions[r]?.includes(operation)).map(r=>`grant-${r}-${operation}`);
 return [
 {name:'request',label:'Запрос в курсе А',model:[...person,'context',...permission],algorithm:['request'],explanation:`${people[subject]}: ${permissions[operation].toLowerCase()} в курсе А.`},
 {name:'roles',label:'Назначенные роли',model:[...person,...roleKeys,'context'],algorithm:['roles'],explanation:'Лене и Илье назначен Студент, Борису — Преподаватель. Назначение действует в курсе А.'},
 {name:'permission',label:'Разрешение роли',model:[...roleKeys,...permission,...edges],algorithm:['permission'],explanation:'Обе роли открывают задание. Только Студент отправляет работу; только Преподаватель оценивает.'},
 {name:'result',label:result==='allow'?'Разрешить':'Отказать',model:[...person,...roleKeys,...permission,...edges],algorithm:[result],result,through,explanation:through?`Найден путь через роль «${through==='student'?'Студент':'Преподаватель'}».`:'У назначенных ролей нет требуемого разрешения.'}
 ];
}
