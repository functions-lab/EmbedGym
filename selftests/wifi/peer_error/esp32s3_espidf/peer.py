from embedgym_peer import Peer, action


class ErrorPeer(Peer):
    @action
    def explode(self):
        raise RuntimeError("peer_error selftest: explode always raises")

    def state(self):
        return {"alive": True}
