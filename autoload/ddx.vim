function! ddx#start(options = {}) abort
  call ddx#_request('start', [a:options])
endfunction
function! ddx#ui_action(name, action, params) abort
  call ddx#_request('uiAction', [a:name, a:action, a:params])
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

  if '%'->bufname() ==# '[Command Line]'
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
          \ a:method, a:args->string())
  endif

  return {}
endfunction

function! s:init() abort
  if 'g:ddx#_initialized'->exists()
    return
  endif

  if !has('patch-8.2.0662') && !has('nvim-0.8')
    call ddx#util#print_error(
          \ 'ddx requires Vim 8.2.0662+ or neovim 0.8.0+.')
    return 1
  endif

  augroup ddx
    autocmd!
    autocmd User DDXReady :
  augroup END

  " Note: ddx.vim must be registered manually.

  " Note: denops load may be started
  autocmd ddx User DenopsReady silent! call ddx#_register()
  if 'g:loaded_denops'->exists() && denops#server#status() ==# 'running'
    silent! call ddx#_register()
  endif
endfunction

let s:root_dir = '<sfile>'->expand()->fnamemodify(':h:h')
let s:sep = has('win32') ? '\' : '/'
function! ddx#_register() abort
  call denops#plugin#register('ddx',
        \ [s:root_dir, 'denops', 'ddx', 'app.ts']->join(s:sep),
        \ #{ mode: 'skip' })

  autocmd ddx User DenopsClosed call s:stopped()
endfunction

function! s:stopped() abort
  unlet! g:ddx#_initialized

  " Restore custom config
  if 'g:ddx#_customs'->exists()
    for custom in g:ddx#_customs
      call ddx#_notify(custom.method, custom.args)
    endfor
  endif
endfunction

function! ddx#_denops_running() abort
  return exists('g:loaded_denops')
        \ && denops#server#status() ==# 'running'
        \ && denops#plugin#is_loaded('ddx')
endfunction
