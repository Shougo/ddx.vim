function ddx#start(options = {}) abort
  call ddx#denops#_notify('start', [a:options])
endfunction

function ddx#redraw(name) abort
  return ddx#denops#_request('redraw', [a:name])
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

function ddx#change(name, address, value) abort
  return ddx#denops#_request('change', [a:name, a:address, a:value])
endfunction
