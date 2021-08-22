(module
  (import "imports" "log" (func $log (param i32)))
  (import "./common.wat" "alloc" (func $alloc (param i32) (result i32)))
  (import "./common.wat" "free" (func $free (param i32 i32)))
  (import "./common.wat" "offset" (global $offset i32))
  (import "./common.wat" "memory" (memory $memory 1))

  (export "memory" (memory $memory))
  (export "alloc" (func $alloc))
  (export "free" (func $free))
  (export "offset" (global $offset))

  (export "sum" (func $sum))
  (export "avg" (func $avg))
  (export "double" (func $double))
  (export "isSumEven" (func $isSumEven))
  (export "howIsSum" (func $howIsSum))
  ;; (export "twice" (func $twice))
  (export "createArray" (func $createArray))

  (data (i32.const 0) "even")
  (data (i32.const 4) "not-even")
  (global $EVEN i32 (i32.const 0))
  (global $EVEN_END i32 (i32.const 4))
  (global $NOT_EVEN i32 (i32.const 4))
  (global $NOT_EVEN_END i32 (i32.const 12))

  ;; used by common memory management
  ;; (global $offset i32 (i32.const 12))

  (func $createArray
    (result i32)
    (local $pointer i32)
    (local $bytes0 i32)
    (local $bytes1 i32)

    ;; allocate & populate 2 byte arrays of length 4

    i32.const 4
    call $alloc
    local.set $bytes0

    i32.const 4
    call $alloc
    local.set $bytes1

    local.get $bytes0
    i32.const 0x04030201
    i32.store

    local.get $bytes1
    i32.const 0x0c0b0a09
    i32.store

    i32.const 6
    call $new_array

    i32.const 9
    call $return_int
    drop
    local.get $bytes0
    i32.const 4
    call $return_bytes
    drop
    local.get $bytes1
    i32.const 4
    call $return_bytes
    drop
    i32.const 1
    call $return_bool
    drop
    f64.const 3.141592
    call $return_float
    drop
    i32.const 1
    call $new_object
    drop
    global.get $EVEN
    global.get $EVEN_END
    call $add_entry
    i32.const 100
    call $return_int
    drop
  )

  (func $double
    (param $offset i32) (param $length i32)
    (result i32)

    (local $i i32)
    (local $ii i32)

    i32.const 0
    local.set $i
    loop
      local.get $offset
      local.get $i
      i32.add
      local.tee $ii

      local.get $ii
      i32.load8_u

      i32.const 2
      i32.mul

      i32.store8

      (i32.add (local.get $i) (i32.const 1))
      local.tee $i
      local.get $length
      i32.lt_u
      br_if 0
    end

    local.get $offset
    local.get $length
    call $return_bytes
  )

  ;; (func $twice
  ;;   (param $offset i32) (param $length i32)
  ;;   (result i32)
  ;;   (local $offset2 i32)
  ;;   (local $length2 i32)
    
  ;;   local.get $length
  ;;   i32.const 2
  ;;   i32.mul
  ;;   local.tee $length2
  ;;   call $alloc
  ;;   local.set $offset2

  ;;   local.get $offset2
  ;;   local.get $offset
  ;;   local.get $length
  ;;   memory.copy

  ;;   local.get $offset2
  ;;   local.get $length
  ;;   i32.add
  ;;   local.get $offset
  ;;   local.get $length
  ;;   memory.copy

  ;;   local.get $offset2
  ;;   local.get $length2
  ;;   call $return_string
  ;; )

  (func $isSumEven
    (param $offset i32) (param $length i32)
    (result i32)

    local.get $offset
    local.get $length
    call $sum
    call $read_int
    i32.const 1
    i32.and
    i32.const 1
    i32.xor
    call $return_bool
  )

  (func $howIsSum
    (param $offset i32) (param $length i32)
    (result i32)

    (local $tmp i32)

    local.get $offset
    local.get $length
    call $sum
    call $read_int
    i32.const 1
    i32.and
    i32.eqz

    if (result i32)
      global.get $EVEN
      global.get $EVEN_END
      call $return_string
    else
      global.get $NOT_EVEN
      global.get $NOT_EVEN_END
      call $return_string
    end
    
  )

  (func $avg
    (param $offset i32) (param $length i32)
    (result i32)

    local.get $offset
    local.get $length
    call $sum
    call $read_int
    f64.convert_i32_u

    local.get $length
    f64.convert_i32_u

    f64.div
    call $return_float
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

    local.get $sum
    call $return_int
  )

  (global $INT i32 (i32.const 0))
  (global $FLOAT i32 (i32.const 1))
  (global $BOOL i32 (i32.const 2))
  (global $BYTES i32 (i32.const 3))
  (global $STRING i32 (i32.const 4))
  (global $ARRAY i32 (i32.const 5))
  (global $OBJECT i32 (i32.const 6))

  (func $return_int
    (param i32) (result i32)
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
  
  (func $read_int
    (param $pointer i32) (result i32)
    local.get $pointer
    i32.const 1
    i32.add
    i32.load
  )
)
