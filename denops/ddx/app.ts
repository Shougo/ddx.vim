import { Denops, ensure, is } from "./deps.ts";
import { Ddx } from "./ddx.ts";
import { DdxExtType, DdxOptions } from "./types.ts";
import { ContextBuilder, defaultDdxOptions } from "./context.ts";

export function main(denops: Denops) {
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
      ddxs[name].push(new Ddx());
    }
    return ddxs[name].slice(-1)[0];
  };

  denops.dispatcher = {
    setGlobal(arg1: unknown): Promise<void> {
      const options = ensure(arg1, is.Record);
      contextBuilder.setGlobal(options);
      return Promise.resolve();
    },
    setLocal(arg1: unknown, arg2: unknown): Promise<void> {
      const options = ensure(arg1, is.Record);
      const name = ensure(arg2, is.String);
      contextBuilder.setLocal(name, options);
      return Promise.resolve();
    },
    patchGlobal(arg1: unknown): Promise<void> {
      const options = ensure(arg1, is.Record);
      contextBuilder.patchGlobal(options);
      return Promise.resolve();
    },
    patchLocal(arg1: unknown, arg2: unknown): Promise<void> {
      const options = ensure(arg1, is.Record);
      const name = ensure(arg2, is.String);
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
      const name = ensure(arg1, is.String);
      const ddx = getDdx(name);
      return Promise.resolve(ddx.getOptions());
    },
    getDefaultOptions(): Promise<Partial<DdxOptions>> {
      return Promise.resolve(defaultDdxOptions());
    },
    alias(arg1: unknown, arg2: unknown, arg3: unknown): Promise<void> {
      const extType = ensure(arg1, is.String) as DdxExtType;
      const alias = ensure(arg2, is.String);
      const base = ensure(arg3, is.String);

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
      const name = ensure(arg1, is.String);
      const actionName = ensure(arg2, is.String);
      const params = ensure(arg3, is.Record);

      const ddx = getDdx(name);
      await ddx.uiAction(denops, actionName, params);
    },
  };
}
