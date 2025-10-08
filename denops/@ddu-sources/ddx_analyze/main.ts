import type { Context, DduOptions, Item } from "@shougo/ddu-vim/types";
import { BaseSource } from "@shougo/ddu-vim/source";
import type { AnalyzeResult } from "../../ddx/base/analyzer.ts";
import type { ActionData } from "../../@ddu-kinds/ddx/main.ts";

import type { Denops } from "@denops/std";

import * as vars from "@denops/std/variable";

type Params = Record<string, never>;

export class Source extends BaseSource<Params> {
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
          "ddx#parse",
          name,
        ) as AnalyzeResult[];

        controller.enqueue(results.map((result) => {
          return {
            word: result.name,
          };
        }));
        controller.close();
      },
    });
  }

  override params(): Params {
    return {};
  }
}
