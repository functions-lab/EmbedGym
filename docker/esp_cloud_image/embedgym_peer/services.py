"""The facilities a peer uses, and the checks on what its handlers return.

Handlers run on the peer thread; a handler that raises or returns a wrong type
is recorded as a peer error, which the next /call or /state reports.
"""

import asyncio
import json
import os
import secrets
import threading
import urllib.parse
from dataclasses import dataclass

import aiocoap
import aiohttp
import paho.mqtt.client as paho

SIM_BACKEND = os.environ.get("EMBEDGYM_SIM_BACKEND", "http://embedgym-sim:8001")
GATEWAYS = {"sta": "/api/gateway", "ap": "/api/gateway-ap"}
ACK_TIMEOUT_S = 5


class PeerFailed(Exception):
    """Raised after a peer error has been recorded."""


@dataclass(frozen=True)
class HttpRequest:
    method: str
    path: str
    query: dict
    headers: dict
    body: bytes


@dataclass(frozen=True)
class CoapRequest:
    method: str
    path: str
    payload: bytes
    mtype: str  # "CON" or "NON"


@dataclass(frozen=True)
class MqttMessage:
    topic: str
    payload: bytes
    qos: int
    retain: bool


@dataclass(frozen=True)
class DeviceResponse:
    """body is the reply decoded as UTF-8, invalid bytes as U+FFFD. error is set,
    and code is None, when the request got no HTTP reply from the gateway."""

    pending: bool
    code: int | None = None
    body: str | None = None
    error: str | None = None


class _SubAck:
    def __init__(self):
        self.done = threading.Event()
        self.reason_codes = []


def connect_mqtt(name, user, password):
    """A client of the local broker, connected and with its network thread running."""
    client = paho.Client(paho.CallbackAPIVersion.VERSION2, client_id=f"{name}-{secrets.token_hex(6)}")
    client.username_pw_set(user, password)
    connected = threading.Event()
    connack = []

    def on_connect(_client, _userdata, _flags, reason_code, _properties):
        connack.append(reason_code)
        connected.set()

    client.on_connect = on_connect
    client.connect("127.0.0.1", 1883)
    client.loop_start()
    if not connected.wait(ACK_TIMEOUT_S):
        client.loop_stop()
        raise TimeoutError(f"MQTT client {name}: no CONNACK")
    if connack[0].is_failure:
        client.loop_stop()
        raise RuntimeError(f"MQTT client {name}: {connack[0]}")
    return client


class Mqtt:
    """A client of the local broker (mqtt.iot.test:1883)."""

    def __init__(self, session, user, password):
        self._session = session
        self._user = user
        self._password = password
        self._subacks = {}
        self._client = connect_mqtt("embedgym_peer", user, password)
        self._client.on_subscribe = self._on_subscribe

    def subscribe(self, topic, callback):
        """callback(MqttMessage). Returns once the broker acknowledged."""
        self._client.message_callback_add(
            topic,
            lambda _client, _userdata, msg: self._session.submit(
                f"mqtt {msg.topic}", callback, MqttMessage(msg.topic, msg.payload, msg.qos, msg.retain)
            ),
        )
        # The broker delivers at min(publish QoS, subscription QoS), so QoS 2
        # makes message.qos the publisher's QoS.
        rc, mid = self._client.subscribe(topic, 2)
        if rc != paho.MQTT_ERR_SUCCESS:
            raise RuntimeError(f"subscribe {topic}: {paho.error_string(rc)}")
        # The SUBACK can arrive before subscribe() returns, so both sides
        # create the entry.
        ack = self._subacks.setdefault(mid, _SubAck())
        if not ack.done.wait(ACK_TIMEOUT_S):
            raise TimeoutError(f"subscribe {topic}: no SUBACK")
        failed = [str(code) for code in ack.reason_codes if code.is_failure]
        if failed:
            raise RuntimeError(f"subscribe {topic}: {failed}")

    def publish(self, topic, payload, qos=0, retain=False):
        """Returns once the message is handed to the broker."""
        info = self._client.publish(topic, payload, qos, retain)
        info.wait_for_publish(ACK_TIMEOUT_S)
        if not info.is_published():
            raise TimeoutError(f"publish {topic}: not acknowledged")

    def retained(self, topic):
        """The payload retained on topic, or None. A fresh subscription reads
        it: MQTT 3.1.1 forwards a retained publish to existing subscribers with
        retain=0."""
        if "+" in topic or "#" in topic:
            raise ValueError(f"retained {topic}: takes a topic, not a filter")
        # The broker writes a subscription's retained message before it reads
        # the next packet, so the echo of a later publish ends the wait. A
        # topic starting with $ does not match any device's # subscription.
        fence = f"$embedgym_peer/fence/{secrets.token_hex(6)}"
        payloads = []
        fenced = threading.Event()

        def on_message(_client, _userdata, msg):
            if msg.topic == fence:
                fenced.set()
            elif msg.retain:
                payloads.append(msg.payload)

        client = connect_mqtt("embedgym-peer-retained", self._user, self._password)
        try:
            client.on_message = on_message
            # QoS 0 hands each message over as it arrives; QoS 2 would hold
            # the retained one until PUBREL, after the fence.
            rc, _mid = client.subscribe([(topic, 0), (fence, 0)])
            if rc != paho.MQTT_ERR_SUCCESS:
                raise RuntimeError(f"retained {topic}: {paho.error_string(rc)}")
            client.publish(fence, b"", 0)
            if not fenced.wait(ACK_TIMEOUT_S):
                raise TimeoutError(f"retained {topic}: the broker did not answer")
        finally:
            client.disconnect()
            client.loop_stop()
        return payloads[0] if payloads else None

    def close(self):
        self._client.disconnect()
        self._client.loop_stop()

    def _on_subscribe(self, _client, _userdata, mid, reason_codes, _properties):
        ack = self._subacks.setdefault(mid, _SubAck())
        ack.reason_codes = reason_codes
        ack.done.set()


