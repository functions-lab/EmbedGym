"""Unit tests for embedgym_parts/hm10.py (HM10Module), mirroring
frontend/src/__tests__/hm10-v545-model.test.ts and hm10-attachment.test.ts
at the worker's interface: bytes from the firmware's UART, delivered bytes,
pad levels, controller actions and the published element state."""
import json

import pytest

from embedgym_parts.hm10 import HM10Module
from embedgym_parts.uart import decode, encode, same_framing

MS = 1_000_000
UART_8N1 = {'baud': 9600, 'data_bits': 8, 'parity': 'none', 'stop_bits': 1}
MCU_TX = {'series': 0, 'high': 3.3, 'load': None}
# A 5 V MCU through a BSS138 channel: HIGH is the LV side's 10 kΩ pull-up to 3.3 V.
SHIFTED = {'series': 0, 'high': 3.3, 'load': {'voltage': 3.3, 'resistance': 10000}}
FIVE_VOLT = {'series': 0, 'high': 5, 'load': None}
PARTNER = {'address': 'A1B2C3D4E5F6', 'pin': '000000', 'authenticated': True, 'bonding': True, 'intervalMs': 30,
           'ancs': False, 'ancsEventId': 0, 'ancsEventFlags': 0, 'ancsCategoryId': 1, 'ancsCategoryCount': 1, 'ancsUid': 0,
           'ancsAppIdentifier': 'com.apple.mobilephone', 'ancsTitle': 'Caller', 'ancsSubtitle': '',
           'ancsMessage': 'Incoming call', 'ancsDate': '20260101T120000'}


class Bench:
    """The worker side: a virtual clock, the firmware's UART and its GPIOs."""

    def __init__(self, retained=None, pads=None, partner=None, framing=UART_8N1, rx_net=MCU_TX) -> None:
        self.t = 0
        self.due = None
        self.framing = framing
        self.rx: list[tuple[int, int]] = []
        self.state: dict = {}
        self.levels: dict = {}
        self.outputs: dict = {}
        self.partner = dict(PARTNER, **(partner or {}))
        m = self.module = HM10Module(lambda: self.t, '00112233ABCD', retained or {}, pads or {}, rx_net, self.partner)
        m.on_schedule = self._arm
        m.on_state = self.state.update
        m.on_mcu_level = self.levels.__setitem__
        m.mcu_output = self.outputs.get
        m.mcu_receiver = lambda: self.framing
        m.deliver = lambda byte: self.rx.append((byte, self.t))
        m.power_on()

    def _arm(self, due: int) -> None:
        self.due = due

    def run(self, ms: float) -> None:
        end = self.t + round(ms * MS)
        while self.due is not None and self.due <= end:
            self.t, self.due = self.due, None
            self.module.tick(self.t)
        self.t = end

    def send(self, value, framing=None) -> None:
        for byte in value.encode('latin-1') if isinstance(value, str) else value:
            self.module.mcu_byte(byte, framing or self.framing)

    def received(self) -> str:
        data = bytes(byte for byte, _ in self.rx).decode('latin-1')
        self.rx.clear()
        return data

    def command(self, value: str) -> str:
        self.received()
        self.send(value)
        self.run(100)
        return self.received()

    def act(self, name: str, data=None) -> None:
        self.module.action(name, self.partner, data)

    def link(self) -> None:
        self.act('remoteOn')
        self.act('connect')
        self.act('subscribe')


def test_frames_keep_their_layout_across_equivalent_framings():
    seven_two = {'baud': 9600, 'data_bits': 7, 'parity': 'none', 'stop_bits': 2}
    assert same_framing(UART_8N1, seven_two)
    assert decode('hm10', encode('hm10', 0x4F | 0x80, UART_8N1), seven_two) == 0x4F
    even = {**UART_8N1, 'parity': 'even', 'stop_bits': 2}
    assert not same_framing(UART_8N1, even)
    assert decode('hm10', encode('hm10', 0x55, even), even) == 0x55
    assert not same_framing(UART_8N1, {**UART_8N1, 'baud': 115200})
    assert same_framing(UART_8N1, {**UART_8N1, 'baud': None})


