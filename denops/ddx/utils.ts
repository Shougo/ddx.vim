import type { DdxBuffer } from "./types.ts";
import type { AnalyzeValueInteger } from "./base/analyzer.ts";

import type { Denops } from "@denops/std";

import {
  type ImportMap,
  ImportMapImporter,
  loadImportMap,
} from "@lambdalisue/import-map-importer";
import { toFileUrl } from "@std/path/to-file-url";
import { fromFileUrl } from "@std/path/from-file-url";
import { join } from "@std/path/join";
import { dirname } from "@std/path/dirname";

export async function printError(
  denops: Denops,
  ...messages: unknown[]
) {
  const message = messages.map((v) => {
    if (v instanceof Error) {
      // NOTE: In Deno, Prefer `Error.stack` because it contains `Error.message`.
      return `${v.stack ?? v}`;
    } else if (typeof v === "object") {
      return JSON.stringify(v);
    } else {
      return `${v}`;
    }
  }).join("\n");
  await denops.call("ddx#util#print_error", message);
}

// See https://github.com/vim-denops/denops.vim/issues/358 for details
export function isDenoCacheIssueError(e: unknown): boolean {
  const expects = [
    "Could not find constraint in the list of versions: ", // Deno 1.40?
    "Could not find version of ", // Deno 1.38
  ] as const;
  if (e instanceof TypeError) {
    return expects.some((expect) => e.message.startsWith(expect));
  }
  return false;
}

export async function tryLoadImportMap(
  script: string,
): Promise<ImportMap | undefined> {
  if (script.startsWith("http://") || script.startsWith("https://")) {
    // We cannot load import maps for remote scripts
    return undefined;
  }
  const PATTERNS = [
    "deno.json",
    "deno.jsonc",
    "import_map.json",
    "import_map.jsonc",
  ];
  // Convert file URL to path for file operations
  const scriptPath = script.startsWith("file://")
    ? fromFileUrl(new URL(script))
    : script;
  const parentDir = dirname(scriptPath);
  for (const pattern of PATTERNS) {
    const importMapPath = join(parentDir, pattern);
    try {
      return await loadImportMap(importMapPath);
    } catch (err: unknown) {
      if (err instanceof Deno.errors.NotFound) {
        // Ignore NotFound errors and try the next pattern
        continue;
      }
      throw err; // Rethrow other errors
    }
  }
  return undefined;
}

export async function importPlugin(path: string): Promise<unknown> {
  // Import module with fragment so that reload works properly
  // https://github.com/vim-denops/denops.vim/issues/227
  const suffix = performance.now();
  const url = toFileUrl(path).href;
  const importMap = await tryLoadImportMap(path);
  if (importMap) {
    const importer = new ImportMapImporter(importMap);
    return await importer.import(`${url}#${suffix}`);
  } else {
    return await import(`${url}#${suffix}`);
  }
}

export function arrayEquals(
  a: Uint8Array | number[],
  b: Uint8Array | number[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; ++i) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function parseOneLine(
  line: string,
  buffer: DdxBuffer,
  offset: number,
  isLittle = true,
): [AnalyzeValueInteger, number] {
  // Parse: 'type name;'
  const match = line.match(/^\s*(\S+)\s+(\S+)\s*;\s*$/);
  if (!match) {
    throw new Error(`Parse error in "${line}"`);
  }
  const [, type, name] = match;

  let value: number;
  let size: number;
  const rawType: "integer" | "string" = "integer";

  if (type === "uint8_t") {
    const byte = buffer.getByte(offset);
    if (!byte) {
      throw new Error(`Cannot get byte : "${offset}"`);
    }
    value = byte;
    size = 1;
  } else if (type === "uint16_t") {
    const bytes = buffer.getBytes(offset, 2);
    value = isLittle ? bytes[0] + (bytes[1] << 8) : (bytes[0] << 8) + bytes[1];
    size = 2;
  } else if (type === "uint32_t") {
    const bytes = buffer.getBytes(offset, 4);
    value = isLittle
      ? bytes[0] + (bytes[1] << 8) + (bytes[2] << 16) + (bytes[3] << 24)
      : (bytes[0] << 24) + (bytes[1] << 16) + (bytes[2] << 8) + bytes[3];
    size = 4;
  } else {
    throw new Error(`Not supported type : "${type}" in "${line}"`);
  }

  const result: AnalyzeValueInteger = {
    name,
    rawType,
    value,
    size,
    address: offset,
  };

  return [result, offset + size];
}

export function numberToUint8Array(
  value: number | bigint,
  size: number,
  isLittle = true,
  signed = false,
): Uint8Array {
  if (!Number.isInteger(size) || size <= 0) {
    throw new RangeError("size must be a positive integer (bytes).");
  }

  // convert to BigInt
  let n = typeof value === "bigint" ? value : BigInt(value);

  const bits = BigInt(8 * size);
  if (!signed) {
    if (n < 0n) {
      throw new RangeError("Unsigned conversion: value must be >= 0.");
    }
    const max = (1n << bits) - 1n;
    if (n > max) {
      throw new RangeError(`Value too large for ${size} bytes (max ${max}).`);
    }
  } else {
    const min = -(1n << (bits - 1n));
    const max = (1n << (bits - 1n)) - 1n;
    if (n < min || n > max) {
      throw new RangeError(
        `Signed value out of range for ${size} bytes (${min}..${max}).`,
      );
    }
    // For negative values, convert to two's complement representation
    if (n < 0n) {
      // NOTE: n is negative, so this produces the two's complement unsigned
      // representation
      n = (1n << bits) + n;
    }
  }

  const out = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    const shift = BigInt(8 * (isLittle ? i : size - 1 - i));
    out[i] = Number((n >> shift) & 0xFFn);
  }
  return out;
}

