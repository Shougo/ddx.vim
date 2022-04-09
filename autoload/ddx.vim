function! ddx#start(...) abort
  call ddx#_request('start', [get(a:000, 0, {})])
endfunction

function! ddx#_request(method, args) abort
  if s:init()
    return {}
  endif

  " Note: If call denops#plugin#wait() in vim_starting, freezed!
  if has('vim_starting')
    call ddx#util#print_error(
          \ printf('You cannot call "%s" in vim_starting.', a:method))
    return {}
  endif

  if bufname('%') ==# '[Command Line]'
    " Must quit from command line window
    quit
  endif

  if denops#plugin#wait('ddx')
    return {}
  endif
  return denops#request('ddx', a:method, a:args)
endfunction
function! ddx#_notify(method, args) abort
  if s:init()
    return {}
  endif

  if ddx#_denops_running()
    if denops#plugin#wait('ddx')
      return {}
    endif
    call denops#notify('ddx', a:method, a:args)
  else
    " Lazy call notify
    execute printf('autocmd User ddxReady call ' .
          \ 'denops#notify("ddx", "%s", %s)',
          \ a:method, string(a:args))
  endif

  return {}
endfunction

function! s:init() abort
  if exists('g:ddx#_initialized')
    return
  endif

  if !has('patch-8.2.0662') && !has('nvim-0.6')
    call ddx#util#print_error(
          \ 'ddx requires Vim 8.2.0662+ or neovim 0.6.0+.')
    return 1
  endif

  augroup ddx
    autocmd!
  augroup END

  " Note: ddx.vim must be registered manually.

  " Note: denops load may be started
  if exists('g:loaded_denops') && denops#server#status() ==# 'running'
    silent! call ddx#_register()
  else
    autocmd ddx User DenopsReady silent! call ddx#_register()
  endif
endfunction

let s:root_dir = fnamemodify(expand('<sfile>'), ':h:h')
function! ddx#_register() abort
  call denops#plugin#register('ddx',
        \ denops#util#join_path(s:root_dir, 'denops', 'ddx', 'app.ts'),
        \ { 'mode': 'skip' })
endfunction

function! ddx#_denops_running() abort
  return exists('g:loaded_denops')
        \ && denops#server#status() ==# 'running'
        \ && denops#plugin#is_loaded('ddx')
endfunction
