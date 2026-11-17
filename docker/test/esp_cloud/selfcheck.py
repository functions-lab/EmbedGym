"""Checks esp_cloud's control API, reset and services, as a client on esp_cloud_net.

Needs `cloud.sh up` (or `sim.sh up`) and, for the device check, the sim on
esp_cloud_net. Runs in a throwaway container of the esp_cloud image, which has
the client libraries, credentials.json and embedgym_peer:

  docker run --rm --network esp_cloud_net \
    -e EMBEDGYM_CLOUD_TOKEN="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' esp_cloud | sed -n 's/^EMBEDGYM_CLOUD_TOKEN=//p')" \
    -v "$PWD/docker/test/esp_cloud/selfcheck.py:/selfcheck.py:ro" \
    embedgym-esp-cloud python3 /selfcheck.py

It resets esp_cloud; do not run it while a run or an agent uses the services.
"""

import asyncio
import json
import os
import socket
import struct
import sys
import threading
import time
import traceback
import urllib.error
import urllib.request

import aiocoap
import aiohttp
import paho.mqtt.client as paho
import psycopg

sys.path.insert(0, "/opt/esp_cloud")
from embedgym_peer.services import Device, DeviceResponse

CONTROL = "http://esp_cloud:9000"
TOKEN = os.environ["EMBEDGYM_CLOUD_TOKEN"]
CREDENTIALS = json.load(open("/opt/esp_cloud/credentials.json"))
MQTT = CREDENTIALS["mqtt"]
PG = CREDENTIALS["postgres"]
TOY = {"task_dir": "docker/test/esp_cloud/toy", "target": "esp32s3_espidf"}
COLLIDE = {"task_dir": "docker/test/esp_cloud/collide", "target": "esp32s3_espidf"}
FIXED_DATE = b"\r\nDate: Mon, 01 Jan 2024 00:00:00 GMT\r\n"

results = []


def item(fn):
    try:
        fn()
        results.append((fn.__name__, None))
    except Exception:
        results.append((fn.__name__, traceback.format_exc().rstrip()))
    return fn