def test_command_ends_after_5_ms_of_idle_and_reply_bytes_leave_one_frame_apart():
    bench = Bench()
    bench.send('AT')
    bench.run(7)
    assert bench.rx == []
    bench.run(10)
    (o, t_o), (k, t_k) = bench.rx
    assert (o, k) == (0x4F, 0x4B)
    # Two command frames (2.08 ms), 5 ms idle, then one 10-bit frame per byte.
    assert t_o == pytest.approx(8.125 * MS, abs=2000)
    assert t_k - t_o == 1041668  # ceil(10 bits at 9600 baud) + 1 ns
    assert bench.state['uartRxHex'] == '4154'


def test_command_ending_in_crlf_gets_no_reply_and_set_name_is_queried():
    bench = Bench()
    assert bench.command('AT\r\n') == ''
    assert bench.command('AT+NAMEAB') == 'OK+Set:AB'
    assert bench.command('AT+NAME?') == 'OK+NAME:AB'
    assert json.loads(bench.state['startupConfiguration'])['name'] == 'AB'


def test_bytes_split_by_5_ms_make_two_commands():
    bench = Bench()
    bench.send('AT+NAMEA')
    bench.run(2)
    bench.send('B')
    bench.run(30)
    assert bench.received() == 'OK+Set:AB'


def test_unknown_command_is_rejected():
    bench = Bench()
    bench.send('AT+FOO')
    with pytest.raises(ValueError, match='unknown command'):
        bench.run(20)


def test_phone_link_carries_data_both_ways_and_bare_at_drops_it():
    bench = Bench()
    assert bench.command('AT+NOTI1') == 'OK+Set:1'
    bench.link()
    assert bench.state['connected'] is True
    bench.run(20)
    assert bench.received() == 'OK+CONN'
    bench.act('sendRemote', [0x00, 0x0D, 0x0A, 0xFF, 0x41])
    bench.run(20)
    assert bench.received() == '\x00\r\n\xffA'
    bench.send('AT+NAME?')
    bench.run(100)
    assert bench.state['remoteRxHex'] == '41542b4e414d453f'
    bench.send('AT')
    bench.run(20)
    assert bench.state['connected'] is False
    assert bench.received() == 'OK+LOST'


def test_phone_read_returns_the_module_mac():
    bench = Bench()
    bench.link()
    bench.act('readRemote')
    assert bench.state['remoteReadHex'] == '00112233abcd'


def test_phone_actions_require_the_documented_state():
    bench = Bench()
    with pytest.raises(ValueError, match='not available for connection'):
        bench.act('connect')
    bench.act('remoteOn')
    with pytest.raises(ValueError, match='no active link'):
        bench.act('subscribe')
    with pytest.raises(ValueError, match='address changes'):
        bench.module.action('remoteOn', dict(PARTNER, address='112233445566'))


def test_bit7_sets_bit_7_on_transmitted_bytes_for_a_7n2_receiver():
    seven_two = {'baud': 9600, 'data_bits': 7, 'parity': 'none', 'stop_bits': 2}
    bench = Bench(retained={'bit7': 1}, framing=seven_two)
    assert bench.command('AT') == 'OK'
    assert bench.module.uart_rx_hex == 'c1d4'


def test_parity_mismatch_raises_and_restart_applies_parity_and_stop_bits():
    even = {'baud': 9600, 'data_bits': 8, 'parity': 'even', 'stop_bits': 2}
    bench = Bench(retained={'mode': 2}, framing=even)
    bench.link()
    for command in ('AT+PARI1', 'AT+STOP1', 'AT+RESET'):
        bench.act('sendRemote', list(command.encode()))
    assert bench.state['connected'] is False
    bench.act('connect')
    bench.act('subscribe')
    bench.act('sendRemote', [0x55, 0xAA])
    bench.run(10)
    assert bench.received() == '\x55\xaa'
    with pytest.raises(ValueError, match='framing do not match'):
        bench.send([0x41], UART_8N1)
        bench.run(5)


