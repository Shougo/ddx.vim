import type { DdxBuffer } from "../../ddx/types.ts";
import {
  type AnalyzeResult,
  type AnalyzeValueNumber,
  type AnalyzeValueString,
  BaseAnalyzer,
} from "../../ddx/base/analyzer.ts";
import { arrayEquals, parseOneLine } from "../../ddx/utils.ts";

export type Params = Record<string, never>;

export class Analyzer extends BaseAnalyzer<Params> {
  override detect(args: {
    buffer: DdxBuffer;
  }): boolean {
    return arrayEquals(args.buffer.getBytes(0, 2), [0x50, 0x4b]);
  }

  override parse(args: {
    buffer: DdxBuffer;
  }): AnalyzeResult[] {
    let results: AnalyzeResult[] = [];
    let offset = 0;

    while (true) {
      const signature = Array.from(args.buffer.getBytes(offset, 4));

      if (arrayEquals(signature, [0x50, 0x4b, 0x03, 0x04])) {
        // ZIP_HEADER
        [results, offset] = this.analyzeZipHeader(
          args.buffer,
          results,
          offset,
        );
      } else if (arrayEquals(signature, [0x50, 0x4b, 0x07, 0x08])) {
        // ZIP_HEADER(PK78)
        [results, offset] = this.analyzeZipHeader2(
          args.buffer,
          results,
          offset,
        );
      } else if (arrayEquals(signature, [0x50, 0x4b, 0x01, 0x02])) {
        // ZIP_CENTRAL_HEADER
        [results, offset] = this.analyzeZipCentralHeader(
          args.buffer,
          results,
          offset,
        );
      } else if (arrayEquals(signature, [0x50, 0x4b, 0x05, 0x06])) {
        // ZIP_END_HEADER
        [results, offset] = this.analyzeZipEndHeader(
          args.buffer,
          results,
          offset,
        );
      } else {
        // UNKNOWN
        break;
      }
    }

    return results;
  }

  override params(): Params {
    return {};
  }

  private analyzeZipHeader(
    buffer: DdxBuffer,
    results: AnalyzeResult[],
    startOffset: number,
  ): [AnalyzeResult[], number] {
    let offset = startOffset;
    const header: AnalyzeResult = { name: "ZIP_HEADER", values: [] };

    // uint8_t signature[4];
    for (let i = 0; i < 4; i++) {
      const value: AnalyzeValueNumber = {
        name: `signature${i}`,
        rawType: "number",
        value: buffer.getInt8(offset),
        size: 1,
        address: offset,
      };

      header.values.push(value);
      offset += 1;
    }

    let value, fileSize;
    [value, offset] = parseOneLine("uint16_t version;", buffer, offset);
    header.values.push(value);
    [value, offset] = parseOneLine("uint16_t flags;", buffer, offset);
    header.values.push(value);
    [value, offset] = parseOneLine("uint16_t compression;", buffer, offset);
    header.values.push(value);
    [value, offset] = parseOneLine("uint16_t dos_time;", buffer, offset);
    header.values.push(value);
    [value, offset] = parseOneLine("uint16_t dos_date;", buffer, offset);
    header.values.push(value);
    [value, offset] = parseOneLine("uint32_t crc32;", buffer, offset);
    header.values.push(value);

    [value, offset] = parseOneLine(
      "uint32_t compressed_size;",
      buffer,
      offset,
    );
    header.values.push(value);
    fileSize = (value as AnalyzeValueNumber).value;

    [value, offset] = parseOneLine(
      "uint32_t uncompressed_size;",
      buffer,
      offset,
    );
    header.values.push(value);
    fileSize += (value as AnalyzeValueNumber).value;

    [value, offset] = parseOneLine(
      "uint16_t file_name_length;",
      buffer,
      offset,
    );
    header.values.push(value);
    const filenameOffset = (value as AnalyzeValueNumber).value;

    [value, offset] = parseOneLine(
      "uint16_t extra_field_length;",
      buffer,
      offset,
    );
    header.values.push(value);
    const dataOffset = fileSize + (value as AnalyzeValueNumber).value;

    // filename
    const filename: AnalyzeValueString = {
      name: "filename",
      rawType: "string",
      value: buffer.getChars(offset, filenameOffset),
      size: filenameOffset,
      address: offset,
    };
    header.values.push(filename);
    offset += filenameOffset;

    // data
    header.values.push({
      name: "data",
      rawType: "string",
      value: "?",
      address: offset,
    });
    offset += dataOffset;

    // Skip until PK78 if fileSize == 0
    while (fileSize === 0) {
      const signature = Array.from(buffer.getBytes(offset, 4));
      if (
        signature.length !== 4 ||
        arrayEquals(signature, [0x50, 0x4b, 0x07, 0x08])
      ) {
        break;
      }
      offset += 1;
    }

    results.push(header);
    return [results, offset];
  }

