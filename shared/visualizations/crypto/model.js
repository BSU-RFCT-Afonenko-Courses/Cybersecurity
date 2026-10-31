export function lcgSequence(seed,a,c,m,count) {
 if(![seed,a,c,m,count].every(Number.isSafeInteger)||m<1||m>65536||count<0||count>100||seed<0||seed>=m||a<0||a>65536||c<0||c>65536) throw Error('Целые параметры: 0 ≤ seed < m ≤ 65536, 0 ≤ a,c ≤ 65536, 0 ≤ число шагов ≤ 100');
 const values=[];let state=seed;for(let i=0;i<count;i++){state=(a*state+c)%m;values.push(state);}return values;
}
export function caesar(text,shift) {
 if(!Number.isSafeInteger(shift)) throw Error('Сдвиг должен быть целым');
 return text.replace(/[A-Z]/g,ch=>String.fromCharCode(65+((ch.charCodeAt(0)-65+shift)%26+26)%26));
}
export function xorBytes(bytes,key) {
 if(!Number.isInteger(key)||key<0||key>255||bytes.some(b=>!Number.isInteger(b)||b<0||b>255)) throw Error('Требуются байты 0–255');
 return bytes.map(b=>b^key);
}