class Http:
    """HTTP on api.iot.test:80. handler(HttpRequest) returns (status, body), where
    body is str (text/plain), bytes (application/octet-stream) or a dict/list (JSON)."""

    def __init__(self):
        self.routes = {}

    def route(self, method, path, handler):
        key = (method.upper(), path)
        if key in self.routes:
            raise ValueError(f"http route {method} {path} registered twice")
        self.routes[key] = handler


class Ws:
    """WebSocket on api.iot.test:80. on_message(data: str | bytes) returns the
    reply (str: text frame, bytes: binary frame) or None."""

    def __init__(self, session):
        self._session = session
        self.routes = {}
        # path -> {WebSocketResponse: its transport}, used on the event loop only.
        self.clients = {}

    def route(self, path, on_message):
        if path in self.routes:
            raise ValueError(f"ws route {path} registered twice")
        self.routes[path] = on_message
        self.clients[path] = {}

    def send(self, path, text):
        """A text frame to every client connected on path; returns once each
        frame is written to its socket."""
        if path not in self.routes:
            raise ValueError(f"ws.send {path}: no such route")
        if not isinstance(text, str):
            raise TypeError(f"ws.send {path}: text must be str, not {type(text).__name__}")
        asyncio.run_coroutine_threadsafe(self._send(path, text), self._session.loop).result(ACK_TIMEOUT_S)

    async def _send(self, path, text):
        clients = list(self.clients[path].items())
        if not clients:
            raise RuntimeError(f"ws.send {path}: no client connected")
        for ws, transport in clients:
            await ws.send_str(text)
            if transport.get_write_buffer_size():
                raise RuntimeError(f"ws.send {path}: the socket did not take the whole frame")


class Coap:
    """CoAP on coap.iot.test:5683/udp. handler(CoapRequest) returns (code, body),
    code in dotted form ("2.05"), body str or bytes."""

    def __init__(self):
        self.routes = {}

    def route(self, path, handler):
        if path in self.routes:
            raise ValueError(f"coap route {path} registered twice")
        self.routes[path] = handler


class Udp:
    def __init__(self, session):
        self._session = session
        self._transports = {}

    def bind(self, port, handler):
        """handler(data: bytes) returns the reply datagram (bytes) or None."""
        if port in self._transports:
            raise ValueError(f"udp port {port} bound twice")
        loop = self._session.loop
        endpoint = loop.create_datagram_endpoint(
            lambda: _UdpProtocol(self._session, port, handler), local_addr=("0.0.0.0", port)
        )
        transport, _ = asyncio.run_coroutine_threadsafe(endpoint, loop).result(ACK_TIMEOUT_S)
        self._transports[port] = transport

    def close(self):
        for transport in self._transports.values():
            transport.close()


