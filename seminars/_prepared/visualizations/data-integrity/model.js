function bytes(data){if(!Array.isArray(data)||data.some(b=>!Number.isInteger(b)||b<0||b>255))throw Error('Требуются байты 0–255');return data;}
export function byteSum(data){return bytes(data).reduce((a,b)=>a+b,0)%256;}
export async function sha256(data){const hash=await crypto.subtle.digest('SHA-256',new Uint8Array(bytes(data)));return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');}
export function xorParity(blocks){if(!blocks.length||blocks.some(b=>bytes(b).length!==blocks[0].length))throw Error('Блоки должны иметь равную длину');return blocks.reduce((a,b)=>a.map((v,i)=>v^b[i]),blocks[0].map(()=>0));}
export function recoverBlock(blocks,parity){if(blocks.filter(b=>b===null).length!==1)throw Error('Нужна ровно одна известная потеря');return xorParity([bytes(parity),...blocks.filter(b=>b!==null)]);}
export function backupCopies(sizes,changes){
 const all=Object.keys(sizes);
 if(!all.length||Object.values(sizes).some(s=>!Number.isFinite(s)||s<=0)||changes.some(day=>day.some(name=>!all.includes(name))))throw Error('Нужны положительные размеры и известные имена файлов');
 const snapshot=files=>({files:[...files],size:files.reduce((sum,name)=>sum+sizes[name],0)});
 const result={full:[snapshot(all)],incremental:[snapshot(all)],differential:[snapshot(all)]};
 const sinceFull=new Set();
 for(const day of changes){const modified=[...new Set(day)];modified.forEach(name=>sinceFull.add(name));result.full.push(snapshot(all));result.incremental.push(snapshot(modified));result.differential.push(snapshot(all.filter(name=>sinceFull.has(name))));}
 return result;
}
