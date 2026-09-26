/**
 * `aiot-sdk devices` — list organizations, projects and devices via the API.
 *
 *   aiot-sdk devices                      # everything you can see
 *   aiot-sdk devices --project <id>       # just one project's devices
 *
 * Auth: --token flag, AIOT_TOKEN env, or the token stored by `aiot-sdk login`.
 */
import type { Command } from "commander";
import { apiRequest } from "../api.js";
import { resolveApiUrl, resolveToken } from "../config-store.js";
import { fail, header } from "./util.js";

interface DevicesOptions {
  project?: string;
  apiUrl?: string;
  token?: string;
}

interface Org {
  id: string;
  name: string;
}
interface Project {
  id: string;
  name: string;
}
interface Device {
  deviceId: string;
  name: string;
  status: string;
  model?: string;
}

function printDevices(orgName: string, projectName: string, devices: Device[]): void {
  if (devices.length === 0) {
    console.log(`  ${orgName} / ${projectName}: no devices`);
    return;
  }
  console.log(`  ${orgName} / ${projectName}:`);
  for (const d of devices) {
    const extra = d.model ? ` (${d.model})` : "";
    console.log(`    ${d.deviceId}  ${d.name}${extra}  [${d.status}]`);
  }
}

export function registerDevices(program: Command): void {
  program
    .command("devices")
    .description("List organizations, projects and devices via the API.")
    .option("--project <id>", "only list devices in this project")
    .option("--api-url <url>", "backend API base URL")
    .option("--token <jwt>", "bearer token (default: AIOT_TOKEN env or stored login)")
    .action(async (opts: DevicesOptions) => {
      const apiUrl = resolveApiUrl(opts);
      const token = resolveToken(opts);
      if (!token) {
        fail('Not signed in. Run "aiot-sdk login" first, set AIOT_TOKEN, or pass --token.');
      }
      header("Devices");
      const get = <T>(path: string) => apiRequest<T>(apiUrl, path, { token });

      if (opts.project) {
        const res = await get<{ devices: Device[] }>(
          `/api/projects/${encodeURIComponent(opts.project)}/devices`,
        );
        printDevices("?", opts.project, res.devices);
        return;
      }

      const me = await get<{ orgs: Org[] }>("/api/auth/me");
      if (me.orgs.length === 0) {
        console.log("No organizations. Register via the dashboard first.");
        return;
      }
      for (const org of me.orgs) {
        const { projects } = await get<{ projects: Project[] }>(
          `/api/orgs/${encodeURIComponent(org.id)}/projects`,
        );
        if (projects.length === 0) {
          console.log(`  ${org.name}: no projects`);
          continue;
        }
        for (const project of projects) {
          const { devices } = await get<{ devices: Device[] }>(
            `/api/projects/${encodeURIComponent(project.id)}/devices`,
          );
          printDevices(org.name, project.name, devices);
        }
      }
    });
}
