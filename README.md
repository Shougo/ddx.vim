# ddx.vim

> Dark deno-powered hexadecimal plugin for neovim/Vim8

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
  - [Requirements](#requirements)
- [Configuration](#configuration)
- [Screenshots](#screenshots)

<!-- vim-markdown-toc -->

## Introduction

I have chosen denops.vim framework to create new plugin. Because denops.vim is
better than neovim Python interface.

- Easy to setup
- Minimal dependency
- Stability
- neovim/Vim8 compatibility
- Speed
- Library
- Easy to hack

## Install

**Note:** Ddx.vim requires Neovim (0.6.0+ and of course, **latest** is
recommended) or Vim 8.2.0662. See [requirements](#requirements) if you aren't
sure whether you have this.

For vim-plug

```viml
call plug#begin()

Plug 'vim-denops/denops.vim'
Plug 'Shougo/ddx.vim'

call plug#end()
```

For dein.vim

```viml
call dein#begin()

call dein#add('vim-denops/denops.vim')
call dein#add('Shougo/ddx.vim')

call dein#end()
```

### Requirements

Ddx.vim requires both Deno and denops.vim.

- <https://deno.land/>
- <https://github.com/vim-denops/denops.vim>

## Configuration

```vim
```

See `:help ddx-options` for a complete list of options.

## Screenshots

## Plans

- [ ] XXX
