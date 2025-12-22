import type { Context, DduOptions, Item } from "@shougo/ddu-vim/types";
import { BaseSource } from "@shougo/ddu-vim/source";
import type { ActionData } from "../../@ddu-kinds/ddx/main.ts";
import type { BinaryDiff } from "../../ddx/utils.ts";

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
        const results = await args.denops.call(
          "ddx#get_diff",
          name,
        ) as BinaryDiff[];

        for (const result of results) {
          const text = `0x${result.offset.toString(16)}:` +
            ` ${result.type} ${result.oldValue} -> ${result.newValue}`;
          const value = {
            name: text,
            rawType: "number" as const,
            value: result.oldValue,
            address: result.offset,
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
