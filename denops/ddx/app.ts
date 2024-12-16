import { Ddx } from "./ddx.ts";
import { DdxExtType, DdxOptions } from "./types.ts";
import {
  ContextBuilder,
  defaultContext,
  defaultDdxOptions,
} from "./context.ts";
import { Loader } from "./loader.ts";
import { uiAction } from "./ext.ts";

import type { Denops, Entrypoint } from "jsr:@denops/std@~7.4.0";

import { ensure } from "jsr:@core/unknownutil@~4.3.0/ensure";
import { is } from "jsr:@core/unknownutil@~4.3.0/is";

export const main: Entrypoint = (denops: Denops) => {
  const loader = new Loader();
  const ddxs: Record<string, Ddx[]> = {};
  const contextBuilder = new ContextBuilder();
  const aliases: Record<DdxExtType, Record<string, string>> = {
    ui: {},
  };

  const getDdx = (name: string) => {
    if (!ddxs[name]) {
      ddxs[name] = [];
    }
    if (ddxs[name].length == 0) {
      ddxs[name].push(new Ddx(loader));
    }
    return ddxs[name].slice(-1)[0];
  };

  denops.dispatcher = {
    setGlobal(arg1: unknown): Promise<void> {
      const options = ensure(arg1, is.Record) as Partial<DdxOptions>;
      contextBuilder.setGlobal(options);
      return Promise.resolve();
    },
    setLocal(arg1: unknown, arg2: unknown): Promise<void> {
      const options = ensure(arg1, is.Record) as Partial<DdxOptions>;
      const name = ensure(arg2, is.String) as string;
      contextBuilder.setLocal(name, options);
      return Promise.resolve();
    },
    patchGlobal(arg1: unknown): Promise<void> {
      const options = ensure(arg1, is.Record) as Partial<DdxOptions>;
      contextBuilder.patchGlobal(options);
      return Promise.resolve();
    },
    patchLocal(arg1: unknown, arg2: unknown): Promise<void> {
      const options = ensure(arg1, is.Record) as Partial<DdxOptions>;
      const name = ensure(arg2, is.String) as string;
      contextBuilder.patchLocal(name, options);
      return Promise.resolve();
    },
    getGlobal(): Promise<Partial<DdxOptions>> {
      return Promise.resolve(contextBuilder.getGlobal());
    },
    getLocal(): Promise<Partial<DdxOptions>> {
      return Promise.resolve(contextBuilder.getLocal());
    },
    getCurrent(arg1: unknown): Promise<Partial<DdxOptions>> {
      const name = ensure(arg1, is.String) as string;
      const ddx = getDdx(name);
      return Promise.resolve(ddx.getOptions());
    },
    getDefaultOptions(): Promise<Partial<DdxOptions>> {
      return Promise.resolve(defaultDdxOptions());
    },
    alias(arg1: unknown, arg2: unknown, arg3: unknown): Promise<void> {
      const extType = ensure(arg1, is.String) as DdxExtType;
      const alias = ensure(arg2, is.String) as string;
      const base = ensure(arg3, is.String) as string;

      aliases[extType][alias] = base;
      return Promise.resolve();
    },
    async start(arg1: unknown): Promise<void> {
      const userOptions = ensure(arg1, is.Record) as DdxOptions;

      const [_, options] = await contextBuilder.get(denops, userOptions);

      const ddx = getDdx(options.name);

      await ddx.start(denops, userOptions.path);
    },
    async uiAction(
      arg1: unknown,
      arg2: unknown,
      arg3: unknown,
    ): Promise<void> {
      const name = ensure(arg1, is.String) as string;
      const actionName = ensure(arg2, is.String) as string;
      const params = ensure(arg3, is.Record);

      const ddx = getDdx(name);
      await uiAction(
        denops,
        loader,
        defaultContext(),
        ddx.getOptions(),
        ddx.getBuffer(),
        actionName,
        params,
      );
    },
  };
};
