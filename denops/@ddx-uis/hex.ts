import {
  ActionFlags,
  BaseUi,
  Context,
  DdxBuffer,
  DdxOptions,
  UiActions,
  UiOptions,
} from "../ddx/types.ts";
import { batch, Denops, fn, op } from "../ddx/deps.ts";

type FloatingBorder =
  | "none"
  | "single"
  | "double"
  | "rounded"
  | "solid"
  | "shadow"
  | string[];

type HighlightGroup = {
  floating?: string;
};

export type Params = {
  encoding: "utf-8";
  floatingBorder: FloatingBorder;
  highlights: HighlightGroup;
  split: "horizontal" | "vertical" | "floating" | "no";
  splitDirection: "botright" | "topleft";
  winCol: number;
  winHeight: number;
  winRow: number;
  winWidth: number;
};

export class Ui extends BaseUi<Params> {
  private buffers: Record<string, number> = {};

  override async redraw(args: {
    denops: Denops;
    context: Context;
    options: DdxOptions;
    buffer: DdxBuffer;
    uiOptions: UiOptions;
    uiParams: Params;
  }): Promise<void> {
    function arrayBufferToHex(buffer: Uint8Array) {
      return Array.prototype.map.call(
        new Uint8Array(buffer),
        (x) => ("00" + x.toString(16)).slice(-2),
      ).join(" ");
    }

    const bufferName = `ddx-ff-${args.options.name}`;
    const initialized = this.buffers[args.options.name] ||
      (await fn.bufexists(args.denops, bufferName) &&
        await fn.bufnr(args.denops, bufferName));
    const bufnr = initialized || await this.initBuffer(args.denops, bufferName);
    const winid = await fn.bufwinid(args.denops, bufnr);

    const hasNvim = args.denops.meta.host == "nvim";
    const floating = args.uiParams.split == "floating" && hasNvim;
    if (winid < 0) {
      const direction = args.uiParams.splitDirection;
      if (args.uiParams.split == "horizontal") {
        const header = `silent keepalt ${direction} `;
        await args.denops.cmd(
          header +
            `sbuffer +resize\\ ${Number(args.uiParams.winHeight)} ${bufnr}`,
        );
      } else if (args.uiParams.split == "vertical") {
        const header = `silent keepalt vertical ${direction} `;
        await args.denops.cmd(
          header +
            `sbuffer +vertical\\ resize\\ ${args.uiParams.winWidth} ${bufnr}`,
        );
      } else if (floating) {
        await args.denops.call("nvim_open_win", bufnr, true, {
          "relative": "editor",
          "row": Number(args.uiParams.winRow),
          "col": Number(args.uiParams.winCol),
          "width": Number(args.uiParams.winWidth),
          "height": Number(args.uiParams.winHeight),
          "border": args.uiParams.floatingBorder,
        });

        await fn.setwinvar(
          args.denops,
          await fn.bufwinnr(args.denops, bufnr),
          "&winhighlight",
          `Normal:${args.uiParams.highlights?.floating ?? "NormalFloat"}`,
        );
      } else if (args.uiParams.split == "no") {
        await args.denops.cmd(`silent keepalt buffer ${bufnr}`);
      } else {
        await args.denops.call(
          "ddx#util#print_error",
          `Invalid split param: ${args.uiParams.split}`,
        );
        return;
      }
    }

    await this.setDefaultParams(args.denops, args.uiParams);

    // NOTE: buffers may be restored
    if (!this.buffers[args.options.name] || winid < 0) {
      await this.initOptions(args.denops, args.options, args.uiParams, bufnr);
    }

    let lnum = 1;
    let start = 0;
    const size = await args.buffer.getSize();
    const length = 16;

    while (start < size) {
      const bytes = await args.buffer.getBytes(
        start,
        Math.min(length, size - start),
      );

      const address = start.toString(16);
      const padding = " ".repeat((16 - bytes.length) * 3);

      const ascii = (new TextDecoder().decode(bytes)).replaceAll(
        // deno-lint-ignore no-control-regex
        /[\x00-\x1f]/g,
        ".",
      );

      await fn.setbufline(
        args.denops,
        bufnr,
        lnum,
        `${("00000000" + address).slice(-8)}: ${
          arrayBufferToHex(bytes)
        }${padding} |   ${ascii}`,
      );

      start += length;
      lnum += 1;
    }

    this.buffers[args.options.name] = bufnr;
  }

