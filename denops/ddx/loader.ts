import { BaseParams, DdxExtType, UiName } from "./types.ts";
import { BaseUi } from "./base/ui.ts";
import { isDenoCacheIssueError } from "./utils.ts";

import type { Denops } from "jsr:@denops/std@~7.6.0";
import * as op from "jsr:@denops/std@~7.6.0/option";
import * as fn from "jsr:@denops/std@~7.6.0/function";

import { Lock } from "jsr:@core/asyncutil@~1.2.0/lock";
import { basename } from "jsr:@std/path@~1.1.0/basename";
import { parse } from "jsr:@std/path@~1.1.0/parse";
import { toFileUrl } from "jsr:@std/path@~1.1.0/to-file-url";
import { is } from "jsr:@core/unknownutil@~4.3.0/is";

export class Loader {
  #uis: Record<UiName, BaseUi<BaseParams>> = {};
  #aliases: Record<DdxExtType, Record<string, string>> = {
    ui: {},
  };
  #checkPaths: Record<string, boolean> = {};
  #registerLock = new Lock(0);
  #cachedPaths: Record<string, string> = {};
  #prevRuntimepath = "";

  async autoload(
    denops: Denops,
    type: DdxExtType,
    name: string,
  ) {
    const runtimepath = await op.runtimepath.getGlobal(denops);
    if (runtimepath !== this.#prevRuntimepath) {
      const cached = await globpath(
        denops,
        "denops/@ddx-*s",
      );
      // NOTE: glob may be invalid.
      if (Object.keys(cached).length > 0) {
        this.#cachedPaths = cached;
      }
      this.#prevRuntimepath = runtimepath;
    }

    const key = `@ddx-${type}s/${this.getAlias(type, name) ?? name}`;

    if (!this.#cachedPaths[key]) {
      return;
    }

    await this.registerPath(type, this.#cachedPaths[key]);
  }

  registerAlias(type: DdxExtType, alias: string, base: string) {
    this.#aliases[type][alias] = base;
  }

  async registerPath(type: DdxExtType, path: string) {
    await this.#registerLock.lock(async () => {
      try {
        await this.#register(type, path);
      } catch (e) {
        if (isDenoCacheIssueError(e)) {
          console.warn("*".repeat(80));
          console.warn(`Deno module cache issue is detected.`);
          console.warn(
            `Execute '!deno cache --reload "${path}"' and restart Vim/Neovim.`,
          );
          console.warn("*".repeat(80));
        }

        console.error(`Failed to load file '${path}': ${e}`);
        throw e;
      }
    });
  }

  getAliasNames(type: DdxExtType) {
    return Object.keys(this.#aliases[type]);
  }
  getAlias(type: DdxExtType, name: string) {
    return this.#aliases[type][name];
  }
  getUi(name: UiName) {
    return this.#uis[name];
  }

  async #register(type: DdxExtType, path: string) {
    if (path in this.#checkPaths) {
      return;
    }

    const name = parse(path).name;

    const mod = await import(toFileUrl(path).href);

    let add;
    switch (type) {
      case "ui":
        add = (name: string) => {
          const ui = new mod.Ui();
          ui.name = name;
          this.#uis[ui.name] = ui;
        };
        break;
    }

    add(name);

    // Check alias
    const aliases = this.getAliasNames(type).filter(
      (k) => this.getAlias(type, k) === name,
    );
    for (const alias of aliases) {
      add(alias);
    }

    this.#checkPaths[path] = true;
  }
}

async function globpath(
  denops: Denops,
  search: string,
): Promise<Record<string, string>> {
  const runtimepath = await op.runtimepath.getGlobal(denops);

  const paths: Record<string, string> = {};
  const glob = await fn.globpath(
    denops,
    runtimepath,
    search + "/*.ts",
    1,
    1,
  );

  if (is.Array(glob)) {
    // NOTE: glob may be invalid.
    for (const path of glob) {
      // Skip already added name.
      const parsed = parse(path);
      const key = `${basename(parsed.dir)}/${parsed.name}`;
      if (key in paths) {
        continue;
      }

      paths[key] = path;
    }
  }

  return paths;
}
