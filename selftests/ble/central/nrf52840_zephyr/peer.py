from bumble.core import UUID, AdvertisingData
from bumble.device import AdvertisingType
from bumble.gatt import Characteristic, CharacteristicValue, Service
from embedgym_ble import BlePeer, action

NAME = b"GYM-SENSOR"
SERVICE = UUID("00002000-7a6c-4e1d-9b0f-5c3a2e1d0f00")
LEVEL = UUID("00002001-7a6c-4e1d-9b0f-5c3a2e1d0f00")
FIRST_LEVEL = 20


class SensorPeer(BlePeer):
    """The phone as a sensor: advertises its name and serves a one-byte level
    that the device reads, subscribes to and is notified of on every change."""

    def setup(self):
        self.level = FIRST_LEVEL
        self.characteristic = None
        self.connections = 0
        self.disconnects = 0
        self.subscribed = False
        self.reads = 0
        self.pushes = 0

    async def start(self):
        self.characteristic = Characteristic(
            LEVEL,
            Characteristic.Properties.READ | Characteristic.Properties.NOTIFY,
            Characteristic.READABLE,
            CharacteristicValue(read=self.on_read),
        )
        self.characteristic.on("subscription", self.on_subscription)
        self.device.add_service(Service(SERVICE, [self.characteristic]))
        self.device.on("connection", self.on_connection)
        await self.device.start_advertising(
            advertising_type=AdvertisingType.UNDIRECTED_CONNECTABLE_SCANNABLE,
            auto_restart=True,
            advertising_data=bytes(AdvertisingData([
                (AdvertisingData.FLAGS, bytes([
                    AdvertisingData.LE_GENERAL_DISCOVERABLE_MODE_FLAG
                    | AdvertisingData.BR_EDR_NOT_SUPPORTED_FLAG
                ])),
                (AdvertisingData.COMPLETE_LOCAL_NAME, NAME),
            ])),
            advertising_interval_min=100,
            advertising_interval_max=100,
        )

    def on_connection(self, connection):
        self.connections += 1
        connection.on("disconnection", self.on_disconnection)

    def on_disconnection(self, reason):
        self.disconnects += 1
        self.subscribed = False

    def on_subscription(self, connection, notify_enabled, indicate_enabled):
        self.subscribed = notify_enabled

    def on_read(self, connection):
        self.reads += 1
        return bytes([self.level])

    def push(self, level):
        self.level = level
        self.pushes += 1
        self.spawn(self.device.notify_subscribers(self.characteristic, bytes([level])))

    @action
    def level_75(self):
        self.push(75)

    @action
    def level_60(self):
        self.push(60)

    @action
    def level_30(self):
        self.push(30)

    @action
    def level_50(self):
        self.push(50)

    def state(self):
        return {
            "connections": self.connections,
            "disconnects": self.disconnects,
            "subscribed": self.subscribed,
            "reads": self.reads,
            "pushes": self.pushes,
        }