def api(method, path, body=None, token=TOKEN):
    headers = {"Content-Type": "application/json"}
    if token is not None:
        headers["X-EmbedGym-Token"] = token
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(CONTROL + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def load(peer=TOY):
    status, body = api("POST", "/load", peer)
    assert status == 200, body
    return body


def state(quiet_ms=50):
    status, body = api("GET", f"/state?quiet_ms={quiet_ms}")
    assert status == 200, body
    return body


def expect_error(status_body, status, text):
    got_status, body = status_body
    assert got_status == status and text in body["error"], (got_status, body)


def mqtt_client(user=MQTT["user"], password=MQTT["password"]):
    """Returns (client, CONNACK reason code)."""
    client = paho.Client(paho.CallbackAPIVersion.VERSION2)
    if user is not None:
        client.username_pw_set(user, password)
    connack = []
    done = threading.Event()

    def on_connect(_client, _userdata, _flags, reason_code, _properties):
        connack.append(reason_code)
        done.set()

    client.on_connect = on_connect
    client.connect("mqtt.iot.test", 1883)
    client.loop_start()
    assert done.wait(5), "no CONNACK"
    return client, connack[0]


def publish(client, topic, payload, **kwargs):
    info = client.publish(topic, payload, **kwargs)
    info.wait_for_publish(5)
    assert info.is_published()


def retained(topic, wait_s):
    client, _ = mqtt_client()
    got = []
    client.on_message = lambda _c, _u, msg: got.append(msg.payload)
    client.subscribe(topic)
    time.sleep(wait_s)
    client.disconnect()
    client.loop_stop()
    return got


def pg_connect(password=PG["password"], dbname=PG["database"], autocommit=True):
    return psycopg.connect(
        host="pg.iot.test", user=PG["user"], password=password, dbname=dbname, autocommit=autocommit
    )


def recv_exact(sock, n):
    data = b""
    while len(data) < n:
        chunk = sock.recv(n - len(data))
        assert chunk, "connection closed"
        data += chunk
    return data


def raw_http(request):
    with socket.create_connection(("api.iot.test", 80), timeout=5) as sock:
        sock.sendall(request)
        data = b""
        while chunk := sock.recv(4096):
            data += chunk
    return data


@item
def token_required():
    expect_error(api("GET", "/state", token=None), 403, "X-EmbedGym-Token")
    expect_error(api("GET", "/state", token="wrong"), 403, "X-EmbedGym-Token")
    expect_error(api("POST", "/load", TOY, token=None), 403, "X-EmbedGym-Token")
    expect_error(api("POST", "/call", {"name": "bump"}, token=None), 403, "X-EmbedGym-Token")
    expect_error(api("POST", "/bind_device", {"client_id": "x"}, token=None), 403, "X-EmbedGym-Token")
    assert api("GET", "/health", token=None) == (200, {"ok": True})


@item
def failed_load_is_reported():
    expect_error(api("POST", "/load", {"task_dir": "docker/test/esp_cloud/missing", "target": "esp32s3_espidf"}), 500, "no peer at")
    expect_error(api("GET", "/state"), 500, "load failed")
    expect_error(api("POST", "/call", {"name": "bump"}), 500, "load failed")


@item
def state_key_colliding_with_check_fails_load():
    expect_error(api("POST", "/load", COLLIDE), 500, "collide with @check names: ['count']")


@item
def load_schema_state_call():
    schema = load()
    assert schema == {
        "actions": ["bump", "fail", "ping_device", "ping_device_twice", "push_ws", "slow", "slow_then_insert",
                    "stuck"],
        "props": ["bumps", "device_body", "device_code", "device_pending", "events", "flags", "owner_is_iot",
                  "posts", "rows", "status_retained"],
    }, schema
    assert state() == {"events": 0, "bumps": 0, "posts": 0, "flags": "toy/flags/kept qos=1 retain=1 kept",
                       "device_pending": False, "device_code": 0, "device_body": "", "rows": 1,
                       "owner_is_iot": True, "status_retained": "none"}
    assert api("POST", "/call", {"name": "bump"}) == (200, {})
    assert api("POST", "/call", {"name": "bump"}) == (200, {})
    assert state()["bumps"] == 2
    expect_error(api("POST", "/call", {"name": "on_event"}), 400, "unknown action 'on_event'")
    expect_error(api("POST", "/call", {"name": "rows"}), 400, "unknown action 'rows'")
    load()
    assert state()["bumps"] == 0, "a second load must start from a fresh peer"


@item
def quiet_barrier_counts_a_burst():
    load()
    client, _ = mqtt_client()
    for n in range(30):
        publish(client, "toy/event", str(n))
    assert state()["events"] == 30
    client.disconnect()
    client.loop_stop()


@item
def quiet_barrier_waits_for_a_stream():
    load()
    client, _ = mqtt_client()

    def stream():
        for n in range(20):
            publish(client, "toy/event", str(n))
            time.sleep(0.02)

    sender = threading.Thread(target=stream)
    sender.start()
    time.sleep(0.05)
    events = state(quiet_ms=150)["events"]
    sender.join()
    client.disconnect()
    client.loop_stop()
    assert events == 20, events


@item
def barrier_waits_for_active_device_query():
    load()
    writer = threading.Thread(
        target=lambda: pg_connect().execute("INSERT INTO readings SELECT 21 FROM pg_sleep(0.6)")
    )
    writer.start()
    time.sleep(0.1)
    start = time.monotonic()
    rows = state(quiet_ms=0)["rows"]
    elapsed = time.monotonic() - start
    writer.join()
    assert rows == 2 and elapsed >= 0.4, (rows, elapsed)


@item
def barrier_waits_for_handler_but_not_partial_body():
    load()
    with socket.create_connection(("api.iot.test", 80), timeout=5) as sock:
        sock.sendall(
            b"POST /count HTTP/1.1\r\nHost: api.iot.test\r\nConnection: close\r\n"
            b"Content-Length: 4\r\n\r\nab"
        )
        start = time.monotonic()
        assert state()["posts"] == 0
        elapsed = time.monotonic() - start
        # The handler sleeps 0.3 s, longer than the quiet period.
        sock.sendall(b"cd")
        posts = state()["posts"]
        reply = b""
        while chunk := sock.recv(4096):
            reply += chunk
    assert elapsed < 0.5, elapsed
    assert posts == 1, posts
    assert reply.startswith(b"HTTP/1.1 200 ") and reply.endswith(b"counted"), reply


@item
def call_budget():
    load()
    start = time.monotonic()
    expect_error(api("POST", "/call", {"name": "slow"}), 500, "action slow: exceeded the 1 s budget")
    elapsed = time.monotonic() - start
    assert 0.9 < elapsed < 1.5, elapsed
    expect_error(api("GET", "/state"), 500, "exceeded the 1 s budget")


@item
def action_exception_is_reported():
    load()
    expect_error(api("POST", "/call", {"name": "fail"}), 500, "toy action failed")


@item
def handler_exception_reported_by_next_state_and_call():
    load()
    client, _ = mqtt_client()
    publish(client, "toy/boom", "x")
    client.disconnect()
    client.loop_stop()
    expect_error(api("GET", "/state"), 500, "toy handler failed on x")
    expect_error(api("POST", "/call", {"name": "bump"}), 500, "toy handler failed on x")


@item
def device_request():
    load()
    expect_error(api("POST", "/call", {"name": "ping_device"}), 500, "device.request before bind_device")
    load()
    assert api("POST", "/bind_device", {"client_id": "selfcheck::nobody"}) == (200, {})
    start = time.monotonic()
    assert api("POST", "/call", {"name": "ping_device"}) == (200, {})
    assert time.monotonic() - start < 0.5, "device.request must not block the action"
    time.sleep(1)
    got = state()
    # The gateway answers 404 for a client id with no WiFi board.
    assert (got["device_pending"], got["device_code"]) == (False, 404), got
    assert api("POST", "/call", {"name": "ping_device_twice"}) == (200, {})
    time.sleep(1)
    got = state()
    assert (got["device_pending"], got["device_code"]) == (False, 404), got


class StandInSession:
    """What Device uses of esp_cloud's Session, with a 1 s client timeout."""

    def __init__(self, loop, http_client):
        self.loop = loop
        self.http_client = http_client
        self.errors = []

    def record(self, where, exc):
        self.errors.append(f"{where}: {exc!r}")

    def submit(self, where, fn, *args):
        fn(*args)


async def stand_in_gateway(reader, writer):
    line = await reader.readline()
    headers = {}
    while (header := await reader.readline()) not in (b"\r\n", b""):
        name, _, value = header.decode().partition(":")
        headers[name.strip().lower()] = value.strip()
    path = line.split()[1]
    if path == b"/api/gateway/selfcheck/echo":
        echo = headers["content-type"].encode() + b"\n" + await reader.readexactly(int(headers["content-length"]))
        writer.write(b"HTTP/1.1 200 OK\r\nContent-Length: %d\r\nConnection: close\r\n\r\n%s" % (len(echo), echo))
        await writer.drain()
    elif path == b"/api/gateway/selfcheck/binary":
        writer.write(b"HTTP/1.1 200 OK\r\nContent-Length: 5\r\nConnection: close\r\n\r\nok \xff\xfe")
        await writer.drain()
    elif path == b"/api/gateway/selfcheck/redirect":
        writer.write(b"HTTP/1.1 302 Found\r\nLocation: /elsewhere\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
        await writer.drain()
    elif path == b"/api/gateway/selfcheck/hang":
        await reader.read()
    elif path == b"/api/gateway/selfcheck/close":
        pass
    else:
        raise ValueError(f"stand-in gateway: unexpected {line!r}")
    writer.close()


def device_request_to_stand_in(*paths, method="GET", broken_client=False, settle_s=0, **request_kwargs):
    """Device.request each path, back to back, through a stand-in gateway on
    loopback; returns (device.last settle_s after it stopped pending, errors
    the session recorded, seconds until not pending)."""
    loop = asyncio.new_event_loop()
    thread = threading.Thread(target=loop.run_forever)
    thread.start()

    async def start():
        server = await asyncio.start_server(stand_in_gateway, "127.0.0.1", 0)
        client = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=1))
        return server, client

    async def stop():
        await client.close()
        server.close()
        await server.wait_closed()

    server, client = asyncio.run_coroutine_threadsafe(start(), loop).result(5)
    try:
        session = StandInSession(loop, None if broken_client else client)
        device = Device(session, backend=f"http://127.0.0.1:{server.sockets[0].getsockname()[1]}")
        device.client_id = "selfcheck"
        start_s = time.monotonic()
        for path in paths:
            device.request(method, path, **request_kwargs)
        while device.last.pending and not session.errors and time.monotonic() - start_s < 3:
            time.sleep(0.01)
        elapsed = time.monotonic() - start_s
        time.sleep(settle_s)
        return device.last, session.errors, elapsed
    finally:
        asyncio.run_coroutine_threadsafe(stop(), loop).result(5)
        loop.call_soon_threadsafe(loop.stop)
        thread.join(5)


