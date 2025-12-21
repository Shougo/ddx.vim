import type { DdxBuffer } from "./buffer.ts";

import type { Denops } from "@denops/std";

export type { DdxBuffer } from "./buffer.ts";

export type DdxExtType = "ui" | "analyzer";

export type UiName = string;
export type AnalyzerName = string;

export type Context = {
  bufNr: number;
  winId: number;
};

export interface ContextBuilder {
  get(denops: Denops, options: UserOptions): Promise<[Context, DdxOptions]>;
  getGlobal(): Partial<DdxOptions>;
  getLocal(): Record<string, Partial<DdxOptions>>;
  setGlobal(options: Partial<DdxOptions>): void;
  setLocal(name: string, options: Partial<DdxOptions>): void;
  patchGlobal(options: Partial<DdxOptions>): void;
  patchLocal(name: string, options: Partial<DdxOptions>): void;
}

export type DdxOptions = {
  analyzerOptions: Record<string, Partial<AnalyzerOptions>>;
  analyzerParams: Record<string, Partial<BaseParams>>;
  analyzers: AnalyzerName[];
  anotherPath: string;
  length: number;
  name: string;
  offset: number;
  path: string;
  ui: UiName;
  uiOptions: Record<string, Partial<UiOptions>>;
  uiParams: Record<string, Partial<BaseParams>>;
};

export type UserOptions = Record<string, unknown>;

export type UiOptions = {
  // TODO: add options and remove placeholder
  placeholder?: unknown;
};

export type AnalyzerOptions = {
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
  anotherBuffer: DdxBuffer;
  actionParams: BaseParams;
  uiOptions: UiOptions;
  uiParams: Params;
};

export enum ActionFlags {
  None = 0,
  Redraw = 1 << 0,
  Persist = 1 << 1,
}