  private analyzeZipHeader2(
    buffer: DdxBuffer,
    results: AnalyzeResult[],
    startOffset: number,
  ): [AnalyzeResult[], number] {
    let offset = startOffset;
    const header: AnalyzeResult = { name: "ZIP_HEADER(PK78)", values: [] };

    // uint8_t signature[4];
    for (let i = 0; i < 4; i++) {
      const value: AnalyzeValueNumber = {
        name: `signature${i}`,
        rawType: "number",
        value: buffer.getInt8(offset),
        size: 1,
        address: offset,
      };
      header.values.push(value);
      offset += 1;
    }

    let value;
    [value, offset] = parseOneLine("uint32_t crc32;", buffer, offset);
    header.values.push(value);

    [value, offset] = parseOneLine(
      "uint32_t compressed_size;",
      buffer,
      offset,
    );
    header.values.push(value);

    [value, offset] = parseOneLine(
      "uint32_t uncompressed_size;",
      buffer,
      offset,
    );
    header.values.push(value);

    results.push(header);
    return [results, offset];
  }

  private analyzeZipCentralHeader(
    buffer: DdxBuffer,
    results: AnalyzeResult[],
    startOffset: number,
  ): [AnalyzeResult[], number] {
    let offset = startOffset;
    const header: AnalyzeResult = { name: "ZIP_CENTRAL_HEADER", values: [] };

    // uint8_t signature[4];
    for (let i = 0; i < 4; i++) {
      const value: AnalyzeValueNumber = {
        name: `signature${i}`,
        rawType: "number",
        value: buffer.getInt8(offset),
        size: 1,
        address: offset,
      };
      header.values.push(value);
      offset += 1;
    }

    let value;
    [value, offset] = parseOneLine("uint16_t version_made;", buffer, offset);
    header.values.push(value);

    [value, offset] = parseOneLine("uint16_t version;", buffer, offset);
    header.values.push(value);

    [value, offset] = parseOneLine("uint16_t flags;", buffer, offset);
    header.values.push(value);

    [value, offset] = parseOneLine("uint16_t compression;", buffer, offset);
    header.values.push(value);

    [value, offset] = parseOneLine("uint16_t dos_time;", buffer, offset);
    header.values.push(value);

    [value, offset] = parseOneLine("uint16_t dos_date;", buffer, offset);
    header.values.push(value);

    [value, offset] = parseOneLine("uint32_t crc32;", buffer, offset);
    header.values.push(value);

    [value, offset] = parseOneLine("uint32_t compressed_size;", buffer, offset);
    header.values.push(value);

    [value, offset] = parseOneLine(
      "uint32_t uncompressed_size;",
      buffer,
      offset,
    );
    header.values.push(value);

    [value, offset] = parseOneLine(
      "uint16_t file_name_length;",
      buffer,
      offset,
    );
    header.values.push(value);
    const filenameOffset = (value as AnalyzeValueNumber).value;

    [value, offset] = parseOneLine(
      "uint16_t extra_field_length;",
      buffer,
      offset,
    );
    header.values.push(value);
    const extraSize = (value as AnalyzeValueNumber).value;

    [value, offset] = parseOneLine(
      "uint16_t file_comment_length;",
      buffer,
      offset,
    );
    header.values.push(value);

    [value, offset] = parseOneLine(
      "uint16_t disk_number_start;",
      buffer,
      offset,
    );
    header.values.push(value);

    [value, offset] = parseOneLine(
      "uint16_t internal_file_attributes;",
      buffer,
      offset,
    );
    header.values.push(value);

    [value, offset] = parseOneLine(
      "uint32_t external_file_attributes;",
      buffer,
      offset,
    );
    header.values.push(value);

    [value, offset] = parseOneLine("uint32_t position;", buffer, offset);
    header.values.push(value);

    // filename
    const filename: AnalyzeValueString = {
      name: "filename",
      rawType: "string",
      value: buffer.getChars(offset, filenameOffset),
      size: filenameOffset,
      address: offset,
    };
    header.values.push(filename);
    offset += filenameOffset;

    // extra field
    header.values.push({
      name: "extra field",
      rawType: "string",
      value: "?",
      address: offset,
    });
    offset += extraSize;

    results.push(header);
    return [results, offset];
  }

  private analyzeZipEndHeader(
    buffer: DdxBuffer,
    results: AnalyzeResult[],
    startOffset: number,
  ): [AnalyzeResult[], number] {
    let offset = startOffset;
    const header: AnalyzeResult = { name: "ZIP_END_HEADER", values: [] };

    // uint8_t signature[4];
    for (let i = 0; i < 4; i++) {
      const value: AnalyzeValueNumber = {
        name: `signature${i}`,
        rawType: "number",
        value: buffer.getInt8(offset),
        size: 1,
        address: offset,
      };
      header.values.push(value);
      offset += 1;
    }

    let value;
    [value, offset] = parseOneLine(
      "uint16_t number_of_disks;",
      buffer,
      offset,
    );
    header.values.push(value);

    [value, offset] = parseOneLine(
      "uint16_t disk_number_start;",
      buffer,
      offset,
    );
    header.values.push(value);

    [value, offset] = parseOneLine(
      "uint16_t number_of_disk_entries;",
      buffer,
      offset,
    );
    header.values.push(value);

    [value, offset] = parseOneLine(
      "uint16_t number_of_entries;",
      buffer,
      offset,
    );
    header.values.push(value);

    [value, offset] = parseOneLine(
      "uint32_t central_dir_size;",
      buffer,
      offset,
    );
    header.values.push(value);

    [value, offset] = parseOneLine(
      "uint32_t central_dir_offset;",
      buffer,
      offset,
    );
    header.values.push(value);

    [value, offset] = parseOneLine(
      "uint16_t file_comment_length;",
      buffer,
      offset,
    );
    header.values.push(value);

    results.push(header);
    return [results, offset];
  }
}
