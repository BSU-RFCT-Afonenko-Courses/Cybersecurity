// Учебная политика конфиденциальности; write не запрашивает чтение назначения.
export const macQueries=[
 {subject:2,object:1,operation:'read',label:'Лена L2: читать материалы L1'},
 {subject:2,object:3,operation:'read',label:'Лена L2: читать ответы L3'},
 {subject:2,object:1,operation:'write',label:'Лена L2: записать в материалы L1'},
 {subject:2,object:3,operation:'write',label:'Лена L2: записать в ответы L3'},
 {subject:2,object:2,operation:'read',label:'Лена L2: читать черновик L2'}
];
export function macTrace(query){
 const {subject,object,operation}=query;
 if(![1,2,3].includes(subject)||![1,2,3].includes(object)||!['read','write'].includes(operation))throw Error('Запрос требует уровней 1–3 и операции read или write');
 const file={1:'handout',2:'draft',3:'answers'}[object],result=(operation==='read'?subject>=object:subject<=object)?'allow':'deny';
 const entity=['person-lena',`file-${file}`],levels=[...entity,`level-${subject}`,`level-${object}`,`person-level-lena`,`file-level-${file}`],flow=`${operation}-lena-${file}`;
 const make=(name,label,model,algorithm,explanation,extra={})=>({name,label,model,algorithm,explanation,...extra});
 return [
 make('request','Запрос',entity,['request'],`Процесс L${subject}: ${operation==='read'?'чтение файла':'запись в файл'} «${{1:'Материалы',2:'Черновик',3:'Ответы'}[object]}» уровня L${object}.`),
 make('levels','Метки процесса и файла',levels,['levels'],`У процесса L${subject}, у файла L${object}. Метки задаёт политика.`),
 make(`${operation}-rule`,operation==='read'?'Не читать выше':'Не писать ниже',[...levels,flow],[`${operation}-rule`],operation==='read'?`Чтение переносит данные из файла в процесс: ${subject} ≥ ${object}?`:`Запись переносит данные из процесса в файл: ${subject} ≤ ${object}?`),
 make('result',result==='allow'?'Разрешить':'Отказать',[...entity,flow],[result],result==='allow'?'Обязательное правило разрешает этот поток данных.':'Поток остановлен на границе уровней.',{result})
 ];
}
