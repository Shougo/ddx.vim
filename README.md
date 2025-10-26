# ddx.vim

> Dark deno-powered hexadecimal plugin for Vim/Neovim

If you don't want to configure plugins, you don't have to use the plugin. It
does not work with zero configuration. You can use other plugins.

[![Doc](https://img.shields.io/badge/doc-%3Ah%20ddx-orange.svg)](doc/ddx.txt)

Please read [help](doc/ddx.txt) for details.

Ddx is the abbreviation of "dark deno-powered heXadecimal".

The development is supported by
[github sponsors](https://github.com/sponsors/Shougo/). Thank you!

<!-- vim-markdown-toc GFM -->

- [Introduction](#introduction)
- [Install](#install)
- [Screenshots](#screenshots)

<!-- vim-markdown-toc -->

## Introduction

I have chosen denops.vim framework to create new plugin. Because denops.vim is
better than Neovim Python interface.

- Easy to setup
- Minimal dependency
- Stability
- Vim/Neovim compatibility
- Speed
- Library
- Easy to hack

## Install

**Note:** It requires Vim 9.1.1646+ or Neovim 0.11.0+. See
[requirements](#requirements) if you aren't sure whether you have this.

### Requirements

Please install both Deno 2.3.0+ and "denops.vim" v8.0+.

- <https://deno.land/>
- <https://github.com/vim-denops/denops.vim>

## Screenshots

Please see: https://github.com/Shougo/ddx.vim/issues/4

![ddx-ui-hex](https://private-user-images.githubusercontent.com/41495/504473009-aba36a7d-bce8-4461-aa11-58c5f0a45521.png)
![:Ddu ddx_analyze](https://private-user-images.githubusercontent.com/41495/504473202-4d0f0131-c089-4e95-a931-d6abb31f749e.png)

## Plans

- [x] View binary file
- [x] Edit binary file(especially, insert bytes and delete bytes)
- [ ] Japanese encodings support
- [ ] GB data support
- [x] Undo support
- [x] ddx-commands
- [x] ddx-ui-hex
- [x] UI support
- [ ] Bitmap analysis
