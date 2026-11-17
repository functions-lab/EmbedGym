"""HM-10 BLE module (HMSoft V545): its command set, link and settings, its
UART, its pads (reset, key) and the phone partner, with the clock in virtual
ns. embedgym_parts/registry.py wires it to a host.

Every timed step sits on one queue; the module reports its earliest deadline
through `on_schedule(due_ns)` and the host calls `tick(now_ns)` when that
timer fires.

UART: the host hands each byte the firmware's UART sends toward RXD to
`mcu_byte(byte, framing)`; frames are serialized one after another on the
wire. Module bytes leave TXD one frame apart at the module's framing and are
decoded at frame end with the framing `mcu_receiver()` reports (None: no
receiver listens and the byte is lost), then passed to `deliver(byte)`. A
framing is `{'baud': int | None, 'data_bits': 7 | 8, 'parity': 'none' |
'even' | 'odd', 'stop_bits': 1 | 2}`; a None baud is not checked. Frames whose
bit layout or parity differ raise. On a host with no UART on its pins, `wire`
is a embedgym_parts/pin_uart.py PinUart instead: module frames are driven on it, and
its RX frames arrive through `mcu_frame_started()` and `mcu_frame(bits, framing)`.

Nets: `pads` maps each wired pad (RESETB, PIO0–PIO11, UART_CTS, UART_RTS) to
`{'series': ohms | None, 'high': volts | None, 'load': PinDrive | None}`: its
rail loads, and for one on an MCU GPIO the series resistance to it and the
voltage it sees while the firmware drives that GPIO HIGH (the MCU's I/O rail,
or a level shifter's LV). `rx_net` is that net for RXD on the firmware's TX,
None when RXD is not on one. The module reads the firmware's level through
`mcu_output(pad)` (None while the GPIO is an input) and sets the level the
firmware reads on an input through `on_mcu_level(pad, high)`; the host calls
`mcu_pins_changed()` when the firmware changes one of those GPIOs. A pad or
RXD the firmware drives outside -0.3..3.6 V raises.

The phone partner is driven by `action(name, partner, data)`, the element's
controller calls. `on_state(values)` reports the element's observable
properties whenever one changes.
"""
from __future__ import annotations

import heapq
import itertools
import json
import math
import re
from decimal import ROUND_HALF_UP, Decimal

from embedgym_parts.i2c.js_math import js_round
from embedgym_parts.i2c.mpr121 import HIGH_MIN, LOW_MAX
from embedgym_parts.mcu_pins import MCU_OUTPUT_OHMS, resolve_voltage
from embedgym_parts.uart import decode, encode, same_framing

MS_NS = 1_000_000
INTERVALS = (7.5, 10, 15, 20, 25, 30, 35, 40, 45, 4000)
ADVERTISING_INTERVALS = (100, 152.5, 211.25, 318.75, 417.5, 546.25, 760, 852.5, 1022.5, 1285, 2000, 3000, 4000, 5000, 6000, 7000)
SUPERVISION_TIMEOUTS = (100, 1000, 2000, 3000, 4000, 5000, 6000)
BAUD_RATES = (9600, 19200, 38400, 57600, 115200, 4800, 2400, 1200, 230400)
PARITIES = ('none', 'even', 'odd')
EMPTY_ADDRESS = '000000000000'
# Conventions (no V545 evidence): RX idle that ends a command, RX/TX buffer size, IC temperature.
COMMAND_IDLE_MS = 5
RX_BUFFER_BYTES = 256
TX_BUFFER_BYTES = 256
IC_TEMPERATURE = '025.000'
CONNECT_TIMEOUT_MS = 10000
ANCS_REQUEST = 'AT+ANCS' + 'HHHH' + 'D' + 'HH'
VCC12 = 3.3
PAD_PULL = {'voltage': VCC12, 'resistance': 47000}
PAD_PRESS = {'voltage': 0, 'resistance': 25}
RESET_QUALIFY_MS = 100.001
KEY_LONG_PRESS_MS = 1000
PADS = ('RESETB', *(f'PIO{i}' for i in range(12)), 'UART_CTS', 'UART_RTS')
# The partner fields the element sends with every controller call.
PARTNER_FIELDS = ('address', 'pin', 'authenticated', 'bonding', 'intervalMs', 'ancs', 'ancsEventId', 'ancsEventFlags',
                  'ancsCategoryId', 'ancsCategoryCount', 'ancsUid', 'ancsAppIdentifier', 'ancsTitle', 'ancsSubtitle',
                  'ancsMessage', 'ancsDate')
ACTIONS = ('remoteOn', 'remoteOff', 'connect', 'subscribe', 'disconnect', 'sendRemote', 'sendRemoteWithResponse',
           'notifyRemote', 'readRemote', 'ancsNotify', 'resetDown', 'resetUp', 'keyDown', 'keyUp')

# Convention: these settings apply to the running module at once; every other setting takes effect at the next restart.
IMMEDIATE = frozenset({
    'notifications', 'noticeAddress', 'saveAddress', 'retryMs', 'scanSeconds', 'showNames', 'securityType', 'pin',
    'whitelistEnabled', 'whitelist', 'minInterval', 'maxInterval', 'latency', 'supervision', 'parameterUpdate',
    'systemLed', 'connectedOutputs', 'collectionSeconds', 'gain',
})

DIGIT_SETTINGS = {
    'ROLE': ('role', 0, 1), 'MODE': ('mode', 0, 2), 'BAUD': ('baud', 0, 8), 'PARI': ('parity', 0, 2), 'STOP': ('stop', 0, 1),
    'BIT7': ('bit7', 0, 1), 'FIOW': ('flow', 0, 1), 'IMME': ('immediate', 0, 1), 'PWRM': ('powerMode', 0, 1),
    'NOTI': ('notifications', 0, 1), 'NOTP': ('noticeAddress', 0, 1), 'SAVE': ('saveAddress', 0, 1), 'SCAN': ('scanSeconds', 1, 9),
    'SHOW': ('showNames', 0, 1), 'IBEA': ('beacon', 0, 1), 'TYPE': ('securityType', 0, 3), 'COMI': ('minInterval', 0, 9),
    'COMA': ('maxInterval', 0, 9), 'COLA': ('latency', 0, 4), 'COSU': ('supervision', 0, 6), 'COUP': ('parameterUpdate', 0, 1),
    'PIO1': ('systemLed', 0, 1), 'POWE': ('transmitPower', 0, 3), 'ADVI': ('advertisingInterval', 0, 15), 'ADTY': ('advertisingType', 0, 3),
    'RELI': ('reliable', 0, 1), 'GAIN': ('gain', 0, 1), 'BATC': ('batteryMonitor', 0, 1), 'COMP': ('selfLearning', 0, 1),
    'FFE2': ('ffe2', 0, 1), 'RESP': ('resp', 0, 1), 'PCTL': ('outputPower', 0, 1), 'ANCS': ('ancs', 0, 1), 'ALLO': ('whitelistEnabled', 0, 1),
}

CONFIG_RANGES = (
    ('role', 0, 1), ('mode', 0, 2), ('baud', 0, 8), ('parity', 0, 2), ('stop', 0, 1),
    ('bit7', 0, 1), ('flow', 0, 1), ('immediate', 0, 1), ('powerMode', 0, 1),
    ('notifications', 0, 1), ('noticeAddress', 0, 1), ('saveAddress', 0, 1), ('retryMs', 0, 999999),
    ('scanSeconds', 1, 9), ('showNames', 0, 1), ('advertisingInterval', 0, 15), ('advertisingType', 0, 3),
    ('reliable', 0, 1), ('transmitPower', 0, 3), ('gain', 0, 1), ('advertFlag', 0, 255), ('advertTemperature', 0, 255),
    ('advertHumidity', 0, 255), ('advertBattery', 0, 255), ('batteryMonitor', 0, 1), ('beacon', 0, 1),
    ('major', 1, 0xfffe), ('minor', 1, 0xfffe), ('measuredPower', 1, 255), ('securityType', 0, 3), ('whitelistEnabled', 0, 1),
    ('uuid', 1, 0xfffe), ('characteristic', 1, 0xfffe), ('ffe2', 0, 1), ('resp', 0, 1),
    ('selfLearning', 0, 1), ('minInterval', 0, 9), ('maxInterval', 0, 9), ('latency', 0, 4),
    ('supervision', 0, 6), ('parameterUpdate', 0, 1), ('systemLed', 0, 1), ('outputPower', 0, 1),
    ('bootOutputs', 0, 0x3ff), ('connectedOutputs', 0, 0x3ff), ('collectionSeconds', 0, 99), ('ancs', 0, 1),
)

# A JS RegExp `.` matches any character except line terminators.
LINE = r'[^\n\r  ]'


def factory_settings() -> dict:
    return {'role': 0, 'mode': 0, 'name': 'HMSoft', 'baud': 0, 'parity': 0, 'stop': 0, 'bit7': 0, 'flow': 0,
            'immediate': 0, 'powerMode': 1, 'notifications': 0, 'noticeAddress': 0, 'saveAddress': 0,
            'lastAddress': None, 'retryMs': 0, 'scanSeconds': 3, 'showNames': 0, 'advertisingInterval': 0,
            'advertisingType': 0, 'reliable': 0, 'transmitPower': 2, 'gain': 0, 'advertFlag': 0, 'advertTemperature': 0,
            'advertHumidity': 0, 'advertBattery': 0, 'batteryMonitor': 0, 'beacon': 0,
            'beaconUuid': '74278BDAB64445208F0C720EAF059935', 'major': 0xffe0, 'minor': 0xffe1,
            'measuredPower': 0xc5, 'securityType': 0, 'pin': '000000', 'whitelistEnabled': 0,
            'whitelist': [EMPTY_ADDRESS, EMPTY_ADDRESS, EMPTY_ADDRESS], 'bonds': [], 'uuid': 0xffe0, 'characteristic': 0xffe1,
            'ffe2': 0, 'resp': 0, 'selfLearning': 0, 'minInterval': 3, 'maxInterval': 7, 'latency': 0, 'supervision': 6,
            'parameterUpdate': 1, 'systemLed': 0, 'outputPower': 1, 'bootOutputs': 0, 'connectedOutputs': 0, 'collectionSeconds': 10, 'ancs': 0}


