from bumble.core import AdvertisingData
from embedgym_ble import BlePeer, action, check

NAME = b"GYM-MECH"
COMPANY_ID = 0xFFFF


class MechanicsPeer(BlePeer):
    def setup(self):
        self.counts = []
        self.scanning = False
        self.pauses = 0
        self.resumes = 0
        self.resumed_at = None
        self.bad = 0

    async def start(self):
        self.device.on("advertisement", self.on_advertisement)
        await self.scan()

    def on_advertisement(self, advertisement):
        if advertisement.data.get(AdvertisingData.COMPLETE_LOCAL_NAME, raw=True) != NAME:
            return
        data = advertisement.data.get(AdvertisingData.MANUFACTURER_SPECIFIC_DATA, raw=True)
        if data is None or len(data) != 4 or int.from_bytes(data[:2], "little") != COMPANY_ID:
            self.bad += 1
            return
        self.counts.append(int.from_bytes(data[2:], "little"))

    async def scan(self):
        await self.device.start_scanning(active=False)
        self.scanning = True

    async def stop_scan(self):
        await self.device.stop_scanning()
        self.scanning = False

    @action
    def pause(self):
        self.pauses += 1
        self.spawn(self.stop_scan())

    @action
    def resume(self):
        self.resumes += 1
        self.resumed_at = len(self.counts)
        self.spawn(self.scan())

    @check
    def counts_in_order(self):
        return all(a <= b for a, b in zip(self.counts, self.counts[1:]))

    def state(self):
        after_resume = [] if self.resumed_at is None else self.counts[self.resumed_at:]
        return {
            "reports": len(self.counts),
            "last": f"count={self.counts[-1]}" if self.counts else "none",
            "scanning": self.scanning,
            "pauses": self.pauses,
            "resumes": self.resumes,
            "min_after_resume": min(after_resume) if after_resume else -1,
            "bad": self.bad,
        }
