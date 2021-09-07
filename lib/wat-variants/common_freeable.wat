;; like common.wat but with a slightly more involved internal memory management that
;; + would allow adding a fine-grained free function, for use cases where allocated memory must persist
;; + allows to safely interleave return value construction and arbitrary allocation
;; added overhead: ~300B gzipped, ~450B plain
(module
  (global $offset i32 (i32.const 12))
  
  ;; internal stuff
  (export "memory" (memory $memory))
  (export "allocate" (func $allocate))
  (export "freeAll" (func $free_all))

  (memory $memory 1)

  (global $internal_offset (mut i32) (i32.const 0))
  (global $initial_alloc_offset (mut i32) (i32.const 0))
  (global $alloc_offset (mut i32) (i32.const 0))
  (global $alloc_offsets (mut i32) (i32.const 0))
  (global $offset_length (mut i32) (i32.const 1))

  (start $initialize)

  (func $initialize
    global.get $offset
    global.set $internal_offset

    ;; we leave 1kB for internal storage stuff
    global.get $internal_offset
    i32.const 1024
    i32.add
    global.set $alloc_offsets

    ;;  and another 1kB for memory management
    global.get $alloc_offsets
    i32.const 1024
    i32.add
    global.set $initial_alloc_offset

    global.get $alloc_offsets
    global.get $initial_alloc_offset
    i32.store
    
    global.get $initial_alloc_offset
    global.set $alloc_offset
  )

  (func $allocate
    (param $byteLength i32) (result i32)
    (local $pointer i32)
    (local $membytes i32)
    ;; pointer = alloc_offset
    global.get $alloc_offset
    local.set $pointer

    ;; alloc_offset += byteLength
    global.get $alloc_offset
    local.get $byteLength
    i32.add
    global.set $alloc_offset

    ;; if (alloc_offset > (memory.size << 16)) { memory.grow(...) }
    (i32.shl (memory.size) (i32.const 16))
    local.set $membytes
    (i32.gt_u (global.get $alloc_offset) (local.get $membytes))
    if 
      global.get $alloc_offset
      local.get $membytes
      i32.sub
      i32.const 16
      i32.shr_u
      i32.const 1
      i32.add
      memory.grow
      drop
      ;; call $log
    end

    ;; memory[alloc_offsets + 4*offset_length] = alloc_offset
    global.get $alloc_offsets
    global.get $offset_length
    i32.const 2
    i32.shl
    i32.add
    global.get $alloc_offset
    i32.store

    ;; offset_length += 1
    i32.const 1
    global.get $offset_length
    i32.add
    global.set $offset_length

    local.get $pointer
  )

  (func $free_all
    global.get $offset
    global.set $internal_offset
    global.get $initial_alloc_offset
    global.set $alloc_offset
    i32.const 1
    global.set $offset_length
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
    (call $storef64 (local.get 0))
  )
  (func $return_bool
    (param i32) (result i32)
    (call $store8 (global.get $BOOL))
    (call $store8 (local.get 0))
    drop
  )
  (func $return_bytes
    (param $initial_alloc_offset i32) (param $length i32) (result i32)
    (call $store8 (global.get $BYTES))
    (call $store32 (local.get $initial_alloc_offset))
    (call $store32 (local.get $length))
  )
  (func $return_string
    (param $initial_alloc_offset i32) (param $length i32) (result i32)
    (call $store8 (global.get $STRING))
    (call $store32 (local.get $initial_alloc_offset))
    (call $store32 (local.get $length))
  )

  ;; these return a pointer that should be the return value
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
    (param $initial_alloc_offset i32) (param $length i32)
    (call $new_array (i32.const 2))
    drop
    (call $return_string (local.get $initial_alloc_offset) (local.get $length))
    drop
  )

  (func $store32
    (param i32)
    global.get $internal_offset
    local.get 0
    i32.store

    i32.const 4
    call $bump
  )

  (func $store8
    (param i32) (result i32)
    global.get $internal_offset
    global.get $internal_offset
    local.get 0
    i32.store8

    i32.const 1
    call $bump
  )

  (func $storef64
    (param f64)
    global.get $internal_offset
    local.get 0
    f64.store

    i32.const 8
    call $bump
  )

  (func $bump
    (param i32)
    global.get $internal_offset
    local.get 0
    i32.add
    global.set $internal_offset
  )
)
