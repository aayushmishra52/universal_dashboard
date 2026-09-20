# Firmware — runtime architecture, state machine, MQTT topics, command lifecycle

What the generated ESP32 firmware does at runtime (the code in `AIoT.h` / `AIoT.cpp` / `adapters/`).

## Architecture

```
┌──────────────┐   ┌───────────────┐   ┌─────────────────┐
│ sketch .ino  │──▶│ AIoT runtime  │──▶│ adapters/       │
│ (setup/loop) │   │ (AIoT.h/.cpp) │   │ analog/digital/ │
└──────────────┘   └───────┬───────┘   │ dht22.h         │
                           │           └─────────────────┘
                    ┌──────┴──────┐
                    │ WiFi + MQTT │
                    │ (espMqtt-   │
                    │  Client)    │
                    └─────────────┘
```

- **`sketch.ino`** — thin entry point: constructs the `AIoT` object from `config.h`, calls `begin()` in `setup()`, `loop()` in `loop()`.
- **`AIoT` runtime** — owns WiFi connection, MQTT session, the device state machine, telemetry scheduling, command dispatch, and health reporting.
- **Adapters** — one header per sensor family (`analog.h`, `digital.h`, `dht22.h`); each adapter reads its GPIO(s) and returns typed capability values. Actuators are driven through the same capability ids (`led`, `relay`, `fan`, `fan_speed`, `servo`).
- **`config.h`** — compile-time secrets (WiFi SSID/password, MQTT host/port/user/password, TLS flag). Generated from `config.example.h`; gitignored.
- **`manifest_json.h`** — the device capability manifest compiled in as a C string, byte-identical to `manifest.json` (guaranteed by the generator).

## State machine

```
BOOT → CONNECTING_WIFI → CONNECTING_MQTT → ONLINE ⇄ RECONNECTING
                                              │
                                              ▼ (fatal)
                                            ERROR
```

- On `ONLINE`: publish retained `manifest`, publish `presence` (online), start telemetry timer.
- On disconnect: exponential-backoff reconnect; publish `presence` (offline) via MQTT Last Will so the platform notices even on ungraceful drops.
- Safe defaults: on boot, all actuators are driven to their registry `safeDefault` (off / 0) before the first command is accepted.

## MQTT topics (protocol v1)

Root: `aiot/v1/{orgId}/{projectId}/{deviceId}`. Topic builders and the topic regex live in `src/contracts/topics.ts`.

| Kind | Direction | Retained | Payload |
|---|---|---|---|
| `manifest` | device → platform | **yes** | `DeviceManifest` — capabilities, firmware version, protocol version |
| `status` | device → platform | no | lifecycle status (`online`, state transitions) |
| `telemetry` | device → platform | no | `{ capabilityId: value, … }` + `at` timestamp |
| `command` | platform → device | no | `Command` (see below) |
| `command` | device → platform | no | `CommandResult` (see below) |
| `presence` | device → platform | yes (LWT) | online/offline |
| `health` | device → platform | no | heap, uptime, RSSI, reconnect count |

Every payload is validated against the vendored Zod schemas (`telemetry.ts`, `health.ts`, `manifest.ts`, …). `PROTOCOL_VERSION = "1.0"`.

## Command lifecycle

A command published to `…/command` looks like:

```json
{
  "kind": "command",
  "protocolVersion": "1.0",
  "commandId": "cmd-01J…",
  "deviceId": "DEV-9K2QX7",
  "capabilityId": "led",
  "action": "set",
  "params": { "value": true },
  "issuedAt": 1726…,
  "expiresAt": 1726…
}
```

The device **never executes a command after `expiresAt`**. Processing on-device:

1. Validate the payload against `CommandSchema`; reject malformed → publish `REJECTED` with a reason.
2. Deduplicate by `commandId` → `DUPLICATE` if already seen.
3. Check expiry → `EXPIRED` if `now > expiresAt`.
4. Acknowledge → `ACKNOWLEDGED`.
5. Dispatch to the capability handler (validated against the actuator's `paramSchema` from the registry) → `SUCCEEDED` (with `reportedState`) or `FAILED` (with `reason`).

The result is published back on the **same** `…/command` topic with `kind: "result"`:

```
QUEUED → SENT → ACKNOWLEDGED → SUCCEEDED
                                ├─ FAILED / REJECTED / EXPIRED / DUPLICATE (terminal)
```

`reportedState` echoes the actuator's post-command state so controllers can converge without a telemetry round-trip.

## Libraries (pinned)

The firmware links against the pinned Arduino libraries (see `PINNED_VERSIONS.md`): ArduinoJson 7.3.2 (payload serialization), espMqttClient 1.7.3 (async MQTT over `AsyncTCP` 1.1.4), DHT sensor library 1.4.7 + Adafruit Unified Sensor 1.1.15 (only when a DHT22 is configured). The ESP32 Arduino core is pinned at 3.3.11; `sketch.yaml` records all of it so `arduino-cli` reproduces the exact build.
