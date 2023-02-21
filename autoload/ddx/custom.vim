function! ddx#custom#patch_global(key_or_dict, value = '') abort
  let dict = s:normalize_key_or_dict(a:key_or_dict, a:value)
  call s:notify('patchGlobal', [dict])
endfunction
function! ddx#custom#patch_local(name, key_or_dict, value = '') abort
  let dict = s:normalize_key_or_dict(a:key_or_dict, a:value)
  call s:notify('patchLocal', [dict, a:name])
endfunction

function! ddx#custom#set_global(dict) abort
  call s:notify('setGlobal', [a:dict])
endfunction
function! ddx#custom#set_local(name, dict) abort
  call s:notify('setLocal', [a:dict, a:name])
endfunction

let s:aliases = #{
      \   ui: {},
      \ }
function! ddx#custom#alias(type, alias, base) abort
  if !has_key(s:aliases, a:type)
    call ddx#util#print_error('Invalid alias type: ' . a:type)
    return
  endif

  let s:aliases[a:type][a:alias] = a:base
  call s:notify('alias', [a:type, a:alias, a:base])
endfunction

" This should be called manually, so wait until ddxReady by the user himself.
function! ddx#custom#get_global() abort
  return ddx#_request('getGlobal', [])
endfunction
function! ddx#custom#get_local() abort
  return ddx#_request('getLocal', [])
endfunction
function! ddx#custom#get_current(name) abort
  return ddx#_request('getCurrent', [a:name])
endfunction
function! ddx#custom#get_aliases() abort
  return s:aliases
endfunction

function! s:normalize_key_or_dict(key_or_dict, value) abort
  if type(a:key_or_dict) == v:t_dict
    return a:key_or_dict
  elseif type(a:key_or_dict) == v:t_string
    let base = {}
    let base[a:key_or_dict] = a:value
    return base
  endif
  return {}
endfunction

function! s:normalize_string_or_list(string_or_list) abort
  if type(a:string_or_list) == v:t_list
    return a:string_or_list
  elseif type(a:string_or_list) == v:t_string
    return [a:string_or_list]
  endif
  return []
endfunction

function! s:notify(method, args) abort
  " Save notify args
  if !exists('g:ddx#_customs')
    let g:ddx#_customs = []
  endif

  call add(g:ddx#_customs, #{ method: a:method, args: a:args })

  return ddx#_notify(a:method, a:args)
endfunction
