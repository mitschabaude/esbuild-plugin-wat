(module
  (import "../lib/return.wat" "return_int" (func $return_int (param i32) (result i32)))

  (import "../lib/common.wat" "offset" (global $offset i32))
  (import "../lib/common.wat" "alloc_offset" (global $alloc_offset i32))

  (export "sum" (func $sum))

  (data (i32.const 0) "even")
  (data (i32.const 4) "not-even")

  (start $init)
  (func $init
    (global.set $offset (i32.const 12))
    (global.set $alloc_offset (i32.const 12))
  )
  
  (func $sum
    (param $offset i32) (param $length i32)
    (result i32)

    (local $i i32)
    (local $sum i32)

    i32.const 0
    local.set $sum

    i32.const 0
    local.set $i
    loop
      local.get $offset
      local.get $i
      i32.add
      i32.load8_u

      local.get $sum
      i32.add
      local.set $sum

      (i32.add (local.get $i) (i32.const 1))
      local.tee $i
      local.get $length
      i32.lt_u
      br_if 0
    end

    ;; local.get $sum
    ;; call $log

    local.get $sum
    call $return_int
  )
  
)
