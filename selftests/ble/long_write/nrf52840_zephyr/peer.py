import asyncio
import zlib

from bumble.att import ATT_Error, ATT_Execute_Write_Request, ATT_Prepare_Write_Request, Opcode
from bumble.core import UUID, AdvertisingData, BaseBumbleError
from bumble.device import Peer
from embedgym_ble import BlePeer, action

NAME = b"GYM-LONGW"
SERVICE = UUID("0000b000-7a6c-4e1d-9b0f-5c3a2e1d0f00")
VALUE = UUID("0000b001-7a6c-4e1d-9b0f-5c3a2e1d0f00")
EXECUTE = 0x01
CANCEL = 0x00


def pattern(seed, length):
    """Byte i is (seed + 31 i + i // 256) & 0xff: no two 18-byte parts alike."""
    return bytes((seed + 31 * i + (i >> 8)) & 0xFF for i in range(length))


# At MTU 23 a part carries 18 bytes: OLD and NEW end on a shorter part,
# CANCELLED and TOO_LONG are whole parts.
OLD = pattern(1, 40)
CANCELLED = pattern(2, 90)
TOO_LONG = pattern(3, 504)
NEW = pattern(4, 500)


class PhonePeer(BlePeer):
    """The phone: at the default ATT MTU of 23, writes values longer than one
    PDU as raw Prepare Write requests of MTU - 5 = 18 bytes each, checking
    that every response echoes its part, and commits or cancels them with
    Execute Write, in the same action or a later one; reads the value back
    with Read and Read Blob."""

    def setup(self):
        self.connection = None
        self.client = None
        self.value = None
        # Outcome of the last action: "pending" while it runs, then "ok" or
        # what went wrong on the device's side.
        self.result = ""
        # Prepare Write responses the last prepare got.
        self.parts = 0
        # Prepare Write responses that did not echo their request.
        self.echo_bad = 0
        # The request opcode the last ATT error answered; 0 for none.
        self.error_op = 0
        self.read_back = b""

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
        if self.value is None:
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
        gatt = Peer(connection)
        services = await gatt.discover_service(SERVICE)
        if not services:
            return "no service"
        await services[0].discover_characteristics()
        value = services[0].get_characteristics_by_uuid(VALUE)
        if not value:
            return "missing characteristic"
        self.client = gatt.gatt_client
        self.value = value[0]
        return "ok"

    def on_disconnection(self, reason):
        self.connection = self.client = self.value = None

    def att_error(self, response):
        self.error_op = int(response.request_opcode_in_error)
        return f"att 0x{response.error_code:02x}"

    async def prepare(self, data):
        """Queues `data` on the device in parts from offset 0."""
        self.parts = 0
        self.error_op = 0
        handle = self.value.handle
        part_size = self.client.mtu - 5
        for offset in range(0, len(data), part_size):
            part = data[offset:offset + part_size]
            response = await self.client.send_request(
                ATT_Prepare_Write_Request(attribute_handle=handle, value_offset=offset, part_attribute_value=part))
            if response.op_code == Opcode.ATT_ERROR_RESPONSE:
                result = self.att_error(response)
                # Drops what the device has queued so far.
                await self.client.send_request(ATT_Execute_Write_Request(flags=CANCEL))
                return result
            self.parts += 1
            if (response.attribute_handle, response.value_offset, bytes(response.part_attribute_value)) != (handle, offset, part):
                self.echo_bad += 1
        return "ok"

    async def execute(self, flags):
        self.error_op = 0
        response = await self.client.send_request(ATT_Execute_Write_Request(flags=flags))
        if response.op_code == Opcode.ATT_ERROR_RESPONSE:
            return self.att_error(response)
        return "ok"

    async def write(self, data, flags):
        result = await self.prepare(data)
        if result != "ok":
            return result
        return await self.execute(flags)

    async def read_stored(self):
        self.read_back = b""
        # Bumble follows a full Read Response with Read Blob requests.
        self.read_back = bytes(await self.value.read_value())
        return "ok"

    @action
    def connect(self):
        if self.connection is not None:
            self.result = "already connected"
            return
        self.run(self.open())

    @action
    def write_old(self):
        self.run_connected(self.write, OLD, EXECUTE)

    @action
    def write_cancelled(self):
        self.run_connected(self.write, CANCELLED, CANCEL)

    @action
    def write_504(self):
        self.run_connected(self.write, TOO_LONG, EXECUTE)

    @action
    def prepare_new(self):
        self.run_connected(self.prepare, NEW)

    @action
    def execute_queued(self):
        """Execute Write committing whatever the device has queued, if anything."""
        self.run_connected(self.execute, EXECUTE)

    @action
    def read(self):
        self.run_connected(self.read_stored)

    def state(self):
        return {
            "connected": self.connection is not None,
            "ready": self.value is not None,
            "result": self.result,
            "mtu": self.client.mtu if self.client is not None else 0,
            "parts": self.parts,
            "echo_bad": self.echo_bad,
            "error_op": self.error_op,
            "read_len": len(self.read_back),
            "read_crc": f"{zlib.crc32(self.read_back):08x}",
        }
