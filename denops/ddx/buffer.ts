import { assertEquals } from "./deps.ts";
import { readRange } from "https://deno.land/std@0.170.0/io/read_range.ts";

type FileBuffer = {
  file: Deno.FsFile;
  start: number;
  length: number;
  path: string;
};

type BytesBuffer = {
  bytes: Uint8Array;
};

// deno-lint-ignore no-explicit-any
function isFileBuffer(arg: any): arg is FileBuffer {
  return arg.file !== undefined;
}

type Buffer = FileBuffer | BytesBuffer;

export class DdxBuffer {
  private buffers: Buffer[] = [];

  async open(path: string) {
    if (!(await exists(path))) {
      return;
    }

    const stat = await Deno.stat(path);

    this.buffers.push({
      file: await Deno.open(path, { read: true }),
      start: 0,
      length: stat.size,
      path,
    });
  }

  write() {
  }

  close() {
    for (const buffer of this.buffers) {
      if (isFileBuffer(buffer)) {
        buffer.file.close();
        buffer.path = "";
      }
    }
  }

  getSize(): number {
    let size = 0;

    for (const buffer of this.buffers) {
      if (isFileBuffer(buffer)) {
        size += buffer.length;
      } else {
        size += buffer.bytes.length;
      }
    }

    return size;
  }

  getByte() {
  }

  async getBytes(start: number, length: number): Promise<Uint8Array> {
    const maxSize = this.getSize() - start;

    const bytes = new Uint8Array(maxSize < length ? maxSize : length);
    let bytesPos = 0;

    for (const buffer of this.buffers) {
      // Skip until "start".
      const bufLength = isFileBuffer(buffer)
        ? buffer.length
        : buffer.bytes.length;

      if (isFileBuffer(buffer)) {
        bytes.set(
          await readRange(buffer.file, {
            start: buffer.start + start,
            end: buffer.start + start + length - 1,
          }),
          bytesPos,
        );
      } else {
        bytes.set(buffer.bytes.slice(start, length - 1), bytesPos);
      }

      bytesPos += bufLength;
    }

    return bytes;
  }

  getInt8() {
  }

  getInt16_le() {
  }

  getInt16_be() {
  }

  getInt32_le() {
  }

  getInt32_be() {
  }
}

const exists = async (path: string) => {
  // Note: Deno.stat() may be failed
  try {
    const stat = await Deno.stat(path);
    if (stat.isDirectory || stat.isFile || stat.isSymlink) {
      return true;
    }
  } catch (_: unknown) {
    // Ignore stat exception
  }

  return false;
};

Deno.test("buffer", async () => {
  const buffer = new DdxBuffer();

  // Check empty
  assertEquals(0, buffer.getSize());
  assertEquals(Uint8Array.from([]), await buffer.getBytes(0, 10));

  // Invalid path
  await buffer.open("foo-bar-baz");
  assertEquals(0, buffer.getSize());
  assertEquals(Uint8Array.from([]), await buffer.getBytes(0, 655535));

  // Valid path
  const tempFilePath = await Deno.makeTempFile();
  await Deno.writeTextFile(tempFilePath, "Hello world!");

  await buffer.open(tempFilePath);

  assertEquals(12, buffer.getSize());

  assertEquals(
    Uint8Array.from([72, 101, 108, 108, 111]),
    await buffer.getBytes(0, 5),
  );

  buffer.close();
});
