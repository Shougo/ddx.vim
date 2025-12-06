import type { Context, DduOptions, Item } from "@shougo/ddu-vim/types";
import { BaseSource } from "@shougo/ddu-vim/source";
import type { ActionData } from "../../@ddu-kinds/ddx/main.ts";
import type { ExtractedString } from "../../ddx/buffer.ts";
import { sanitizeExtractedText } from "../../ddx/utils.ts";

import type { Denops } from "@denops/std";
import * as vars from "@denops/std/variable";

type Params = Record<string, never>;

export class Source extends BaseSource<Params> {
  override kind = "ddx";

  override gather(args: {
    denops: Denops;
    context: Context;
    options: DduOptions;
    sourceParams: Params;
  }): ReadableStream<Item<ActionData>[]> {
    return new ReadableStream({
      async start(controller) {
        const name = await vars.b.get(args.denops, "ddx_ui_name", "");
        const encoding = await vars.b.get(
          args.denops,
          "ddx_ui_encoding",
          "utf-8",
        );
        const results = await args.denops.call(
          "ddx#get_strings",
          name,
          encoding,
        ) as ExtractedString[];

        for (const result of results) {
          // Replace non printable text.
          const text = sanitizeExtractedText(result.text);
          const value = {
            name: text,
            rawType: "string",
            value: result.text,
            address: result.offset,
            encoding: result.encoding,
          };

          controller.enqueue([{
            word: text,
            action: {
              value,
            },
          }]);
        }

        controller.close();
      },
    });
  }

  override params(): Params {
    return {};
  }
}
