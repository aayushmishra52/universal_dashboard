/**
 * `aiot-sdk init` — inject MQTT credentials from a dotenv file into a
 * generated firmware project.
 *
 *   aiot-sdk init --credentials-file ./aiot.credentials.env [--project-dir .]
 *
 * Reads AIOT_MQTT_USER / AIOT_MQTT_PASSWORD (MQTT_USER / MQTT_PASS accepted
 * as aliases) and re-renders config/config.h from the esp32 template with
 * MQTT_USER / MQTT_PASS filled in. Wi-Fi and broker host/port/tls are kept
 * from the existing project (config.h + aiot.config.json).
 */
import type { Command } from "commander";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ejs from "ejs";
import { templateRoot } from "../generate/render.js";
import { loadProjectConfig } from "./util.js";
import { fail, header } from "./util.js";

/** Minimal dotenv parser: KEY=VALUE, optional quotes, # comments. */
export function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) out[key] = value;
  }
  return out;
}

export interface MqttCredentials {
  username: string;
  password: string;
}

export function credentialsFromEnv(env: Record<string, string>): MqttCredentials {
  const username =
    env.AIOT_MQTT_USER ?? env.MQTT_USER ?? env.AIOT_MQTT_USERNAME ?? "";
  const password =
    env.AIOT_MQTT_PASSWORD ?? env.MQTT_PASS ?? env.AIOT_MQTT_SECRET ?? "";
  if (!username || !password) {
    fail(
      "Credentials file must define AIOT_MQTT_USER and AIOT_MQTT_PASSWORD " +
        "(MQTT_USER / MQTT_PASS are accepted as aliases).",
    );
  }
  return { username, password: password as string };
}

/** Read `#define NAME "value"` from an existing config.h (best effort). */
function extractDefine(configH: string, name: string): string {
  const m = configH.match(new RegExp(`#define\\s+${name}\\s+"([^"]*)"`));
  return m ? m[1] : "";
}

/**
 * Re-render config/config.h with the MQTT username/password injected.
 * Returns the path written.
 */
export function injectCredentials(
  projectDir: string,
  credentialsPath: string,
): string {
  const dir = resolve(projectDir);
  const credsFile = resolve(credentialsPath);
  if (!existsSync(credsFile)) {
    fail(`Credentials file not found: ${credsFile}`);
  }
  const creds = credentialsFromEnv(parseDotenv(readFileSync(credsFile, "utf8")));
  const cfg = loadProjectConfig(dir); // throws unless this is a generated project

  const configHPath = join(dir, "config", "config.h");
  const existing = existsSync(configHPath) ? readFileSync(configHPath, "utf8") : "";
  const templatePath = join(templateRoot(), "config", "config.h.ejs");
  const template = readFileSync(templatePath, "utf8");
  const rendered = ejs.render(
    template,
    {
      wifiSsid: extractDefine(existing, "WIFI_SSID"),
      wifiPass: extractDefine(existing, "WIFI_PASS"),
      mqttHost: cfg.mqtt.host,
      mqttPort: cfg.mqtt.port,
      mqttUser: creds.username,
      mqttPass: creds.password,
      tls: cfg.mqtt.tls,
      deviceId: cfg.deviceId,
      projectId: cfg.projectId,
      orgId: cfg.orgId,
      deviceName: cfg.deviceName,
    },
    {
      filename: templatePath,
      escape: (markup: unknown) => String(markup ?? ""),
    },
  );
  writeFileSync(configHPath, rendered);
  return configHPath;
}

export function registerInit(program: Command): void {
  program
    .command("init")
    .description(
      "Inject MQTT credentials from a dotenv file into a generated firmware project's config/config.h.",
    )
    .requiredOption(
      "--credentials-file <path>",
      "dotenv file with AIOT_MQTT_USER / AIOT_MQTT_PASSWORD (see `aiot-sdk provision --out`)",
    )
    .option("--project-dir <dir>", "generated project directory", ".")
    .action(async (opts: { credentialsFile: string; projectDir: string }) => {
      header("Inject credentials");
      const written = injectCredentials(opts.projectDir, opts.credentialsFile);
      console.log(`Wrote ${written} with MQTT_USER / MQTT_PASS from ${resolve(opts.credentialsFile)}.`);
      console.log("config.h is gitignored — never commit it.");
    });
}
