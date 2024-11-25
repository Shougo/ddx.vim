function ddx#denops#_request(method, args) abort
  if s:init()
    return {}
  endif

  " Note: If call denops#plugin#wait() in vim_starting, freezed!
  if has('vim_starting')
    call ddx#util#print_error(
          \ printf('You cannot call "%s" in vim_starting.', a:method))
    return {}
  endif

  if getcmdwintype() !=# ''
    " Must quit from command line window
    quit
  endif

  if denops#plugin#wait('ddx')
    return {}
  endif
  return denops#request('ddx', a:method, a:args)
endfunction
function ddx#denops#_notify(method, args) abort
  if s:init()
    return {}
  endif

  if ddx#denops#_running()
    if denops#plugin#wait('ddx')
      return {}
    endif
    call denops#notify('ddx', a:method, a:args)
  else
    " Lazy call notify
    execute printf('autocmd User DenopsPluginPost:ddx call '
          \ .. 'denops#notify("ddx", "%s", %s)', a:method, a:args->string())
  endif

  return {}
endfunction

function s:init() abort
  if 's:initialized'->exists()
    return
  endif

  if !has('patch-9.1.0448') && !has('nvim-0.10')
    call ddx#util#print_error(
          \ 'ddx requires Vim 9.1.0448+ or neovim 0.10.0+.')
    return 1
  endif

  augroup ddx
    autocmd!
    autocmd User DenopsPluginPost:ddx ++nested let s:initialized = v:true
  augroup END

  " Note: ddx.vim must be registered manually.

  " NOTE: denops load may be started
  if 'g:loaded_denops'->exists()
    if denops#server#status() ==# 'running'
      call s:register()
      return
    endif

    try
      if '<amatch>'->expand() ==# 'DenopsReady'
        call s:register()
        return
      endif
    catch /^Vim\%((\a\+)\)\=:E497:/
      " NOTE: E497 is occured when it is not in autocmd.
    endtry
  endif

  autocmd ddx User DenopsReady ++nested call s:register()
endfunction

const s:root_dir = '<sfile>'->expand()->fnamemodify(':h:h:h')
const s:sep = has('win32') ? '\' : '/'
function s:register() abort
  call denops#plugin#load(
        \   'ddx',
        \   [s:root_dir, 'denops', 'ddx', 'app.ts']->join(s:sep)
        \ )

  autocmd ddx User DenopsClosed ++nested call s:stopped()
endfunction

function s:stopped() abort
  unlet! s:initialized

  " Restore custom config
  if 'g:ddx#_customs'->exists()
    for custom in g:ddx#_customs
      call ddx#_notify(custom.method, custom.args)
    endfor
  endif
endfunction

function ddx#denops#_running() abort
  return 'g:loaded_denops'->exists()
        \ && denops#server#status() ==# 'running'
        \ && 'ddx'->denops#plugin#is_loaded()
endfunction
