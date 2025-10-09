import type {
  AnalyzerOptions,
  BaseParams,
  Context,
  DdxOptions,
} from "../types.ts";
import type { DdxBuffer } from "../buffer.ts";

import type { Denops } from "@denops/std";

export type OnInitArguments<Params extends BaseParams> = {
  denops: Denops;
  analyzerOptions: AnalyzerOptions;
  analyzerParams: Params;
};

type BaseAnalyzerArguments<Params extends BaseParams> = {
  denops: Denops;
  context: Context;
  options: DdxOptions;
  analyzerOptions: AnalyzerOptions;
  analyzerParams: Params;
};

export type AnalyzeResult = {
  name: string;
  values: AnalyzeValue[];
};

export type AnalyzeValue = AnalyzeValueNumber | AnalyzeValueString;

export type AnalyzeValueNumber = {
  name: string;
  rawType: "number";
  value: number;
  size?: number;
  address: number;
};

export type AnalyzeValueString = {
  name: string;
  rawType: "string";
  value: string;
  size?: number;
  address: number;
};

export type DetectArguments<Params extends BaseParams> =
  & BaseAnalyzerArguments<
    Params
  >
  & {
    buffer: DdxBuffer;
  };

export type ParseArguments<Params extends BaseParams> =
  & BaseAnalyzerArguments<
    Params
  >
  & {
    buffer: DdxBuffer;
  };

export abstract class BaseAnalyzer<Params extends BaseParams> {
  name = "";
  isInitialized = false;

  apiVersion = 1;

  onInit(_args: OnInitArguments<Params>): void | Promise<void> {}

  abstract detect(_args: DetectArguments<Params>): boolean | Promise<boolean>;

  abstract parse(
    _args: ParseArguments<Params>,
  ): AnalyzeResult[] | Promise<AnalyzeResult[]>;

  abstract params(): Params;
}

export function defaultAnalyzerOptions(): AnalyzerOptions {
  return {};
}

export function defaultAnalyzerParams(): BaseParams {
  return {};
}