def test_flow_control_holds_transmission_while_cts_is_high_and_rts_tracks_the_buffer():
    pads = {'UART_CTS': {'series': 0, 'high': 3.3, 'load': None}, 'UART_RTS': {'series': 0, 'high': 3.3, 'load': None}}
    bench = Bench(retained={'flow': 1}, pads=pads)
    assert bench.levels['UART_RTS'] is False
    bench.outputs['UART_CTS'] = True
    bench.send('AT')
    bench.run(50)
    assert bench.rx == []
    bench.outputs['UART_CTS'] = False
    bench.module.mcu_pins_changed()
    bench.run(5)
    assert bench.received() == 'OK'


def test_a_5_v_mcu_drive_raises_on_rxd_and_on_a_pad():
    with pytest.raises(ValueError, match=r'RXD exceeds raw 3.3V pin envelope \(5.0V\)'):
        Bench(rx_net=FIVE_VOLT).send('A')
    bench = Bench(retained={'flow': 1}, pads={'UART_CTS': FIVE_VOLT})
    bench.outputs['UART_CTS'] = True
    with pytest.raises(ValueError, match=r'UART_CTS exceeds raw 3.3V pin envelope \(5.0V\)'):
        bench.module.mcu_pins_changed()


def test_a_level_shifted_5_v_mcu_reaches_rxd_and_cts_at_3_3_v():
    bench = Bench(retained={'flow': 1}, pads={'UART_CTS': SHIFTED}, rx_net=SHIFTED)
    bench.outputs['UART_CTS'] = True
    bench.module.mcu_pins_changed()
    bench.send('AT')
    bench.run(50)
    assert bench.rx == []
    bench.outputs['UART_CTS'] = False
    bench.module.mcu_pins_changed()
    bench.run(5)
    assert bench.received() == 'OK'


def test_a_divided_rxd_below_logic_high_raises():
    divided = {'series': 1000, 'high': 3.3, 'load': {'voltage': 0, 'resistance': 2000}}
    with pytest.raises(ValueError, match='RXD idles at 2.18'):
        Bench(rx_net=divided).send('A')


def test_led_blinks_on_the_clock_and_holds_high_connected():
    pads = {'PIO1': {'series': 0, 'high': 3.3, 'load': None}}
    bench = Bench(pads=pads)
    assert bench.levels['PIO1'] is True and bench.state['status'] is True
    bench.run(500)
    assert bench.levels['PIO1'] is False
    bench.link()
    assert bench.levels['PIO1'] is True


def test_mode1_collects_pad_inputs_and_reads_adc_voltages():
    high = {'series': None, 'high': None, 'load': {'voltage': 3.3, 'resistance': 10000}}
    low = {'series': None, 'high': None, 'load': {'voltage': 0, 'resistance': 10000}}
    pads = {'PIO4': {'series': 1000, 'high': 3.3, 'load': None}, 'PIO5': low, 'PIO6': high, 'PIO7': low,
            'PIO8': low, 'PIO9': high, 'PIO10': low, 'PIO11': high}
    bench = Bench(retained={'mode': 1, 'collectionSeconds': 1}, pads=pads)
    bench.outputs['PIO4'] = True
    bench.link()
    for command in ('AT+COL??', 'AT+ADC6?', 'AT+ADC5?'):
        bench.act('sendRemote', list(command.encode()))
    bench.run(100)
    assert bytes.fromhex(bench.state['remoteRxHex']) == b'OK+Col:A5OK+ADC6:3.30OK+ADC5:0.00'
    bench.outputs['PIO4'] = False
    bench.module.mcu_pins_changed()
    bench.run(1000)
    assert bytes.fromhex(bench.state['remoteRxHex']).endswith(b'OK+Col:25')


