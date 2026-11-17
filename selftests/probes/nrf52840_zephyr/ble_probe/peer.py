"""ble_probe.py's phone: finds "GYM Probe" by name, connects, subscribes to
COUNTER and counts its notifications, then raises the MTU to 247 and the data
length to 251 and subscribes to BURST. led_on / led_off write LED; bulk sends
20 frames of 244 bytes to BULK without response; burst asks for 20 such
frames back as BURST notifications; fail raises. What the board gets wrong (a
missing service or characteristic, an ATT error, a malformed notification)
goes into `problems`, never raises."""
import asyncio

from bumble.att import ATT_Error
from bumble.core import UUID, AdvertisingData
from bumble.device import Peer
from bumble.hci import HCI_LE_1M_PHY

from embedgym_ble import BlePeer, action, check

NAME = 'GYM Probe'
SERVICE = UUID('5f1e0000-7a3c-4b8e-9d21-0c4f6a8b2e10')
LED = UUID('5f1e0001-7a3c-4b8e-9d21-0c4f6a8b2e10')
COUNTER = UUID('5f1e0002-7a3c-4b8e-9d21-0c4f6a8b2e10')
BULK = UUID('5f1e0003-7a3c-4b8e-9d21-0c4f6a8b2e10')
BURST = UUID('5f1e0004-7a3c-4b8e-9d21-0c4f6a8b2e10')
CHARACTERISTICS = {LED: 'LED', COUNTER: 'COUNTER', BULK: 'BULK', BURST: 'BURST'}
MTU = 247
DATA_LENGTH = (251, 2120)  # octets, µs
COUNTER_LEN = 4
FRAME_LEN = 244
FRAMES = 20


def frame(first: int) -> bytes:
    return bytes((first + i) & 0xFF for i in range(FRAME_LEN))


class Phone(BlePeer):
    def setup(self):
        self.connection = None
        self.characteristics = {}
        self.problems = []
        self.connected_ms = -1.0
        self.subscribed_ms = -1.0
        self.notifications = 0
        self.last_value = 0
        self.gaps = 0
        self.writes = 0
        self.written_ms = -1.0
        self.mtu = 0
        self.bulk_sent = 0
        self.burst_good = 0
        self.burst_bad = 0

    def state(self):
        data_length = self.connection.data_length if self.connection is not None else None
        return {
            'connected_ms': self.connected_ms,
            'subscribed_ms': self.subscribed_ms,
            'notifications': self.notifications,
            'last_value': self.last_value,
            'gaps': self.gaps,
            'writes': self.writes,
            'written_ms': self.written_ms,
            'mtu': self.mtu,
            'tx_octets': data_length.max_tx_octets if data_length else 0,
            'rx_octets': data_length.max_rx_octets if data_length else 0,
            'bulk_sent': self.bulk_sent,
            'burst_good': self.burst_good,
            'burst_bad': self.burst_bad,
            'problems': len(self.problems),
            'problem': self.problems[0] if self.problems else '',
        }

    async def start(self):
        found = asyncio.get_running_loop().create_future()

        def on_advertisement(advertisement):
            if advertisement.data.get(AdvertisingData.Type.COMPLETE_LOCAL_NAME) == NAME and not found.done():
                found.set_result(advertisement.address)

        self.device.on('advertisement', on_advertisement)
        # The radio model has one PHY; a Coded scan window would only halve the scan.
        await self.device.start_scanning(scanning_phys=[HCI_LE_1M_PHY])
        address = await found
        await self.device.stop_scanning()
        self.connection = await self.device.connect(address)
        self.connected_ms = self.now_ms()
        peer = Peer(self.connection)
        try:
            await self.discover(peer)
            if len(self.characteristics) < len(CHARACTERISTICS):
                return  # discover() recorded what is missing
            await peer.subscribe(self.characteristics[COUNTER], self.on_counter)
            self.subscribed_ms = self.now_ms()
            self.mtu = await peer.request_mtu(MTU)
            await self.connection.set_data_length(*DATA_LENGTH)
            await peer.subscribe(self.characteristics[BURST], self.on_burst)
        except ATT_Error as error:
            self.problems.append(f'setup: ATT error {error.error_name}')

    async def discover(self, peer):
        await peer.discover_services([SERVICE])
        services = peer.get_services_by_uuid(SERVICE)
        if not services:
            self.problems.append('no probe service')
            return
        await services[0].discover_characteristics()
        for uuid, name in CHARACTERISTICS.items():
            found = services[0].get_characteristics_by_uuid(uuid)
            if found:
                self.characteristics[uuid] = found[0]
            else:
                self.problems.append(f'no {name} characteristic')

    def on_counter(self, value):
        value = bytes(value)
        if len(value) != COUNTER_LEN:
            self.problems.append(f'COUNTER notification of {len(value)} bytes')
            return
        n = int.from_bytes(value, 'little')
        if n != self.last_value + 1:
            self.gaps += 1
        self.last_value = n
        self.notifications += 1

    def on_burst(self, value):
        value = bytes(value)
        if value == frame(self.burst_good + self.burst_bad):
            self.burst_good += 1
        else:
            self.burst_bad += 1

    async def write(self, uuid, value, with_response):
        """Writes a characteristic of the board's; False when it can't."""
        if uuid not in self.characteristics:
            self.problems.append(f'{CHARACTERISTICS[uuid]} write without the characteristic')
            return False
        try:
            await self.characteristics[uuid].write_value(value, with_response=with_response)
        except ATT_Error as error:
            self.problems.append(f'{CHARACTERISTICS[uuid]} write: ATT error {error.error_name}')
            return False
        return True

    async def write_led(self, on):
        if await self.write(LED, bytes([on]), True):
            self.writes += 1
            self.written_ms = self.now_ms()

    async def write_bulk(self):
        for first in range(FRAMES):
            if not await self.write(BULK, frame(first), False):
                return
            self.bulk_sent += 1

    @action
    def led_on(self):
        self.spawn(self.write_led(1))

    @action
    def led_off(self):
        self.spawn(self.write_led(0))

    @action
    def bulk(self):
        self.spawn(self.write_bulk())

    @action
    def burst(self):
        self.spawn(self.write(BURST, bytes([FRAMES]), True))

    @action
    def fail(self):
        raise RuntimeError('probe fail')

    @check
    def linked(self):
        return self.subscribed_ms >= 0
