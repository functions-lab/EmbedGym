import asyncio

from bumble.core import AdvertisingData, BaseBumbleError
from embedgym_ble import BlePeer, action

NAME = b"GYM-VANISH"


class PhonePeer(BlePeer):
    """The phone: connects by name, hangs up (`disconnect`) or vanishes
    (`vanish`: its controller resets, so the link ends without
    LL_TERMINATE_IND and the board sees a supervision timeout). The reset
    keeps the phone's address, which is a Device() argument."""

    def setup(self):
        self.connection = None
        self.vanishing = False
        # Outcome of the last action: "pending" while it runs, then "ok" or
        # what went wrong.
        self.result = ""
        self.connects = 0
        self.disconnects = 0
        self.vanishes = 0
        self.last_reason = 0

    async def attempt(self, operation):
        try:
            self.result = await operation
        except BaseBumbleError as error:
            self.result = str(error)

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
        return "ok"

    def on_disconnection(self, reason):
        self.connection = None
        # Bumble ends a link it loses to the reset in its host only.
        if self.vanishing:
            self.vanishes += 1
        else:
            self.disconnects += 1
            self.last_reason = reason

    async def hang_up(self):
        await self.connection.disconnect()
        return "ok"

    async def disappear(self):
        self.vanishing = True
        try:
            await self.device.power_on()
        finally:
            self.vanishing = False
        return "ok"

    @action
    def connect(self):
        if self.connection is not None:
            self.result = "already connected"
            return
        self.run(self.open())

    @action
    def disconnect(self):
        if self.connection is None:
            self.result = "not connected"
            return
        self.run(self.hang_up())

    @action
    def vanish(self):
        if self.connection is None:
            self.result = "not connected"
            return
        self.run(self.disappear())

    def state(self):
        return {
            "connected": self.connection is not None,
            "result": self.result,
            "connects": self.connects,
            "disconnects": self.disconnects,
            "vanishes": self.vanishes,
            "last_reason": self.last_reason,
        }
