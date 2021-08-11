(module
  (import "imports" "log" (func $log (param i32)))

  (memory (export "memory") 1)
  (global (export "offset") i32 (i32.const 16))

  (global $result_f64 (export "result_f64") (mut f64) (f64.const 0))

  (func (export "avg")
    (param $offset i32) (param $length i32) (result i32)
    (local $tmp i32)
    (local $tmpf f64)

    local.get $offset
    local.get $length
    call $sum
    call $read_int
    f64.convert_i32_u
    (local.get $length)
    f64.convert_i32_u
    f64.div
    call $return_float
  )
  
  (func $sum (export "sum")
    (param $offset i32) (param $length i32)
    (result i32)

    (local $i i32)
    (local $end i32)
    (local $sum i32)

    (local.set $end (i32.add (local.get $length) (local.get $offset)))

    local.get $offset
    local.set $i
    i32.const 0
    local.set $sum

    loop
      ;; local.get $i
      ;; i32.load8_u
      ;; call $log

      local.get $i
      i32.load8_u
      local.get $sum
      i32.add
      local.set $sum
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (i32.lt_u (local.get $i) (local.get $end))
      br_if 0
    end


    local.get $sum
    call $return_int
  )

  (func $return_int
    (param i32) (result i32)
    local.get 0
    i32.const 3
    i32.shl
  )
  (func $return_float
    (param $float f64) (result i32)
    local.get $float
    global.set $result_f64
    i32.const 1
  )

  (func $read_int
    (param i32) (result i32)
    local.get 0
    i32.const 3
    i32.shr_u
  )
  (func $read_float
    (param i32) (result f64)
    global.get $result_f64
  )
)
