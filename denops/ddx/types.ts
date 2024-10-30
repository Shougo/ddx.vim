import { DdxBuffer } from "./buffer.ts";

import type { Denops } from "jsr:@denops/std@~7.3.0";

export type DdxExtType = "ui";

export type UiName = string;

export type Context = {
  bufNr: number;
  winId: number;
};

export type DdxOptions = {
  name: string;
  path: string;
  ui: string;
  uiOptions: Record<string, Partial<UiOptions>>;
  uiParams: Record<string, Partial<BaseParams>>;
};

export type UserOptions = Record<string, unknown>;

export type UiOptions = {
  // TODO: add options and remove placeholder
  placeholder?: unknown;
};

export type BaseParams = Record<string, unknown>;

export type UiActionCallback<Params extends BaseParams> = (
  args: ActionArguments<Params>,
) => ActionFlags | Promise<ActionFlags>;

export type ActionArguments<Params extends BaseParams> = {
  denops: Denops;
  context: Context;
  options: DdxOptions;
  buffer: DdxBuffer;
  actionParams: unknown;
  uiOptions: UiOptions;
  uiParams: Params;
};

export enum ActionFlags {
  None = 0,
  Redraw = 1 << 0,
  Persist = 1 << 1,
}
