/**
 * Vendored copy of the canonical protocol layer of the Universal AIoT platform.
 * ("vendored contracts" — the protocol contracts that used to ship as a
 * workspace package; vendored here so this package is self-contained.)
 *
 * MQTT topics, Zod schemas, and validation helpers shared by every package.
 * Import everything from this entrypoint; never duplicate a schema elsewhere.
 */

export * from "./topics.js";
export * from "./manifest.js";
export * from "./telemetry.js";
export * from "./command.js";
export * from "./health.js";
export * from "./auth.js";
export * from "./realtime.js";
export * from "./automation.js";
export * from "./validate.js";
export * from "./ids.js";
