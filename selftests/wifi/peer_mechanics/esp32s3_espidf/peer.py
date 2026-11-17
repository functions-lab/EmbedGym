from embedgym_peer import Peer, action, check


class MechanicsPeer(Peer):
    def setup(self):
        self.counts = []
        self.commands = 0
        self.mqtt.subscribe("gym/mech/count", self.on_count)

    def on_count(self, message):
        self.counts.append(message.payload.decode())

    @action
    def light_on(self):
        self.mqtt.publish("gym/mech/cmd", "ON")
        self.commands += 1

    @action
    def light_off(self):
        self.mqtt.publish("gym/mech/cmd", "OFF")
        self.commands += 1

    @check
    def counts_in_order(self):
        return self.counts == [str(n) for n in range(len(self.counts))]

    def state(self):
        return {
            "messages": len(self.counts),
            "last": f"count={self.counts[-1]}" if self.counts else "none",
            "commands": self.commands,
        }
