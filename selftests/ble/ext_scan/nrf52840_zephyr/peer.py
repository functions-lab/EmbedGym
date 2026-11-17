from bumble import hci
from bumble.core import AdvertisingData
from bumble.device import AdvertisingEventProperties, AdvertisingParameters
from embedgym_ble import BlePeer, action

NAME = b"GYM-CHAIN"
COMPANY_ID = 0xFFFF
# 250 bytes of advertising data in all: more than one AUX_ADV_IND holds, so the
# controller sends the rest in an AUX_CHAIN_IND. 251 is the most one HCI
# command sets, and Bumble sends one.
PATTERN_LEN = 233


def advertising_data(seq):
    pattern = bytes((seq * 29 + i * 11 + 3) & 0xFF for i in range(PATTERN_LEN))
    return bytes(AdvertisingData([
        (AdvertisingData.COMPLETE_LOCAL_NAME, NAME),
        (AdvertisingData.MANUFACTURER_SPECIFIC_DATA,
         COMPANY_ID.to_bytes(2, "little") + seq.to_bytes(2, "little") + pattern),
    ]))


class ChainPeer(BlePeer):
    """An extended, non-connectable, non-scannable advertiser that `advertise`
    starts; `next` steps the sequence number in its data."""

    def setup(self):
        self.advertising_set = None
        self.seq = 0
        self.updates = 0

    async def advertise_chain(self):
        self.advertising_set = await self.device.create_advertising_set(
            advertising_parameters=AdvertisingParameters(
                advertising_event_properties=AdvertisingEventProperties(
                    is_connectable=False, is_scannable=False, is_legacy=False),
                primary_advertising_interval_min=100,
                primary_advertising_interval_max=100,
                primary_advertising_phy=hci.Phy.LE_1M,
                secondary_advertising_phy=hci.Phy.LE_1M,
                advertising_sid=1,
            ),
            advertising_data=advertising_data(0),
        )
        self.updates += 1

    async def readvertise(self, seq):
        await self.advertising_set.set_advertising_data(advertising_data(seq))
        self.updates += 1

    @action
    def advertise(self):
        self.spawn(self.advertise_chain())

    @action
    def next(self):
        self.seq += 1
        self.spawn(self.readvertise(self.seq))

    def state(self):
        return {"seq": self.seq, "updates": self.updates}