export function stringToUint8Array(
  input: string,
  size?: number,
  encoding: "utf-8" | "utf-16le" | "utf-16be" | "ascii" | "latin1" = "utf-8",
  options?: {
    pad?: boolean;
    padWith?: number;
    truncate?: boolean;
    nullTerminate?: boolean;
  }
): Uint8Array {
  const opt = {
    pad: true,
    padWith: 0,
    truncate: true,
    nullTerminate: false,
    ...(options ?? {}),
  };

  if (size !== undefined && (!Number.isInteger(size) || size < 0)) {
    throw new RangeError("size must be a non-negative integer if provided");
  }
  // 1) encode string to bytes according to encoding
  let encoded: Uint8Array;

  if (encoding === "utf-8") {
    // Use TextEncoder when available (browser/Deno/modern Node)
    if (typeof TextEncoder !== "undefined") {
      encoded = new TextEncoder().encode(input);
    } else {
      // fallback: basic utf-8 encoder (rare path)
      const codePoints = Array.from(input).map((ch) => ch.codePointAt(0) ?? 0);
      const bytes: number[] = [];
      for (const cp of codePoints) {
        if (cp <= 0x7f) {
          bytes.push(cp);
        } else if (cp <= 0x7ff) {
          bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
        } else if (cp <= 0xffff) {
          bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
        } else {
          bytes.push(
            0xf0 | (cp >> 18),
            0x80 | ((cp >> 12) & 0x3f),
            0x80 | ((cp >> 6) & 0x3f),
            0x80 | (cp & 0x3f)
          );
        }
      }
      encoded = new Uint8Array(bytes);
    }
  } else if (encoding === "ascii" || encoding === "latin1") {
    // 1 byte per code unit; latin1 maps 0..255, ascii maps 0..127 (higher truncated)
    const bytes = new Uint8Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const code = input.charCodeAt(i);
      bytes[i] = encoding === "ascii" ? code & 0x7f : code & 0xff;
    }
    encoded = bytes;
  } else {
    // utf-16le / utf-16be
    const bytes: number[] = [];
    for (let i = 0; i < input.length; i++) {
      const cu = input.charCodeAt(i); // UTF-16 code unit (0..0xFFFF). Surrogates are preserved as two code units.
      if (encoding === "utf-16le") {
        bytes.push(cu & 0xff, (cu >> 8) & 0xff);
      } else {
        // utf-16be
        bytes.push((cu >> 8) & 0xff, cu & 0xff);
      }
    }
    encoded = new Uint8Array(bytes);
  }

  // 2) apply null termination if requested
  if (opt.nullTerminate) {
    if (encoding === "utf-16le" || encoding === "utf-16be") {
      // append two zero bytes (UTF-16 NUL)
      const tmp = new Uint8Array(encoded.length + 2);
      tmp.set(encoded, 0);
      // last two bytes are already 0
      encoded = tmp;
    } else {
      // single NUL byte
      const tmp = new Uint8Array(encoded.length + 1);
      tmp.set(encoded, 0);
      // final byte zero by default
      encoded = tmp;
    }
  }

  // If no size specified, return the full encoded bytes
  if (size === undefined) return encoded;

  // 3) handle truncation or overflow
  if (encoded.length > size) {
    if (opt.truncate) {
      // For utf-16 encodings, avoid truncating in the middle of a code unit pair:
      if (encoding === "utf-16le" || encoding === "utf-16be") {
        // ensure size is even; if odd, drop the last byte to keep code unit integrity
        const target = size % 2 === 0 ? size : size - 1;
        return encoded.subarray(0, Math.max(0, target));
      }
      return encoded.subarray(0, size);
    } else {
      throw new RangeError(`encoded byte length (${encoded.length}) exceeds requested size (${size})`);
    }
  }

  // 4) pad if needed
  if (encoded.length < size) {
    if (!opt.pad) {
      // return as-is even if shorter
      return encoded;
    }
    const out = new Uint8Array(size);
    out.set(encoded, 0);
    // fill remainder with padWith (0..255)
    const fill = opt.padWith & 0xff;
    for (let i = encoded.length; i < size; i++) out[i] = fill;
    return out;
  }

  // exact match
  return encoded;
}
