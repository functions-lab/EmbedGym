"""The peer docker/test/esp_cloud/selfcheck.py loads; not a task."""

import time

from embedgym_peer import Peer, action, check


class ToyPeer(Peer):
    def setup(self):
        self.events = 0
        self.bumps = 0
        self.posts = 0
        self.flags = []
        self.mqtt.subscribe("toy/event", self.on_event)
        self.mqtt.subscribe("toy/boom", self.on_boom)
        # Retained before the subscription, so it arrives with retain set.
        self.mqtt.publish("toy/flags/kept", "kept", qos=1, retain=True)
        self.mqtt.subscribe("toy/flags/#", self.on_flags)
        self.http.route("POST", "/echo", lambda request: (200, {"got": request.body.decode()}))
        self.http.route("POST", "/count", self.slow_count)
        self.ws.route("/ws", lambda data: data)
        self.coap.route("/hello", lambda request: ("2.05", f"hello {request.method}"))
        self.coap.route("/slow", self.slow_coap)
        self.coap.route("/bumps", lambda request: ("2.05", str(self.bumps)))
        self.coap.route("/mtype", lambda request: ("2.05", request.mtype))
        self.udp.bind(123, lambda data: data[::-1])
        self.pg.execute("CREATE TABLE readings (value real NOT NULL)")
        self.pg.execute("INSERT INTO readings VALUES (20.0)")

    def on_event(self, _message):
        # Slow enough that a burst is still queued on the peer thread when
        # /state arrives.
        time.sleep(0.01)
        self.events += 1

    def slow_coap(self, _request):
        time.sleep(0.3)
        return "2.05", "late"

    def slow_count(self, _request):
        time.sleep(0.3)
        self.posts += 1
        return 200, "counted"

    def on_boom(self, message):
        raise RuntimeError(f"toy handler failed on {message.payload.decode()}")

    def on_flags(self, message):
        self.flags.append(
            f"{message.topic} qos={message.qos} retain={int(message.retain)} {message.payload.decode()}"
        )

    @action
    def bump(self):
        self.bumps += 1

    @action
    def slow(self):
        time.sleep(2)

    @action
    def slow_then_insert(self):
        time.sleep(3)
        self.pg.execute("INSERT INTO readings VALUES (7)")
        self.bumps += 1
        self.device.request("GET", "/late")

    @action
    def stuck(self):
        time.sleep(7)

    @action
    def fail(self):
        raise RuntimeError("toy action failed")

    @action
    def push_ws(self):
        self.ws.send("/ws", "pushed")

    @action
    def ping_device(self):
        self.device.request("GET", "/status")

    @action
    def ping_device_twice(self):
        self.device.request("GET", "/a")
        self.device.request("GET", "/b")

    @check
    def rows(self):
        return self.pg.execute("SELECT count(*) FROM readings").fetchone()[0]

    @check
    def owner_is_iot(self):
        owner = self.pg.execute("SELECT tableowner FROM pg_tables WHERE tablename = 'readings'")
        return owner.fetchone()[0] == "iot"

    @check
    def status_retained(self):
        payload = self.mqtt.retained("toy/status")
        return "none" if payload is None else payload.decode()

    def state(self):
        last = self.device.last
        return {
            "events": self.events,
            "bumps": self.bumps,
            "posts": self.posts,
            "flags": "; ".join(sorted(self.flags)),
            "device_pending": last is not None and last.pending,
            "device_code": 0 if last is None or last.code is None else last.code,
            "device_body": "" if last is None or last.body is None else last.body,
        }