@item
def device_reply_is_recorded_as_sent():
    last, errors, _ = device_request_to_stand_in("binary")
    assert (last, errors) == (DeviceResponse(False, 200, "ok \ufffd\ufffd"), []), (last, errors)
    last, errors, _ = device_request_to_stand_in("redirect")
    assert (last, errors) == (DeviceResponse(False, 302, ""), []), (last, errors)


@item
def device_body_is_sent_with_its_content_type():
    last, errors, _ = device_request_to_stand_in("echo", method="POST", form={"ssid": "My Net&1", "interval": "3"})
    expected = DeviceResponse(False, 200, "application/x-www-form-urlencoded\nssid=My+Net%261&interval=3")
    assert (last, errors) == (expected, []), (last, errors)
    last, errors, _ = device_request_to_stand_in("echo", method="POST", body="interval=3")
    assert (last, errors) == (DeviceResponse(False, 200, "text/plain; charset=utf-8\ninterval=3"), []), (last, errors)
    device = Device(None)
    device.client_id = "selfcheck"
    for kwargs, text in (
        ({"body": "x", "form": {"a": "1"}}, "body or form, not both"),
        ({"form": {"interval": 3}}, "form must be a dict of str to str"),
        ({"form": [("a", "1")]}, "form must be a dict of str to str"),
    ):
        try:
            device.request("POST", "/provision", **kwargs)
        except TypeError as e:
            assert text in str(e), (kwargs, e)
        else:
            raise AssertionError(f"{kwargs}: no TypeError")


