import asyncio

from bumble.att import ATT_Error
from bumble.core import UUID, AdvertisingData, BaseBumbleError
from bumble.device import Peer
from embedgym_ble import BlePeer, action, check

NAME = b"GYM-BULK"
SERVICE = UUID("00005000-7a6c-4e1d-9b0f-5c3a2e1d0f00")
SINK = UUID("00005001-7a6c-4e1d-9b0f-5c3a2e1d0f00")
BLOB = UUID("00005002-7a6c-4e1d-9b0f-5c3a2e1d0f00")
STREAM = UUID("00005003-7a6c-4e1d-9b0f-5c3a2e1d0f00")
BURST = UUID("00005004-7a6c-4e1d-9b0f-5c3a2e1d0f00")
MTU = 247
STREAM_WRITES = 10
BURST_COUNT = 20


def sink_value(k):
    """The k-th 240-byte value written to the sink (k = 0 is the acknowledged write)."""
    return bytes((k * 31 + i * 7 + 1) & 0xFF for i in range(240))


BLOB_VALUE = bytes((i * 7 + 3) & 0xFF for i in range(400))


def stream_value(seq):
    return bytes([seq]) + bytes((seq + 11 * j) & 0xFF for j in range(1, MTU - 3))


class PhonePeer(BlePeer):
    """The phone: raises the ATT MTU, writes 240-byte values (acknowledged and
    back to back), long-reads a 400-byte value and takes a notification burst."""

    def setup(self):
        self.connection = None
        self.gatt = None
        self.sink = self.blob = self.burst = None
        # Outcome of the last action: "pending" while it runs, then "ok" or
        # what went wrong on the device's side.
        self.result = ""
        self.mtu = 0
        self.writes = 0
        self.blob_value = b""
        self.notifications = []

    async def attempt(self, operation):
        try:
            self.result = await operation
        except ATT_Error as error:
            self.result = f"att 0x{error.error_code:02x}"
        except BaseBumbleError as error:
            self.result = str(error)
        except asyncio.CancelledError:
            # Bumble cancels a pending GATT request when the link drops.
            self.result = "disconnected"

    def run(self, operation):
        self.result = "pending"
        self.spawn(self.attempt(operation))

    def run_connected(self, operation):
        if self.sink is None:
            self.result = "not connected"
            return
        self.run(operation())

    async def find(self, name):
        found = asyncio.get_running_loop().create_future()

        def on_advertisement(advertisement):
            if not found.done() and advertisement.data.get(AdvertisingData.COMPLETE_LOCAL_NAME, raw=True) == name:
                found.set_result(advertisement.address)

        self.device.on("advertisement", on_advertisement)
        await self.device.start_scanning(filter_duplicates=True)
        try:
            return await found
        finally:
            self.device.remove_listener("advertisement", on_advertisement)
            await self.device.stop_scanning()

    async def open(self):
        connection = await self.device.connect(await self.find(NAME))
        connection.on("disconnection", self.on_disconnection)
        self.connection = connection
        self.gatt = Peer(connection)
        services = await self.gatt.discover_service(SERVICE)
        if not services:
            return "no service"
        await services[0].discover_characteristics()
        found = [services[0].get_characteristics_by_uuid(uuid) for uuid in (SINK, BLOB, STREAM, BURST)]
        if not all(found):
            return "missing characteristic"
        sink, blob, stream, burst = (characteristics[0] for characteristics in found)
        await stream.subscribe(self.on_stream)
        self.sink, self.blob, self.burst = sink, blob, burst
        return "ok"

    def on_disconnection(self, reason):
        self.connection = self.gatt = None
        self.sink = self.blob = self.burst = None

    def on_stream(self, value):
        self.notifications.append(bytes(value))

    async def exchange_mtu(self):
        self.mtu = await self.gatt.request_mtu(MTU)
        return "ok"

    async def write_one(self):
        await self.sink.write_value(sink_value(0), with_response=True)
        self.writes += 1
        return "ok"

    async def write_stream(self):
        for k in range(1, STREAM_WRITES + 1):
            await self.sink.write_value(sink_value(k))
            self.writes += 1
        return "ok"

    async def read_blob(self):
        self.blob_value = await self.blob.read_value()
        return "ok"

    async def start_burst(self):
        await self.burst.write_value(bytes([BURST_COUNT]), with_response=True)
        return "ok"

    @action
    def connect(self):
        if self.connection is not None:
            self.result = "already connected"
            return
        self.run(self.open())

    @action
    def mtu_247(self):
        self.run_connected(self.exchange_mtu)

    @action
    def write(self):
        self.run_connected(self.write_one)

    @action
    def stream(self):
        self.run_connected(self.write_stream)

    @action
    def read(self):
        self.run_connected(self.read_blob)

    @action
    def burst_20(self):
        self.run_connected(self.start_burst)

    @check
    def blob_ok(self):
        return self.blob_value == BLOB_VALUE

    @check
    def burst_ok(self):
        """The burst arrived complete, in order, byte for byte."""
        return self.notifications == [stream_value(seq) for seq in range(BURST_COUNT)]

    def state(self):
        data_length = self.connection.data_length if self.connection is not None else None
        return {
            "connected": self.connection is not None,
            "result": self.result,
            "mtu": self.mtu,
            "dle_tx": data_length.max_tx_octets if data_length else 0,
            "dle_rx": data_length.max_rx_octets if data_length else 0,
            "writes": self.writes,
            "blob_len": len(self.blob_value),
            "notifications": len(self.notifications),
        }
