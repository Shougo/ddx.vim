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
        if (name === "") {
          controller.close();
          return;
        }

        const results = await args.denops.call(
          "ddx#get_diff",
          name,
        ) as BinaryDiff[];

        for (const result of results) {
          const text = `0x${result.offset.toString(16)}: ` +
            `${result.type} ${formatBytes(result.oldValue)} -> ${
              formatBytes(result.newValue)
            }`;

          if (result.type === "changed") {
            controller.enqueue([{
              word: text,
              action: {
                value: {
                  name: text,
                  rawType: "integer" as const,
                  value: result.oldValue?.[0] ?? 0,
                  address: result.offset,
                },
              },
            }]);
          } else {
            controller.enqueue([{
              word: text,
            }]);
          }
        }

        controller.close();
      },
    });
  }

  override params(): Params {
    return {};
  }
}

function formatBytes(bytes: Uint8Array | undefined): string {
  if (!bytes || bytes.length === 0) {
    return "(none)";
  }
  return [...bytes]
    .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
    .join(" ");
}
