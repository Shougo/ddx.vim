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
import { assertEquals } from "@std/assert";
import EncodingLib from "@encoding-japanese";

export async function printError(
  denops: Denops,
  ...messages: unknown[]
) {
  const message = messages.map((v) => {
    if (v instanceof Error) {
      // NOTE: In Deno, Prefer `Error.stack` because it contains
      // `Error.message`.
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

export async function safeStat(path: string): Promise<Deno.FileInfo | null> {
  // NOTE: Deno.stat() may be failed
  try {
    const stat = await Deno.lstat(path);
    if (stat.isSymlink) {
      try {
        const stat = await Deno.stat(path);
        stat.isSymlink = true;
        return stat;
      } catch (_: unknown) {
        // Ignore stat exception
      }
    }
    return stat;
  } catch (_: unknown) {
    // Ignore stat exception
  }
  return null;
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

/**
 * Convert string to Uint8Array with various encodings.
 * Added support for "cp932" (Windows-31J / Shift_JIS variant).
 */
export function stringToUint8Array(
  input: string,
  size?: number,
  encoding:
    | "utf-8"
    | "utf-16le"
    | "utf-16be"
    | "ascii"
    | "latin1"
    | "cp932" = "utf-8",
  options?: {
    pad?: boolean;
    padWith?: number;
    truncate?: boolean;
    nullTerminate?: boolean;
  },
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
          bytes.push(
            0xe0 | (cp >> 12),
            0x80 | ((cp >> 6) & 0x3f),
            0x80 | (cp & 0x3f),
          );
        } else {
          bytes.push(
            0xf0 | (cp >> 18),
            0x80 | ((cp >> 12) & 0x3f),
            0x80 | ((cp >> 6) & 0x3f),
            0x80 | (cp & 0x3f),
          );
        }
      }
      encoded = new Uint8Array(bytes);
    }
  } else if (encoding === "ascii" || encoding === "latin1") {
    // 1 byte per code unit; latin1 maps 0..255, ascii maps 0..127 (higher
    // truncated)
    const bytes = new Uint8Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const code = input.charCodeAt(i);
      bytes[i] = encoding === "ascii" ? code & 0x7f : code & 0xff;
    }
    encoded = bytes;
  } else if (encoding === "cp932") {
    // Use encoding-japanese to convert to SJIS/CP932 bytes
    try {
      // Be explicit: input is JS Unicode string, set from:'UNICODE',
      // to:'SJIS', type:'array'
      const arr = EncodingLib.convert(input, {
        from: "UNICODE",
        to: "SJIS",
        type: "array",
      }) as number[];
      encoded = Uint8Array.from(arr);
    } catch (e) {
      throw new RangeError(
        `CP932 encoder is not available in this environment: ${String(e)}`,
      );
    }
  } else {
    // utf-16le / utf-16be
    const bytes: number[] = [];
    for (let i = 0; i < input.length; i++) {
      // UTF-16 code unit (0..0xFFFF). Surrogates are preserved as two code
      // units.
      const cu = input.charCodeAt(i);
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
      if (encoding === "utf-16le" || encoding === "utf-16be") {
        // ensure size is even; if odd, drop the last byte to keep code unit
        // integrity
        const target = size % 2 === 0 ? size : size - 1;
        return encoded.subarray(0, Math.max(0, target));
      }

      if (encoding === "cp932") {
        // Avoid splitting a SJIS lead byte at the end.
        // Lead byte ranges in Shift_JIS: 0x81-0x9F, 0xE0-0xEF
        let target = size;
        if (target > 0) {
          const lastByte = encoded[target - 1];
          const isLead = (b: number) =>
            (0x81 <= b && b <= 0x9f) || (0xe0 <= b && b <= 0xef);
          if (isLead(lastByte)) {
            target -= 1;
          }
        }
        return encoded.subarray(0, Math.max(0, target));
      }

      return encoded.subarray(0, size);
    } else {
      throw new RangeError(
        `encoded byte length (${encoded.length}) exceeds requested size (${size})`,
      );
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

function toHex(u8: Uint8Array): string {
  return Array.from(u8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Escape non-printable characters in extracted strings using short escape
 * sequences where appropriate so they are always visible in the UI.
 *
 * Rules:
 * - Preserve: SPACE (0x20) and printable ASCII 0x21..0x7E (visible chars).
 * - Short escapes:
 *     NUL(0x00) -> "\0"
 *     TAB(0x09) -> "\t"
 *     LF(0x0A)  -> "\n"
 *     CR(0x0D)  -> "\r"
 * - Escape other control/private/unassigned characters:
 *     - <= 0xFF   -> "\xNN"
 *     - <= 0xFFFF -> "\uNNNN"
 *     - > 0xFFFF  -> "\u{HHHHH}"
 *
 * Note: Backslash in input is preserved (not doubled). If you want to show
 * literal backslashes as "\\", modify the handling accordingly.
 */
export function sanitizeExtractedText(input: string): string {
  if (!input) return input;

  let out = "";
  for (let i = 0; i < input.length;) {
    const cp = input.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    const advance = cp > 0xffff ? 2 : 1;

    // Fast path: printable ASCII (visible characters)
    if (cp >= 0x21 && cp <= 0x7e) {
      out += ch;
      i += advance;
      continue;
    }

    // Preserve single SPACE
    if (cp === 0x20) {
      out += " ";
      i += advance;
      continue;
    }

    // Short escapes for common controls
    if (cp === 0x00) {
      out += "\\0";
      i += advance;
      continue;
    }
    if (cp === 0x09) {
      out += "\\t";
      i += advance;
      continue;
    }
    if (cp === 0x0a) {
      out += "\\n";
      i += advance;
      continue;
    }
    if (cp === 0x0d) {
      out += "\\r";
      i += advance;
      continue;
    }

    // If not in Unicode "Other" category (C), keep it (printable Unicode)
    const isOther = /[\p{C}]/u.test(ch);
    if (!isOther) {
      out += ch;
      i += advance;
      continue;
    }

    // Fallback escapes for remaining control/private/unassigned characters
    if (cp <= 0xff) {
      out += "\\x" + cp.toString(16).padStart(2, "0").toUpperCase();
    } else if (cp <= 0xffff) {
      out += "\\u" + cp.toString(16).padStart(4, "0").toUpperCase();
    } else {
      out += "\\u{" + cp.toString(16).toUpperCase() + "}";
    }

    i += advance;
  }

  return out;
}

export interface BinaryDiff {
  offset: number;
  type: "changed" | "added" | "deleted";
  oldValue?: Uint8Array;
  newValue?: Uint8Array;
}

export function calculateBinaryDiff(
  original: Uint8Array,
  modified: Uint8Array,
): BinaryDiff[] {
  const diffs: BinaryDiff[] = [];
  const length = Math.min(original.length, modified.length);

  // Step 1: Detect changed values
  for (let i = 0; i < length; i++) {
    if (original[i] !== modified[i]) {
      diffs.push({
        offset: i,
        type: "changed",
        oldValue: new Uint8Array([original[i]]),
        newValue: new Uint8Array([modified[i]]),
      });
    }
  }

  // Step 2: Detect deletions
  if (original.length > length) {
    diffs.push({
      offset: length,
      type: "deleted",
      oldValue: original.slice(length),
    });
  }

  // Step 3: Detect additions
  if (modified.length > length) {
    diffs.push({
      offset: length,
      type: "added",
      newValue: modified.slice(length),
    });
  }

  return diffs;
}

/*
 Example:
 const s = "eO\x08\x11c\u0000k{;\x1F\n\t";
 console.log(sanitizeExtractedText(s));
 // => "eO\x08\x11c\0k{;\x1F\n\t"
*/

// Use explicit Unicode escapes to avoid source-file encoding issues.
// "テキスト" = U+30C6 U+30AD U+30B9 U+30C8
const KATAKANA_TEXT = "\u30C6\u30AD\u30B9\u30C8";

Deno.test("stringToUint8Array: utf-8 encoding for テキスト", () => {
  const s = KATAKANA_TEXT;
  const bytes = stringToUint8Array(s, undefined, "utf-8");
  const hex = toHex(bytes);
  // Correct UTF-8 for "テキスト":
  // テ: U+30C6 -> e3 83 86
  // キ: U+30AD -> e3 82 ad
  // ス: U+30B9 -> e3 82 b9
  // ト: U+30C8 -> e3 83 88
  assertEquals(hex, "e38386e382ade382b9e38388");
});

Deno.test("stringToUint8Array: utf-16be encoding for テキスト", () => {
  const s = KATAKANA_TEXT;
  const bytes = stringToUint8Array(s, undefined, "utf-16be");
  const hex = toHex(bytes);
  // Expected UTF-16BE: 0x30 0xc6 0x30 0xad 0x30 0xb9 0x30 0xc8
  assertEquals(hex, "30c630ad30b930c8");
});

Deno.test("stringToUint8Array: cp932 encode-decode for テキスト", () => {
  const s = KATAKANA_TEXT;
  const bytes = stringToUint8Array(s, undefined, "cp932");

  // If you want to assert exact bytes you can, but implementations/libraries
  // sometimes differ slightly (SJIS vs CP932 vendor extensions). To make the
  // test robust across environments, check roundtrip decode -> original
  // string. This requires the same encoding library used by stringToUint8Array
  // to decode.
  //
  // Use the same library if available:
  let decoded = "";
  try {
    const arr = EncodingLib.convert(bytes, {
      from: "SJIS",
      to: "UNICODE",
      type: "string",
    });
    decoded = String(arr);
  } catch (e) {
    // Re-throw so test fails with helpful info (above logs show hex)
    throw e;
  }

  assertEquals(decoded, s);
});

// Test case: No differences when both data sets are identical
Deno.test("No differences when both data sets are identical", () => {
  const original = new Uint8Array([0x10, 0x20, 0x30, 0x40]);
  const modified = new Uint8Array([0x10, 0x20, 0x30, 0x40]);

  const result = calculateBinaryDiff(original, modified);
  assertEquals(
    result.length,
    0,
    "The result should be an empty array when both datasets are identical",
  );
});

// Test case: Detects a single byte difference
Deno.test("Detects a single byte difference", () => {
  const original = new Uint8Array([0x10, 0x20, 0x30, 0x40]);
  const modified = new Uint8Array([0x10, 0x21, 0x30, 0x40]);

  const result = calculateBinaryDiff(original, modified);

  assertEquals(result.length, 1, "The result should contain 1 difference");
  assertEquals(result[0].offset, 1, "The difference should be at offset 1");
  assertEquals(
    result[0].oldValue![0],
    0x20,
    "The old value at offset 1 should be 0x20",
  );
  assertEquals(
    result[0].newValue![0],
    0x21,
    "The new value at offset 1 should be 0x21",
  );
});

// Test case: Detects multiple differences
Deno.test("Detects multiple differences", () => {
  const original = new Uint8Array([0x10, 0x20, 0x30, 0x40]);
  const modified = new Uint8Array([0x11, 0x21, 0x30, 0x41]);

  const result = calculateBinaryDiff(original, modified);

  assertEquals(result.length, 3, "The result should contain 3 differences");
  assertEquals(
    result[0].offset,
    0,
    "The first difference should be at offset 0",
  );
  assertEquals(
    result[1].offset,
    1,
    "The second difference should be at offset 1",
  );
  assertEquals(
    result[2].offset,
    3,
    "The third difference should be at offset 3",
  );
});

Deno.test("Handles case where original data is longer", () => {
  const original = new Uint8Array([0x10, 0x20, 0x30, 0x40, 0x50]);
  const modified = new Uint8Array([0x10, 0x20, 0x30]);

  const result = calculateBinaryDiff(original, modified);

  assertEquals(
    result.length,
    1,
    "The result should contain 1 difference (a deletion)",
  );
  assertEquals(
    result[0].offset,
    3,
    "The first difference should start at offset 3",
  );
  assertEquals(
    result[0].type,
    "deleted",
    "The type of the difference should be 'deleted'",
  );
  assertEquals(
    result[0].oldValue,
    new Uint8Array([0x40, 0x50]),
    "The deleted values should be [0x40, 0x50]",
  );
  assertEquals(
    result[0].newValue,
    undefined,
    "The new value for deletions should be undefined",
  );
});

Deno.test("Handles case where modified data is longer", () => {
  const original = new Uint8Array([0x10, 0x20, 0x30]);
  const modified = new Uint8Array([0x10, 0x20, 0x30, 0x40, 0x50]);

  const result = calculateBinaryDiff(original, modified);

  assertEquals(
    result.length,
    1,
    "The result should contain 1 difference (an addition)",
  );
  assertEquals(result[0].offset, 3, "The difference should start at offset 3");
  assertEquals(
    result[0].oldValue,
    undefined,
    "The old value for added ranges should be undefined",
  );
  assertEquals(
    result[0].newValue,
    Uint8Array.from([0x40, 0x50]),
    "The new values should be [0x40, 0x50]",
  );
});
