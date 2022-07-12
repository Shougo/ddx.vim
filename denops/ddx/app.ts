import { batch, Denops, ensureObject, vars } from "./deps.ts";
import { Ddx } from "./ddx.ts";

export async function main(denops: Denops) {
  const ddxs: Record<string, Ddx[]> = {};

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
    async start(arg1: unknown): Promise<void> {
      const userOptions = ensureObject(arg1);

      const ddx = getDdx("");

      await ddx.start(denops, userOptions.path);
    },
  };

  await batch(denops, async (denops: Denops) => {
    await vars.g.set(denops, "ddx#_initialized", 1);
    await denops.cmd("doautocmd <nomodeline> User DDXReady");
  });
}
