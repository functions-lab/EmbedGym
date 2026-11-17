from embedgym_peer import Peer, action


class SoftApPeer(Peer):
    """The phone: provisions the device through its SoftAP, then reaches it on
    the network it joined."""

    @action
    def provision(self):
        self.device.request("POST", "/provision", form={"ssid": "Espressif"}, via="ap")

    @action
    def status(self):
        self.device.request("GET", "/status")

    def state(self):
        last = self.device.last
        if last is None:
            return {"pending": False, "last_code": 0, "last_body": ""}
        if last.pending:
            return {"pending": True, "last_code": 0, "last_body": ""}
        if last.error is not None:
            # No HTTP reply at all (connection refused/closed, timeout).
            return {"pending": False, "last_code": 0, "last_body": last.error}
        return {"pending": False, "last_code": last.code, "last_body": last.body}