class _UdpProtocol(asyncio.DatagramProtocol):
    def __init__(self, session, port, handler):
        self._session = session
        self._port = port
        self._handler = handler
        self._transport = None
        self._replies = set()

    def connection_made(self, transport):
        self._transport = transport

    def datagram_received(self, data, addr):
        future = self._session.submit(f"udp {self._port}", udp_reply, self._handler, data)
        task = asyncio.ensure_future(self._reply(future, addr))
        self._replies.add(task)
        task.add_done_callback(self._replies.discard)

    async def _reply(self, future, addr):
        try:
            reply = await asyncio.wrap_future(future)
        except PeerFailed:
            return
        if reply is not None:
            self._transport.sendto(reply, addr)


class Device:
    """Requests into the device's HTTP server through the backend gateway."""

    def __init__(self, session, backend=SIM_BACKEND):
        self._session = session
        self._backend = backend
        self._future = None
        self._generation = 0
        self.client_id = None
        self.last = None

    def request(self, method, path, body=None, via="sta", *, form=None):
        """Returns at once; the reply lands in self.last (a DeviceResponse).
        body is str (text/plain), bytes (application/octet-stream) or a
        dict/list (JSON). form, in place of body, is a dict of str fields sent
        as application/x-www-form-urlencoded in the dict's order.
        via "sta" reaches the device's station address, "ap" its SoftAP address.
        A request still pending is dropped: self.last describes the newest one."""
        if via not in GATEWAYS:
            raise ValueError(f"device.request via must be 'sta' or 'ap', not {via!r}")
        if self.client_id is None:
            raise RuntimeError("device.request before bind_device")
        if self.last is not None and self.last.pending:
            self._future.cancel()
        if form is not None:
            if body is not None:
                raise TypeError("device.request takes body or form, not both")
            if not isinstance(form, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in form.items()):
                raise TypeError(f"device.request form must be a dict of str to str, not {form!r}")
            payload = {
                "data": urllib.parse.urlencode(form).encode(),
                "headers": {"Content-Type": "application/x-www-form-urlencoded"},
            }
        elif isinstance(body, (dict, list)):
            payload = {"json": body}
        elif body is None or isinstance(body, (str, bytes)):
            payload = {"data": body}
        else:
            raise TypeError(f"device.request body must be str, bytes, dict or list, not {type(body).__name__}")
        self._generation += 1
        self.last = DeviceResponse(pending=True)
        url = f"{self._backend}{GATEWAYS[via]}/{self.client_id}/{path.lstrip('/')}"
        self._future = asyncio.run_coroutine_threadsafe(
            self._send(method.upper(), url, payload, self._generation), self._session.loop
        )

    async def _send(self, method, url, payload, generation):
        where = f"device {method} {url}"
        try:
            # A redirect is the device's reply, not a request for the peer to follow.
            async with self._session.http_client.request(method, url, allow_redirects=False, **payload) as resp:
                response = DeviceResponse(False, resp.status, (await resp.read()).decode(errors="replace"))
        except (aiohttp.ClientError, TimeoutError) as e:
            response = DeviceResponse(False, error=repr(e))
        except Exception as e:
            self._session.record(where, e)
            return
        # state() and checks read self.last on the peer thread.
        self._session.submit(where, self._complete, response, generation)

    def _complete(self, response, generation):
        # A dropped request may finish after its replacement started.
        if generation == self._generation:
            self.last = response

    def cancel(self):
        if self._future is not None:
            self._future.cancel()


def http_reply(handler, request):
    status, body = handler(request)
    if not isinstance(status, int):
        raise TypeError(f"http status must be int, not {type(status).__name__}")
    if isinstance(body, (dict, list)):
        return status, "application/json", json.dumps(body).encode()
    if isinstance(body, str):
        return status, "text/plain", body.encode()
    if isinstance(body, bytes):
        return status, "application/octet-stream", body
    raise TypeError(f"http body must be str, bytes, dict or list, not {type(body).__name__}")


def ws_reply(on_message, data):
    reply = on_message(data)
    if reply is None or isinstance(reply, (str, bytes)):
        return reply
    raise TypeError(f"ws reply must be str, bytes or None, not {type(reply).__name__}")


def coap_reply(handler, request):
    code, body = handler(request)
    major, minor = (int(part) for part in code.split("."))
    if isinstance(body, str):
        body = body.encode()
    if not isinstance(body, bytes):
        raise TypeError(f"coap body must be str or bytes, not {type(body).__name__}")
    return aiocoap.Code(major << 5 | minor), body


def udp_reply(handler, data):
    reply = handler(data)
    if reply is None or isinstance(reply, bytes):
        return reply
    raise TypeError(f"udp reply must be bytes or None, not {type(reply).__name__}")
