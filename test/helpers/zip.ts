import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { crc32 } from "@/lib/zip";

/**
 * A central-directory reader written independently of src/lib/zip.ts, so a
 * container is checked against something other than the code that produced it.
 * Every entry's CRC is verified on the way out.
 */
export function unzip(buffer: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd > 0, "no end of central directory");
  const count = buffer.readUInt16LE(eocd + 10);
  let p = buffer.readUInt32LE(eocd + 16);

  for (let i = 0; i < count; i++) {
    assert.equal(buffer.readUInt32LE(p), 0x02014b50, "bad central directory signature");
    const method = buffer.readUInt16LE(p + 10);
    const storedCrc = buffer.readUInt32LE(p + 16);
    const compSize = buffer.readUInt32LE(p + 20);
    const nameLen = buffer.readUInt16LE(p + 28);
    const extraLen = buffer.readUInt16LE(p + 30);
    const commentLen = buffer.readUInt16LE(p + 32);
    const offset = buffer.readUInt32LE(p + 42);
    const name = buffer.subarray(p + 46, p + 46 + nameLen).toString("utf8");

    assert.equal(buffer.readUInt32LE(offset), 0x04034b50, "bad local header signature");
    const dataStart =
      offset + 30 + buffer.readUInt16LE(offset + 26) + buffer.readUInt16LE(offset + 28);
    const raw = buffer.subarray(dataStart, dataStart + compSize);
    const data = method === 8 ? inflateRawSync(raw) : Buffer.from(raw);
    assert.equal(crc32(data), storedCrc, `${name}: crc mismatch`);
    out.set(name, data);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
