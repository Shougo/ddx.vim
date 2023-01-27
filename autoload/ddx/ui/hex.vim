function! ddx#ui#hex#do_action(name, options = {}) abort
  if !exists('b:ddx_ui_name') || &filetype !=# 'ddx-hex'
    return
  endif

  call ddx#ui_action(b:ddx_ui_name, a:name, a:options)
endfunction

function! ddx#ui#hex#parse_address(string, cur_text, encoding) abort
  " Get last address.
  let base_address = matchstr(a:string, '^\x\+')

  " Default.
  let type = 'address'
  let address = str2nr(base_address, 16)

  if a:cur_text =~# '^\s*\x\+\s*:[[:xdigit:][:space:]]\+\S$'
    " Check hex line.
    let offset = len(split(matchstr(a:cur_text,
          \ '^\s*\x\+\s*:\zs[[:xdigit:][:space:]]\+$'))) - 1
    if 0 <= offset && offset < 16
      let type = 'hex'
      let address += offset
    endif
  elseif a:cur_text =~# '\x\+\s\+|.*$'
    let chars = matchstr(a:cur_text, '\x\+\s\+|\zs.*\ze.$')
    let offset = (a:encoding ==# 'latin1') ?
          \ len(chars) - 4 + 1 : strwidth(chars) - 4 + 1
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
  return matchstr(a:string, '^.*\%' . a:col . 'c.')
endfunction

function! ddx#ui#hex#input(prompt, text='') abort
  redraw

  try
    return input(a:prompt, a:text)
  catch /^Vim:Interrupt/
  endtry

  return ''
endfunction
