function ddx#util#print_error(string, name = 'ddx') abort
  echohl Error
  for line in a:string->string()->split("\n")
    echomsg printf('[%s] %s', a:name, line)
  endfor
  echohl None
endfunction
