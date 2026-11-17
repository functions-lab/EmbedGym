"""The picsimlab I2C event encoding (hw/i2c/picsimlab_i2c.c) the part models speak.

  picsimlab_i2c_ev(event)  passes the raw QEMU i2c_event value:
    0x00 I2C_START_RECV  firmware doing requestFrom (read-direction START)
    0x01 I2C_START_SEND  firmware doing beginTransmission (write-direction START)
    0x03 I2C_FINISH      end of transaction (STOP or repeated START between phases)
    0x04 I2C_NACK
  picsimlab_i2c_tx(data)   event = (data << 8) | 0x05
  picsimlab_i2c_rx()       event = 0x06, the return value is the byte delivered

A handler returns 0 to ACK and nonzero to NACK; for a read it returns the byte.
"""
I2C_START_RECV = 0x00   # firmware called requestFrom  (read  direction START)
I2C_START_SEND = 0x01   # firmware called beginTransmission (write direction START)
I2C_FINISH     = 0x03   # end of transaction (STOP or repeated-START between phases)
I2C_NACK       = 0x04   # master NACKed the last byte it read
I2C_WRITE      = 0x05   # firmware sent a byte; data = (event >> 8) & 0xFF
I2C_READ       = 0x06   # firmware requesting a byte; return the data byte
