from embedgym_parts.pin_drive import pin_drive_emitter


def test_each_change_becomes_one_stamped_event():
    clock = [1_000]
    events = []
    drive_pin = pin_drive_emitter(0x15a, events.append, lambda: clock[0])
    high = {'voltage': 3.3, 'resistance': 50.0}
    drive_pin('4', high)
    clock[0] = 2_000
    drive_pin('4', dict(high))
    clock[0] = 3_000
    drive_pin('4', None)
    drive_pin('4', None)
    drive_pin('5', None)
    assert events == [
        {'type': 'part_pin_drive', 'pin': 0x15a, 'part_pin': '4', 'drive': high, 't_ns': 1_000},
        {'type': 'part_pin_drive', 'pin': 0x15a, 'part_pin': '4', 'drive': None, 't_ns': 3_000},
        {'type': 'part_pin_drive', 'pin': 0x15a, 'part_pin': '5', 'drive': None, 't_ns': 3_000},
    ]


def test_a_model_mutating_its_drive_still_emits_the_change():
    events = []
    drive_pin = pin_drive_emitter(7, events.append, lambda: 0)
    drive = {'voltage': 0.0, 'resistance': 500.0}
    drive_pin('4', drive)
    drive['voltage'] = 3.3
    drive_pin('4', drive)
    assert [event['drive']['voltage'] for event in events] == [0.0, 3.3]


def test_live_mode_stamps_nothing():
    events = []
    pin_drive_emitter(7, events.append)('4', None)
    assert events == [{'type': 'part_pin_drive', 'pin': 7, 'part_pin': '4', 'drive': None}]
