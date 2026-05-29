import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

export interface ArchiveEntry {
  path: string;
  bytes: Uint8Array;
}

export interface ArchiveAdapter {
  read(bytes: Uint8Array): ArchiveEntry[];
  write(entries: ArchiveEntry[]): Uint8Array;
}

export class FflateArchiveAdapter implements ArchiveAdapter {
  read(bytes: Uint8Array): ArchiveEntry[] {
    const archive = unzipSync(bytes);
    return Object.entries(archive).map(([path, entryBytes]) => ({
      path,
      bytes: copyBytes(entryBytes)
    }));
  }

  write(entries: ArchiveEntry[]): Uint8Array {
    const archive: Record<string, Uint8Array> = {};
    for (const entry of entries) {
      archive[entry.path] = copyBytes(entry.bytes);
    }
    return zipSync(archive, { level: 6, mtime: new Date("1980-01-01T00:00:00.000Z") });
  }
}

export function encodeArchiveJson(value: unknown): Uint8Array {
  return strToU8(`${JSON.stringify(value, null, 2)}\n`);
}

export function decodeArchiveJson(bytes: Uint8Array): unknown {
  return JSON.parse(strFromU8(bytes));
}

export function copyBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

export const defaultArchiveAdapter = new FflateArchiveAdapter();
