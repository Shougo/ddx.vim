export { BaseUi } from "./base/ui.ts";
export type { UiActions } from "./base/ui.ts";
import { Denops } from "./deps.ts";

export type DdxExtType = "ui";

export type Context = {
  bufNr: number;
};

export type DdxOptions = {
  name: string;
  path: string;
  ui: string;
  uiOptions: Record<string, Partial<UiOptions>>;
  uiParams: Record<string, Partial<Record<string, unknown>>>;
};

export type UiOptions = {
  // TODO: add options and remove placeholder
  placeholder?: unknown;
};

export type ActionArguments<Params extends Record<string, unknown>> = {
  denops: Denops;
  context: Context;
  options: DdxOptions;
  actionParams: unknown;
  uiOptions: Record<string, Partial<UiOptions>>;
  uiParams: Params;
};

export enum ActionFlags {
  None = 0,
  RefreshItems = 1 << 0,
  Redraw = 1 << 1,
  Persist = 1 << 2,
}
