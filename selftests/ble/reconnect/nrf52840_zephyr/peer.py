import asyncio

from bumble.att import ATT_Error
from bumble.core import UUID, AdvertisingData, BaseBumbleError
from bumble.device import Peer
from embedgym_ble import BlePeer, action

NAME = b"GYM-RECONN"
SERVICE = UUID("00003000-7a6c-4e1d-9b0f-5c3a2e1d0f00")
KICK = UUID("00003001-7a6c-4e1d-9b0f-5c3a2e1d0f00")


class PhonePeer(BlePeer):
    """The phone: connects by name, hangs up itself (`drop`) or asks the
    device to hang up (`kick`), and counts both sides of every link."""

    def setup(self):
        self.connection = None
        self.kick_char = None
        # Outcome of the last action: "pending" while it runs, then "ok" or
        # what went wrong on the device's side.
        self.result = ""
        self.connects = 0
        self.disconnects = 0
        self.last_reason = 0

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
        self.connects += 1
        services = await Peer(connection).discover_service(SERVICE)
        if not services:
            return "no service"
        await services[0].discover_characteristics()
        kick = services[0].get_characteristics_by_uuid(KICK)
        if not kick:
            return "missing characteristic"
        self.kick_char = kick[0]
        return "ok"

    def on_disconnection(self, reason):
        self.connection = self.kick_char = None
        self.disconnects += 1
        self.last_reason = reason

    async def close(self):
        await self.connection.disconnect()
        return "ok"

    async def write_kick(self):
        await self.kick_char.write_value(b"\x01", with_response=True)
        return "ok"

    @action
    def connect(self):
        if self.connection is not None:
            self.result = "already connected"
            return
        self.run(self.open())

    @action
    def drop(self):
        if self.connection is None:
            self.result = "not connected"
            return
        self.run(self.close())

    @action
    def kick(self):
        if self.kick_char is None:
            self.result = "not connected"
            return
        self.run(self.write_kick())

    def state(self):
        return {
            "connected": self.connection is not None,
            "result": self.result,
            "connects": self.connects,
            "disconnects": self.disconnects,
            "last_reason": self.last_reason,
        }
