import asyncio

from bumble.att import ATT_Error, ATT_Handle_Value_Confirmation
from bumble.core import UUID, AdvertisingData, BaseBumbleError
from bumble.device import Peer
from bumble.gatt import GATT_CLIENT_CHARACTERISTIC_CONFIGURATION_DESCRIPTOR
from embedgym_ble import BlePeer, action, check

NAME = b"GYM-IND"
SERVICE = UUID("0000a000-7a6c-4e1d-9b0f-5c3a2e1d0f00")
COUNTER = UUID("0000a001-7a6c-4e1d-9b0f-5c3a2e1d0f00")
CCCD_INDICATE = b"\x02\x00"
CCCD_OFF = b"\x00\x00"


def joined(values):
    return ",".join(str(value) for value in values) or "none"


class PhonePeer(BlePeer):
    """The phone: finds the device by name and turns indications of its
    counter on and off by writing the CCCD. It records every indication and
    notification PDU from connection on, subscribed or not, and confirms each
    indication at once, except that after `hold` it leaves the next one
    unconfirmed until `release`."""

    def setup(self):
        self.connection = None
        self.client = None
        self.counter = None
        self.cccd = None
        # Outcome of the last action: "pending" while it runs, then "ok" or
        # what went wrong on the device's side.
        self.result = ""
        self.properties = 0
        # Counter indications in arrival order (-1 for a value not 4 bytes long),
        # and those the phone has confirmed.
        self.values = []
        self.confirmed = []
        self.notifications = 0
        # Indications and notifications on any other handle.
        self.foreign = 0
        self.hold_next = False
        self.holding = False
        self.held_value = -1
        self.held_ms = -1
        # Value PDUs when indications off was acknowledged; None before that.
        self.pdus_at_disable = None

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
        if self.cccd is None:
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
        self.client = connection.gatt_client
        # Bumble's GATT client looks up the handler of every PDU by name on
        # the instance; these replace its own, which pass values only to
        # subscribers and always confirm at once.
        self.client.on_att_handle_value_indication = self.on_indication
        self.client.on_att_handle_value_notification = self.on_notification
        services = await Peer(connection).discover_service(SERVICE)
        if not services:
            return "no service"
        await services[0].discover_characteristics()
        counter = services[0].get_characteristics_by_uuid(COUNTER)
        if not counter:
            return "missing characteristic"
        self.counter = counter[0]
        self.properties = int(self.counter.properties)
        await self.counter.discover_descriptors()
        self.cccd = self.counter.get_descriptor(GATT_CLIENT_CHARACTERISTIC_CONFIGURATION_DESCRIPTOR)
        if self.cccd is None:
            return "no cccd"
        return "ok"

    def on_disconnection(self, reason):
        self.connection = self.client = self.counter = self.cccd = None

    def on_indication(self, indication):
        if self.counter is None or indication.attribute_handle != self.counter.handle:
            self.foreign += 1
            self.client.send_confirmation(ATT_Handle_Value_Confirmation())
            return
        value = indication.attribute_value
        self.values.append(int.from_bytes(value, "little") if len(value) == 4 else -1)
        if self.hold_next:
            self.hold_next = False
            self.holding = True
            self.held_value = self.values[-1]
            self.held_ms = self.now_ms()
        if not self.holding:
            self.confirm_received()

    def confirm_received(self):
        """Confirms the received indications not confirmed yet, in order."""
        while len(self.confirmed) < len(self.values):
            self.client.send_confirmation(ATT_Handle_Value_Confirmation())
            self.confirmed.append(self.values[len(self.confirmed)])

    def on_notification(self, notification):
        if self.counter is None or notification.attribute_handle != self.counter.handle:
            self.foreign += 1
        else:
            self.notifications += 1

    def value_pdus(self):
        return len(self.values) + self.notifications + self.foreign

    async def enable(self):
        await self.cccd.write_value(CCCD_INDICATE, with_response=True)
        return "ok"

    async def disable(self):
        await self.cccd.write_value(CCCD_OFF, with_response=True)
        self.pdus_at_disable = self.value_pdus()
        return "ok"

    async def release_held(self):
        if not self.holding:
            return "nothing held"
        self.holding = False
        self.confirm_received()
        return "ok"

    @action
    def connect(self):
        if self.connection is not None:
            self.result = "already connected"
            return
        self.run(self.open())

    @action
    def subscribe(self):
        self.run_connected(self.enable)

    @action
    def unsubscribe(self):
        self.run_connected(self.disable)

    @action
    def hold(self):
        """Leaves the next indication unconfirmed until `release`."""
        self.hold_next = True
        self.result = "ok"

    @action
    def release(self):
        self.run_connected(self.release_held)

    @check
    def values_in_order(self):
        """The indications are the uint32 values 1, 2, 3, ... with none missing."""
        return self.values == list(range(1, len(self.values) + 1))

    def state(self):
        return {
            "connected": self.connection is not None,
            "ready": self.cccd is not None,
            "result": self.result,
            "properties": self.properties,
            "indications": len(self.values),
            "notifications": self.notifications,
            "foreign": self.foreign,
            "last_value": self.values[-1] if self.values else -1,
            "received": joined(self.values),
            "confirmed": joined(self.confirmed),
            "holding": self.holding,
            "held_value": self.held_value,
            # When the held indication arrived, on the board's clock; -1 before.
            "held_ms": self.held_ms,
            # Value PDUs after indications off was acknowledged; -1 before that.
            "after_disable": -1 if self.pdus_at_disable is None else self.value_pdus() - self.pdus_at_disable,
        }