@item
def device_transport_failure_is_recorded():
    last, errors, _ = device_request_to_stand_in("close")
    assert (last.pending, last.code, last.body, errors) == (False, None, None, []), (last, errors)
    assert "ServerDisconnectedError" in last.error, last
    last, errors, elapsed = device_request_to_stand_in("hang")
    assert (last.pending, last.code, last.body, errors) == (False, None, None, []), (last, errors)
    assert "TimeoutError" in last.error and 0.9 < elapsed < 2, (last, elapsed)


@item
def device_request_replaces_a_stalled_one():
    # The dropped request would time out after 1 s; it must not overwrite the reply.
    last, errors, _ = device_request_to_stand_in("hang", "binary", settle_s=1.5)
    assert (last, errors) == (DeviceResponse(False, 200, "ok \ufffd\ufffd"), []), (last, errors)


@item
def device_framework_bug_is_a_peer_error():
    last, errors, _ = device_request_to_stand_in("binary", broken_client=True)
    assert last.pending and len(errors) == 1 and "AttributeError" in errors[0], (last, errors)


@item
def http_route_and_fixed_date():
    load()
    body = b"hi"
    reply = raw_http(
        b"POST /echo HTTP/1.1\r\nHost: api.iot.test\r\nConnection: close\r\n"
        b"Content-Length: 2\r\n\r\n" + body
    )
    assert reply.startswith(b"HTTP/1.1 200 ") and FIXED_DATE in reply, reply
    assert reply.endswith(b'{"got": "hi"}'), reply
    reply = raw_http(b"GET /nope HTTP/1.1\r\nHost: api.iot.test\r\nConnection: close\r\n\r\n")
    assert reply.startswith(b"HTTP/1.1 404 ") and FIXED_DATE in reply, reply


