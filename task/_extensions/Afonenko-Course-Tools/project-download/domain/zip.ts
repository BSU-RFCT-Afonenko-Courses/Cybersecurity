import { diagnostic } from "../diagnostics.ts";
export interface ArchiveEntry { name: string; bytes: Uint8Array }
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
/** Воспроизводимый ZIP: STORE, имена UTF-8, дата 1980-01-01; внешний архиватор не нужен. */
export function zip(entries: ArchiveEntry[]): Uint8Array {
  const files: Uint8Array[] = [], directory: Uint8Array[] = [];
  let offset = 0, centralSize = 0;
  if (entries.length > 65535) throw diagnostic("DOWNLOAD.ZIP_INVALID", `Число записей ZIP: ${entries.length}; предел ZIP32 — 65535`, {field:"size",hint:"Разделите материалы на архивы формата ZIP32."});
  const names = new Set<string>();
  for (const entry of entries) {
    if (!entry.name || entry.name.startsWith("/") || entry.name.includes("\\") || entry.name.split("/").some(part => part === ".." || part === "." || !part) || names.has(entry.name)) throw diagnostic("DOWNLOAD.ZIP_INVALID", `Недопустимое или повторное имя записи ZIP: ${entry.name}`, {id:entry.name,field:"entry.name"});
    names.add(entry.name);
    const name = new TextEncoder().encode(entry.name), size = entry.bytes.length, crc = crc32(entry.bytes);
    if (name.length > 65535 || size > 0xffffffff) throw diagnostic("DOWNLOAD.ZIP_INVALID", `Размер записи ZIP: имя UTF-8 — ${name.length} байт (предел 65535), данные — ${size} байт (предел 4294967295)`, {id:entry.name,field:"size",hint:"Уменьшите размер файла или длину его имени."});
    const local = new Uint8Array(30 + name.length), lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x800, true);
    lv.setUint16(12, 33, true); lv.setUint32(14, crc, true); lv.setUint32(18, size, true); lv.setUint32(22, size, true); lv.setUint16(26, name.length, true); local.set(name, 30);
    files.push(local, entry.bytes);
    const central = new Uint8Array(46 + name.length), cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x800, true);
    cv.setUint16(14, 33, true); cv.setUint32(16, crc, true); cv.setUint32(20, size, true); cv.setUint32(24, size, true); cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true); central.set(name, 46);
    directory.push(central); centralSize += central.length; offset += local.length + size;
  }
  if (offset + centralSize > 0xffffffff) throw diagnostic("DOWNLOAD.ZIP_INVALID", `Размер данных и каталога ZIP: ${offset + centralSize} байт; предел ZIP32 — 4294967295`, {field:"size",hint:"Разделите материалы на архивы формата ZIP32."});
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true); ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
  const result = new Uint8Array(offset + centralSize + end.length); let cursor = 0;
  for (const chunk of [...files, ...directory, end]) { result.set(chunk, cursor); cursor += chunk.length; }
  return result;
}
