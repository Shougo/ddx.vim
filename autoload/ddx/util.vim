function ddx#util#print_error(string, name = 'ddx') abort
  echohl Error
  for line in
        \ (a:string->type() ==# v:t_string ? a:string : a:string->string())
        \ ->split("\n")->filter({ _, val -> val != ''})
    echomsg printf('[%s] %s', a:name, line)
  endfor
  echohl None
endfunction

function ddx#util#print(string, name = 'ddx') abort
  for line in
        \ (a:string->type() ==# v:t_string ? a:string : a:string->string())
        \ ->split("\n")->filter({ _, val -> val != ''})
    echomsg printf('[%s] %s', a:name, line)
  endfor
endfunction

function ddx#util#highlight(
      \ highlight, prop_type, priority, id, bufnr, row, col, length) abort

  if !a:highlight->hlexists()
    call ddx#util#print_error(
          \ printf('highlight "%s" does not exist', a:highlight))
    return
  endif

  const max_col = getline(a:row)->len()

  if a:row <= 0 || a:col <= 0 || a:row > line('$') || a:col > max_col
    " Invalid range
    return
  endif

  const length =
        \   a:length <= 0 || a:col + a:length > max_col
        \ ? max_col - a:col + 1
        \ : a:length

  if !has('nvim')
    " Add prop_type
    if a:prop_type->prop_type_get(#{ bufnr: a:bufnr })->empty()
      call prop_type_add(a:prop_type, #{
            \   bufnr: a:bufnr,
            \   highlight: a:highlight,
            \   priority: a:priority,
            \   override: v:true,
            \ })
    endif
  endif

  if has('nvim')
    call nvim_buf_set_extmark(
          \   a:bufnr,
          \   a:id,
          \   a:row - 1,
          \   a:col - 1,
          \   #{
          \     end_col: a:col - 1 + length,
          \     hl_group: a:highlight,
          \   }
          \ )
  else
    call prop_add(a:row, a:col, #{
          \   length: length,
          \   type: a:prop_type,
          \   bufnr: a:bufnr,
          \   id: a:id,
          \ })
  endif
endfunction

function ddx#util#input(prompt, text='') abort
  redraw

  try
    return a:prompt->input(a:text)
  catch /^Vim:Interrupt/
  endtry

  return ''
endfunction
