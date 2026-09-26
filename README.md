# aiot-sdk

[![npm version](https://img.shields.io/npm/v/aiot-sdk.svg)](https://www.npmjs.com/package/aiot-sdk)
[![license](https://img.shields.io/npm/l/aiot-sdk.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/aiot-sdk.svg)](./package.json)

**aiot-sdk** is the standalone firmware SDK CLI for the Universal AIoT platform. Scaffold, validate, build, test, flash and package ESP32 firmware projects that speak the canonical `aiot/v1` MQTT protocol — no platform repo required.

## Install

```bash
npm i -g aiot-sdk        # install globally
# or run without installing:
npx aiot-sdk --help
```

Requires **Node.js ≥ 22**. Compiling firmware additionally requires `arduino-cli` — run `aiot-sdk repair` once to install the pinned ESP32 toolchain.

## Quickstart

```bash
# 1. Scaffold a project (DHT22 temp/humidity on GPIO 15, LED on GPIO 2)
aiot-sdk create --board esp32 --device-name living-room \
  --sensor dht22 --sensor-pin 15 \
  --actuator led --actuator-pin 2 \
  --out ./living-room

cd living-room

# 2. Fill in your secrets (this file is gitignored)
cp config/config.example.h config/config.h
#   edit WIFI_SSID / WIFI_PASSWORD / MQTT_HOST / MQTT_USER / MQTT_PASSWORD

# 3. Validate + compile + protocol-check + run the in-process simulator
aiot-sdk test

# 4. Flash to hardware
aiot-sdk flash --port /dev/ttyUSB0
```

Prefer interactive? Run `aiot-sdk create` with no flags — it walks you through board, sensors, pins and WiFi/MQTT settings, validating pins against the board's pin map as you go.

## CLI commands

### `login` — sign in to the Universal AIoT backend

```
aiot-sdk login [options]
```

Prompts for email/password and stores the JWT (0600) at
`~/.config/aiot-sdk/config.json`. `--api-url` overrides the backend address
(default `http://localhost:4000`). `--token <jwt>` stores an existing token
instead — e.g. a Firebase ID token when the backend has Firebase Auth
enabled (`FIREBASE_PROJECT_ID` set).

### `devices` — list your devices

```
aiot-sdk devices
```

Lists devices visible to the logged-in user (uses the stored token).

### `provision` — issue device MQTT credentials

```
aiot-sdk provision --device DEV-XXXX --out ./aiot.credentials.env
```

Calls `POST /api/devices/:id/credentials` (requires ADMIN on the device) and
writes `MQTT_USER`/`MQTT_PASS` to a dotenv file (0600). The secret is shown
once by the API and never stored server-side — keep the file safe. Pair with
`init --credentials-file` to bake the credentials into firmware, or flash
them onto the device any way you like; the device can then connect from
anywhere via the advertised `PUBLIC_MQTT_URL`.

### `create` — scaffold a project

```
aiot-sdk create [options]
```

Validates everything (board, pins, sensors, actuators, ids) **before** writing anything, then renders 18 files from the EJS templates. Options:

| Option | Description |
|---|---|
| `--board <id>` | board id: `esp32`, `esp32c3`, `esp32c6`, `esp32s3` (default `esp32`) |
| `--device-id <id>` | device id, e.g. `DEV-9K2QX7` (generated if omitted) |
| `--device-name <name>` | human-friendly device name (also the sketch name) |
| `--project-id <id>` | project id |
| `--org-id <id>` | organisation id |
| `--sensor <id>` | sensor id — repeatable (see sensor table) |
| `--sensor-pin <pin>` | GPIO pin for the preceding `--sensor` — repeatable |
| `--actuator <id>` | actuator id — repeatable (see actuator table) |
| `--actuator-pin <pin>` | GPIO pin for the preceding `--actuator` — repeatable |
| `--mqtt-host <host>` | MQTT broker host (default `localhost`) |
| `--mqtt-port <port>` | MQTT broker port (default `1883`) |
| `--mqtt-user <user>` | MQTT username (goes to gitignored `config.h`) |
| `--mqtt-pass <pass>` | MQTT password (goes to gitignored `config.h`) |
| `--wifi-ssid <ssid>` | WiFi SSID (goes to gitignored `config.h`) |
| `--wifi-pass <pass>` | WiFi password (goes to gitignored `config.h`) |
| `--tls` | use MQTT over TLS |
| `--out <dir>` | output directory (default `./<device-name>`) |

Pin choices are validated against each board's pin map (ADC-capable, strapping, reserved, input-only pins), with warnings when you pick a strapping pin.

### `build` — compile the firmware

```
aiot-sdk build [--project-dir <dir>] [--verbose]
```

Compiles the sketch with `arduino-cli` against the pinned ESP32 core and libraries (see `PINNED_VERSIONS.md`). `--verbose` prints the full `arduino-cli` invocation.

### `test` — full device test pipeline

```
aiot-sdk test [--project-dir <dir>]
```

Runs four stages, in order:

1. **static** — validate project config, manifest schema, and pin map
2. **compile** — build the firmware with `arduino-cli`
3. **protocol** — validate manifest/payload shapes against the canonical Zod schemas
4. **simulator** — spin up an ephemeral in-process MQTT broker (aedes) and run a full telemetry + command round-trip between a simulated device and a controller

### `simulate` — virtual device

```
aiot-sdk simulate [--project-dir <dir>] [--broker <url>] [--org <id>] [--project <id>] [--device <id>] [--username <u>] [--password <p>]
```

Shells out to `npx aiot-virtual-device` (a separate package from the platform repo). If it isn't installed, `aiot-sdk` refuses to fake a simulation and tells you how to get it.

### `doctor` — check the toolchain

```
aiot-sdk doctor
```

Checks node version, `arduino-cli`, installed ESP32 core, git, and hardware presence — and compares the toolchain against `PINNED_VERSIONS.md`.

### `diagnose` — environment diagnostics

```
aiot-sdk diagnose [--project-dir <dir>]
```

Collects environment diagnostics with **secrets redacted** — safe to paste into an issue report.

### `repair` — install the pinned toolchain

```
aiot-sdk repair
```

Installs `arduino-cli` 1.5.1, ESP32 Arduino core 3.3.11, and the pinned libraries (ArduinoJson 7.3.2, espMqttClient 1.7.3, AsyncTCP 1.1.4, DHT sensor library 1.4.7, Adafruit Unified Sensor 1.1.15). Never touches your `config.h` or project sources.

### `clean` — remove build artifacts

```
aiot-sdk clean [--project-dir <dir>]
```

Removes build artifacts; keeps `config/` and sources.

### `flash` — upload to hardware

```
aiot-sdk flash [--project-dir <dir>] [--port <port>]
```

Uploads the firmware to a connected device. The port is auto-detected when exactly one device is connected.

### `package` — distributable archive

```
aiot-sdk package [--project-dir <dir>]
```

Bundles the project into a distributable `.tar.gz` plus a SHA-256 checksum.

## Board support

| id | Board | FQBN |
|---|---|---|
| `esp32` | ESP32 Dev Module | `esp32:esp32:esp32` |
| `esp32c3` | ESP32-C3 Dev Module | `esp32:esp32:esp32c3` |
| `esp32c6` | ESP32-C6 Dev Module | `esp32:esp32:esp32c6` |
| `esp32s3` | ESP32-S3 Dev Module | `esp32:esp32:esp32s3` |

## Sensors

| id | Name | Capabilities produced | Pin type |
|---|---|---|---|
| `analog` | Analog Input (ADC) | `analog` (V) | ADC |
| `digital` | Digital Input (GPIO) | `digital` (bool) | GPIO |
| `temperature` | Temperature (analog, e.g. TMP36) | `temperature` (°C) | ADC |
| `humidity` | Humidity (analog) | `humidity` (%RH) | ADC |
| `dht22` | DHT22 (temperature + humidity) | `temperature`, `humidity` | GPIO (+ pull-up) |
| `pressure` | Pressure (analog) | `pressure` (hPa) | ADC |
| `motion` | PIR Motion Sensor | `motion` (bool) | GPIO |
| `light` | Light (LDR / analog) | `light` | ADC |
| `distance` | Distance (analog, e.g. Sharp IR) | `distance` | ADC |
| `button` | Push Button | `button` (bool) | GPIO |

The DHT22 pulls in two pinned Arduino libraries (DHT sensor library 1.4.7, Adafruit Unified Sensor 1.1.15); everything else is dependency-free.

## Actuators

| id | Name | Action | Pin type |
|---|---|---|---|
| `led` | LED | `value: bool` (on/off) | GPIO |
| `relay` | Relay Module | `value: bool` (energized/released) | GPIO |
| `fan` | Fan (on/off) | `value: bool` | GPIO (via driver) |
| `fan_speed` | Fan (PWM speed) | `value: 0–100 %` | PWM |
| `servo` | Servo Motor | `value: 0–180°` | PWM |

All actuators default to a safe state (off / 0) at boot.

## Generated project layout

```
<device-name>/
├── <device-name>.ino     # Arduino sketch entry point
├── AIoT.h / AIoT.cpp     # runtime: WiFi, MQTT, state machine, commands
├── adapters/             # sensor adapter headers (analog.h, digital.h, dht22.h)
├── config/
│   ├── aiot.config.json  # device identity, board, sensors, MQTT (no secrets)
│   ├── config.h          # WiFi/MQTT secrets — gitignored, created from…
│   └── config.example.h  # …this template
├── manifest.json         # capability manifest (also embedded in firmware)
├── manifest_json.h       # manifest embedded as a C string
├── pinout.json           # resolved pin assignment
├── sketch.yaml           # arduino-cli build profile + pinned library refs
├── wiring.svg            # generated wiring diagram
├── WIRING.md / README.md / TESTING.md
└── .gitignore
```

## Firmware protocol (aiot/v1)

Every device publishes/subscribes under:

```
aiot/v1/{orgId}/{projectId}/{deviceId}/{manifest|status|telemetry|command|presence|health}
```

- `manifest` (retained) — capability manifest, identical to the generated `manifest.json`
- `status` — device lifecycle status
- `telemetry` — sensor readings + actuator state, validated against the canonical schemas
- `command` — commands **to** the device, and command results **back** from it
- `presence` — online/offline announcements
- `health` — device health snapshots

Commands carry a `commandId`, `capabilityId`, `action`, `params`, `issuedAt` and `expiresAt` (a device never executes an expired command). Results move through `QUEUED → SENT → ACKNOWLEDGED → SUCCEEDED`, or terminate as `FAILED`, `EXPIRED`, `REJECTED`, `DUPLICATE`. See `docs/FIRMWARE.md` and the vendored schemas in `src/contracts/`.

## Configuration & secrets

There are no environment variables and no `.env` file. All configuration is via CLI flags at `create` time and the project's `config/aiot.config.json` + `config/config.h`. WiFi/MQTT credentials live **only** in `config/config.h`, which is gitignored from day one — `config/config.example.h` is the checked-in template.

## Troubleshooting

- **`arduino-cli` not on PATH** → run `aiot-sdk repair`.
- **Compile fails on `AsyncTCP.h`** → `aiot-sdk repair` installs AsyncTCP 1.1.4 (required by espMqttClient's transport, unconditionally).
- **Wrong core/library version** → `aiot-sdk doctor` diffs your toolchain against `PINNED_VERSIONS.md`; `aiot-sdk repair` fixes it.
- **Output dir ≠ sketch name** → arduino-cli requires the directory to match `<name>.ino`; rename the directory before `build`/`test`/`flash` (`create` warns you).
- **Strapping-pin warnings** (GPIO 0/2/5/12/15 on ESP32, etc.) → the pin works, but avoid pulling strapping pins to fixed levels at boot.
- **Need redacted diagnostics** → `aiot-sdk diagnose` collects environment info with secrets stripped.

## Programmatic API

The CLI is the primary surface, but the package also exports building blocks (`renderProject`, `validateGenerateInput`, `buildManifest`, registries, `PINNED_VERSIONS`, …) via `import ... from "aiot-sdk"` for embedding generation/validation in other tools.

## Related

- Platform repo: https://github.com/<your-username>/universal-aiot
- Docs: [docs/GENERATOR.md](./docs/GENERATOR.md) (templates, registries, validation) · [docs/FIRMWARE.md](./docs/FIRMWARE.md) (runtime, MQTT topics, command lifecycle) · [docs/TESTING.md](./docs/TESTING.md) (test pipeline) · [PUBLISHING.md](./PUBLISHING.md) (release process)
