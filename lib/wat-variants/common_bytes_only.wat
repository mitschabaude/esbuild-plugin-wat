;; like common.wat, but only supports returning byte arrays
;; which is enough for e.g. cryptography
;; adds only ~150B overhead to .wasm
(module
  (global $offset i32 (i32.const 12))
  
  ;; internal stuff
  (export "memory" (memory $memory))
  (export "alloc" (func $alloc))
  (export "free" (func $initialize))

  (memory $memory 1)
  (global $alloc_offset (mut i32) (i32.const 0))

  (start $initialize)

  (func $initialize
    global.get $offset
    global.set $alloc_offset
  )

  (func $alloc
    (param $length i32) (result i32)
    (local $pointer i32)
    (local $allocpages i32)
    ;; pointer = alloc_offset
    ;; alloc_offset += length
    global.get $alloc_offset
    local.set $pointer
    global.get $alloc_offset
    local.get $length
    i32.add
    global.set $alloc_offset

    ;; if (((alloc_offset >> 16) + 1) > memory.size) { memory.grow(...) }
    global.get $alloc_offset
    i32.const 16
    i32.shr_u
    i32.const 1
    i32.add
    local.tee $allocpages
    memory.size
    i32.gt_u
    if 
      local.get $allocpages
      memory.grow
      drop
      ;; call $log
    end

    local.get $pointer
  )
  
  (func $return_bytes
    (param $offset i32) (param $length i32) (result i32)
    (local $pointer i32)
    i32.const 9
    call $alloc
    local.tee $pointer
    i32.const 3
    i32.store8
    (i32.store (i32.add (local.get $pointer) (i32.const 1)) (local.get $offset))
    (i32.store (i32.add (local.get $pointer) (i32.const 5)) (local.get $length))
    local.get $pointer
  )
)
