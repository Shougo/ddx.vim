import { batch, Denops, ensureObject, ensureString, vars } from "./deps.ts";
import { Ddx } from "./ddx.ts";
import { DdxExtType, DdxOptions } from "./types.ts";
import { ContextBuilder, defaultDdxOptions } from "./context.ts";

export async function main(denops: Denops) {
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
      const options = ensureObject(arg1);
      contextBuilder.setGlobal(options);
      return Promise.resolve();
    },
    setLocal(arg1: unknown, arg2: unknown): Promise<void> {
      const options = ensureObject(arg1);
      const name = ensureString(arg2);
      contextBuilder.setLocal(name, options);
      return Promise.resolve();
    },
    patchGlobal(arg1: unknown): Promise<void> {
      const options = ensureObject(arg1);
      contextBuilder.patchGlobal(options);
      return Promise.resolve();
    },
    patchLocal(arg1: unknown, arg2: unknown): Promise<void> {
      const options = ensureObject(arg1);
      const name = ensureString(arg2);
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
      const name = ensureString(arg1);
      const ddx = getDdx(name);
      return Promise.resolve(ddx.getOptions());
    },
    getDefaultOptions(): Promise<Partial<DdxOptions>> {
      return Promise.resolve(defaultDdxOptions());
    },
    alias(arg1: unknown, arg2: unknown, arg3: unknown): Promise<void> {
      const extType = ensureString(arg1) as DdxExtType;
      const alias = ensureString(arg2);
      const base = ensureString(arg3);

      aliases[extType][alias] = base;
      return Promise.resolve();
    },
    async start(arg1: unknown): Promise<void> {
      const userOptions = ensureObject(arg1) as DdxOptions;

      const [_, options] = await contextBuilder.get(denops, userOptions);

      const ddx = getDdx(options.name);

      await ddx.start(denops, userOptions.path);
    },
    async uiAction(
      arg1: unknown,
      arg2: unknown,
      arg3: unknown,
    ): Promise<void> {
      const name = ensureString(arg1);
      const actionName = ensureString(arg2);
      const params = ensureObject(arg3);

      const ddu = getDdx(name);
      await ddu.uiAction(denops, actionName, params);
    },
  };

  await batch(denops, async (denops: Denops) => {
    await vars.g.set(denops, "ddx#_initialized", 1);
    await denops.cmd("doautocmd <nomodeline> User DDXReady");
    await denops.cmd("autocmd! User DDXReady");
  });
}
