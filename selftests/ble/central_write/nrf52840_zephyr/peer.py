import zlib

from bumble.att import ATT_Error, ErrorCode
from bumble.core import UUID, AdvertisingData
from bumble.device import AdvertisingType
from bumble.gatt import GATT_CLIENT_CHARACTERISTIC_CONFIGURATION_DESCRIPTOR, Characteristic, CharacteristicValue, Service
from embedgym_ble import BlePeer, action

NAME = b"GYM-LOGGER"
SERVICE = UUID("00008000-7a6c-4e1d-9b0f-5c3a2e1d0f00")
COMMAND = UUID("00008001-7a6c-4e1d-9b0f-5c3a2e1d0f00")
LOG = UUID("00008002-7a6c-4e1d-9b0f-5c3a2e1d0f00")
FEED = UUID("00008003-7a6c-4e1d-9b0f-5c3a2e1d0f00")
NOTE = UUID("00008004-7a6c-4e1d-9b0f-5c3a2e1d0f00")
# What a command notification asks the device to write.
ASK_LOG, ASK_FEED, ASK_NOTE = 1, 2, 3
# Bytes an ATT PDU spends before the written value: opcode and handle, and in
# a prepared write the offset too.
WRITE_HEADER = 3
PREPARE_HEADER = 5
EXECUTE_COMMIT = 1


def joined(values):
    """Records as one string, in arrival order: ASCII as is, other bytes escaped."""
    return ",".join(value.decode("ascii", "backslashreplace") for value in values)


