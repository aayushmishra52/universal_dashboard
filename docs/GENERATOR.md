# Generator — templates, registries, validation

How `aiot-sdk create` turns flags into a complete, compilable ESP32 project.

## Pipeline

```
CLI flags ──► validateGenerateInput ──► planFirmware ──► buildManifest ──► renderProject ──► writeProject
(input.ts)      (firmware.ts)            (manifest.ts)      (render.ts, EJS)   (render.ts)
```

1. **Parse & validate** (`src/generate/input.ts`) — board id, device id (`DEV-XXXXXX` format), sensor/actuator ids, pin numbers. Every pin goes through `validatePin()` against the board's pin map: ADC-capable vs digital, strapping pins (warnings), reserved/flash pins (errors), input-only pins (errors for actuators).
2. **Plan firmware** (`src/generate/firmware.ts`) — resolves which adapters and libraries are needed, merges capabilities, assigns the capability list.
3. **Build manifest** (`src/generate/manifest.ts`) — constructs the device manifest and validates it with `DeviceManifestSchema` from the vendored contracts. The identical JSON is embedded in the firmware (`manifest_json.h`), so the retained `manifest` publish always matches `manifest.json`.
4. **Render** (`src/generate/render.ts`) — walks `templates/esp32/**/*.ejs`, renders each with EJS, strips the `.ejs` suffix, and writes the project. Produces 18 files for a typical device.
5. **Write** — `writeProject()` writes files only after all validation passed; nothing is written half-way.

## Template layout (`templates/esp32/`)

| Template | Output |
|---|---|
| `sketch.ino.ejs` | `<name>.ino` — Arduino entry point |
| `AIoT.h.ejs` / `AIoT.cpp.ejs` | Runtime class: WiFi, MQTT, state machine, command dispatch |
| `adapters/*.h.ejs` | Sensor adapters: `analog.h`, `digital.h`, `dht22.h` |
| `config/config.h.ejs` | Secrets header (gitignored in the generated project) |
| `config/config.example.h.ejs` | Checked-in template for `config.h` |
| `config/aiot.config.json.ejs` | Device identity, board, capabilities, MQTT settings (no secrets) |
| `manifest.json.ejs` | Capability manifest |
| `manifest_json.h.ejs` | Manifest as a C string, compiled into firmware |
| `pinout.json.ejs` | Resolved pin assignment |
| `sketch.yaml.ejs` | arduino-cli profile: FQBN, pinned core, library references |
| `wiring.svg.ejs` | Generated wiring diagram |
| `WIRING.md.ejs` / `README.md.ejs` / `TESTING.md.ejs` | Per-project docs |
| `.gitignore.ejs` | Generated project's `.gitignore` (ignores `config/config.h`) |

### Template resolution

`templateRoot()` (`src/generate/render.ts`) finds the package root by walking up from `import.meta.url` until it finds a `package.json` whose `name` is `aiot-sdk` (or the legacy `@aiot/sdk-generator`), then appends `templates/esp32`. This is why **`templates/` must ship in the npm tarball** (`files` in `package.json`) and why renaming the package requires updating the name check.

## Registries

All registries are JSON + a thin typed accessor, so new hardware is data, not code:

- `src/board-registry/boards.json` — 4 boards (`esp32`, `esp32c3`, `esp32c6`, `esp32s3`): FQBN, pin lists (digital/adc/bootstrap/input-only/reserved), strapping notes, peripherals.
- `src/sensor-registry/sensors.json` — 10 sensors: adapter type, interface, pin usage, capabilities produced (with units/ranges/precision), required Arduino libraries, wiring hints.
- `src/actuator-registry/actuators.json` — 5 actuators: capability, param schema (`{value}`), pin usage, safe default, wiring hints.
- `src/versions.ts` — `PINNED_VERSIONS`, the single source of truth mirrored in `PINNED_VERSIONS.md` and installed by `aiot-sdk repair`.

Capabilities are validated with `CapabilitySchema` from the vendored contracts, so a registry entry that doesn't conform fails fast at generation time.

## Validation philosophy

- Validate **before** writing: `create` collects all errors and reports them together; a failed validation leaves the output directory untouched.
- Pins: hard errors for reserved/input-only mismatches; **warnings** (not errors) for strapping pins, since they work with care.
- Device ids match `DEVICE_ID_REGEX` (`DEV-` + 6 base32-ish chars); omitted ids are generated.
- The manifest is the contract: whatever the generator emits must satisfy the same Zod schema the firmware and the backend validate against — there is exactly one schema, vendored in `src/contracts/`.

## Secrets

`create` accepts `--wifi-ssid/--wifi-pass/--mqtt-user/--mqtt-pass` and writes them **only** to `config/config.h`, which the generated `.gitignore` excludes. Nothing secret-bearing is ever written to `aiot.config.json`, `manifest.json`, or logs. See also `src/secret-scan.ts` and `aiot-sdk diagnose` (redacted output).
