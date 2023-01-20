import {
  ActionArguments,
  ActionFlags,
  Context,
  DdxBuffer,
  DdxOptions,
  UiOptions,
} from "../types.ts";
import { Denops } from "../deps.ts";

export type BaseUiParams = Record<string, unknown>;

export type UiActions<Params extends BaseUiParams> = Record<
  string,
  (args: ActionArguments<Params>) => Promise<ActionFlags>
>;

export type OnInitArguments<Params extends BaseUiParams> = {
  denops: Denops;
  uiOptions: UiOptions;
  uiParams: Params;
};

export type RedrawArguments<Params extends BaseUiParams> = {
  denops: Denops;
  context: Context;
  options: DdxOptions;
  buffer: DdxBuffer;
  uiOptions: UiOptions;
  uiParams: Params;
};

export type QuitArguments<Params extends BaseUiParams> = {
  denops: Denops;
  context: Context;
  options: DdxOptions;
  uiOptions: UiOptions;
  uiParams: Params;
};

export abstract class BaseUi<Params extends BaseUiParams> {
  name = "";
  isInitialized = false;

  apiVersion = 1;

  async onInit(_args: OnInitArguments<Params>): Promise<void> {}

  async redraw(_args: RedrawArguments<Params>): Promise<void> {}

  async quit(_args: QuitArguments<Params>): Promise<void> {}

  actions: UiActions<Params> = {};

  abstract params(): Params;
}

export function defaultUiOptions(): UiOptions {
  return {};
}

export function defaultUiParams(): BaseUiParams {
  return {};
}
