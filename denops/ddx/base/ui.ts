import {
  ActionArguments,
  ActionFlags,
  Context,
  DdxBuffer,
  DdxOptions,
  UiOptions,
} from "../types.ts";
import { Denops } from "../deps.ts";

export type UiActions<Params extends Record<string, unknown>> = Record<
  string,
  (args: ActionArguments<Params>) => Promise<ActionFlags>
>;

export type OnInitArguments<Params extends Record<string, unknown>> = {
  denops: Denops;
  uiOptions: UiOptions;
  uiParams: Params;
};

export type RedrawArguments<Params extends Record<string, unknown>> = {
  denops: Denops;
  context: Context;
  options: DdxOptions;
  buffer: DdxBuffer;
  uiOptions: UiOptions;
  uiParams: Params;
};

export type QuitArguments<Params extends Record<string, unknown>> = {
  denops: Denops;
  context: Context;
  options: DdxOptions;
  uiOptions: UiOptions;
  uiParams: Params;
};

export abstract class BaseUi<
  Params extends Record<string, unknown>,
> {
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

export function defaultUiParams(): Record<string, unknown> {
  return {};
}