def ascii_bytes(value: str) -> list[int]:
    return [ord(char) for char in value]


def text(value) -> str:
    return bytes(value).decode('latin-1')


def hex_text(value: int, width: int) -> str:
    return f'{value:0{width}X}'


def hex_bytes(value) -> str:
    return ''.join(f'{byte:02x}' for byte in value)


def checked_bytes(value) -> list[int]:
    if not value or any(isinstance(byte, bool) or not isinstance(byte, int) or not 0 <= byte <= 255 for byte in value):
        raise ValueError('hm-10: payload requires nonempty integer bytes 0..255')
    return list(value)


def check_address(value) -> str:
    if not isinstance(value, str) or not re.fullmatch(r'[0-9A-F]{12}', value):
        raise ValueError('hm-10: address requires 12 uppercase hexadecimal digits')
    return value


def rssi_field(rssi: float) -> str:
    return f'{"-" if rssi < 0 else "0"}{str(abs(js_round(rssi))).rjust(3, "0")}'


def to_fixed_2(value: float) -> str:
    """Number.prototype.toFixed(2) for a nonnegative value."""
    return str(Decimal(value).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))


def matches_template(value: str, template: str, complete: bool) -> bool:
    if len(value) > len(template) or (complete and len(value) != len(template)):
        return False
    for char, slot in zip(value, template):
        if slot == 'H':
            if char not in '0123456789ABCDEF':
                return False
        elif slot == 'D':
            if char not in '012345':
                return False
        elif char != slot:
            return False
    return True


# ── UART frames ──────────────────────────────────────────────────────────────

def check_framing(framing: dict) -> None:
    baud = framing.get('baud')
    if (baud is not None and (not isinstance(baud, (int, float)) or not math.isfinite(baud) or baud <= 0)) \
            or framing.get('data_bits') not in (7, 8) or framing.get('parity') not in PARITIES or framing.get('stop_bits') not in (1, 2):
        raise ValueError(f'hm10: invalid UART framing {framing!r}')


def bit_ns(framing: dict, fallback_baud: int) -> float:
    return 1e9 / (framing['baud'] or fallback_baud)


# ── The phone ────────────────────────────────────────────────────────────────

class Partner:
    """The local BLE partner (a phone app): one peer of the module."""

    address_type = 0
    name = 'Local BLE partner'
    connectable = True
    rssi = -55
    security_type = 0
    latency = None
    accepts_parameters = True
    characteristics = ({'service': 0xffe0, 'uuid': 0xffe1, 'read': True, 'notify': True, 'write': True, 'writeWithoutResponse': True},)

    def __init__(self, module: 'HM10Module', fields: dict) -> None:
        self.module = module
        self.fields = check_partner(fields)
        self.address = self.fields['address']
        self.available = False
        self.busy = False
        self.bonded = False
        self.notify_central = None
        self.ancs_sources = None

    @property
    def pin(self) -> str:
        return self.fields['pin']

    @property
    def interval_ms(self) -> float:
        return self.fields['intervalMs']

    @property
    def ancs(self):
        return self if self.fields['ancs'] else None

    def receive(self, data: list[int]) -> None:
        self.module.remote_rx_hex += hex_bytes(data)

    def write(self, uuid: int, data: list[int], _with_response: bool) -> None:
        if uuid != 0xffe1:
            raise ValueError('hm10: remote characteristic is not writable')
        self.module.remote_rx_hex += hex_bytes(data)

    def subscribe(self, uuid: int, enabled: bool, notify) -> None:
        if uuid != 0xffe1:
            raise ValueError('hm10: remote characteristic is not notifiable')
        self.notify_central = notify if enabled else None

    def release_subscription(self, _uuid: int) -> None:
        self.notify_central = None

    def disconnected(self) -> None:
        self.notify_central = None
        self.ancs_sources = None

    # Apple ANCS provider roles.
    def ancs_subscribe(self, notification, data) -> None:
        self.ancs_sources = (notification, data)

    def ancs_release(self) -> None:
        self.ancs_sources = None

    def ancs_write_control_point(self, request: list[int]) -> None:
        f = self.fields
        attribute = request[5]
        uid = request[1] | (request[2] << 8) | (request[3] << 16) | (request[4] * 0x1000000)
        if request[0] != 0 or len(request) != (8 if attribute in (1, 2, 3) else 6) or attribute > 5:
            raise ValueError('hm10: partner supports ANCS Get Notification Attributes for one attribute')
        if uid != f['ancsUid']:
            raise ValueError(f'hm10: partner has no ANCS notification {uid}')
        message = f['ancsMessage'].encode('utf-8')
        values = [f['ancsAppIdentifier'], f['ancsTitle'], f['ancsSubtitle'], f['ancsMessage'], str(len(message)), f['ancsDate']]
        value = list(values[attribute].encode('utf-8'))
        if len(request) == 8:
            value = value[:request[6] | (request[7] << 8)]
        response = [0, *request[1:5], attribute, len(value) & 0xff, len(value) >> 8, *value]
        for offset in range(0, len(response), 20):
            self.ancs_sources[1](response[offset:offset + 20])


def check_partner(fields: dict) -> dict:
    if not isinstance(fields, dict) or set(fields) != set(PARTNER_FIELDS):
        raise ValueError(f'hm10: partner fields must be {list(PARTNER_FIELDS)}')
    check_address(fields['address'])
    if not isinstance(fields['pin'], str) or not re.fullmatch(r'[0-9]{6}', fields['pin']):
        raise ValueError('hm10: partner PIN requires six decimal digits')
    for key in ('authenticated', 'bonding', 'ancs'):
        if not isinstance(fields[key], bool):
            raise ValueError(f'hm10: partner {key} must be boolean')
    for key in ('intervalMs', 'ancsEventId', 'ancsEventFlags', 'ancsCategoryId', 'ancsCategoryCount', 'ancsUid'):
        if isinstance(fields[key], bool) or not isinstance(fields[key], (int, float)) or not math.isfinite(fields[key]):
            raise ValueError(f'hm10: partner {key} must be a finite number')
    for key in ('ancsAppIdentifier', 'ancsTitle', 'ancsSubtitle', 'ancsMessage', 'ancsDate'):
        if not isinstance(fields[key], str):
            raise ValueError(f'hm10: partner {key} must be text')
    return dict(fields)


# ── The module ───────────────────────────────────────────────────────────────

