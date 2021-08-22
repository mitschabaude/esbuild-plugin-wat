(module
  (import "imports" "log" (func $log (param i32)))
  (import "./common.wat" "alloc" (func $alloc (param i32) (result i32)))
  (import "./common.wat" "free" (func $free (param i32) (param i32)))
  (import "./common.wat" "offset" (global f64))
  (import "./common.wat" "memory" (memory 1))
  (global i32 (i32.const 0))
  (global i32 (i32.const 4))
  (global i32 (i32.const 4))
  (global i32 (i32.const 12))
  (global i32 (i32.const 0))
  (global i32 (i32.const 1))
  (global i32 (i32.const 2))
  (global i32 (i32.const 3))
  (global i32 (i32.const 4))
  (global i32 (i32.const 5))
  (global i32 (i32.const 6))
  (data 0 (i32.const 0) "even")
  (data 0 (i32.const 4) "not-even")
  (func $createArray (result i32)
    (local i32 i32 i32)
    (i32.const 4)
    (call $alloc)
    (set_local 1)
    (i32.const 4)
    (call $alloc)
    (set_local 2)
    (get_local 1)
    (i32.const 67305985)
    (i32.store)
    (get_local 2)
    (i32.const 202050057)
    (i32.store)
    (i32.const 6)
    (call $new_array)
    (i32.const 9)
    (call $return_int)
    (drop)
    (get_local 1)
    (i32.const 4)
    (call $return_bytes)
    (drop)
    (get_local 2)
    (i32.const 4)
    (call $return_bytes)
    (drop)
    (i32.const 1)
    (call $return_bool)
    (drop)
    (f64.const 3.141592)
    (call $return_float)
    (drop)
    (i32.const 1)
    (call $new_object)
    (drop)
    (get_global 1)
    (get_global 2)
    (call $add_entry)
    (i32.const 100)
    (call $return_int)
    (drop)
  )
  (func $double (param i32) (param i32) (result i32)
    (local i32 i32)
    (i32.const 0)
    (set_local 2)
    (loop
      (get_local 0)
      (get_local 2)
      (i32.add)
      (tee_local 3)
      (get_local 3)
      (i32.load8_u)
      (i32.const 2)
      (i32.mul)
      (i32.store8)
      (get_local 2)
      (i32.const 1)
      (i32.add)
      (tee_local 2)
      (get_local 1)
      (i32.lt_u)
      (br_if 0)
      
    )
    (get_local 0)
    (get_local 1)
    (call $return_bytes)
  )
  (func $isSumEven (param i32) (param i32) (result i32)
    (get_local 0)
    (get_local 1)
    (call $sum)
    (call $read_int)
    (i32.const 1)
    (i32.and)
    (i32.const 1)
    (i32.xor)
    (call $return_bool)
  )
  (func $howIsSum (param i32) (param i32) (result i32)
    (local i32)
    (get_local 0)
    (get_local 1)
    (call $sum)
    (call $read_int)
    (i32.const 1)
    (i32.and)
    (i32.eqz)
    (if (result i32)
      (then
        (get_global 1)
        (get_global 2)
        (call $return_string)
      )
      (else
        (get_global 3)
        (get_global 4)
        (call $return_string)
        
      )
    )
  )
  (func $avg (param i32) (param i32) (result i32)
    (get_local 0)
    (get_local 1)
    (call $sum)
    (call $read_int)
    (f64.convert_u/i32)
    (get_local 1)
    (f64.convert_u/i32)
    (f64.div)
    (call $return_float)
  )
  (func $sum (param i32) (param i32) (result i32)
    (local i32 i32)
    (i32.const 0)
    (set_local 3)
    (i32.const 0)
    (set_local 2)
    (loop
      (get_local 0)
      (get_local 2)
      (i32.add)
      (i32.load8_u)
      (get_local 3)
      (i32.add)
      (set_local 3)
      (get_local 2)
      (i32.const 1)
      (i32.add)
      (tee_local 2)
      (get_local 1)
      (i32.lt_u)
      (br_if 0)
      
    )
    (get_local 3)
    (call $return_int)
  )
  (func $return_int (param i32) (result i32)
    (get_global 5)
    (call $store8)
    (get_local 0)
    (call $store32)
  )
  (func $return_float (param f64) (result i32)
    (get_global 6)
    (call $store8)
    (i32.const 8)
    (call $alloc)
    (get_local 0)
    (f64.store)
  )
  (func $return_bool (param i32) (result i32)
    (get_global 7)
    (call $store8)
    (get_local 0)
    (call $store8)
    (drop)
  )
  (func $return_bytes (param i32) (param i32) (result i32)
    (get_global 8)
    (call $store8)
    (get_local 0)
    (call $store32)
    (get_local 1)
    (call $store32)
  )
  (func $return_string (param i32) (param i32) (result i32)
    (get_global 9)
    (call $store8)
    (get_local 0)
    (call $store32)
    (get_local 1)
    (call $store32)
  )
  (func $new_array (param i32) (result i32)
    (get_global 10)
    (call $store8)
    (get_local 0)
    (call $store8)
    (drop)
  )
  (func $new_object (param i32) (result i32)
    (get_global 11)
    (call $store8)
    (get_local 0)
    (call $store8)
    (drop)
  )
  (func $add_entry (param i32) (param i32)
    (i32.const 2)
    (call $new_array)
    (drop)
    (get_local 0)
    (get_local 1)
    (call $return_string)
    (drop)
  )
  (func $store8 (param i32) (result i32)
    (local i32)
    (i32.const 1)
    (call $alloc)
    (tee_local 1)
    (get_local 1)
    (get_local 0)
    (i32.store8)
  )
  (func $store32 (param i32)
    (i32.const 4)
    (call $alloc)
    (get_local 0)
    (i32.store)
  )
  (func $read_int (param i32) (result i32)
    (get_local 0)
    (i32.const 1)
    (i32.add)
    (i32.load)
  )
  (export "memory" (memory 0))
  (export "alloc" (func $alloc))
  (export "free" (func $free))
  (export "offset" (global 0))
  (export "sum" (func $sum))
  (export "avg" (func $avg))
  (export "double" (func $double))
  (export "isSumEven" (func $isSumEven))
  (export "howIsSum" (func $howIsSum))
  (export "createArray" (func $createArray))
)
