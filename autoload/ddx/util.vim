function! ddx#util#print_error(string, name = 'ddx') abort
  echohl Error
  echomsg printf('[%s] %s', a:name,
        \ type(a:string) ==# v:t_string ? a:string : string(a:string))
  echohl None
endfunction
