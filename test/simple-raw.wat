(module
  (memory 1)

  (export "sum" (func $sum))
  (export "memory" (memory 0))
  
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
      ;; local.get $offset
      ;; local.get $i
      ;; i32.add
      ;; i32.load8_u
      ;; call $log

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
  )
  
)
