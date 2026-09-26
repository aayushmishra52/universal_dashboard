/**
 * aiot-sdk local config: the API token and backend URL live in
 * ~/.config/aiot-sdk/config.json with 0600 permissions (the directory is
 * 0700). Tokens are never printed, logged, or written anywhere else.
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface SdkConfig {
  token?: string;
  apiUrl?: string;
}

export const DEFAULT_API_URL = "http://localhost:4000";

export function configDir(home: string = homedir()): string {
  return join(home, ".config", "aiot-sdk");
}

export function configPath(home: string = homedir()): string {
  return join(configDir(home), "config.json");
}

/** Load stored config; missing or corrupt files yield an empty config. */
export function loadSdkConfig(home: string = homedir()): SdkConfig {
  const p = configPath(home);
  if (!existsSync(p)) return {};
  try {
    const parsed = JSON.parse(readFileSync(p, "utf8")) as Partial<SdkConfig>;
    return {
      ...(typeof parsed.token === "string" ? { token: parsed.token } : {}),
      ...(typeof parsed.apiUrl === "string" ? { apiUrl: parsed.apiUrl } : {}),
    };
  } catch {
    return {};
  }
}

/** Persist config with owner-only permissions. Returns the file path. */
export function saveSdkConfig(cfg: SdkConfig, home: string = homedir()): string {
  const dir = configDir(home);
  mkdirSync(dir, { recursive: true });
  const p = join(dir, "config.json");
  writeFileSync(p, JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
  // writeFileSync mode only applies on creation; enforce on every save.
  try {
    chmodSync(p, 0o600);
    chmodSync(dir, 0o700);
  } catch {
    /* non-POSIX platforms: best effort */
  }
  return p;
}

export function resolveApiUrl(
  opts: { apiUrl?: string } = {},
  home: string = homedir(),
): string {
  return (
    opts.apiUrl ??
    process.env.AIOT_API_URL ??
    loadSdkConfig(home).apiUrl ??
    DEFAULT_API_URL
  );
}

/**
 * Token precedence: explicit --token flag > AIOT_TOKEN env > stored config.
 * Accepts any bearer token the backend validates, including Firebase ID
 * tokens exchanged by the backend's pluggable auth.
 */
export function resolveToken(
  opts: { token?: string } = {},
  home: string = homedir(),
): string | undefined {
  return (
    opts.token ?? process.env.AIOT_TOKEN ?? loadSdkConfig(home).token ?? undefined
  );
}
