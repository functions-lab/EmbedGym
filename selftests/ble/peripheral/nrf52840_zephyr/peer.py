import asyncio

from bumble.att import ATT_Error
from bumble.core import UUID, AdvertisingData, BaseBumbleError
from bumble.device import Peer
from bumble.gatt import GATT_CLIENT_CHARACTERISTIC_CONFIGURATION_DESCRIPTOR
from embedgym_ble import BlePeer, action, check

NAME = b"GYM-PERIPH"
SERVICE = UUID("00001000-7a6c-4e1d-9b0f-5c3a2e1d0f00")
LED = UUID("00001001-7a6c-4e1d-9b0f-5c3a2e1d0f00")
COUNTER = UUID("00001002-7a6c-4e1d-9b0f-5c3a2e1d0f00")


class PhonePeer(BlePeer):
    """The phone: finds the device by name and drives its LED service."""

    def setup(self):
        self.connection = None
        self.led = None
        self.counter = None
        # Outcome of the last action: "pending" while it runs, then "ok" or
        # what went wrong on the device's side.
        self.result = ""
        self.led_read = ""
        self.counts = []
        # len(counts) when the device acknowledged notifications off.
        self.counts_at_disable = None
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

    def run(self, operation):
        self.result = "pending"
        self.spawn(self.attempt(operation))

    def run_connected(self, operation, *args):
        if self.led is None:
            self.result = "not connected"
            return
        self.run(operation(*args))

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
        services = await Peer(connection).discover_service(SERVICE)
        if not services:
            return "no service"
        await services[0].discover_characteristics()
        led = services[0].get_characteristics_by_uuid(LED)
        counter = services[0].get_characteristics_by_uuid(COUNTER)
        if not led or not counter:
            return "missing characteristic"
        self.led, self.counter = led[0], counter[0]
        return "ok"

    def on_disconnection(self, reason):
        self.connection = self.led = self.counter = None
        self.disconnects += 1

    def on_count(self, value):
        self.counts.append(int.from_bytes(value, "little") if len(value) == 4 else None)

    async def read_led(self):
        self.led_read = (await self.led.read_value()).hex()
        return "ok"

    async def write_led(self, value):
        await self.led.write_value(value, with_response=True)
        return "ok"

    async def subscribe_counter(self):
        await self.counter.subscribe(self.on_count)
        return "ok"

    async def disable_notifications(self):
        # Writes the CCCD itself: Bumble's unsubscribe() would also drop
        # on_count, hiding any notification that still arrives.
        if not self.counter.descriptors_discovered:
            await self.counter.discover_descriptors()
        cccd = self.counter.get_descriptor(GATT_CLIENT_CHARACTERISTIC_CONFIGURATION_DESCRIPTOR)
        if cccd is None:
            return "no cccd"
        await cccd.write_value(b"\x00\x00", with_response=True)
        self.counts_at_disable = len(self.counts)
        return "ok"

    async def close(self):
        await self.connection.disconnect()
        return "ok"

    @action
    def connect(self):
        if self.connection is not None:
            self.result = "already connected"
            return
        self.run(self.open())

    @action
    def read(self):
        self.run_connected(self.read_led)

    @action
    def led_on(self):
        self.run_connected(self.write_led, b"\x01")

    @action
    def led_off(self):
        self.run_connected(self.write_led, b"\x00")

    @action
    def led_bad(self):
        self.run_connected(self.write_led, b"\x02")

    @action
    def subscribe(self):
        self.run_connected(self.subscribe_counter)

    @action
    def notify_off(self):
        self.run_connected(self.disable_notifications)

    @action
    def disconnect(self):
        if self.connection is None:
            self.result = "not connected"
            return
        self.run(self.close())

    @check
    def counts_in_order(self):
        """Every notification is a uint32 one above the one before it."""
        return None not in self.counts and all(b == a + 1 for a, b in zip(self.counts, self.counts[1:]))

    def state(self):
        return {
            "connected": self.connection is not None,
            "ready": self.led is not None,
            "result": self.result,
            "led_read": self.led_read,
            "notifications": len(self.counts),
            "last_count": self.counts[-1] if self.counts and self.counts[-1] is not None else -1,
            # Notifications that arrived after notify_off was acknowledged; -1 before that.
            "after_disable": -1 if self.counts_at_disable is None else len(self.counts) - self.counts_at_disable,
            "disconnects": self.disconnects,
        }
