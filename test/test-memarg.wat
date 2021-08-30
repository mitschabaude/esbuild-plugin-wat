(module
  (memory 1)
  (func (export "test")
    i32.const 3
    i32.const 4
    i32.store8 offset=9
  )
)