class LoggerPeer(BlePeer):
    """The phone as a data logger the device connects to. A notification on
    the command characteristic asks the device for writes; the phone records
    every write in arrival order. The device may write only:
    - the command CCCD and log records with write requests (while rejecting,
      log records are answered with Write Request Rejected);
    - feed records with write commands;
    - the note with prepared writes, from offset 0 without gaps, committed by
      one execute.
    Any other write operation, and any PDU over the ATT MTU, is invalid: the
    phone counts it and serves it as Bumble does."""

    def setup(self):
        self.command = self.log = self.feed = self.note = None
        self.command_cccd = 0
        self.connections = 0
        self.disconnects = 0
        self.subscribed = False
        self.rejecting = False
        self.logs = []
        self.rejected = []
        self.feeds = []
        self.feed_commands = 0
        self.notes = []
        # The link's ATT MTU when the last note arrived.
        self.note_mtu = 0
        # (offset, length) of the note fragments prepared since the last execute.
        self.queued = []
        self.note_commits = 0
        # Fragments of the last committed note.
        self.note_fragments = 0
        self.invalid = []

    async def start(self):
        self.command = Characteristic(COMMAND, Characteristic.Properties.NOTIFY, Characteristic.READABLE, b"")
        self.command.on("subscription", self.on_subscription)
        self.log = Characteristic(LOG, Characteristic.Properties.WRITE, Characteristic.WRITEABLE,
                                  CharacteristicValue(write=self.on_log))
        self.feed = Characteristic(FEED, Characteristic.Properties.WRITE_WITHOUT_RESPONSE, Characteristic.WRITEABLE,
                                   CharacteristicValue(write=self.on_feed))
        self.note = Characteristic(NOTE, Characteristic.Properties.WRITE, Characteristic.WRITEABLE,
                                   CharacteristicValue(write=self.on_note))
        self.device.add_service(Service(SERVICE, [self.command, self.log, self.feed, self.note]))
        server = self.device.gatt_server
        self.command_cccd = server.get_descriptor_attribute(
            SERVICE, COMMAND, GATT_CLIENT_CHARACTERISTIC_CONFIGURATION_DESCRIPTOR).handle
        self.watch_writes()
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

    def watch_writes(self):
        """A characteristic's write callback gets the value alone, whichever
        ATT operation carried it. So the phone checks each write PDU first:
        the GATT server looks up its handler by the PDU's name on the instance
        for every PDU, and these wrappers check the PDU, then pass it on."""
        server = self.device.gatt_server
        for name, check in (
            ("on_att_write_request", self.check_write_request),
            ("on_att_write_command", self.check_write_command),
            ("on_att_prepare_write_request", self.check_prepare_write),
            ("on_att_execute_write_request", self.check_execute_write),
        ):
            setattr(server, name, checked(getattr(server, name), check))

    def flag(self, what):
        self.invalid.append(what)

    def check_size(self, bearer, header, value, what):
        if header + len(value) > bearer.att_mtu:
            self.flag(f"{what} of {len(value)} B at ATT MTU {bearer.att_mtu}")

    def check_write_request(self, bearer, request):
        handle = request.attribute_handle
        self.check_size(bearer, WRITE_HEADER, request.attribute_value, f"write request to 0x{handle:04x}")
        if handle == self.log.handle:
            if self.rejecting:
                self.rejected.append(bytes(request.attribute_value))
                # The server answers a request whose handler raises ATT_Error
                # with that error, and never hands the value on.
                raise ATT_Error(ErrorCode.WRITE_REQUEST_REJECTED, att_handle=handle)
        elif handle != self.command_cccd:
            self.flag(f"write request to 0x{handle:04x}")

    def check_write_command(self, bearer, command):
        handle = command.attribute_handle
        self.check_size(bearer, WRITE_HEADER, command.attribute_value, f"write command to 0x{handle:04x}")
        if handle == self.feed.handle:
            self.feed_commands += 1
        else:
            self.flag(f"write command to 0x{handle:04x}")

    def check_prepare_write(self, bearer, request):
        handle, offset = request.attribute_handle, request.value_offset
        self.check_size(bearer, PREPARE_HEADER, request.part_attribute_value, f"prepared write to 0x{handle:04x}")
        if handle != self.note.handle:
            self.flag(f"prepared write to 0x{handle:04x}")
            return
        queued = sum(length for _, length in self.queued)
        if offset != queued:
            self.flag(f"note fragment at offset {offset} after {queued} B")
        self.queued.append((offset, len(request.part_attribute_value)))

    def check_execute_write(self, bearer, request):
        if request.flags == EXECUTE_COMMIT and self.queued:
            self.note_commits += 1
            self.note_fragments = len(self.queued)
        else:
            self.flag(f"execute write flags={request.flags} with {len(self.queued)} note fragments")
        self.queued = []

    def on_connection(self, connection):
        self.connections += 1
        connection.on("disconnection", self.on_disconnection)

    def on_disconnection(self, reason):
        self.disconnects += 1
        self.subscribed = False
        self.queued = []

    def on_subscription(self, connection, notify_enabled, indicate_enabled):
        self.subscribed = notify_enabled

    def on_log(self, connection, value):
        self.logs.append(bytes(value))

    def on_feed(self, connection, value):
        self.feeds.append(bytes(value))

    def on_note(self, connection, value):
        self.notes.append(bytes(value))
        self.note_mtu = connection.att_mtu

    def ask(self, what):
        self.spawn(self.device.notify_subscribers(self.command, bytes([what])))

    @action
    def ask_log(self):
        self.ask(ASK_LOG)

    @action
    def ask_feed(self):
        self.ask(ASK_FEED)

    @action
    def ask_note(self):
        self.ask(ASK_NOTE)

    @action
    def reject(self):
        self.rejecting = True

    @action
    def accept(self):
        self.rejecting = False

    def state(self):
        note = self.notes[-1] if self.notes else b""
        return {
            "connections": self.connections,
            "disconnects": self.disconnects,
            "subscribed": self.subscribed,
            "logs": len(self.logs),
            "log_text": joined(self.logs),
            "rejected": len(self.rejected),
            "rejected_text": joined(self.rejected),
            "feeds": len(self.feeds),
            "feed_text": joined(self.feeds),
            "feed_commands": self.feed_commands,
            "notes": len(self.notes),
            "note_len": len(note),
            "note_crc": f"{zlib.crc32(note):08x}",
            "note_mtu": self.note_mtu,
            "note_commits": self.note_commits,
            "note_fragments": self.note_fragments,
            "invalid": len(self.invalid),
            "first_invalid": self.invalid[0] if self.invalid else "",
        }


def checked(handle_pdu, check):
    def on_pdu(bearer, pdu):
        check(bearer, pdu)
        handle_pdu(bearer, pdu)
    return on_pdu
