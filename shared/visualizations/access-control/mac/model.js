// Учебная политика конфиденциальности: L1 < L2 < L3, без категорий.
// write — добавление без чтения назначения, а не обычное редактирование.
export const macQueries = [
  {subject:2, object:1, operation:'read', label:'L2: читать файл L1'},
  {subject:2, object:3, operation:'read', label:'L2: читать файл L3'},
  {subject:2, object:1, operation:'write', label:'L2: добавить в файл L1'},
  {subject:2, object:3, operation:'write', label:'L2: добавить в файл L3'},
  {subject:2, object:2, operation:'read', label:'L2: читать файл L2'}
];

export function macTrace(query) {
  const {subject, object, operation} = query;
  if (![1,2,3].includes(subject) || ![1,2,3].includes(object) || !['read','write'].includes(operation)) {
    throw new Error('Запрос требует уровней 1–3 и операции read или write');
  }
  const result = (operation === 'read' ? subject >= object : subject <= object) ? 'allow' : 'deny';
  const entities = ['process', `file-${object}`];
  const levels = [...entities, `level-${subject}`, `level-${object}`];
  const flow = `${operation}-${object}`;
  return [
    {name:'request', label:'Запрос', model:[...entities], algorithm:['request']},
    {name:'levels', label:'Уровни', model:[...levels], algorithm:['levels']},
    {name:`${operation}-rule`, label:operation === 'read' ? 'Правило чтения' : 'Правило записи', model:[...levels, flow], algorithm:[`${operation}-rule`]},
    {name:'result', label:result === 'allow' ? 'Разрешить' : 'Отказать', model:[...entities, flow], algorithm:[result], result}
  ];
}
