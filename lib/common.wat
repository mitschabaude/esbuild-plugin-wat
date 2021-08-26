;; this module adds the bare necesseties for sane .wat development:
;; * bump & reset memory management with $alloc: [i32 $length] -> [i32 $pointer] 
;; * simple API for returning strings, booleans, byte arrays, nested objects and arrays
;; added overhead: 235B gzipped, 335B plain
(module
  ;; (import "meta" "data_end" (global i32))
  
  (export "memory" (memory $memory))
  (export "alloc" (func $alloc))
  (export "free" (func $free))
  (export "offset" (global $offset))
  (export "alloc_offset" (global $alloc_offset))

  (memory $memory 1)
  (global $offset (mut i32) (i32.const 0))
  (global $alloc_offset (mut i32) (i32.const 0))

  (func $free
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
)
