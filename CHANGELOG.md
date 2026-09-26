# Changelog

All notable changes to the `aiot-sdk` CLI will be documented here.

## [1.1.0] — 2026-09-26

### Added

- **`aiot-sdk login`** — sign in to the Universal AIoT backend
  (`POST /api/auth/login`); stores the JWT with `0600` permissions at
  `~/.config/aiot-sdk/config.json`. `--api-url` overrides the backend address;
  `--token <jwt>` stores an existing token instead (e.g. a Firebase ID token
  when the backend has Firebase Auth enabled).
- **`aiot-sdk devices`** — list devices visible to the logged-in user.
- **`aiot-sdk provision --device <id> --out <file>`** — issue per-device MQTT
  credentials via `POST /api/devices/:id/credentials` and write them to a
  dotenv file (`0600`). The secret is returned once by the API and never
  stored server-side.
- **`aiot-sdk init --credentials-file <file>`** — inject `MQTT_USER` /
  `MQTT_PASS` from a provisioned credentials file into the generated
  firmware `config/config.h` (existing `mqttUser`/`mqttPass` template vars).
- `engines.node` lowered from `>=22` to `>=20`.

## [1.0.0] — 2026-09-20

Initial release: `aiot-sdk` CLI — scaffold (`create`), validate, build, test,
flash and package Universal AIoT ESP32 firmware projects, plus the in-process
device simulator.
