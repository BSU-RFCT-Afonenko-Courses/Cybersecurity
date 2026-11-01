export function lcgSequence(seed,a,c,m,count) {
 if(![seed,a,c,m,count].every(Number.isSafeInteger)||m<1||m>65536||count<0||count>100||seed<0||seed>=m||a<0||a>65536||c<0||c>65536) throw Error('Целые параметры: 0 ≤ seed < m ≤ 65536, 0 ≤ a,c ≤ 65536, 0 ≤ число шагов ≤ 100');
 const values=[];let state=seed;for(let i=0;i<count;i++){state=(a*state+c)%m;values.push(state);}return values;
}
export function caesar(text,shift,alphabet) {
 if(!Number.isSafeInteger(shift)) throw Error('Сдвиг должен быть целым безопасным числом');
 const latin='ABCDEFGHIJKLMNOPQRSTUVWXYZ', russian='АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ';
 if(!['ru','latin'].includes(alphabet)) throw Error('Выберите русский или латинский алфавит');
 const letters=alphabet==='ru'?russian:latin;
 return Array.from(String(text),ch=>{
  const upper=ch.toUpperCase();
  const i=letters.indexOf(upper);if(i!==-1){const n=letters.length,k=((shift%n)+n)%n,result=letters[(i+k)%n];return ch===upper?result:result.toLowerCase();}
  return ch;
 }).join('');
}
export function xorBytes(bytes,key) {
 if(!Number.isInteger(key)||key<0||key>255||bytes.some(b=>!Number.isInteger(b)||b<0||b>255)) throw Error('Требуются байты 0–255');
 return bytes.map(b=>b^key);
}
