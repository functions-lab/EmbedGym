import asyncio

from bumble.att import ATT_Error
from bumble.core import UUID, AdvertisingData, BaseBumbleError
from bumble.device import Peer
from embedgym_ble import BlePeer, action, check

NAME = b"GYM-LINK"
SERVICE = UUID("00004000-7a6c-4e1d-9b0f-5c3a2e1d0f00")
TICK = UUID("00004001-7a6c-4e1d-9b0f-5c3a2e1d0f00")
READS = UUID("00004002-7a6c-4e1d-9b0f-5c3a2e1d0f00")
READ_PERIOD_S = 2


def decode(value):
    return int.from_bytes(value, "little") if len(value) == 4 else None


class PhonePeer(BlePeer):
    """The phone: holds one link open, takes the device's 1 s tick
    notifications and reads its read counter every 2 s."""

    def setup(self):
        self.connection = None
        # "pending" until the link is up and subscribed, "ok" while the
        # session runs, then what ended it.
        self.result = ""
        self.ticks = []  # (decoded value, arrival ms)
        self.reads = []  # decoded values
        self.disconnects = 0

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

    async def session(self):
        connection = await self.device.connect(await self.find(NAME))
        connection.on("disconnection", self.on_disconnection)
        self.connection = connection
        services = await Peer(connection).discover_service(SERVICE)
        if not services:
            return "no service"
        await services[0].discover_characteristics()
        tick = services[0].get_characteristics_by_uuid(TICK)
        reads = services[0].get_characteristics_by_uuid(READS)
        if not tick or not reads:
            return "missing characteristic"
        await tick[0].subscribe(self.on_tick)
        self.result = "ok"
        while True:
            await asyncio.sleep(READ_PERIOD_S)
            if self.connection is None:
                return "disconnected"
            self.reads.append(decode(await reads[0].read_value()))

    def on_disconnection(self, reason):
        self.connection = None
        self.disconnects += 1

    def on_tick(self, value):
        self.ticks.append((decode(value), self.now_ms()))

    @action
    def connect(self):
        if self.connection is not None:
            self.result = "already connected"
            return
        self.result = "pending"
        self.spawn(self.attempt(self.session()))

    @check
    def ticks_steady(self):
        """Ticks count 1, 2, 3, ... and arrive 1 s apart, give or take 100 ms."""
        values = [value for value, _ in self.ticks]
        arrivals = [ms for _, ms in self.ticks]
        return values == list(range(1, len(values) + 1)) and all(
            900 <= b - a <= 1100 for a, b in zip(arrivals, arrivals[1:]))

    @check
    def reads_in_order(self):
        """Reads return 1, 2, 3, ..."""
        return self.reads == list(range(1, len(self.reads) + 1))

    def state(self):
        return {
            "connected": self.connection is not None,
            "result": self.result,
            "ticks": len(self.ticks),
            "reads": len(self.reads),
            "disconnects": self.disconnects,
        }
