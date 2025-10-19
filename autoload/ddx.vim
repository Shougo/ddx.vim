function ddx#start(options = {}) abort
  call ddx#denops#_notify('start', [a:options])
endfunction

function ddx#ui_action(name, action, params) abort
  call ddx#denops#_request('uiAction', [a:name, a:action, a:params])
endfunction

function ddx#analyze(name) abort
  return ddx#denops#_request('analyze', [a:name])
endfunction

function ddx#jump(name, address) abort
  return ddx#denops#_request('jump', [a:name, a:address])
endfunction
