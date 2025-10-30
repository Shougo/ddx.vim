import { ActionFlags, type Actions, type DduItem } from "@shougo/ddu-vim/types";
import { BaseKind } from "@shougo/ddu-vim/kind";
import type { AnalyzeValue } from "../../ddx/base/analyzer.ts";
import { printError } from "../../ddx/utils.ts";

import type { Denops } from "@denops/std";
import * as vars from "@denops/std/variable";

export type ActionData = {
  value: AnalyzeValue;
};

type Params = Record<string, never>;

export class Kind extends BaseKind<Params> {
  override actions: Actions<Params> = {
    edit: {
      description: "Edit the value.",
      callback: async (args: {
        denops: Denops;
        items: DduItem[];
        kindParams: Params;
        actionParams: unknown;
      }) => {
        const name = await vars.b.get(args.denops, "ddx_ui_name", "");

        for (const item of args.items) {
          const action = item.action as ActionData;

          if (action.value.rawType === "integer") {
            // integer
            const input = await args.denops.call(
              "ddx#util#input",
              `New value: ${action.value.value} -> `,
            ) as string;
            if (input == "") {
              return ActionFlags.Persist;
            }

            const value = parseStrictInt(input, 10);
            if (Number.isNaN(value)) {
              await printError(
                args.denops,
                "Invalid value",
              );
              return ActionFlags.Persist;
            }

            await args.denops.call("ddx#change", name, action.value, value);
          } else {
            // string
            const input = await args.denops.call(
              "ddx#util#input",
              `New value: ${action.value.value} -> `,
            ) as string;
            if (input == "") {
              return ActionFlags.Persist;
            }

            await args.denops.call("ddx#change", name, action.value, input);
          }
        }

        return ActionFlags.Redraw;
      },
    },
    open: {
      description: "Open the address.",
      callback: async (args: {
        denops: Denops;
        items: DduItem[];
        kindParams: Params;
        actionParams: unknown;
      }) => {
        const name = await vars.b.get(args.denops, "ddx_ui_name", "");
        for (const item of args.items) {
          const action = item.action as ActionData;
          await args.denops.call("ddx#jump", name, action.value.address);
        }

        return ActionFlags.None;
      },
    },
  };

  override params(): Params {
    return {};
  }
}

function parseStrictInt(str: string, radix: number = 10): number {
  if (typeof str !== "string" || str.trim() === "") {
    return NaN;
  }

  let pattern: RegExp;
  switch (radix) {
    case 2:
      pattern = /^-?[01]+$/;
      break;
    case 8:
      pattern = /^-?[0-7]+$/;
      break;
    case 10:
      pattern = /^-?\d+$/;
      break;
    case 16:
      pattern = /^-?[0-9a-fA-F]+$/;
      break;
    default:
      return NaN;
  }

  if (!pattern.test(str.trim())) {
    return NaN;
  }
  const n = parseInt(str, radix);
  return Number.isNaN(n) ? NaN : n;
}
