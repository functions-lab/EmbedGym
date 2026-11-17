import asyncio

from bumble.core import UUID, AdvertisingData, BaseBumbleError
from bumble.device import AdvertisingEventProperties, AdvertisingParameters
from bumble.gatt import Characteristic, CharacteristicValue, Service
from bumble.hci import Address
from embedgym_ble import BlePeer, action

SERVICE = UUID("00009000-7a6c-4e1d-9b0f-5c3a2e1d0f00")
VALUE = UUID("00009001-7a6c-4e1d-9b0f-5c3a2e1d0f00")


class Tag:
    """One tag: an advertising set with its own random address and name, and
    the link the device opened to it."""

    def __init__(self, sid, name, address, value):
        self.sid = sid
        self.name = name
        self.address = Address(address)
        self.value = value
        self.connection = None
        self.connections = 0
        self.disconnects = 0
        self.reads = 0
        self.subscribed = False
        # Outcome of the tag's last action: "pending" while it runs, then
        # "ok" or what went wrong.
        self.result = ""


class TagsPeer(BlePeer):
    """The phone as two sensor tags, A and B: two connectable advertising sets
    over one GATT database. A read or notification of the value carries the
    value of the tag whose link it goes over. `drop_a` hangs up A's link; A
    advertises again once the phone's controller reports the link closed, up
    to the link's supervision timeout later (the controller can miss the one
    event in which the device acknowledges the hang-up)."""

    def setup(self):
        self.tags = {
            "a": Tag(0, b"GYM-TAG-A", "C1:00:00:00:00:01", 11),
            "b": Tag(1, b"GYM-TAG-B", "C1:00:00:00:00:02", 22),
        }
        self.characteristic = None
        # Links, reads and subscriptions on no tag's address.
        self.strays = 0

    async def start(self):
        self.characteristic = Characteristic(
            VALUE,
            Characteristic.Properties.READ | Characteristic.Properties.NOTIFY,
            Characteristic.READABLE,
            CharacteristicValue(read=self.on_read),
        )
        self.characteristic.on("subscription", self.on_subscription)
        self.device.add_service(Service(SERVICE, [self.characteristic]))
        self.device.on("connection", self.on_connection)
        for tag in self.tags.values():
            await self.device.create_advertising_set(
                random_address=tag.address,
                advertising_parameters=AdvertisingParameters(
                    advertising_event_properties=AdvertisingEventProperties(
                        is_connectable=True, is_scannable=True, is_legacy=True),
                    primary_advertising_interval_min=100,
                    primary_advertising_interval_max=100,
                    advertising_sid=tag.sid,
                ),
                advertising_data=bytes(AdvertisingData([
                    (AdvertisingData.FLAGS, bytes([
                        AdvertisingData.LE_GENERAL_DISCOVERABLE_MODE_FLAG
                        | AdvertisingData.BR_EDR_NOT_SUPPORTED_FLAG
                    ])),
                    (AdvertisingData.COMPLETE_LOCAL_NAME, tag.name),
                ])),
                auto_restart=True,
            )

    def tag_of(self, connection):
        """The tag whose advertising set the link came in on: Bumble gives
        the link that set's random address as its own."""
        for tag in self.tags.values():
            if connection.self_address == tag.address:
                return tag
        self.strays += 1
        return None

    def on_connection(self, connection):
        tag = self.tag_of(connection)
        if tag is None:
            return
        tag.connection = connection
        tag.connections += 1
        connection.on("disconnection", lambda reason: self.on_disconnection(tag))

    def on_disconnection(self, tag):
        tag.connection = None
        tag.disconnects += 1
        tag.subscribed = False

    def on_subscription(self, connection, notify_enabled, indicate_enabled):
        tag = self.tag_of(connection)
        if tag is not None:
            tag.subscribed = notify_enabled

    def on_read(self, connection):
        tag = self.tag_of(connection)
        if tag is None:
            return b""
        tag.reads += 1
        return bytes([tag.value])

    async def attempt(self, tag, operation):
        try:
            await operation
            tag.result = "ok"
        except BaseBumbleError as error:
            tag.result = str(error)
        except asyncio.CancelledError:
            # Bumble cancels pending work on a link when it drops.
            tag.result = "disconnected"

    def run(self, tag, operation):
        tag.result = "pending"
        self.spawn(self.attempt(tag, operation))

    def bump(self, tag):
        if tag.connection is None:
            tag.result = "not connected"
            return
        tag.value += 1
        self.run(tag, self.device.notify_subscriber(tag.connection, self.characteristic, bytes([tag.value])))

    @action
    def bump_a(self):
        self.bump(self.tags["a"])

    @action
    def bump_b(self):
        self.bump(self.tags["b"])

    @action
    def drop_a(self):
        tag = self.tags["a"]
        if tag.connection is None:
            tag.result = "not connected"
            return
        self.run(tag, tag.connection.disconnect())

    def state(self):
        values = {"strays": self.strays, "links": len(self.device.connections)}
        for key, tag in self.tags.items():
            values.update({
                f"{key}_result": tag.result,
                f"{key}_connected": tag.connection is not None,
                f"{key}_connections": tag.connections,
                f"{key}_disconnects": tag.disconnects,
                f"{key}_reads": tag.reads,
                f"{key}_subscribed": tag.subscribed,
            })
        return values
