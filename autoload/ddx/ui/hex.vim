function! ddx#ui#hex#do_action(name, options = {}) abort
  if !('b:ddx_ui_name'->exists()) || &filetype !=# 'ddx-hex'
    return
  endif

  call ddx#ui_action(b:ddx_ui_name, a:name, a:options)
endfunction

function! ddx#ui#hex#parse_address(string, cur_text, encoding) abort
  " Get last address.
  let base_address = a:string->matchstr('^\x\+')

  " Default.
  let type = 'address'
  let address = base_address->str2nr(16)

  if a:cur_text =~# '^\s*\x\+\s*:[[:xdigit:][:space:]]\+\S$'
    " Check hex line.
    let offset = a:cur_text->matchstr(
          \ '^\s*\x\+\s*:\zs[[:xdigit:][:space:]]\+$')->split()->len() - 1
    if 0 <= offset && offset < 16
      let type = 'hex'
      let address += offset
    endif
  elseif a:cur_text =~# '\x\+\s\+|.*$'
    let chars = a:cur_text->matchstr('\x\+\s\+|\zs.*\ze.$')
    let offset = (a:encoding ==# 'latin1') ?
          \ chars->len() - 4 + 1 : chars->strwidth() - 4 + 1
    if offset < 0
      let offset = 0
    endif

    if offset < b:vinarise.width
      let type = 'ascii'
      let address += offset
    endif
  endif

  return [type, address]
endfunction

function! ddx#ui#hex#get_cur_text(string, col) abort
  return a:string->matchstr('^.*\%' .. a:col . 'c.')
endfunction

function! ddx#ui#hex#input(prompt, text='') abort
  redraw

  try
    return a:prompt->input(a:text)
  catch /^Vim:Interrupt/
  endtry

  return ''
endfunction
