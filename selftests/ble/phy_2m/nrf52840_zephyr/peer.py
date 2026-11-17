import asyncio

from bumble.att import ATT_Error, ATT_Handle_Value_Confirmation
from bumble.core import UUID, AdvertisingData, BaseBumbleError
from bumble.device import Peer
from bumble.gatt import GATT_CLIENT_CHARACTERISTIC_CONFIGURATION_DESCRIPTOR
from bumble.hci import Phy
from embedgym_ble import BlePeer, action, check

NAME = b"GYM-PHY"
SERVICE = UUID("0000c000-7a6c-4e1d-9b0f-5c3a2e1d0f00")
COUNTER = UUID("0000c001-7a6c-4e1d-9b0f-5c3a2e1d0f00")
PHY = UUID("0000c002-7a6c-4e1d-9b0f-5c3a2e1d0f00")
CCCD_NOTIFY = b"\x01\x00"


class PhonePeer(BlePeer):
    """The phone: connects by name, turns on the device's counter
    notifications by writing the CCCD, and moves the link between 1M and 2M
    itself (LE Set PHY) or asks the device to (a write to its PHY
    characteristic). It records every notification and indication PDU, and
    the PHY its controller reports after every completed update."""

    def setup(self):
        self.connection = None
        self.client = None
        self.counter = None
        self.phy_char = None
        # Outcome of the last action: "pending" while it runs, then "ok" or
        # what went wrong on the device's side.
        self.result = ""
        self.properties = 0
        # Counter notifications in arrival order (None for a value not 4 bytes long).
        self.counts = []
        # Indications, and notifications on any other handle.
        self.indications = 0
        self.foreign = 0
        # The link's PHY in each direction as the phone's controller reports it; 0 before connect.
        self.phy_tx = 0
        self.phy_rx = 0
        self.phy_updates = 0
        self.phy_failures = 0
        # len(counts) at the last completed PHY update.
        self.counts_at_update = 0

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
        if self.phy_char is None:
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
        connection.on("connection_phy_update", self.on_phy_update)
        connection.on("connection_phy_update_failure", self.on_phy_update_failure)
        self.connection = connection
        self.client = connection.gatt_client
        # Bumble's GATT client looks up the handler of every PDU by name on
        # the instance; these replace its own, so that values count by the PDU
        # that carried them, from connection on.
        self.client.on_att_handle_value_notification = self.on_notification
        self.client.on_att_handle_value_indication = self.on_indication
        phy = await connection.get_phy()
        self.phy_tx, self.phy_rx = phy.tx_phy, phy.rx_phy
        services = await Peer(connection).discover_service(SERVICE)
        if not services:
            return "no service"
        await services[0].discover_characteristics()
        counter = services[0].get_characteristics_by_uuid(COUNTER)
        phy_char = services[0].get_characteristics_by_uuid(PHY)
        if not counter or not phy_char:
            return "missing characteristic"
        self.counter = counter[0]
        self.properties = int(self.counter.properties)
        await self.counter.discover_descriptors()
        cccd = self.counter.get_descriptor(GATT_CLIENT_CHARACTERISTIC_CONFIGURATION_DESCRIPTOR)
        if cccd is None:
            return "no cccd"
        await cccd.write_value(CCCD_NOTIFY, with_response=True)
        self.phy_char = phy_char[0]
        return "ok"

    def on_disconnection(self, reason):
        self.connection = self.client = self.counter = self.phy_char = None

    def on_phy_update(self, phy):
        self.phy_tx, self.phy_rx = phy.tx_phy, phy.rx_phy
        self.phy_updates += 1
        self.counts_at_update = len(self.counts)

    def on_phy_update_failure(self, error):
        self.phy_failures += 1

    def on_notification(self, notification):
        if self.counter is None or notification.attribute_handle != self.counter.handle:
            self.foreign += 1
            return
        value = notification.attribute_value
        self.counts.append(int.from_bytes(value, "little") if len(value) == 4 else None)

    def on_indication(self, indication):
        self.indications += 1
        self.client.send_confirmation(ATT_Handle_Value_Confirmation())

    async def set_phy(self, phys):
        # Returns at the controller's command status; the update completes later.
        await self.connection.set_phy(tx_phys=phys, rx_phys=phys)
        return "ok"

    async def ask_board(self, phy):
        await self.phy_char.write_value(bytes([phy]), with_response=True)
        return "ok"

    @action
    def connect(self):
        if self.connection is not None:
            self.result = "already connected"
            return
        self.run(self.open())

    @action
    def phone_2m(self):
        # 1M stays allowed so that the device can move the link back to 1M:
        # each controller keeps the PHYs it last asked for, and the central
        # picks 2M first.
        self.run_connected(self.set_phy, [Phy.LE_1M, Phy.LE_2M])

    @action
    def phone_1m(self):
        self.run_connected(self.set_phy, [Phy.LE_1M])

    @action
    def board_2m(self):
        self.run_connected(self.ask_board, 2)

    @action
    def board_1m(self):
        self.run_connected(self.ask_board, 1)

    @check
    def counts_in_order(self):
        """Every notification is a uint32 one above the one before it, from 1."""
        return self.counts == list(range(1, len(self.counts) + 1))

    def state(self):
        return {
            "connected": self.connection is not None,
            "result": self.result,
            "properties": self.properties,
            "indications": self.indications,
            "foreign": self.foreign,
            "notifications": len(self.counts),
            "last_count": self.counts[-1] if self.counts and self.counts[-1] is not None else -1,
            "phy_tx": int(self.phy_tx),
            "phy_rx": int(self.phy_rx),
            "phy_updates": self.phy_updates,
            "phy_failures": self.phy_failures,
            # Notifications since the last completed PHY update.
            "since_update": len(self.counts) - self.counts_at_update,
        }
