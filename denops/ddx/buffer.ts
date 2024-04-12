import { assertEquals } from "./deps.ts";
import { ByteSliceStream } from "https://deno.land/std@0.222.1/streams/byte_slice_stream.ts";
import { toArrayBuffer } from "https://deno.land/std@0.222.1/streams/to_array_buffer.ts";

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
  #buffers: Buffer[] = [];

  async open(path: string) {
    if (!(await exists(path))) {
      return;
    }

    const stat = await Deno.stat(path);

    this.#buffers.push({
      file: await Deno.open(path, { read: true }),
      start: 0,
      length: stat.size,
      path,
    });
  }

  getIndex(pos: number): [number, number] {
    let bytesPos = 0;
    let index = 0;
    let offset = pos;

    for (const buffer of this.#buffers) {
      if (pos < bytesPos) {
        break;
      }

      const bufLength = isFileBuffer(buffer)
        ? buffer.length
        : buffer.bytes.length;

      bytesPos += bufLength;
      offset -= bufLength;
      index++;
    }

    return [index, offset];
  }

  insert(pos: number, bytes: Uint8Array) {
    if (this.#buffers.length == 0) {
      this.#buffers.push({
        bytes,
      });
      return;
    }

    const [index, offset] = this.getIndex(pos);

    this.#buffers.splice(index, 0, {
      bytes,
    });

    // Split is not needed
    if (offset == 0) {
      return;
    }

    const prevBuffer = this.#buffers[index];
    this.#buffers.splice(index, 0, prevBuffer);

    if (isFileBuffer(prevBuffer)) {
      prevBuffer.length = offset;
    } else {
      prevBuffer.bytes = prevBuffer.bytes.slice(offset);
    }

    const nextBuffer = this.#buffers[index + 2];
    if (nextBuffer) {
      if (isFileBuffer(nextBuffer)) {
        nextBuffer.start = offset + 1;
        nextBuffer.length -= offset + 1;
      } else {
        nextBuffer.bytes = nextBuffer.bytes.slice(offset + 1);
      }
    }
  }

  async write(path: string) {
    const bytes = await this.getBytes(0, this.getSize());
    await Deno.writeFile(path, bytes);
  }

  close() {
    for (const buffer of this.#buffers) {
      if (isFileBuffer(buffer)) {
        buffer.file.close();
        buffer.path = "";
      }
    }
  }

  getSize(): number {
    let size = 0;

    for (const buffer of this.#buffers) {
      if (isFileBuffer(buffer)) {
        size += buffer.length;
      } else {
        size += buffer.bytes.length;
      }
    }

    return size;
  }

  async getByte(pos: number): Promise<number | undefined> {
    let bytesPos = 0;

    for (const buffer of this.#buffers) {
      // Skip until "start".
      const bufLength = isFileBuffer(buffer)
        ? buffer.length
        : buffer.bytes.length;

      if (bytesPos + bufLength < pos) {
        bytesPos += bufLength;
        continue;
      }

      if (isFileBuffer(buffer)) {
        const file = await Deno.open(buffer.path, { read: true });
        const rangedStream = file.readable
          .pipeThrough(
            new ByteSliceStream(buffer.start + pos, buffer.start + pos),
          );
        const range = await toArrayBuffer(rangedStream);
        return new Uint8Array(range).at(0);
      } else {
        return buffer.bytes.at(pos);
      }
    }

    return undefined;
  }

  async getBytes(start: number, length: number): Promise<Uint8Array> {
    const maxSize = this.getSize() - start;

    const bytes = new Uint8Array(maxSize < length ? maxSize : length);
    let bytesPos = 0;

    for (const buffer of this.#buffers) {
      // Skip until "start".
      const bufLength = isFileBuffer(buffer)
        ? buffer.length
        : buffer.bytes.length;

      if (isFileBuffer(buffer)) {
        const file = await Deno.open(buffer.path, { read: true });
        const rangedStream = file.readable
          .pipeThrough(
            new ByteSliceStream(
              buffer.start + start,
              buffer.start + start + length - 1,
            ),
          );
        const range = await toArrayBuffer(rangedStream);
        bytes.set(new Uint8Array(range), bytesPos);
      } else {
        bytes.set(buffer.bytes.slice(start, length), bytesPos);
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

Deno.test("bytes insertion", async () => {
  const buffer = new DdxBuffer();

  const bytes1 = Uint8Array.from([72, 101]);
  const bytes2 = Uint8Array.from([108, 108, 111]);
  const bytes3 = Uint8Array.from([72, 101, 108, 108, 111]);

  buffer.insert(0, bytes1);
  assertEquals(2, buffer.getSize());

  buffer.insert(2, bytes2);
  assertEquals(5, buffer.getSize());

  assertEquals(
    bytes3,
    await buffer.getBytes(0, 5),
  );

  // Save
  const tempFilePath = await Deno.makeTempFile();
  await buffer.write(tempFilePath);

  assertEquals(
    bytes3,
    await Deno.readFile(tempFilePath),
  );

  buffer.close();
});
