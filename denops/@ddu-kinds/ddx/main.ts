import { ActionFlags, type Actions, type DduItem } from "@shougo/ddu-vim/types";
import { BaseKind } from "@shougo/ddu-vim/kind";

import type { Denops } from "@denops/std";

export type ActionData = {
  address: number;
};

type Params = Record<string, never>;

export class Kind extends BaseKind<Params> {
  override actions: Actions<Params> = {
    open: {
      description: "Open the address.",
      callback: (_args: {
        denops: Denops;
        items: DduItem[];
        kindParams: Params;
        actionParams: unknown;
      }) => {
        return Promise.resolve(ActionFlags.None);
      },
    },
  };

  override params(): Params {
    return {};
  }
}
