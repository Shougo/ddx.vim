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

  if !has('patch-9.0.1499') && !has('nvim-0.8')
    call ddx#util#print_error(
          \ 'ddx requires Vim 9.0.1499+ or neovim 0.8.0+.')
    return 1
  endif

  augroup ddx
    autocmd!
    autocmd User DenopsPluginPost:ddx ++nested let s:initialized = v:true
  augroup END

  " Note: ddx.vim must be registered manually.

  " Note: denops load may be started
  if 'g:loaded_denops'->exists() &&
        \ ('<amatch>'->expand() ==# 'DenopsReady' ||
        \  denops#server#status() ==# 'running')
    call s:register()
  else
    autocmd ddx User DenopsReady ++nested call s:register()
  endif
endfunction

function ddx#denops#_load(name, path) abort
  try
    call denops#plugin#load(a:name, a:path)
  catch /^Vim\%((\a\+)\)\=:E117:/
    " Fallback to `register` for backward compatibility
    silent! call denops#plugin#register(a:name, a:path, #{ mode: 'skip' })
  endtry
endfunction

const s:root_dir = '<sfile>'->expand()->fnamemodify(':h:h:h')
const s:sep = has('win32') ? '\' : '/'
function s:register() abort
  call dpp#denops#_load(
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
