function ddx#start(options = {}) abort
  call ddx#denops#_notify('start', [a:options])
endfunction
function ddx#ui_action(name, action, params) abort
  call ddx#denops#_request('uiAction', [a:name, a:action, a:params])
endfunction
function ddx#parse(name) abort
  return ddx#denops#_request('parse', [a:name])
endfunction
