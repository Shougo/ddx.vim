import { readRange } from "https://deno.land/std@0.149.0/io/files.ts";

export class DdxBuffer {
  private file: Deno.FsFile | null = null;

  async open(path: string) {
    this.file = await Deno.open(path, { read: true });
  }

  write() {
  }

  getByte() {
  }

  async getBytes(): Promise<Uint8Array> {
    if (!this.file) {
      return new Uint8Array();
    }
    return await readRange(this.file, { start: 0, end: 15 });
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
