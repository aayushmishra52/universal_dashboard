import { describe, expect, it, vi, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseDotenv,
  credentialsFromEnv,
  injectCredentials,
} from "../src/commands/init.js";
import { renderCredentialsEnv } from "../src/commands/provision.js";
import {
  loadSdkConfig,
  saveSdkConfig,
  resolveToken,
  resolveApiUrl,
  DEFAULT_API_URL,
} from "../src/config-store.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function tempHome(): string {
  return mkdtempSync(join(tmpdir(), "aiot-sdk-home-"));
}

describe("parseDotenv", () => {
  it("parses KEY=VALUE with quotes, comments and blanks", () => {
    const env = parseDotenv(
      [
        "# comment",
        "",
        "AIOT_MQTT_USER=dc_abc123",
        'AIOT_MQTT_PASSWORD="s3cret with spaces"',
        "AIOT_MQTT_URL='mqtt://example.com:1883'",
        "not-a-pair",
        "123BAD=oops",
      ].join("\n"),
    );
    expect(env).toEqual({
      AIOT_MQTT_USER: "dc_abc123",
      AIOT_MQTT_PASSWORD: "s3cret with spaces",
      AIOT_MQTT_URL: "mqtt://example.com:1883",
    });
  });
});

describe("credentialsFromEnv", () => {
  it("reads AIOT_MQTT_USER / AIOT_MQTT_PASSWORD", () => {
    expect(
      credentialsFromEnv({ AIOT_MQTT_USER: "dc_x", AIOT_MQTT_PASSWORD: "pw" }),
    ).toEqual({ username: "dc_x", password: "pw" });
  });

  it("accepts MQTT_USER / MQTT_PASS aliases", () => {
    expect(credentialsFromEnv({ MQTT_USER: "u", MQTT_PASS: "p" })).toEqual({
      username: "u",
      password: "p",
    });
  });

  it("fails when credentials are missing", () => {
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation((() => {
        throw new Error("process.exit called");
      }) as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => credentialsFromEnv({})).toThrow("process.exit called");
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("config store", () => {
  it("round-trips the token with owner-only permissions", () => {
    const home = tempHome();
    const path = saveSdkConfig({ token: "jwt-test-token", apiUrl: "http://x:4000" }, home);
    expect(path).toBe(join(home, ".config", "aiot-sdk", "config.json"));
    const mode = statSync(path).mode & 0o777;
    expect(mode).toBe(0o600);
    expect(loadSdkConfig(home)).toEqual({
      token: "jwt-test-token",
      apiUrl: "http://x:4000",
    });
  });

  it("returns an empty config when nothing is stored", () => {
    expect(loadSdkConfig(tempHome())).toEqual({});
  });

  it("resolves token with flag > env > stored precedence", () => {
    const home = tempHome();
    saveSdkConfig({ token: "stored-token" }, home);
    expect(resolveToken({ token: "flag-token" }, home)).toBe("flag-token");
    vi.stubEnv("AIOT_TOKEN", "env-token");
    expect(resolveToken({}, home)).toBe("env-token");
    vi.unstubAllEnvs();
    expect(resolveToken({}, home)).toBe("stored-token");
    expect(resolveToken({}, tempHome())).toBeUndefined();
  });

  it("resolves the API url with flag > env > stored > default precedence", () => {
    const home = tempHome();
    expect(resolveApiUrl({}, home)).toBe(DEFAULT_API_URL);
    saveSdkConfig({ apiUrl: "http://stored:4000" }, home);
    expect(resolveApiUrl({}, home)).toBe("http://stored:4000");
    vi.stubEnv("AIOT_API_URL", "http://env:4000");
    expect(resolveApiUrl({}, home)).toBe("http://env:4000");
    expect(resolveApiUrl({ apiUrl: "http://flag:4000" }, home)).toBe("http://flag:4000");
  });
});

describe("renderCredentialsEnv", () => {
  it("renders a dotenv file with the credential material", () => {
    const out = renderCredentialsEnv({
      mqttUrl: "mqtt://broker:1883",
      clientId: "dc_test123",
      secret: "topsecret",
      deviceId: "DEV-1",
    });
    expect(out).toContain("AIOT_MQTT_URL=mqtt://broker:1883");
    expect(out).toContain("AIOT_MQTT_USER=dc_test123");
    expect(out).toContain("AIOT_MQTT_PASSWORD=topsecret");
  });
});

describe("injectCredentials", () => {
  function scaffoldProject(): string {
    const dir = mkdtempSync(join(tmpdir(), "aiot-sdk-proj-"));
    mkdirSync(join(dir, "config"), { recursive: true });
    writeFileSync(
      join(dir, "config", "aiot.config.json"),
      JSON.stringify({
        deviceId: "DEV-TEST1",
        projectId: "proj-1",
        orgId: "org-1",
        board: "esp32",
        deviceName: "Test Device",
        mqtt: { host: "broker.example.com", port: 8883, tls: true },
      }),
    );
    writeFileSync(
      join(dir, "config", "config.h"),
      [
        "#pragma once",
        '#define WIFI_SSID "MyWifi"',
        '#define WIFI_PASS "wifipass"',
        '#define MQTT_HOST "broker.example.com"',
        "#define MQTT_PORT 8883",
        '#define MQTT_USER ""',
        '#define MQTT_PASS ""',
        "#define MQTT_TLS true",
        "",
      ].join("\n"),
    );
    const creds = join(dir, "aiot.credentials.env");
    writeFileSync(
      creds,
      "AIOT_MQTT_USER=dc_injected1\nAIOT_MQTT_PASSWORD=injected-secret\n",
    );
    return dir;
  }

  it("injects the MQTT username/password into config.h, preserving wifi", () => {
    const dir = scaffoldProject();
    const written = injectCredentials(dir, join(dir, "aiot.credentials.env"));
    expect(written).toBe(join(dir, "config", "config.h"));
    const content = readFileSync(written, "utf8");
    expect(content).toContain('#define MQTT_USER "dc_injected1"');
    expect(content).toContain('#define MQTT_PASS "injected-secret"');
    expect(content).toContain('#define WIFI_SSID "MyWifi"');
    expect(content).toContain('#define WIFI_PASS "wifipass"');
    expect(content).toContain('#define MQTT_HOST "broker.example.com"');
  });

  it("refuses a non-project directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "aiot-sdk-empty-"));
    const creds = join(dir, "c.env");
    writeFileSync(creds, "AIOT_MQTT_USER=u\nAIOT_MQTT_PASSWORD=p\n");
    expect(() => injectCredentials(dir, creds)).toThrow(/Not an aiot-sdk project/);
  });
});