@item
def websocket_echo():
    async def run():
        async with aiohttp.ClientSession() as session:
            async with session.ws_connect("ws://api.iot.test/ws") as ws:
                await ws.send_str("ping")
                text = await ws.receive(timeout=5)
                await ws.send_bytes(b"\x01\x02")
                binary = await ws.receive(timeout=5)
        return text.data, binary.data

    assert asyncio.run(run()) == ("ping", b"\x01\x02")


@item
def websocket_push_reaches_every_client():
    load()

    async def run():
        async with aiohttp.ClientSession() as session:
            async with session.ws_connect("ws://api.iot.test/ws") as a, session.ws_connect("ws://api.iot.test/ws") as b:
                for ws in (a, b):
                    # The echo shows that the server has registered the client.
                    await ws.send_str("ping")
                    assert (await ws.receive(timeout=5)).data == "ping"
                called = await asyncio.to_thread(api, "POST", "/call", {"name": "push_ws"})
                return called, (await a.receive(timeout=5)).data, (await b.receive(timeout=5)).data

    assert asyncio.run(run()) == ((200, {}), "pushed", "pushed")


@item
def websocket_push_without_client_fails():
    load()
    expect_error(api("POST", "/call", {"name": "push_ws"}), 500, "ws.send /ws: no client connected")
    expect_error(api("GET", "/state"), 500, "ws.send /ws: no client connected")


@item
def load_drops_websocket_clients():
    load()

    async def run():
        async with aiohttp.ClientSession() as session:
            async with session.ws_connect("ws://api.iot.test/ws") as ws:
                await ws.send_str("ping")
                await ws.receive(timeout=5)
                await asyncio.to_thread(load)
                return (await ws.receive(timeout=5)).type

    closed = asyncio.run(run())
    assert closed in (aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR), closed
    expect_error(api("POST", "/call", {"name": "push_ws"}), 500, "ws.send /ws: no client connected")


@item
def coap_route():
    async def run():
        context = await aiocoap.Context.create_client_context()
        hello = await context.request(aiocoap.Message(code=aiocoap.GET, uri="coap://coap.iot.test/hello")).response
        missing = await context.request(aiocoap.Message(code=aiocoap.GET, uri="coap://coap.iot.test/nope")).response
        await context.shutdown()
        return hello, missing

    hello, missing = asyncio.run(asyncio.wait_for(run(), 10))
    assert (hello.code, hello.payload) == (aiocoap.CONTENT, b"hello GET"), (hello.code, hello.payload)
    assert missing.code == aiocoap.NOT_FOUND, missing.code


@item
def slow_coap_reply_is_piggybacked():
    # CON GET /slow, message id 0x1234, no token.
    request = bytes([0x40, 0x01, 0x12, 0x34, 0xB4]) + b"slow"
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.settimeout(5)
        sock.sendto(request, ("coap.iot.test", 5683))
        reply, _ = sock.recvfrom(64)
    # ACK (type 2) carrying 2.05 with the same message id, not an empty ACK.
    assert reply[:4] == bytes([0x60, 0x45, 0x12, 0x34]) and reply.endswith(b"late"), reply


