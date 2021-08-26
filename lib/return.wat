;; this module adds the bare necesseties for sane .wat development:
;; * bump & reset memory management with $alloc: [i32 $length] -> [i32 $pointer] 
;; * simple API for returning strings, booleans, byte arrays, nested objects and arrays
;; added overhead: 235B gzipped, 335B plain
(module

  (import "./memory.wat" "alloc" (func $alloc (param i32) (result i32)))
  
  (export "return_int" (func $return_int))
  (export "return_float" (func $return_float))
  (export "return_bool" (func $return_bool))
  (export "return_bytes" (func $return_bytes))
  (export "return_string" (func $return_string))
  (export "new_array" (func $new_array))
  (export "new_object" (func $new_object))
  (export "add_entry" (func $add_entry))

  (global $INT i32 (i32.const 0))
  (global $FLOAT i32 (i32.const 1))
  (global $BOOL i32 (i32.const 2))
  (global $BYTES i32 (i32.const 3))
  (global $STRING i32 (i32.const 4))
  (global $ARRAY i32 (i32.const 5))
  (global $OBJECT i32 (i32.const 6))

  (func $return_int
    (param i32) (result i32)
    ;; (call $log (local.get 0))
    (call $store8 (global.get $INT))
    (call $store32 (local.get 0))
  )
  (func $return_float
    (param f64) (result i32)
    (call $store8 (global.get $FLOAT))
    (f64.store (call $alloc (i32.const 8)) (local.get 0))
  )
  (func $return_bool
    (param i32) (result i32)
    (call $store8 (global.get $BOOL))
    (call $store8 (local.get 0))
    drop
  )
  (func $return_bytes
    (param $offset i32) (param $length i32) (result i32)
    (call $store8 (global.get $BYTES))
    (call $store32 (local.get $offset))
    (call $store32 (local.get $length))
  )
  (func $return_string
    (param $offset i32) (param $length i32) (result i32)
    (call $store8 (global.get $STRING))
    (call $store32 (local.get $offset))
    (call $store32 (local.get $length))
  )

  ;; these 2 return a pointer that should be the return value
  (func $new_array
    (param $length i32) (result i32)
    (call $store8 (global.get $ARRAY))
    (call $store8 (local.get $length))
    drop
  )
  (func $new_object
    (param $length i32) (result i32)
    (call $store8 (global.get $OBJECT))
    (call $store8 (local.get $length))
    drop
  )

  (func $add_entry
    (param $offset i32) (param $length i32)
    (call $new_array (i32.const 2))
    drop
    (call $return_string (local.get $offset) (local.get $length))
    drop
  )

  (func $store8 ;; returns its pointer
    (param i32) (result i32)
    (local $pointer i32)
    i32.const 1
    call $alloc
    local.tee $pointer
    local.get $pointer
    local.get 0
    i32.store8
  )

  (func $store32
    (param i32)
    i32.const 4
    call $alloc
    local.get 0
    i32.store
  )
)
