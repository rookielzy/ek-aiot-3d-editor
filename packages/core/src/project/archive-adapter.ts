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
    // Zip timestamps are local wall-clock. A fixed instant is recorded in two-hour steps, so
    // 1980-01-01T12:00Z is 1980 in every zone from UTC-12 eastward; "now" would make packages
    // depend on the exporter's clock and zone, which reads as 1979 west of UTC.
    return zipSync(archive, { level: 6, mtime: new Date("1980-01-01T12:00:00.000Z") });
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
