import { BaseUi, BaseUiParams, DdxExtType, UiName } from "./types.ts";
import {
  basename,
  Denops,
  fn,
  is,
  Lock,
  op,
  parse,
  toFileUrl,
} from "./deps.ts";

export class Loader {
  #uis: Record<UiName, BaseUi<BaseUiParams>> = {};
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
      await this.#register(type, path);
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
