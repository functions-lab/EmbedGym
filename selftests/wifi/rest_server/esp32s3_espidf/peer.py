from embedgym_peer import Peer, action


class RestServerPeer(Peer):
    """The phone: requests into the device's HTTP server."""

    @action
    def status(self):
        self.device.request("GET", "/api/status")

    @action
    def relay_on(self):
        self.device.request("POST", "/api/relay", "on")

    @action
    def relay_off(self):
        self.device.request("POST", "/api/relay", "off")

    @action
    def relay_bad(self):
        self.device.request("POST", "/api/relay", "toggle")

    @action
    def relay_nul(self):
        self.device.request("POST", "/api/relay", b"on\x00junk")

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
