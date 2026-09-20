# Testing — test pipeline + publish gate

## `aiot-sdk test` — the four-stage pipeline

`aiot-sdk test [--project-dir <dir>]` runs every stage in order and stops at the first failure:

| Stage | What it does | Tooling |
|---|---|---|
| **1. static** | Validates project config (`aiot.config.json`), the manifest against `DeviceManifestSchema`, and every pin against the board pin map | vendored Zod schemas + registries |
| **2. compile** | Full firmware compile with `arduino-cli` against the pinned ESP32 core/libraries | `arduino-cli` (installed by `aiot-sdk repair`) |
| **3. protocol** | Validates manifest and representative payloads (telemetry, command, command result, health, presence) against the canonical schemas | vendored contracts |
| **4. simulator** | Boots an ephemeral in-process MQTT broker and runs a real telemetry + command round-trip between a simulated device and a controller client | `src/simulator.ts` (aedes + mqtt) |

Stage 4 uses no hardware and no external broker: it starts an **aedes** broker in-process, connects a simulated device (publishing telemetry, subscribing to commands) and a controller (issuing a command, awaiting the result), and asserts the full `QUEUED → … → SUCCEEDED` lifecycle plus schema-valid payloads on every topic. This is the closest thing to hardware-in-the-loop without silicon.

## Unit tests (`npm test`)

```bash
npm test   # vitest run
```

| File | Coverage |
|---|---|
| `tests/render.test.ts` | Project rendering: files produced, manifest embedded, config.h gitignored |
| `tests/validation.test.ts` | Input validation: board/pin/sensor/actuator/id rules |
| `tests/topics.test.ts` | Topic builders + `parseTopic` round-trips |
| `tests/simulator.test.ts` | In-process broker telemetry + command round-trip |

33 tests, all passing on Node ≥ 22.

## Publish gate

Do not publish a version that hasn't cleared the gate:

```bash
npm run build      # tsc, zero errors
npm test           # 33/33 green
npm pack --dry-run # confirm files: dist, templates, README.md, LICENSE
```

`prepublishOnly` re-runs the build automatically, but **tests are not run by any npm hook** — run them yourself. See `PUBLISHING.md` for the full release checklist.

## Before flashing real hardware

1. `aiot-sdk doctor` — toolchain matches `PINNED_VERSIONS.md`
2. `aiot-sdk test` — all four stages green
3. `cp config/config.example.h config/config.h` and fill in real WiFi/MQTT credentials
4. `aiot-sdk flash --port /dev/ttyUSB0`
5. Watch `…/status` and `…/telemetry` on your broker to confirm the device comes `ONLINE`

## Golden project

The reference build is **ESP32 + DHT22 on GPIO 4 + LED on GPIO 2**, compiled against the exact versions in `PINNED_VERSIONS.md` (verified 2026-09-20). If you change a pin or dependency and the golden project stops compiling, treat it as a regression in the generator, not in the project.
