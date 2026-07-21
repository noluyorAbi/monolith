import { deflateRawSync } from "node:zlib";

/**
 * Minimal ZIP writer, enough for the OPC container a 3MF is built on.
 *
 * Timestamps are frozen rather than taken from the clock, so the same object
 * always produces byte-identical output. That makes a downloaded file
 * cacheable and diffable, and it means a test can assert on the bytes.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** 2020-01-01 00:00:00 in the DOS date/time encoding ZIP uses. */
const DOS_TIME = 0;
const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1;

export interface ZipEntry {
  path: string;
  data: Uint8Array;
}

interface Staged extends ZipEntry {
  compressed: Uint8Array;
  method: number;
  crc: number;
  offset: number;
}

export function zip(entries: ZipEntry[]): Buffer {
  const staged: Staged[] = [];
  const chunks: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const deflated = deflateRawSync(entry.data, { level: 9 });
    // Storing is better whenever deflate would make the part larger, which
    // happens with the tiny relationship XML files.
    const useDeflate = deflated.length < entry.data.length;
    const compressed = useDeflate ? new Uint8Array(deflated) : entry.data;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(entry.data);
    const name = Buffer.from(entry.path, "utf8");

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4); // version needed
    header.writeUInt16LE(0x0800, 6); // UTF-8 names
    header.writeUInt16LE(method, 8);
    header.writeUInt16LE(DOS_TIME, 10);
    header.writeUInt16LE(DOS_DATE, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(entry.data.length, 22);
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(0, 28);

    chunks.push(header, name, Buffer.from(compressed));
    staged.push({ ...entry, compressed, method, crc, offset });
    offset += header.length + name.length + compressed.length;
  }

  const directoryStart = offset;
  for (const entry of staged) {
    const name = Buffer.from(entry.path, "utf8");
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4); // version made by
    header.writeUInt16LE(20, 6); // version needed
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(entry.method, 10);
    header.writeUInt16LE(DOS_TIME, 12);
    header.writeUInt16LE(DOS_DATE, 14);
    header.writeUInt32LE(entry.crc, 16);
    header.writeUInt32LE(entry.compressed.length, 20);
    header.writeUInt32LE(entry.data.length, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt16LE(0, 30); // extra
    header.writeUInt16LE(0, 32); // comment
    header.writeUInt16LE(0, 34); // disk
    header.writeUInt16LE(0, 36); // internal attrs
    header.writeUInt32LE(0, 38); // external attrs
    header.writeUInt32LE(entry.offset, 42);
    chunks.push(header, name);
    offset += header.length + name.length;
  }

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(staged.length, 8);
  end.writeUInt16LE(staged.length, 10);
  end.writeUInt32LE(offset - directoryStart, 12);
  end.writeUInt32LE(directoryStart, 16);
  end.writeUInt16LE(0, 20);
  chunks.push(end);

  return Buffer.concat(chunks);
}
