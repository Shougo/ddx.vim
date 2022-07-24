function! ddx#util#print_error(string, ...) abort
  let name = a:0 ? a:1 : 'ddx'
  echohl Error
  echomsg printf('[%s] %s', name,
        \ type(a:string) ==# v:t_string ? a:string : string(a:string))
  echohl None
endfunction