class HM10Module:
    def __init__(self, now_ns, identity: str, retained: dict, pads: dict, rx_net: dict | None, partner: dict) -> None:
        self.now_ns = now_ns
        self.identity = check_address(identity)
        if not isinstance(retained, dict):
            raise ValueError('hm-10: retained configuration requires an object')
        known = factory_settings()
        for key in retained:
            if key not in known:
                raise ValueError(f'hm-10: unknown retained setting {key}')
        self.config = {**known, **retained}
        self._validate_config(self.config)
        self.config['whitelist'] = list(self.config['whitelist'])
        self.config['bonds'] = list(self.config['bonds'])
        self.active = self._clone_config()
        if not isinstance(pads, dict) or any(pad not in PADS for pad in pads):
            raise ValueError(f'hm10: pads must be among {list(PADS)}')
        for name, net in [*pads.items(), *([('RXD', rx_net)] if rx_net is not None else [])]:
            if not isinstance(net, dict) or set(net) != {'series', 'high', 'load'} or (net['series'] is None) != (net['high'] is None):
                raise ValueError(f'hm10: the {name} net takes series, high and load, high set exactly when series is, got {net!r}')
        self.pads = pads
        self.rx_net = rx_net
        self.partner = Partner(self, partner)
        self.peers = {self.partner.address: self.partner}
        # Element observables.
        self.remote_rx_hex = ''
        self.uart_rx_hex = ''
        self.remote_read_hex = ''
        self.status = False
        self._published: dict = {}
        # Pads.
        self.own: dict = {}
        self.mcu_levels: dict = {}
        self.board_powered = False
        self.reset_low = False
        self.qualified_reset = False
        self.reset_epoch = 0
        self.key_low = False
        self.key_epoch = 0
        self.uart_available = False
        self._updating = False
        # V545 state.
        self.powered = False
        self.reset_held = False
        self.asleep = False
        self.working = False
        self.deployed = 0
        self.boot_generation = 0
        self.link_generation = 0
        self.led_generation = 0
        self.scan_generation = 0
        self.connect_generation = 0
        self.manual_connect_generation = 0
        self.pwm_generation = 0
        self.rx_generation = 0
        self.discovered: list = []
        self.peer = None
        self.authenticated = False
        self.subscribed: set = set()
        self.pending: list[int] = []
        self.pending_tick = False
        self.link_timeout = 6000
        self.link_interval = 20
        self.link_latency = 0
        self.last_heartbeat = 0.0
        self.burst = None
        self.baud_locked = False
        self.rts_level = 'unset'
        self.central_write = None
        self.central_notify = None
        self.advertising_started = 0.0
        self.retry_started = 0.0
        self.retry_expired = False
        self.retry_pending = False
        self.pio: list = [None] * 12
        self.collected = 0
        self.ancs_link = False
        # UART.
        self.module_epoch = 0
        self.mcu_line_free_ns = 0
        # The module's own TX and RX on plain GPIOs (embedgym_parts/pin_uart.py), None on a UART host.
        self.wire = None
        self.wire_rx_epoch = 0
        self.module_queue: list[int] = []
        self.module_transmitting = False
        self.waiting_for_cts = False
        self.idle_callbacks: list = []
        # Clock.
        self._events: list = []
        self._seq = itertools.count()
        self._at: int | None = None

    # ── Worker hooks ─────────────────────────────────────────────────────────
    def on_schedule(self, due_ns: int) -> None:
        raise RuntimeError('hm10: the worker has not connected on_schedule')

    def on_state(self, values: dict) -> None:
        raise RuntimeError('hm10: the worker has not connected on_state')

    def on_mcu_level(self, pad: str, high: bool) -> None:
        raise RuntimeError('hm10: the worker has not connected on_mcu_level')

    def mcu_output(self, pad: str) -> bool | None:
        raise RuntimeError('hm10: the worker has not connected mcu_output')

    def mcu_receiver(self) -> dict | None:
        raise RuntimeError('hm10: the worker has not connected mcu_receiver')

    def deliver(self, byte: int) -> None:
        raise RuntimeError('hm10: the worker has not connected deliver')

    # ── Worker entry points ──────────────────────────────────────────────────
    def power_on(self) -> None:
        """The board rail powers the header (the frontend checked the supply)."""
        self._at = self.now_ns()
        try:
            self.board_powered = True
            self._drive('RESETB', PAD_PULL)
            self._drive('PIO0', PAD_PULL)
            self._power_on()
            self._update()
        finally:
            self._at = None
        self._arm()

    def tick(self, now_ns: int) -> None:
        """Run every step due by `now_ns`, each at its own deadline."""
        while self._events and self._events[0][0] <= now_ns:
            due, _, callback = heapq.heappop(self._events)
            self._at = due
            try:
                callback()
                self._update()
            finally:
                self._at = None
        self._arm()

    def mcu_byte(self, byte: int, framing: dict) -> None:
        """The firmware's UART sent `byte` toward RXD with `framing`."""
        check_framing(framing)
        self._check_rxd_idle()
        self._entry(lambda: self._mcu_write(byte, framing))

    def mcu_frame_started(self) -> None:
        """On `wire`: a start bit the firmware drives reached RXD."""
        def started() -> None:
            self._check_rxd_idle()
            self.wire_rx_epoch = self.module_epoch
            if self.uart_available:
                self.uart_frame_started()
        self._entry(started)

    def mcu_frame(self, bits: list, framing: dict) -> None:
        """On `wire`: that frame, sampled at the module's framing."""
        def complete() -> None:
            if not (self.uart_available and self.wire_rx_epoch == self.module_epoch):
                return
            if framing != self.module_framing():
                raise ValueError('hm10: changing module UART framing during reception is unsupported')
            received = decode('hm10', bits, framing)
            self.uart_rx_hex += f'{received:02x}'
            self.receive_uart_byte(received)
            self._update()
        self._entry(complete)

    def _check_rxd_idle(self) -> None:
        net = self.rx_net
        idle = resolve_voltage(({'voltage': net['high'], 'resistance': MCU_OUTPUT_OHMS + net['series']}, net['load']))
        self._check_envelope('RXD', idle)
        if idle < 2.4:
            raise ValueError(f'hm10: RXD idles at {idle}V, below the 2.4V logic HIGH')

    def mcu_pins_changed(self) -> None:
        """The firmware changed the direction or level of a pad's GPIO."""
        def changed() -> None:
            for pad in self.pads:
                if self.pads[pad]['series'] is not None:
                    if self.mcu_output(pad) is not None:
                        self._check_envelope(pad, self._raw(pad))
                    self._push_mcu_level(pad)
            self._update()
        self._entry(changed)

    def action(self, name: str, partner: dict, data=None) -> None:
        """An element controller call (the phone and the pad buttons)."""
        if name not in ACTIONS:
            raise ValueError(f'hm10: unknown action {name!r}')
        fields = check_partner(partner)
        if fields['address'] != self.partner.address:
            raise ValueError('hm10: remote address changes require restarting simulation')
        self._entry(lambda: self._action(name, fields, data))

    def _entry(self, step) -> None:
        self._at = self.now_ns()
        try:
            step()
        finally:
            self._at = None
        self._arm()

    # ── Clock ────────────────────────────────────────────────────────────────
    def _clock(self) -> int:
        return self.now_ns() if self._at is None else self._at

    def now_ms(self) -> float:
        return self._clock() / MS_NS

    def schedule(self, callback, delay_ms: float) -> None:
        self._schedule_at(self._clock() + max(1, js_round(delay_ms * MS_NS)), callback)

    def _schedule_at(self, due: int, callback) -> None:
        heapq.heappush(self._events, (due, next(self._seq), callback))

    def _arm(self) -> None:
        if self._events:
            self.on_schedule(max(self._events[0][0], self.now_ns()))

    # ── Element controller ───────────────────────────────────────────────────
    def _action(self, name: str, fields: dict, data) -> None:
        self.partner.fields = fields
        if name in ('sendRemote', 'sendRemoteWithResponse', 'notifyRemote'):
            payload = checked_bytes(data)
        elif data is not None:
            raise ValueError(f'hm10: action {name} takes no bytes')
        if name == 'remoteOn':
            self.partner.available = True
        elif name == 'remoteOff':
            self.partner.available = False
        elif name == 'connect':
            self._require_peripheral('connect')
            self.connect_remote(self.partner, self._security())
        elif name == 'subscribe':
            self._require_peripheral('subscribe')
            self.subscribe(self._notify_uuid(), True)
        elif name == 'disconnect':
            self.disconnect()
        elif name in ('sendRemote', 'sendRemoteWithResponse'):
            self._require_peripheral('write')
            with_response = name == 'sendRemoteWithResponse'
            self.write(self._writable_uuid(with_response), payload, with_response)
        elif name == 'notifyRemote':
            if self.active['role'] != 1 or self.partner.notify_central is None or not self.partner.available:
                raise ValueError('hm10: local remote has no active central notification subscription')
            self.partner.notify_central(payload)
        elif name == 'readRemote':
            self._require_peripheral('read')
            self.remote_read_hex = hex_bytes(self.read(self._notify_uuid()))
        elif name == 'ancsNotify':
            self._ancs_notify(fields)
        elif name == 'resetDown':
            self._drive('RESETB', PAD_PRESS)
        elif name == 'resetUp':
            self._drive('RESETB', PAD_PULL if self.board_powered else None)
        elif name == 'keyDown':
            self._drive('PIO0', PAD_PRESS)
        elif name == 'keyUp':
            self._drive('PIO0', PAD_PULL if self.board_powered else None)
        else:
            raise ValueError(f'hm10: unknown action {name!r}')
        self._update()

    def _ancs_notify(self, f: dict) -> None:
        if self.partner.ancs_sources is None:
            raise ValueError('hm10: partner has no ANCS subscription from the module')
        for key, maximum, name in (('ancsEventId', 2, 'EventID'), ('ancsEventFlags', 31, 'EventFlags'), ('ancsCategoryId', 11, 'CategoryID'),
                                   ('ancsCategoryCount', 255, 'CategoryCount'), ('ancsUid', 0xffff, 'NotificationUID')):
            value = f[key]
            if value != int(value) or not 0 <= value <= maximum:
                raise ValueError(f'hm10: partner ANCS {name} must be an integer 0..{maximum}')
        uid = int(f['ancsUid'])
        self.partner.ancs_sources[0]([int(f['ancsEventId']), int(f['ancsEventFlags']), int(f['ancsCategoryId']),
                                      int(f['ancsCategoryCount']), uid & 0xff, uid >> 8, 0, 0])

    def _security(self) -> dict:
        f = self.partner.fields
        return {'authenticated': f['authenticated'], 'pin': f['pin'], 'bonded': f['bonding']}

    def _require_peripheral(self, action: str) -> None:
        if self.active['role'] != 0:
            raise ValueError(f'hm10: partner {action} requires the module in peripheral role')

    def _notify_uuid(self) -> int:
        return next(c for c in self.characteristics() if c['notify'])['uuid']

    def _writable_uuid(self, with_response: bool) -> int:
        for c in self.characteristics():
            if c['write' if with_response else 'writeWithoutResponse']:
                return c['uuid']
        raise ValueError(f'hm10: configured characteristic does not support {"Write" if with_response else "Write Without Response"}')

    # ── Pads ─────────────────────────────────────────────────────────────────
    def _pad_resistance(self, pad: str) -> float:
        # CC2541 DC spec at DVDD >= 2.6 V: 0.5 V drop at 4 mA (20 mA on P1_0/P1_1 = PIO3/PIO2). PCTL1 halving it is a convention.
        return (25 if pad in ('PIO2', 'PIO3') else 125) / (2 if self.active['outputPower'] == 1 else 1)

    def _drive(self, pad: str, drive: dict | None) -> None:
        self.own[pad] = drive
        if pad in self.pads and self.pads[pad]['series'] is not None:
            self._push_mcu_level(pad)

    def _push_mcu_level(self, pad: str) -> None:
        """The level the firmware reads on the pad's GPIO while it is an input;
        floating and indeterminate voltages leave the last level."""
        if self.mcu_output(pad) is not None:
            self.mcu_levels.pop(pad, None)
            return
        voltage = resolve_voltage((self.own.get(pad), self.pads[pad]['load']))
        if voltage is None or LOW_MAX < voltage < HIGH_MIN:
            return
        high = voltage >= HIGH_MIN
        if self.mcu_levels.get(pad) != high:
            self.mcu_levels[pad] = high
            self.on_mcu_level(pad, high)

    def _raw(self, pad: str) -> float | None:
        sources = [self.own.get(pad)]
        net = self.pads.get(pad)
        if net is not None:
            sources.append(net['load'])
            if net['series'] is not None:
                level = self.mcu_output(pad)
                if level is not None:
                    sources.append({'voltage': net['high'] if level else 0, 'resistance': MCU_OUTPUT_OHMS + net['series']})
        return resolve_voltage(sources)

    @staticmethod
    def _check_envelope(pin: str, volts: float) -> None:
        if volts < -0.3 or volts > 3.6:
            raise ValueError(f'hm10: {pin} exceeds raw 3.3V pin envelope ({volts}V)')

    def _logic(self, pad: str) -> bool:
        volts = self._raw(pad)
        if volts is None:
            raise ValueError(f'hm10: {pad} is floating')
        self._check_envelope(pad, volts)
        if volts <= 0.5:
            return False
        if volts >= 2.4:
            return True
        raise ValueError(f'hm10: {pad} is inside the indeterminate logic region ({volts}V)')

    def _output(self, pad: str, high: bool | None) -> None:
        value = None if high is None else {'voltage': VCC12 if high else 0, 'resistance': self._pad_resistance(pad)}
        self._drive(pad, value)
        if value is not None:
            volts = self._raw(pad)
            if abs(value['voltage'] - volts) / value['resistance'] > 0.001:
                raise ValueError(f'hm10: {pad} exceeds nominal 1mA output-load envelope')

    def _drive_pio(self, index: int, high: bool | None) -> None:
        self._output(f'PIO{index}', high)
        if index == 1:
            self.status = high is True

    def _read_pio(self, index: int) -> bool:
        return self._logic(f'PIO{index}')

    def _read_pio_voltage(self, index: int) -> float:
        volts = self._raw(f'PIO{index}')
        if volts is None:
            raise ValueError(f'hm10: PIO{index} is floating')
        return volts

    def _update(self) -> None:
        """Hm10.ts update(): reset and key qualification, UART availability, observables."""
        if self._updating:
            return
        self._updating = True
        try:
            if self.board_powered:
                held = not self._logic('RESETB')
                if held != self.reset_low:
                    self.reset_low = held
                    self.reset_epoch += 1
                    epoch = self.reset_epoch
                    if held:
                        def qualify() -> None:
                            if epoch == self.reset_epoch and self.reset_low:
                                self.qualified_reset = True
                                self.set_reset_held(True)
                        self.schedule(qualify, RESET_QUALIFY_MS)
                    else:
                        self.qualified_reset = False
                        self.set_reset_held(False)
                key = not self._logic('PIO0')
                if key != self.key_low:
                    self.key_low = key
                    self.key_epoch += 1
                    epoch = self.key_epoch
                    if key:
                        self.schedule(lambda: epoch == self.key_epoch and self.key_low and self.key_long_press(), KEY_LONG_PRESS_MS)
            available = self.board_powered and not self.qualified_reset
            if available != self.uart_available:
                self.uart_available = available
                self._uart_set_available(available)
            if self.uart_available:
                self._uart_resume_transmit()
            self._publish()
        finally:
            self._updating = False

    def _publish(self) -> None:
        values = {'connected': self.peer is not None, 'sleeping': self.asleep, 'resetHeld': self.reset_low,
                  'keyHeld': self.key_low, 'remoteRxHex': self.remote_rx_hex, 'uartRxHex': self.uart_rx_hex,
                  'remoteReadHex': self.remote_read_hex, 'status': self.status,
                  'startupConfiguration': json.dumps(self.config, separators=(',', ':'))}
        changed = {key: value for key, value in values.items() if self._published.get(key, ...) != value}
        if changed:
            self._published.update(changed)
            self.on_state(changed)

    # ── UART (Hm10Uart.ts) ───────────────────────────────────────────────────
    def module_framing(self) -> dict:
        return {'baud': BAUD_RATES[self.active['baud']], 'data_bits': 8, 'parity': PARITIES[self.active['parity']],
                'stop_bits': 1 if self.active['stop'] == 0 else 2}

    def _uart_set_available(self, available: bool) -> None:
        self.uart_available = available
        self.module_epoch += 1
        self.module_queue = []
        self.module_transmitting = False
        self.waiting_for_cts = False
        self.idle_callbacks = []
        if self.wire is not None:
            self.wire.cancel()

    def _mcu_write(self, byte: int, framing: dict) -> None:
        if not isinstance(byte, int) or not 0 <= byte <= 255:
            raise ValueError('hm10: UART payload must be an integer byte')
        receiver = self.module_framing()
        bits = encode('hm10', byte & ((1 << framing['data_bits']) - 1), framing)
        mcu_bit = bit_ns(framing, receiver['baud'])
        start = max(self._clock(), self.mcu_line_free_ns)
        self.mcu_line_free_ns = start + js_round(len(bits) * mcu_bit)
        epoch = self.module_epoch

        def receiving() -> bool:
            return self.uart_available and epoch == self.module_epoch

        def started() -> None:
            if self.uart_available:
                self.uart_frame_started()

        def complete() -> None:
            if not receiving():
                return
            if not same_framing(framing, receiver) or receiver != self.module_framing():
                raise ValueError('hm10: MCU and module UART framing do not match')
            received = decode('hm10', bits, receiver)
            self.uart_rx_hex += f'{received:02x}'
            self.receive_uart_byte(received)

        if start == self._clock():
            started()
        else:
            self._schedule_at(start, started)
        self._schedule_at(start + math.ceil(max(len(bits) * mcu_bit, (len(bits) - 0.5) * 1e9 / receiver['baud'])) + 1, complete)

    def _uart_send(self, data: list[int]) -> None:
        if not self.uart_available:
            raise ValueError('hm10: module UART is unavailable')
        room = TX_BUFFER_BYTES - len(self.module_queue) - int(self.module_transmitting)
        self.module_queue.extend(data[:max(0, room)])
        if not self.module_transmitting and not self.waiting_for_cts:
            self._transmit_module_byte()

    def _uart_resume_transmit(self) -> None:
        if not self.waiting_for_cts or not self._clear_to_send():
            return
        self.waiting_for_cts = False
        self._transmit_module_byte()

    def _clear_to_send(self) -> bool:
        return not self.flow_control() or not self._logic('UART_CTS')

    def _when_transmit_idle(self, callback) -> None:
        self.idle_callbacks.append(callback)
        if not self.module_transmitting and not self.module_queue:
            self._schedule_at(self._clock() + 1, self._flush_idle)

    def _flush_idle(self) -> None:
        if self.module_transmitting or self.module_queue:
            return
        callbacks, self.idle_callbacks = self.idle_callbacks, []
        for callback in callbacks:
            callback()

    def _transmit_module_byte(self) -> None:
        if not self.module_queue:
            self._flush_idle()
            return
        if not self._clear_to_send():
            self.waiting_for_cts = True
            return
        byte = self.module_queue.pop(0)
        sender = self.module_framing()
        bits = encode('hm10', byte, sender)
        receiver = self.mcu_receiver()
        if receiver is not None:
            check_framing(receiver)
        epoch = self.module_epoch
        start = self._clock()
        self.module_transmitting = True
        if self.wire is not None:
            self.wire.send(bits, 1e9 / sender['baud'])
        rx_bits = 0 if receiver is None else (len(bits) - 0.5) * bit_ns(receiver, sender['baud'])

        def complete() -> None:
            if not (self.uart_available and epoch == self.module_epoch):
                return
            self.module_transmitting = False
            if sender != self.module_framing():
                raise ValueError('hm10: changing module UART framing during transmission is unsupported')
            live = self.mcu_receiver()
            if receiver is not None and live is not None:
                if live != receiver:
                    raise ValueError('hm10: changing the MCU UART framing during reception is unsupported')
                if not same_framing(sender, receiver):
                    raise ValueError('hm10: module and MCU UART framing do not match')
                self.deliver(decode('hm10', bits, receiver))
            self._transmit_module_byte()

        self._schedule_at(start + math.ceil(max(len(bits) * 1e9 / sender['baud'], rx_bits)) + 1, complete)

    # ── V545 model (Hm10V545Model.ts) ────────────────────────────────────────
    def available(self) -> bool:
        return self.powered and not self.reset_held and not self.asleep

    def flow_control(self) -> bool:
        return self.powered and not self.reset_held and self.active['flow'] == 1

    def characteristics(self) -> list[dict]:
        common = {'service': self.active['uuid'], 'uuid': self.active['characteristic'], 'read': True, 'notify': True,
                  'write': self.active['resp'] == 1, 'writeWithoutResponse': self.active['resp'] == 0}
        if self.active['ffe2'] == 0:
            return [common]
        return [{**common, 'write': False, 'writeWithoutResponse': False},
                {**common, 'uuid': common['uuid'] + 1, 'read': False, 'notify': False}]

    def advertisement(self) -> dict | None:
        if not self.powered or self.reset_held or self.asleep or not self.working or self.active['role'] != 0 or self.peer:
            return None
        # ADTY1 is directed advertising to the last peer; with no last peer there is no target (convention).
        if self.active['advertisingType'] == 1 and self.config['lastAddress'] is None:
            return None
        return {'connectable': self.deployed == 0 and self.active['advertisingType'] <= 1,
                'directedTo': self.config['lastAddress'] if self.active['advertisingType'] == 1 else None}

    def _power_on(self) -> None:
        if self.powered:
            raise ValueError('hm-10: power is already on')
        self.deployed = 0
        self.powered = True
        if not self.reset_held:
            self._boot()

    def reset(self) -> None:
        self._require_power()
        self._drop_link(False)
        self._boot()

    def set_reset_held(self, held: bool) -> None:
        if self.reset_held == held:
            return
        self.reset_held = held
        if not self.powered:
            return
        if held:
            self._drop_link(False)
            self._halt()
        else:
            self._boot()

    def key_long_press(self) -> None:
        self._require_power()
        if self.baud_locked:
            self.config['baud'] = 0
            self.active['baud'] = 0
            self.baud_locked = False
            return
        if self.asleep:
            self._wake()
            if self.active['notifications'] == 1:
                self._emit(ascii_bytes('OK+WAKE'))
        elif self.peer:
            self.disconnect()
        else:
            self.config = factory_settings()
            self.reset()

    def uart_frame_started(self) -> None:
        """A UART start bit reached RXD: the line is no longer idle."""
        self._require_power()
        self.rx_generation += 1

    def receive_uart_byte(self, received: int) -> None:
        self._require_power()
        byte = received & 0x7f if self.active['bit7'] == 1 else received
        if self.burst is None:
            mode = 'wake' if self.asleep else 'data' if self.peer else 'ignore' if self.baud_locked else 'command'
            self.burst = {'mode': mode, 'bytes': [], 'held': [], 'count': 0, 'woke': False}
        burst = self.burst
        if burst['mode'] == 'wake':
            if not burst['woke'] and burst['count'] + 1 > 80:
                burst['woke'] = True
                self._wake()
                self._emit(ascii_bytes('OK+WAKE'))
        elif burst['mode'] == 'command':
            if len(burst['bytes']) < RX_BUFFER_BYTES:
                burst['bytes'].append(byte)
        elif burst['mode'] == 'data':
            self._connected_byte(burst, byte)
        burst['count'] += 1
        self._update_rts()
        self.rx_generation += 1
        generation = self.rx_generation
        self.schedule(lambda: generation == self.rx_generation and self.burst is burst and self._end_burst(), COMMAND_IDLE_MS)

    def connect_remote(self, peer: Partner, security: dict) -> None:
        self._require_power()
        selected = self._select_parameters(peer)
        if isinstance(selected, str):
            raise ValueError(f'hm-10: {selected}')
        failure = self._remote_admission_failure(peer, security, selected)
        if failure is not None:
            raise ValueError(f'hm-10: {failure}')
        self._establish(peer, security, selected)

    def disconnect(self) -> None:
        self._require_power()
        if not self.peer:
            raise ValueError('hm-10: no active link')
        self._drop_link(True)
        if self.active['role'] == 0 and self.active['powerMode'] == 0:
            self._enter_sleep()
        self._update_led()
        generation = self.connect_generation
        if self.active['role'] == 1 and self.working:
            def retry() -> None:
                if generation != self.connect_generation or not self.available() or self.peer:
                    return
                self.retry_started = self.now_ms()
                self.retry_expired = False
                self._try_automatic_peer()
            self.schedule(retry, 100)

    def subscribe(self, uuid: int, enabled: bool) -> None:
        self._require_link()
        if self.active['role'] != 0:
            raise ValueError('hm-10: local server subscription requires peripheral role')
        self._authorize()
        characteristic = next((c for c in self.characteristics() if c['uuid'] == uuid), None)
        if not characteristic or not characteristic['notify']:
            raise ValueError('hm-10: characteristic does not permit notifications')
        if enabled:
            self.subscribed.add(uuid)
        else:
            self.subscribed.discard(uuid)

    def read(self, uuid: int) -> list[int]:
        """A remote read of the module's characteristic returns the module MAC (field reports, firmware unstated)."""
        self._require_link()
        if self.active['role'] != 0:
            raise ValueError('hm-10: local server read requires peripheral role')
        self._authorize()
        characteristic = next((c for c in self.characteristics() if c['uuid'] == uuid), None)
        if not characteristic or not characteristic['read']:
            raise ValueError('hm-10: characteristic does not permit reads')
        return [int(self.identity[i:i + 2], 16) for i in range(0, 12, 2)]

    def write(self, uuid: int, payload: list[int], with_response: bool = False) -> None:
        self._require_link()
        self._authorize()
        if self.active['role'] != 0:
            raise ValueError('hm-10: local server writes require peripheral role')
        characteristic = next((c for c in self.characteristics() if c['uuid'] == uuid), None)
        if not characteristic or not characteristic['write' if with_response else 'writeWithoutResponse']:
            raise ValueError('hm-10: requested GATT write property is not available')
        data = checked_bytes(payload)
        peer = self.peer
        if len(data) > 20:
            raise ValueError('hm-10: V545 characteristic packet exceeds 20 bytes')
        if self.active['mode'] == 0:
            self._emit(data)
        elif self.active['mode'] in (1, 2):
            command = text(data)
            if command.startswith('AT'):
                if not command.endswith(('\r', '\n')):
                    self._command(command, 'remote', lambda reply: self._notify(ascii_bytes(reply)))
            else:
                if len(data) >= 20:
                    raise ValueError('hm-10: MODE1/2 transparent remote packet must be shorter than 20 bytes')
                self._emit(data)
        else:
            raise ValueError('hm-10: invalid work mode')
        if self.peer is peer and peer is not None and not self.asleep:
            self._heartbeat()

    def _heartbeat(self) -> None:
        self._require_link()
        self.last_heartbeat = self.now_ms()

    def _clone_config(self) -> dict:
        return {**self.config, 'whitelist': list(self.config['whitelist']), 'bonds': list(self.config['bonds'])}

    def _validate_config(self, config: dict) -> None:
        for key, minimum, maximum in CONFIG_RANGES:
            value = config[key]
            if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
                raise ValueError(f'hm-10: invalid retained {key}')
        if not isinstance(config['name'], str) or not re.fullmatch(r'[\x20-\x7e]{1,13}', config['name']):
            raise ValueError('hm-10: name must contain 1..13 ASCII printable characters')
        if not isinstance(config['pin'], str) or not re.fullmatch(r'[0-9]{6}', config['pin']):
            raise ValueError('hm-10: PIN requires six decimal digits')
        if not isinstance(config['beaconUuid'], str) or not re.fullmatch(r'[0-9A-F]{32}', config['beaconUuid']):
            raise ValueError('hm-10: beacon UUID requires 32 uppercase hex digits')
        for offset in range(0, 32, 8):
            if config['beaconUuid'][offset:offset + 8] in ('00000000', 'FFFFFFFF'):
                raise ValueError('hm-10: invalid beacon UUID chunk')
        if config['lastAddress'] is not None:
            check_address(config['lastAddress'])
        if not isinstance(config['whitelist'], list) or not isinstance(config['bonds'], list):
            raise ValueError('hm-10: whitelist and bonds require address arrays')
        if len(config['whitelist']) != 3:
            raise ValueError('hm-10: whitelist has exactly three address slots')
        for entry in config['whitelist'] + config['bonds']:
            check_address(entry)
        if len(set(config['bonds'])) != len(config['bonds']):
            raise ValueError('hm-10: duplicate retained bond address')
        if config['ancs'] == 1 and config['securityType'] != 3:
            raise ValueError('hm-10: ANCS requires TYPE3')

    def _halt(self) -> None:
        self.boot_generation += 1
        self.link_generation += 1
        self.scan_generation += 1
        self.connect_generation += 1
        self.manual_connect_generation += 1
        self.led_generation += 1
        self.pwm_generation += 1
        self.discovered = []
        self.retry_pending = False
        self.burst = None
        self.pending = []
        self.pio = [None] * 12
        for pin in range(1, 12):
            self._drive_pio(pin, None)
        self._update_rts()

    def _boot(self) -> None:
        self.boot_generation += 1
        self.scan_generation += 1
        self.connect_generation += 1
        self.manual_connect_generation += 1
        self.discovered = []
        self.retry_started = self.now_ms()
        self.retry_expired = False
        self.retry_pending = False
        self.advertising_started = self.now_ms()
        self.active = self._clone_config()
        self.baud_locked = self.active['baud'] == 7
        self.asleep = self.active['role'] == 0 and self.active['powerMode'] == 0
        self.working = not self.asleep and (self.active['role'] == 0 or self.active['immediate'] == 0)
        self.burst = None
        self.pending = []
        self._apply_gpio(self.active['bootOutputs'])
        self._update_led()
        self._update_rts()
        self._try_automatic_peer()

    def _wake(self) -> None:
        self.asleep = False
        self.working = self.active['role'] == 0 or self.active['immediate'] == 0
        self.advertising_started = self.now_ms()
        self._update_led()

    def _apply_gpio(self, mask: int) -> None:
        for pin in range(2, 12):
            self._set_pio(pin, None if self.active['mode'] == 1 and pin >= 4 else (mask & (0x800 >> pin)) != 0)

    def _set_pio(self, pin: int, level: bool | None) -> None:
        if pin == 2:
            self.pwm_generation += 1
        self.pio[pin] = level
        self._drive_pio(pin, level)

    # PIO2 settings 2..9 are the manual's 100..800 ms PWM; 50 % duty and period = setting time are conventions.
    def _start_pwm(self, setting: int) -> None:
        self.pwm_generation += 1
        generation = self.pwm_generation
        self.pio[2] = setting
        half = (setting - 1) * 50

        def toggle(high: bool) -> None:
            if generation != self.pwm_generation or not self.powered:
                return
            self._drive_pio(2, high)
            self.schedule(lambda: toggle(not high), half)

        toggle(True)

    def _update_led(self) -> None:
        self.led_generation += 1
        generation = self.led_generation
        if not self.powered:
            self._drive_pio(1, None)
            return
        if self.asleep:
            self._drive_pio(1, False)
            return
        if self.peer:
            self._drive_pio(1, True)
            return
        if self.active['systemLed'] == 1:
            self._drive_pio(1, False)
            return

        def toggle(high: bool) -> None:
            if generation != self.led_generation or not self.powered:
                return
            self._drive_pio(1, high)
            self.schedule(lambda: toggle(not high), 500)

        toggle(True)

    # UART_RTS is active low: asserted while the receive buffer has room (convention: RX_BUFFER_BYTES).
    def _update_rts(self) -> None:
        level = None
        if self.powered and not self.reset_held and self.active['flow'] == 1:
            fill = len(self.pending) + (len(self.burst['bytes']) if self.burst is not None and self.burst['mode'] == 'command' else 0)
            level = fill >= RX_BUFFER_BYTES
        if level == self.rts_level:
            return
        self.rts_level = level
        self._output('UART_RTS', level)

    def _enter_sleep(self) -> None:
        if self.active['role'] != 0:
            raise ValueError('hm-10: sleep requires peripheral role')
        self._drop_link(False)
        self.asleep = True
        self.working = False
        self.scan_generation += 1
        self.connect_generation += 1
        self._update_led()

    def _set_bond(self, remote: str, bonded: bool) -> None:
        if bonded and remote not in self.config['bonds']:
            self.config['bonds'].append(remote)
        if not bonded:
            self.config['bonds'] = [entry for entry in self.config['bonds'] if entry != remote]

    def _whitelist_failure(self, peer: Partner) -> str | None:
        if self.active['whitelistEnabled'] == 1 and not any(entry != EMPTY_ADDRESS and entry == peer.address for entry in self.active['whitelist']):
            return 'peer is excluded by whitelist'
        return None

    def _security_failure(self, peer: Partner, security: dict) -> str | None:
        kind = max(self.active['securityType'], peer.security_type)
        bonded = peer.address in self.config['bonds'] and peer.bonded is True
        if kind >= 1 and not bonded and security.get('authenticated') is not True:
            return 'authenticated pairing is required'
        if self.active['securityType'] >= 2 and not bonded and security.get('pin') != self.active['pin']:
            return 'pairing PIN does not match'
        if peer.security_type >= 2 and not bonded and security.get('pin') != peer.pin:
            return 'peer pairing PIN does not match'
        if kind == 3 and not bonded and security.get('bonded') is not True:
            return 'bilateral bonding consent is required'
        return None

    def _remote_admission_failure(self, central: Partner, security: dict, parameters: dict) -> str | None:
        if self.active['role'] != 0:
            return 'a remote central requires peripheral role'
        advert = self.advertisement()
        if advert is None or not advert['connectable'] or (advert['directedTo'] is not None and advert['directedTo'] != central.address) \
                or self.peer or not central.available or central.busy:
            return 'peripheral is not available for connection'
        selected = self._select_parameters(central, parameters)
        if isinstance(selected, str):
            return selected
        return self._whitelist_failure(central) or self._security_failure(central, security)

    def _select_parameters(self, peer: Partner, parameters: dict | None = None):
        minimum = INTERVALS[self.active['minInterval']]
        maximum = INTERVALS[self.active['maxInterval']]
        interval = parameters['intervalMs'] if parameters else (peer.interval_ms if peer.interval_ms is not None else minimum)
        latency = parameters['latency'] if parameters else (peer.latency if peer.latency is not None else self.active['latency'])
        timeout = parameters['timeoutMs'] if parameters else SUPERVISION_TIMEOUTS[self.active['supervision']]
        applies_request = self.active['role'] == 1 or (self.active['parameterUpdate'] == 1 and peer.accepts_parameters is not False)
        # An accepted request moves the interval to the nearest value of a valid requested range.
        if applies_request and minimum <= maximum:
            interval = min(maximum, max(minimum, interval))
        if not math.isfinite(interval) or interval < 7.5 or interval > 4000 or latency != int(latency) or latency < 0 or latency > 499 \
                or timeout <= 2 * interval * (latency + 1):
            return 'invalid BLE interval, latency or supervision parameters'
        return {'intervalMs': interval, 'latency': latency, 'timeoutMs': timeout}

    def _central_security(self) -> dict:
        return {'authenticated': True, 'pin': self.active['pin'], 'bonded': self.active['securityType'] == 3}

    def _central_failure(self, peer: Partner) -> str | None:
        if self._check_central_transport(peer) is None:
            return 'remote service lacks configured writable and notify characteristics'
        selected = self._select_parameters(peer)
        if isinstance(selected, str):
            return selected
        return self._whitelist_failure(peer) or self._security_failure(peer, self._central_security())

    def _establish_central(self, peer: Partner) -> None:
        selected = self._select_parameters(peer)
        self._establish(peer, self._central_security(), selected)
        transport = self._check_central_transport(peer)
        self.central_write, self.central_notify = transport
        peer.subscribe(transport[1]['uuid'], True, lambda payload: self._receive_central_notification(peer, payload))

    def _establish(self, peer: Partner, security: dict, parameters: dict) -> None:
        kind = max(self.active['securityType'], peer.security_type)
        bonded = peer.address in self.config['bonds'] and peer.bonded is True
        self.scan_generation += 1
        self.connect_generation += 1
        self.manual_connect_generation += 1
        self.discovered = []
        self.retry_pending = False
        self.peer = peer
        peer.busy = True
        self.authenticated = kind == 0 or bonded or security.get('authenticated') is True
        if kind == 3 and not bonded:
            self._set_bond(peer.address, True)
            peer.bonded = True
        if self.active['saveAddress'] == 0:
            self.config['lastAddress'] = peer.address
        self.link_interval = parameters['intervalMs']
        self.link_latency = parameters['latency']
        self.link_timeout = parameters['timeoutMs']
        self.last_heartbeat = self.now_ms()
        if self.active['mode'] != 1:
            self._apply_gpio(self.active['connectedOutputs'])
        self._update_led()
        self._notice(f'OK+CONN:{peer.address}' if self.active['noticeAddress'] == 1 else 'OK+CONN')
        generation = self.link_generation

        def supervise() -> None:
            if generation != self.link_generation or self.peer is not peer:
                return
            elapsed = self.now_ms() - self.last_heartbeat
            if not peer.available and elapsed >= self.link_timeout:
                self.disconnect()
                return
            if peer.available:
                self.last_heartbeat = self.now_ms()
            self.schedule(supervise, min(self.link_interval * (self.link_latency + 1),
                                         max(0.000001, self.link_timeout - (self.now_ms() - self.last_heartbeat))))

        self.schedule(supervise, self.link_interval * (self.link_latency + 1))
        if self.active['role'] == 0 and self.active['mode'] == 1:
            self._start_collection()
        if self.active['role'] == 0 and self.active['ancs'] == 1 and peer.ancs and self.authenticated and peer.address in self.config['bonds']:
            self.ancs_link = True
            peer.ancs.ancs_subscribe(lambda payload: self._ancs_notification(peer, payload), lambda payload: self._ancs_data(peer, payload))
            for notice in ('OK+ANCSN', 'OK+ANCSC', 'OK+ANCSD'):
                self._emit(ascii_bytes(notice))

    def _drop_link(self, notice: bool) -> None:
        peer = self.peer
        if not peer:
            return
        self.link_generation += 1
        self.connect_generation += 1
        self.peer = None
        if self.central_notify:
            peer.release_subscription(self.central_notify['uuid'])
        if self.ancs_link:
            peer.ancs.ancs_release()
        self.ancs_link = False
        self.central_write = None
        self.central_notify = None
        self.subscribed.clear()
        self.pending = []
        self.pending_tick = False
        self.authenticated = False
        peer.busy = False
        peer.disconnected()
        self.advertising_started = self.now_ms()
        self._update_rts()
        if notice:
            self._notice('OK+LOST')

    def _notice(self, value: str) -> None:
        if self.active['notifications'] == 1:
            self._emit(ascii_bytes(value))

    def _authorize(self) -> None:
        if not self.authenticated:
            raise ValueError('hm-10: GATT access is unauthorized')

    def _require_power(self) -> None:
        if not self.powered:
            raise ValueError('hm-10: module is unpowered')
        if self.reset_held:
            raise ValueError('hm-10: module is held in reset')

    def _require_link(self) -> None:
        self._require_power()
        if not self.peer or self.asleep:
            raise ValueError('hm-10: no active link')
        if not self.peer.available:
            raise ValueError('hm-10: peer is unavailable')

    def _emit(self, data: list[int]) -> None:
        self._uart_send([byte | 0x80 for byte in data] if self.active['bit7'] == 1 else list(data))

    def _uart_reply(self, value: str, generation: int) -> None:
        if generation == self.boot_generation and self.available():
            self._emit(ascii_bytes(value))

    def _notify(self, payload: list[int]) -> None:
        self._require_link()
        if self.active['characteristic'] in self.subscribed:
            self.peer.receive(list(payload))

    def _connected_byte(self, burst: dict, byte: int) -> None:
        if not self.peer:
            return
        if len(burst['held']) == burst['count']:
            candidate = [*burst['held'], byte]
            if self._connected_command_prefix(candidate):
                burst['held'] = candidate
                return
            burst['held'] = []
            self._queue_air(candidate)
            return
        self._queue_air([byte])

    def _connected_command_prefix(self, candidate: list[int]) -> bool:
        value = text(candidate)
        return 'AT'.startswith(value) or (self.ancs_link and matches_template(value, ANCS_REQUEST, False))

    def _end_burst(self) -> None:
        burst = self.burst
        self.burst = None
        if burst['mode'] == 'command':
            # A burst that began disconnected and ended on a link is discarded (convention).
            if not self.peer and burst['bytes']:
                self._uart_command(burst['bytes'])
        elif burst['mode'] == 'data' and burst['held'] and self.peer:
            held = text(burst['held'])
            if held == 'AT':
                self.disconnect()
            elif self.ancs_link and matches_template(held, ANCS_REQUEST, True):
                self._ancs_request(self.peer, held)
            else:
                self._queue_air(burst['held'])
        self._update_rts()

    def _uart_command(self, data: list[int]) -> None:
        command = text(data)
        if command.endswith(('\r', '\n')):
            return
        generation = self.boot_generation
        self._command(command, 'uart', lambda reply: self._uart_reply(reply, generation))

    def _queue_air(self, data: list[int]) -> None:
        # Bytes arriving while the receive buffer is full are lost (buffer size is a convention).
        for byte in data:
            if len(self.pending) < RX_BUFFER_BYTES:
                self.pending.append(byte)
        self._update_rts()
        self._schedule_transmit()

    def _schedule_transmit(self) -> None:
        if self.pending_tick or not self.pending:
            return
        self.pending_tick = True
        peer = self.peer
        generation = self.link_generation

        def transmit() -> None:
            if generation != self.link_generation or self.peer is not peer:
                return
            self.pending_tick = False
            if not peer.available:
                self.pending = []
                self._update_rts()
                return
            packet, self.pending = self.pending[:20], self.pending[20:]
            self._update_rts()
            if self.active['role'] == 0:
                self._notify(packet)
            elif self.active['role'] == 1:
                peer.write(self.central_write['uuid'], packet, not self.central_write['writeWithoutResponse'])
            else:
                raise ValueError('hm-10: invalid role')
            if self.peer is peer and peer.available and not self.asleep:
                self._heartbeat()
            self._schedule_transmit()

        self.schedule(transmit, self.link_interval * (self.link_latency + 1))

    def _receive_central_notification(self, peer: Partner, payload: list[int]) -> None:
        self._require_link()
        if self.peer is not peer or self.active['role'] != 1 or not self.central_notify:
            raise ValueError('hm-10: unsolicited central notification')
        self._authorize()
        data = checked_bytes(payload)
        if len(data) > 20:
            raise ValueError('hm-10: V545 notification exceeds 20 bytes')
        self._emit(data)
        self._heartbeat()

    def _check_central_transport(self, peer: Partner):
        a = self.active
        write = next((c for c in peer.characteristics
                      if (c['uuid'] == a['uuid'] if a['selfLearning'] == 1 else c['service'] == a['uuid'] and c['uuid'] == a['characteristic'])), None)
        notify = next((c for c in peer.characteristics
                       if c['uuid'] == a['characteristic'] and (a['selfLearning'] == 1 or c['service'] == a['uuid'])), None)
        if not write or (not write['write'] and not write['writeWithoutResponse']) or not notify or not notify['notify']:
            return None
        return write, notify

    def _try_automatic_peer(self) -> None:
        if not self.powered or self.reset_held or self.asleep or not self.working or self.active['role'] != 1 or self.peer:
            return
        last = self.config['lastAddress']
        if last is not None and self.active['retryMs'] > 0 and self.now_ms() - self.retry_started >= self.active['retryMs']:
            self.retry_expired = True
        searching = last is None or self.retry_expired
        peers = list(self.peers.values()) if searching else [p for p in (self.peers.get(last),) if p is not None]
        peer = next((p for p in peers if p.connectable and not p.busy and p.available and self._central_failure(p) is None), None)
        if peer:
            self._establish_central(peer)
        elif not self.retry_pending:
            self.retry_pending = True
            generation = self.connect_generation
            now = self.now_ms()
            timeout_delay = max(0.000001, self.active['retryMs'] - (now - self.retry_started)) \
                if last is not None and self.active['retryMs'] > 0 and not self.retry_expired else math.inf

            def retry() -> None:
                if generation != self.connect_generation or self.peer or not self.powered:
                    return
                self.retry_pending = False
                self._try_automatic_peer()

            self.schedule(retry, min(100, timeout_delay))

    def _discover(self, on_result, on_complete) -> None:
        self.scan_generation += 1
        generation = self.scan_generation
        self.discovered = []
        seen: set = set()
        end = self.now_ms() + self.active['scanSeconds'] * 1000

        def sample() -> None:
            if generation != self.scan_generation or not self.available() or self.peer:
                return
            for peer in list(self.peers.values()):
                if peer.address in seen or not peer.available:
                    continue
                seen.add(peer.address)
                if len(self.discovered) < 6:
                    self.discovered.append(peer)
                on_result(peer)
            now = self.now_ms()
            if now >= end:
                on_complete()
                return
            self.schedule(sample, min(end, now + 100) - now)

        sample()

    def _central_connect(self, target: str, address_type: int | None, on_status) -> None:
        self.manual_connect_generation += 1
        generation = self.manual_connect_generation
        deadline = self.now_ms() + CONNECT_TIMEOUT_MS

        def attempt() -> None:
            if generation != self.manual_connect_generation or not self.available() or self.peer:
                return
            peer = self.peers.get(target)
            if peer and (address_type is None or peer.address_type == address_type) and peer.connectable and not peer.busy and peer.available:
                if self._central_failure(peer) is not None:
                    self.manual_connect_generation += 1
                    on_status('E')
                    return
                self._establish_central(peer)
            elif self.now_ms() >= deadline:
                self.manual_connect_generation += 1
                on_status('F')
            else:
                now = self.now_ms()
                self.schedule(attempt, max(0.000001, min(deadline, now + 100) - now))

        attempt()

    def _start_collection(self) -> None:
        self.collected = self._collect_inputs()
        generation = self.link_generation

        def tick() -> None:
            if generation != self.link_generation or not self.peer or self.active['collectionSeconds'] == 0:
                return
            value = self._collect_inputs()
            if value != self.collected:
                self.collected = value
                self._notify(ascii_bytes(f'OK+Col:{hex_text(value, 2)}'))
            self.schedule(tick, self.active['collectionSeconds'] * 1000)

        # CYC00 disables periodic change reports (convention).
        if self.active['collectionSeconds'] > 0:
            self.schedule(tick, self.active['collectionSeconds'] * 1000)

    def _collect_inputs(self) -> int:
        value = 0
        for pin in range(4, 12):
            if self._read_pio(pin):
                value |= 1 << (11 - pin)
        return value

    def _pio_level(self, pin: int) -> str:
        state = self.pio[pin]
        if isinstance(state, int) and not isinstance(state, bool):
            return str(state)
        if state is None:
            return '1' if self._read_pio(pin) else '0'
        return '1' if state else '0'

    def _battery_percent(self) -> int:
        return 100

    def _ancs_notification(self, peer: Partner, payload: list[int]) -> None:
        if self.peer is not peer or not self.ancs_link:
            raise ValueError('hm-10: ANCS notification without an ANCS link')
        data = checked_bytes(payload)
        event_id, _, category, count = data[:4]
        uid = data[4] | (data[5] << 8) | (data[6] << 16) | (data[7] * 0x1000000)
        if len(data) != 8 or event_id > 2 or category > 11:
            raise ValueError('hm-10: ANCS Notification Source requires 8 bytes with defined EventID and CategoryID')
        if uid > 0xffff:
            raise ValueError('hm-10: ANCS NotificationUID exceeds the 4-character UART field')
        self._emit(ascii_bytes(f'OK+ANCS8{event_id}{hex_text(category, 1)}{hex_text(count, 2)}{hex_text(uid, 4)}'))

    def _ancs_request(self, peer: Partner, request: str) -> None:
        uid = int(request[7:11], 16)
        attribute = int(request[11])
        max_length = int(request[12:14], 16)
        if attribute in (0, 4, 5) and max_length != 0:
            raise ValueError('hm-10: ANCS attributes 0, 4 and 5 take max length 00')
        self._emit(ascii_bytes(f'OK+{request[7:11]}'))
        self._emit(ascii_bytes('OK+ANCSW'))
        command = [0, uid & 0xff, uid >> 8, 0, 0, attribute, *([max_length, 0] if attribute in (1, 2, 3) else [])]
        peer.ancs.ancs_write_control_point(command)

    def _ancs_data(self, peer: Partner, payload: list[int]) -> None:
        if self.peer is not peer or not self.ancs_link:
            raise ValueError('hm-10: ANCS data without an ANCS link')
        data = checked_bytes(payload)
        if len(data) > 20:
            raise ValueError('hm-10: ANCS Data Source fragment exceeds 20 bytes')
        self._emit([*ascii_bytes('OK+ANCS '), *ascii_bytes(hex_text(len(data), 2)), *data])

    def _restart_after(self, source: str, before=None) -> None:
        generation = self.boot_generation

        def restart() -> None:
            if generation != self.boot_generation or not self.powered or self.reset_held:
                return
            if before:
                before()
            self.reset()

        if source == 'uart':
            self._when_transmit_idle(restart)
        else:
            restart()

    def _apply_setting(self, key: str, value) -> None:
        candidate = {**self._clone_config(), key: value}
        self._validate_config(candidate)
        self.config = candidate
        if key in IMMEDIATE:
            self.active = {**self.active, key: value}
            if key == 'systemLed':
                self._update_led()

    def _require_central_command(self, command: str, source: str) -> None:
        if source != 'uart':
            raise ValueError(f'hm-10: {command} cannot run through a connected peripheral GATT write')
        if self.active['role'] != 1 or self.active['immediate'] != 1:
            raise ValueError(f'hm-10: {command} requires ROLE1 and IMME1 (manual)')

    def _command(self, command: str, source: str, reply) -> None:
        if command == 'AT':
            if source == 'remote':
                self.disconnect()
                return
            self.manual_connect_generation += 1
            reply('OK')
            return
        if not command.startswith('AT+'):
            raise ValueError(f'hm-10 V545: unknown command {json.dumps(command)}')
        body = command[3:]
        if re.match(r'SENS|RAT|TEHU|UART', body):
            raise ValueError(f'hm-10: {command} requires HMSensor rather than HMSoft firmware')
        if re.match(r'128B|DISA|MPIO|LN|FINDSERVICES|READDATA|SET_WAY', body):
            raise ValueError(f'hm-10: {command} belongs to firmware later than V545')
        if re.match(r'FILT|BUSHU|BEAC|IB1|IB2|FLOW', body):
            raise ValueError(f'hm-10: {command} is not part of the V545 command set')

        def invalid(name: str):
            raise ValueError(f'hm-10 V545: invalid {name} parameter in {command}')

        cfg = self.config
        match = re.fullmatch(r'([A-Z0-9]{4})(\?|[0-9A-F])', body)
        if match and match[1] in DIGIT_SETTINGS:
            name, value = match[1], match[2]
            key, minimum, maximum = DIGIT_SETTINGS[name]

            def shown(setting: int) -> str:
                return hex_text(setting, 1) if name == 'ADVI' else str(setting)

            if value == '?':
                reply(f'OK+Get:{shown(cfg[key])}')
                return
            setting = int(value, 16) if name == 'ADVI' or value.isdigit() else None
            if setting is None or not minimum <= setting <= maximum:
                invalid(name)
            if name == 'ANCS' and setting == 1 and cfg['securityType'] != 3:
                raise ValueError('hm-10: AT+ANCS1 requires AT+TYPE3 first (manual)')
            if name == 'TYPE' and setting != 3 and cfg['ancs'] == 1:
                raise ValueError('hm-10: ANCS requires TYPE3; send AT+ANCS0 first')
            self._apply_setting(key, setting)
            reply(f'OK+Set:{shown(setting)}')
            if name == 'ROLE':
                self._restart_after(source)
            return
        if (match := re.fullmatch(f'NAME({LINE}+)', body)):
            if match[1] == '?':
                reply(f'OK+NAME:{cfg["name"]}')
                return
            if not re.fullmatch(r'[\x20-\x7e]{1,13}', match[1]):
                invalid('NAME')
            self._apply_setting('name', match[1])
            reply(f'OK+Set:{match[1]}')
            return
        if body == 'ADDR?':
            reply(f'OK+ADDR:{self.identity}')
            return
        if body in ('VERR?', 'VERS?'):
            reply('HMSoft V545')
            return
        if body == 'HELP?':
            reply('www.jnhuamao.cn')
            return
        if body == 'RADD?':
            reply(f'OK+RADD:{cfg["lastAddress"] or EMPTY_ADDRESS}')
            return
        if body == 'RESET':
            reply('OK+RESET')
            self._restart_after(source)
            return
        if body == 'RENEW':
            reply('OK+RENEW')

            def renew() -> None:
                self.config = factory_settings()

            self._restart_after(source, renew)
            return
        if body == 'ERASE':
            reply('OK+ERASE')
            cfg['bonds'] = []
            return
        if body == 'CLEAR':
            if self.active['role'] != 1:
                raise ValueError('hm-10: AT+CLEAR is a central-role command (manual)')
            cfg['lastAddress'] = None
            self.connect_generation += 1
            self.retry_pending = False
            reply('OK+CLEAR')
            self._try_automatic_peer()
            return
        if body == 'START':
            reply('OK+START')
            self.working = True
            self._try_automatic_peer()
            return
        if body == 'SLEEP':
            if self.active['role'] != 0:
                raise ValueError('hm-10: AT+SLEEP is a peripheral-role command (manual)')
            reply('OK+SLEEP')
            self._enter_sleep()
            return
        if (match := re.fullmatch(r'DELO([12])', body)):
            reply(f'OK+DELO{match[1]}')
            generation = self.boot_generation
            setting = int(match[1])

            def deploy() -> None:
                if generation != self.boot_generation or not self.powered or self.reset_held:
                    return
                self.deployed = setting
                self.reset()

            self.schedule(deploy, 500)
            return
        if (match := re.fullmatch(r'TCON(\?|[0-9]{6})', body)):
            if match[1] == '?':
                reply(f'OK+Get:{str(cfg["retryMs"]).rjust(6, "0")}')
                return
            self._apply_setting('retryMs', int(match[1]))
            reply(f'OK+Set:{match[1]}')
            return
        if (match := re.fullmatch(r'(UUID|CHAR|MARJ|MINO)(\?|0x[0-9A-F]{4})', body)):
            key = {'UUID': 'uuid', 'CHAR': 'characteristic', 'MARJ': 'major', 'MINO': 'minor'}[match[1]]
            if match[2] == '?':
                reply(f'OK+Get:0x{hex_text(cfg[key], 4)}')
                return
            value = int(match[2], 16)
            if not 1 <= value <= 0xfffe:
                invalid(match[1])
            self._apply_setting(key, value)
            reply(f'OK+Set:{match[2]}')
            return
        if (match := re.fullmatch(r'MEAS(\?|0x[0-9A-F]{2})', body)):
            if match[1] == '?':
                reply(f'OK+Get:0x{hex_text(cfg["measuredPower"], 2)}')
                return
            value = int(match[1], 16)
            if value < 1:
                invalid('MEAS')
            self._apply_setting('measuredPower', value)
            reply(f'OK+Set:{match[1]}')
            return
        if (match := re.fullmatch(r'IBE([0-3])(\?|[0-9A-F]{8})', body)):
            offset = int(match[1]) * 8
            if match[2] == '?':
                reply(f'OK+Get:{cfg["beaconUuid"][offset:offset + 8]}')
                return
            if match[2] in ('00000000', 'FFFFFFFF'):
                invalid(f'IBE{match[1]}')
            self._apply_setting('beaconUuid', cfg['beaconUuid'][:offset] + match[2] + cfg['beaconUuid'][offset + 8:])
            reply(f'OK+Set:{match[2]}')
            return
        if (match := re.fullmatch(r'FLAG([0-9A-F]{2})', body)):
            self._apply_setting('advertFlag', int(match[1], 16))
            reply(f'OK+Set:{match[1]}')
            return
        if (match := re.fullmatch(r'(TEMP|HUMI|BATT)(0x[0-9A-F]{2})', body)):
            key = {'TEMP': 'advertTemperature', 'HUMI': 'advertHumidity', 'BATT': 'advertBattery'}[match[1]]
            self._apply_setting(key, int(match[2], 16))
            reply(f'OK+Set:{match[2]}')
            return
        if body == 'TEMP?':
            reply(f'OK+Get:{IC_TEMPERATURE}')
            return
        if body == 'BATT?':
            reply(f'OK+Get:{str(self._battery_percent()).rjust(3, "0")}')
            return
        if (match := re.fullmatch(r'(BEFC|AFTC)(\?|[0-3][0-9A-F]{2})', body)):
            key = 'bootOutputs' if match[1] == 'BEFC' else 'connectedOutputs'
            if match[2] == '?':
                reply(f'OK+Get:{hex_text(cfg[key], 3)}')
                return
            if cfg['mode'] == 1:
                raise ValueError(f'hm-10: AT+{match[1]} must not be used with MODE1 (manual)')
            self._apply_setting(key, int(match[2], 16))
            reply(f'OK+Set:{match[2]}')
            return
        if (match := re.fullmatch(r'CYC(\?\?|[0-9]{2})', body)):
            if match[1] == '??':
                reply(f'OK+Get:{str(cfg["collectionSeconds"]).rjust(2, "0")}')
                return
            self._apply_setting('collectionSeconds', int(match[1]))
            reply(f'OK+Set:{match[1]}')
            return
        if (match := re.fullmatch(r'(PASS|PIN)(\?|[0-9]{6})', body)):
            if match[2] == '?':
                reply(f'OK+Get:{cfg["pin"]}' if match[1] == 'PASS' else f'OK+PIN:{cfg["pin"]}')
                return
            self._apply_setting('pin', match[2])
            reply(f'OK+Set:{match[2]}')
            return
        if (match := re.fullmatch(r'(ALLO|ID)([1-3])([0-9A-F]{12})', body)):
            whitelist = list(cfg['whitelist'])
            whitelist[int(match[2]) - 1] = match[3]
            self._apply_setting('whitelist', whitelist)
            reply(f'OK+Set:{match[3]}')
            return
        if (match := re.fullmatch(r'AD([1-3])\?\?', body)):
            reply(f'OK+Get:{cfg["whitelist"][int(match[1]) - 1]}')
            return
        if (match := re.fullmatch(r'ADC([3-9AB])\?', body)):
            volts = min(3.3, max(0, self._read_pio_voltage(int(match[1], 16))))
            reply(f'OK+ADC{match[1]}:{to_fixed_2(volts)}')
            return
        if body == 'COL??':
            reply(f'OK+Col:{hex_text(self._collect_inputs(), 2)}')
            return
        if body == 'PIO??':
            value = 0
            for pin in range(2, 12):
                if self._pio_level(pin) != '0':
                    value |= 0x800 >> pin
            reply(f'OK+PIO?:{hex_text(value, 4)}')
            return
        if (match := re.fullmatch(r'PIO([2-9AB])(\?|[0-9])', body)):
            pin = int(match[1], 16)
            if match[2] == '?':
                reply(f'OK+PIO{match[1]}:{self._pio_level(pin)}')
                return
            setting = int(match[2])
            if setting > 1 and pin != 2:
                invalid(f'PIO{match[1]}')
            if self.active['mode'] == 1 and pin >= 4:
                raise ValueError(f'hm-10: PIO{match[1]} is a MODE1 collection input')
            if setting > 1:
                self._start_pwm(setting)
            else:
                self._set_pio(pin, setting == 1)
            reply(f'OK+PIO{match[1]}:{setting}')
            return
        if body == 'RSSI?':
            if source != 'remote':
                raise ValueError('hm-10: AT+RSSI? is answered only to a connected remote in MODE1/2 (manual)')
            reply(f'OK+RSSI:{rssi_field(self.peer.rssi)}')
            return
        if body in ('DISC?', 'DISI?'):
            self._require_central_command(command, source)
            generation = self.boot_generation

            def out(value: str) -> None:
                self._uart_reply(value, generation)

            if body == 'DISC?':
                reply('OK+DISCS')

                def found(peer: Partner) -> None:
                    out(f'OK+DIS{peer.address_type}:{peer.address}')
                    if self.active['showNames'] == 1:
                        out(f'OK+NAME:{peer.name}\r\n')

                self._discover(found, lambda: out('OK+DISCE'))
            else:
                reply('OK+DISIS')
                self._discover(lambda peer: out(f'OK+DISC:00000000:{"0" * 32}:{"0" * 10}:{peer.address}:{rssi_field(peer.rssi)}'),
                               lambda: out('OK+DISCE'))
            return
        if (match := re.fullmatch(r'CO([N012])([0-9A-F]{12})', body)):
            self._require_central_command(command, source)
            prefix = 'OK+CONN' if match[1] == 'N' else f'OK+CO{match[1]}{match[1]}'
            generation = self.boot_generation
            reply(f'{prefix}A')
            self._central_connect(match[2], None if match[1] == 'N' else int(match[1]),
                                  lambda status: self._uart_reply(f'{prefix}{status}', generation))
            return
        if body == 'CONNL':
            self._require_central_command(command, source)
            if cfg['lastAddress'] is None:
                reply('OK+CONNN')
                return
            generation = self.boot_generation
            reply('OK+CONNL')
            self._central_connect(cfg['lastAddress'], None, lambda status: self._uart_reply(f'OK+CONN{status}', generation))
            return
        if (match := re.fullmatch(r'CONN([0-5])', body)):
            self._require_central_command(command, source)
            index = int(match[1])
            peer = self.discovered[index] if index < len(self.discovered) else None
            self.discovered = []
            self.scan_generation += 1
            if not peer:
                reply('OK+CONNE')
                return
            generation = self.boot_generation
            reply(f'OK+CONN{match[1]}')
            self._central_connect(peer.address, None, lambda status: self._uart_reply(f'OK+CONN{status}', generation))
            return
        raise ValueError(f'hm-10 V545: unknown command {json.dumps(command)}')
