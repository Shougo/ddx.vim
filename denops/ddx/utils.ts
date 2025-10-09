import type { DdxBuffer } from "./types.ts";
import type { AnalyzeValueNumber } from "./base/analyzer.ts";

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
): [AnalyzeValueNumber, number] {
  // Parse: 'type name;'
  const match = line.match(/^\s*(\S+)\s+(\S+)\s*;\s*$/);
  if (!match) {
    throw new Error(`Parse error in "${line}"`);
  }
  const [, type, name] = match;

  let value: number;
  let size: number;
  const rawType: "number" | "string" = "number";

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

  const result: AnalyzeValueNumber = {
    name,
    rawType,
    value,
    size,
    address: offset,
  };

  return [result, offset + size];
}
