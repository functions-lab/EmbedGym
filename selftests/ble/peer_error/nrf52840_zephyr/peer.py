from embedgym_ble import BlePeer, action


class ErrorPeer(BlePeer):
    @action
    def explode(self):
        raise RuntimeError("peer_error selftest: explode always raises")

    def state(self):
        return {"alive": True}