@item
def coap_request_carries_its_type():
    load()
    # GET /mtype with no token: CON with message id 0x3333, then NON with 0x3334.
    con = bytes([0x40, 0x01, 0x33, 0x33, 0xB5]) + b"mtype"
    non = bytes([0x50, 0x01, 0x33, 0x34, 0xB5]) + b"mtype"
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.settimeout(5)
        sock.sendto(con, ("coap.iot.test", 5683))
        con_reply, _ = sock.recvfrom(64)
        sock.sendto(non, ("coap.iot.test", 5683))
        non_reply, _ = sock.recvfrom(64)
    # A piggybacked ACK 2.05 to the CON; a NON 2.05 to the NON.
    assert con_reply[:4] == bytes([0x60, 0x45, 0x33, 0x33]) and con_reply.endswith(b"\xffCON"), con_reply
    assert non_reply[:2] == bytes([0x50, 0x45]) and non_reply.endswith(b"\xffNON"), non_reply


@item
def udp_handler():
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.settimeout(5)
        sock.sendto(b"abc", ("ntp.iot.test", 123))
        reply, _ = sock.recvfrom(64)
    assert reply == b"cba", reply


@item
def mqtt_password_auth():
    client, code = mqtt_client()
    assert not code.is_failure, code
    client.disconnect()
    client.loop_stop()
    for user, password in ((MQTT["user"], "wrong"), (None, None)):
        client, code = mqtt_client(user, password)
        client.loop_stop()
        assert code.is_failure, (user, code)


@item
def mqtt_message_flags():
    load()
    client, _ = mqtt_client()
    publish(client, "toy/flags/q0", "a", qos=0)
    publish(client, "toy/flags/q1", "b", qos=1)
    publish(client, "toy/flags/q2", "c", qos=2)
    publish(client, "toy/flags/live", "d", qos=1, retain=True)
    client.disconnect()
    client.loop_stop()
    # A retained publish reaches an existing subscription with retain=0.
    assert state()["flags"] == "; ".join([
        "toy/flags/kept qos=1 retain=1 kept",
        "toy/flags/live qos=1 retain=0 d",
        "toy/flags/q0 qos=0 retain=0 a",
        "toy/flags/q1 qos=1 retain=0 b",
        "toy/flags/q2 qos=2 retain=0 c",
    ])


@item
def mqtt_retained_reads_the_current_value():
    load()
    assert state()["status_retained"] == "none"
    client, _ = mqtt_client()
    publish(client, "toy/status", "one", qos=1, retain=True)
    assert state()["status_retained"] == "one"
    publish(client, "toy/status", "two", qos=0, retain=True)
    publish(client, "toy/status", "three", qos=2, retain=True)
    assert state()["status_retained"] == "three"
    # An empty retained publish clears the topic.
    publish(client, "toy/status", "", qos=1, retain=True)
    assert state()["status_retained"] == "none"
    publish(client, "toy/status", "stale", qos=1, retain=True)
    client.disconnect()
    client.loop_stop()
    load()
    assert state()["status_retained"] == "none"
    client, _ = mqtt_client()
    publish(client, "toy/status", "fresh", qos=1, retain=True)
    client.disconnect()
    client.loop_stop()
    assert state()["status_retained"] == "fresh"


@item
def postgres_asks_for_md5():
    params = f"user\0{PG['user']}\0database\0{PG['database']}\0\0".encode()
    startup = struct.pack("!ii", 8 + len(params), 196608) + params
    with socket.create_connection(("pg.iot.test", 5432), timeout=5) as sock:
        sock.sendall(startup)
        kind, _length, code = struct.unpack("!cii", recv_exact(sock, 9))
    # AuthenticationMD5Password is R/5; SCRAM would be R/10.
    assert (kind, code) == (b"R", 5), (kind, code)


