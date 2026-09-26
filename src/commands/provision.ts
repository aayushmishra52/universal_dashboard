/**
 * `aiot-sdk provision` — provision a device MQTT credential via the API and
 * write it to a dotenv file (0600). The secret is returned by the backend
 * exactly once, so this command is the moment to persist it.
 *
 *   aiot-sdk provision --device DEV-ABC123 --out ./aiot.credentials.env
 *   aiot-sdk provision --device DEV-ABC123 --label "rooftop sensor"
 *
 * Output file:
 *   AIOT_MQTT_URL=mqtt://…
 *   AIOT_MQTT_USER=dc_…
 *   AIOT_MQTT_PASSWORD=<secret shown once>
 *
 * Feed the file to `aiot-sdk init --credentials-file` to inject the
 * credentials into a generated firmware project.
 */
import type { Command } from "commander";
import { chmodSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { apiRequest } from "../api.js";
import { resolveApiUrl, resolveToken } from "../config-store.js";
import { fail, header } from "./util.js";

interface ProvisionOptions {
  device: string;
  out: string;
  label?: string;
  apiUrl?: string;
  token?: string;
}

interface IssuedCredential {
  id: string;
  clientId: string;
  secret: string;
  label: string | null;
  scopes: string[];
  createdAt: number;
}

export function renderCredentialsEnv(input: {
  mqttUrl?: string;
  clientId: string;
  secret: string;
  deviceId: string;
}): string {
  const lines = [
    "# Universal AIoT device credentials — KEEP SECRET, do not commit.",
    `# device: ${input.deviceId}`,
    `# issued: ${new Date().toISOString()}`,
  ];
  if (input.mqttUrl) lines.push(`AIOT_MQTT_URL=${input.mqttUrl}`);
  lines.push(`AIOT_MQTT_USER=${input.clientId}`);
  lines.push(`AIOT_MQTT_PASSWORD=${input.secret}`);
  return lines.join("\n") + "\n";
}

export function registerProvision(program: Command): void {
  program
    .command("provision")
    .description("Provision a device MQTT credential and write it to a dotenv file.")
    .requiredOption("--device <id>", "device id, e.g. DEV-ABC123")
    .option("--out <path>", "dotenv output path", "./aiot.credentials.env")
    .option("--label <label>", "human-readable credential label")
    .option("--api-url <url>", "backend API base URL")
    .option("--token <jwt>", "bearer token (default: AIOT_TOKEN env or stored login)")
    .action(async (opts: ProvisionOptions) => {
      const apiUrl = resolveApiUrl(opts);
      const token = resolveToken(opts);
      if (!token) {
        fail('Not signed in. Run "aiot-sdk login" first, set AIOT_TOKEN, or pass --token.');
      }
      const deviceId = opts.device;
      header("Provision credential");
      const issued = await apiRequest<IssuedCredential>(
        apiUrl,
        `/api/devices/${encodeURIComponent(deviceId)}/credentials`,
        { method: "POST", body: { label: opts.label }, token },
      );
      // Best effort: advertise the broker URL the backend publishes so the
      // dotenv file works for remote devices too.
      let mqttUrl: string | undefined;
      try {
        const detail = await apiRequest<{
          connectivity?: { mqttUrl?: string };
        }>(apiUrl, `/api/devices/${encodeURIComponent(deviceId)}`, { token });
        mqttUrl = detail.connectivity?.mqttUrl;
      } catch {
        /* connectivity is advisory; the credential is what matters */
      }
      const outPath = resolve(opts.out);
      writeFileSync(
        outPath,
        renderCredentialsEnv({
          mqttUrl,
          clientId: issued.clientId,
          secret: issued.secret,
          deviceId,
        }),
        { mode: 0o600 },
      );
      try {
        chmodSync(outPath, 0o600);
      } catch {
        /* non-POSIX: best effort */
      }
      console.log(`Credential for ${deviceId} written to ${outPath} (0600).`);
      console.log(`Client ID: ${issued.clientId}`);
      console.log("The secret is stored only in that file — it will not be shown again.");
    });
}
