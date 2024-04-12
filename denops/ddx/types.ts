import { Denops } from "./deps.ts";
import type { BaseUiParams } from "./base/ui.ts";
import { DdxBuffer } from "./buffer.ts";

export { BaseUi } from "./base/ui.ts";
export type { BaseUiParams, UiActions } from "./base/ui.ts";
export { DdxBuffer } from "./buffer.ts";

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
  uiParams: Record<string, Partial<BaseUiParams>>;
};

export type UserOptions = Record<string, unknown>;

export type UiOptions = {
  // TODO: add options and remove placeholder
  placeholder?: unknown;
};

export type UiActionCallback<Params extends BaseUiParams> = (
  args: ActionArguments<Params>,
) => ActionFlags | Promise<ActionFlags>;

export type ActionArguments<Params extends BaseUiParams> = {
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