@item
def reset_clears_services():
    load()
    client, _ = mqtt_client()
    publish(client, "toy/retained", "stale", qos=1, retain=True)
    client.disconnect()
    client.loop_stop()
    assert retained("toy/retained", 0.5) == [b"stale"]

    pg_connect().execute("INSERT INTO readings VALUES (99)")
    open_transaction = pg_connect(autocommit=False)
    open_transaction.execute("INSERT INTO readings VALUES (98)")
    iot = pg_connect()
    iot.execute(f"ALTER ROLE {PG['user']} SET search_path = leaked")
    iot.execute(f"ALTER ROLE {PG['user']} PASSWORD 'changed'")
    iot.close()
    try:
        pg_connect().close()
        raise AssertionError("the changed password should reject the fixed one")
    except psycopg.OperationalError:
        pass
    assert state()["rows"] == 2

    load()
    assert state()["rows"] == 1
    with pg_connect() as iot:
        search_path = iot.execute("SHOW search_path").fetchone()[0]
    assert search_path == '"$user", public', search_path
    try:
        open_transaction.execute("SELECT 1")
        raise AssertionError("the leftover transaction's session should be terminated")
    except psycopg.OperationalError:
        pass
    assert retained("toy/retained", 0.5) == []


@item
def iot_connects_only_to_its_database():
    pg_connect().close()
    for dbname in ("postgres", "template1"):
        try:
            pg_connect(dbname=dbname).close()
            raise AssertionError(f"{PG['user']} connected to {dbname}")
        except psycopg.OperationalError as e:
            assert "CONNECT privilege" in str(e), e


@item
def coap_duplicate_cache_does_not_outlive_a_load():
    # CON GET /bumps with message id 0x2222, twice from one source port.
    request = bytes([0x40, 0x01, 0x22, 0x22, 0xB5]) + b"bumps"
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.settimeout(5)
        load()
        assert api("POST", "/call", {"name": "bump"}) == (200, {})
        sock.sendto(request, ("coap.iot.test", 5683))
        before, _ = sock.recvfrom(64)
        load()
        sock.sendto(request, ("coap.iot.test", 5683))
        after, _ = sock.recvfrom(64)
    assert before.endswith(b"\xff1") and after.endswith(b"\xff0"), (before, after)


@item
def load_waits_for_a_timed_out_action():
    load()
    assert api("POST", "/bind_device", {"client_id": "selfcheck::nobody"}) == (200, {})
    expect_error(api("POST", "/call", {"name": "slow_then_insert"}), 500, "exceeded the 1 s budget")
    start = time.monotonic()
    load()
    elapsed = time.monotonic() - start
    # The action sleeps 3 s, 2 s of them after /call gave up.
    assert elapsed > 1.8, elapsed
    got = state()
    assert (got["rows"], got["bumps"], got["device_code"]) == (1, 0, 0), got


@item
def load_fails_while_an_action_is_stuck():
    load()
    expect_error(api("POST", "/call", {"name": "stuck"}), 500, "exceeded the 1 s budget")
    start = time.monotonic()
    expect_error(api("POST", "/load", TOY), 500, "the previous peer's action stuck is still running")
    elapsed = time.monotonic() - start
    assert 4.5 < elapsed < 7, elapsed
    expect_error(api("GET", "/state"), 500, "action stuck is still running")
    # The action sleeps 7 s; the next load waits out the rest.
    load()
    assert state()["bumps"] == 0


# Last: on a server that cannot undo it, every later load fails.
@item
def database_flags_do_not_break_reset():
    load()
    with pg_connect() as iot:
        iot.execute(f"ALTER DATABASE {PG['database']} IS_TEMPLATE true CONNECTION LIMIT 0")
    load()
    assert state()["rows"] == 1
    pg_connect().close()


for name, failure in results:
    print(f"[{'PASS' if failure is None else 'FAIL'}] {name}")
    if failure is not None:
        print("    " + failure.replace("\n", "\n    "))
failed = sum(failure is not None for _, failure in results)
print(f"{'PASS' if failed == 0 else 'FAIL'} — {len(results) - failed} passed, {failed} failed")
sys.exit(1 if failed else 0)