def test_floating_collection_input_raises():
    bench = Bench(retained={'mode': 1})
    bench.act('remoteOn')
    with pytest.raises(ValueError, match='PIO4 is floating'):
        bench.act('connect')


def test_pio2_pwm_toggles_with_the_setting_period():
    pads = {'PIO2': {'series': 0, 'high': 3.3, 'load': None}}
    bench = Bench(retained={'mode': 2}, pads=pads)
    bench.link()
    bench.act('sendRemote', list(b'AT+PIO24'))
    edges = []
    for _ in range(4):
        edges.append(bench.levels['PIO2'])
        bench.run(150)
    assert edges == [True, False, True, False]


def test_reset_held_100_ms_drops_the_link_and_release_reboots():
    bench = Bench()
    bench.link()
    bench.act('resetDown')
    bench.run(100)
    assert bench.state['connected'] is True and bench.state['resetHeld'] is True
    bench.run(1)
    assert bench.state['connected'] is False
    bench.act('resetUp')
    bench.act('connect')
    assert bench.state['connected'] is True


def test_long_key_press_restores_factory_settings():
    bench = Bench(retained={'name': 'Custom'})
    bench.act('keyDown')
    bench.run(1000)
    bench.act('keyUp')
    assert json.loads(bench.state['startupConfiguration'])['name'] == 'HMSoft'


def test_sleep_wakes_on_a_burst_longer_than_80_bytes():
    bench = Bench()
    assert bench.command('AT+SLEEP') == 'OK+SLEEP'
    assert bench.state['sleeping'] is True
    bench.send('x' * 82)
    bench.run(120)
    assert bench.state['sleeping'] is False
    assert bench.received() == 'OK+WAKE'


def test_transmit_buffer_keeps_256_bytes():
    bench = Bench(retained={'mode': 0})
    bench.link()
    bench.module._uart_send(list(range(256)) + [1, 2, 3])
    bench.run(400)
    assert len(bench.rx) == 256


def test_unlistened_bytes_are_lost():
    bench = Bench()
    bench.framing = None
    bench.send('AT', UART_8N1)
    bench.run(20)
    bench.framing = UART_8N1
    bench.run(20)
    assert bench.rx == []


def test_central_discovers_and_connects_to_the_phone():
    bench = Bench(retained={'role': 1, 'immediate': 1, 'showNames': 1, 'notifications': 1})
    bench.act('remoteOn')
    assert bench.command('AT+DISC?') == 'OK+DISCSOK+DIS0:A1B2C3D4E5F6OK+NAME:Local BLE partner\r\n'
    bench.run(3000)
    assert bench.received() == 'OK+DISCE'
    assert bench.command('AT+CONN0') == 'OK+CONN0OK+CONN'
    assert bench.state['connected'] is True
    bench.send('hello')
    bench.run(100)
    assert bench.state['remoteRxHex'].endswith('68656c6c6f')


def test_ancs_notification_and_attribute_request():
    bench = Bench(retained={'securityType': 3, 'ancs': 1}, partner={'ancs': True})
    bench.link()
    bench.run(60)
    assert bench.received() == 'OK+ANCSNOK+ANCSCOK+ANCSD'
    bench.act('ancsNotify')
    bench.run(60)
    assert bench.received() == 'OK+ANCS801010000'
    bench.send('AT+ANCS0000106')
    bench.run(200)
    assert bench.received() == 'OK+0000OK+ANCSWOK+ANCS 0E\x00\x00\x00\x00\x00\x01\x06\x00Caller'


def test_retained_settings_are_validated():
    with pytest.raises(ValueError, match='unknown retained setting'):
        Bench(retained={'colour': 1})
    with pytest.raises(ValueError, match='ANCS requires TYPE3'):
        Bench(retained={'ancs': 1})