  override async quit(args: {
    denops: Denops;
    context: Context;
    options: DdxOptions;
    uiParams: Params;
  }): Promise<void> {
    // Move to the UI window.
    const bufnr = this.buffers[args.options.name];
    await fn.win_gotoid(
      args.denops,
      await fn.bufwinid(args.denops, bufnr),
    );

    const winnr = await fn.winnr(args.denops, "$");
    if (args.uiParams.split == "no" || winnr == 1) {
      await args.denops.cmd(
        args.context.bufNr == this.buffers[args.options.name]
          ? "enew"
          : `buffer ${args.context.bufNr}`,
      );
    } else {
      await args.denops.cmd("silent! close!");
      await fn.win_gotoid(args.denops, args.context.winId);
    }
  }

  override actions: UiActions<Params> = {
    change: async (args: {
      denops: Denops;
      context: Context;
      options: DdxOptions;
      uiParams: Params;
    }) => {
      // Get address
      const currentLine = await fn.getline(args.denops, ".");
      const curText = await args.denops.call(
        "ddx#ui#hex#get_cur_text",
        currentLine,
        await fn.col(args.denops, "."),
      );
      const [address, type] = await args.denops.call(
        "ddx#ui#hex#parse_address",
        currentLine,
        curText,
        args.uiParams.encoding,
      ) as string[];

      console.log([address, type]);

      return ActionFlags.None;
    },
    quit: async (args: {
      denops: Denops;
      context: Context;
      options: DdxOptions;
      uiParams: Params;
    }) => {
      await this.quit({
        denops: args.denops,
        context: args.context,
        options: args.options,
        uiParams: args.uiParams,
      });

      return ActionFlags.None;
    },
  };

  override params(): Params {
    return {
      encoding: "utf-8",
      floatingBorder: "none",
      highlights: {},
      split: "horizontal",
      splitDirection: "botright",
      winCol: 0,
      winHeight: 20,
      winRow: 0,
      winWidth: 0,
    };
  }

  private async initBuffer(
    denops: Denops,
    bufferName: string,
  ): Promise<number> {
    const bufnr = await fn.bufadd(denops, bufferName);
    await fn.bufload(denops, bufnr);

    return bufnr;
  }

  private async initOptions(
    denops: Denops,
    options: DdxOptions,
    uiParams: Params,
    bufnr: number,
  ): Promise<void> {
    const winid = await fn.bufwinid(denops, bufnr);

    await batch(denops, async (denops: Denops) => {
      await fn.setbufvar(denops, bufnr, "ddx_ui_name", options.name);

      // Set options
      await fn.setwinvar(denops, winid, "&list", 0);
      await fn.setwinvar(denops, winid, "&colorcolumn", "");
      await fn.setwinvar(denops, winid, "&cursorline", 1);
      await fn.setwinvar(denops, winid, "&foldcolumn", 0);
      await fn.setwinvar(denops, winid, "&foldenable", 0);
      await fn.setwinvar(denops, winid, "&number", 0);
      await fn.setwinvar(denops, winid, "&relativenumber", 0);
      await fn.setwinvar(denops, winid, "&signcolumn", "no");
      await fn.setwinvar(denops, winid, "&spell", 0);
      await fn.setwinvar(denops, winid, "&wrap", 0);
      await fn.setwinvar(denops, winid, "&signcolumn", "no");

      await fn.setbufvar(denops, bufnr, "&bufhidden", "unload");
      await fn.setbufvar(denops, bufnr, "&buftype", "nofile");
      await fn.setbufvar(denops, bufnr, "&filetype", "ddx-hex");
      await fn.setbufvar(denops, bufnr, "&swapfile", 0);

      if (uiParams.split == "horizontal") {
        await fn.setbufvar(denops, bufnr, "&winfixheight", 1);
      } else if (uiParams.split == "vertical") {
        await fn.setbufvar(denops, bufnr, "&winfixwidth", 1);
      }
    });
  }

  private async setDefaultParams(denops: Denops, uiParams: Params) {
    if (uiParams.winRow == 0) {
      uiParams.winRow = Math.trunc(
        (await denops.call("eval", "&lines") as number) / 2 - 10,
      );
    }
    if (uiParams.winCol == 0) {
      uiParams.winCol = Math.trunc(
        (await op.columns.getGlobal(denops)) / 4,
      );
    }
    if (uiParams.winWidth == 0) {
      uiParams.winWidth = Math.trunc((await op.columns.getGlobal(denops)) / 2);
    }
  }
}
