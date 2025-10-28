import { ActionFlags, type Actions, type DduItem } from "@shougo/ddu-vim/types";
import { BaseKind } from "@shougo/ddu-vim/kind";
import type { AnalyzeValue } from "../../ddx/base/analyzer.ts";

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

        console.log(name);
        for (const item of args.items) {
          const action = item.action as ActionData;

          if (action.value.rawType === "number") {
            // number
            const input = await args.denops.call(
              "ddx#util#input",
              `New value: 0x${action.value.value.toString(16)} -> 0x`,
            ) as string;
            if (input == "") {
              return ActionFlags.Persist;
            }
            console.log(input);
          } else {
            // string
            const input = await args.denops.call(
              "ddx#util#input",
              `New value: ${action.value.value} -> `,
            ) as string;
            if (input == "") {
              return ActionFlags.Persist;
            }
            console.log(input);
          }

          console.log(action.value);
        }

        return ActionFlags.None;
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
