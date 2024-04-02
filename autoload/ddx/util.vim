function ddx#util#print_error(string, name = 'ddx') abort
  echohl Error
  echomsg printf('[%s] %s', a:name, a:string->string())
  echohl None
endfunction
