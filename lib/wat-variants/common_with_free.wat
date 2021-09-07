;; older version of common_freeable.wat that includes & exports a fine-grained free function
;; => allows arbitrary memory allocation and persistence
;; added overhead: ~400B gzipped, ~610B plain
(module
  ;; we leave ~1kB for internal storage stuff and another 1kB for memory management
  (global $initial_offset i32 (i32.const 0))
  (global $internal_offset (mut i32) (i32.const 0))

  ;; internal stuff
  (export "memory" (memory $memory))
  (export "offset" (global $offset))
  (export "offsets" (global $offsets))
  (export "offsetLength" (global $offsetLength))
  (export "internalOffset" (global $internal_offset))
  (export "initialOffset" (global $initial_offset))

  (export "allocate" (func $allocate))
  (export "freeAll" (func $freeAll))
  (export "free" (func $free))

  (memory $memory 1)

  ;; offsets = [2048]
  (global $offsets i32 (i32.const 1024))
  (global $offsetLength (mut i32) (i32.const 1))
  (global $lastOffset (mut i32) (i32.const 2048))
  (data (i32.const 1024) "\00\08")

  (global $offset i32 (i32.const 2048))

  (func $allocate
    (param $byteLength i32) (result i32)
    (local $pointer i32)
    (local $membytes i32)
    ;; pointer = lastOffset
    global.get $lastOffset
    local.set $pointer

    ;; lastOffset += byteLength
    global.get $lastOffset
    local.get $byteLength
    i32.add
    global.set $lastOffset

    ;; if (lastOffset > (memory.size << 16)) { memory.grow(...) }
    (i32.shl (memory.size) (i32.const 16))
    local.set $membytes
    (i32.gt_u (global.get $lastOffset) (local.get $membytes))
    if 
      global.get $lastOffset
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

    ;; memory[offsets + 4*offsetLength] = lastOffset
    global.get $offsets
    global.get $offsetLength
    i32.const 2
    i32.shl
    i32.add
    global.get $lastOffset
    i32.store

    ;; offsetLength += 1
    i32.const 1
    global.get $offsetLength
    i32.add
    global.set $offsetLength

    local.get $pointer
  )

  (func $freeAll
    global.get $offset
    global.set $lastOffset
    i32.const 1
    global.set $offsetLength
  )

  (func $free
    (param $pointer i32) (param $byteLength i32)
    (local $offsetToRemove i32)
    (local $i i32) (local $end i32)
    (local $o i32)

    ;; offsetToRemove = pointer + byteLength
    local.get $pointer
    local.get $byteLength
    i32.add
    local.set $offsetToRemove

    ;; if (offsetToRemove > lastOffset) return
    local.get $offsetToRemove
    global.get $lastOffset
    i32.gt_u
    br_if 0

    ;; i = offsets
    global.get $offsets
    local.set $i
    ;; end = offsets + 4*(offsetLength - 1)
    global.get $offsets
    global.get $offsetLength
    i32.const 1
    i32.sub
    i32.const 2
    i32.shl
    i32.add
    local.set $end

    loop
      ;; i += 4
      local.get $i
      i32.const 4
      i32.add
      local.set $i

      ;; if (i > end) return
      local.get $i
      local.get $end
      i32.gt_u
      br_if 1

      ;; o = memory[i]
      local.get $i
      i32.load
      local.set $o

      ;; if (o !== offsetToRemove) continue
      local.get $o
      local.get $offsetToRemove
      i32.ne
      br_if 0
    end

    ;; memory[i] = ~0
    local.get $i
    i32.const 0xffffffff
    i32.store

    ;; if (i < end) return
    local.get $i
    local.get $end
    i32.lt_u
    br_if 0

    ;; the last offset was freed => remove nullified offsets
    loop $loop
      ;; o = memory[i]
      local.get $i
      i32.load
      local.set $o

      ;; if (o === ~0) { ... }
      (if (i32.eq (local.get $o) (i32.const 0xffffffff))
        (then 
          ;;  offsetLength--
          global.get $offsetLength
          i32.const 1
          i32.sub
          global.set $offsetLength
          ;; i-=4
          local.get $i
          i32.const 4
          i32.sub
          local.set $i
          ;; continue 
          br $loop
        )
      )
    end

    ;; lastOffset = o
    local.get $o
    global.set $lastOffset
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
    (param $offset i32) (param $length i32)
    (call $new_array (i32.const 2))
    drop
    (call $return_string (local.get $offset) (local.get $length))
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
