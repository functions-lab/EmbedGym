"""A peer whose state key collides with a check name; its load must fail."""

from embedgym_peer import Peer, check


class CollidePeer(Peer):
    @check
    def count(self):
        return 0

    def state(self):
        return {"count": 1}
