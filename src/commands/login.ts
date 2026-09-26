/**
 * `aiot-sdk login` — sign in to the Universal AIoT backend and store the API
 * token in ~/.config/aiot-sdk/config.json (0600).
 *
 * Two modes:
 *   aiot-sdk login                          # prompts for email + password
 *   aiot-sdk login --token <jwt>             # store a token directly
 *
 * The --token form accepts any bearer token the backend validates, which
 * also covers Firebase ID tokens (the backend exchanges them for a session
 * token via its pluggable auth). The token is never printed.
 */
import type { Command } from "commander";
import { input, password } from "@inquirer/prompts";
import { apiRequest, ApiError } from "../api.js";
import { resolveApiUrl, saveSdkConfig } from "../config-store.js";
import { fail, header } from "./util.js";

interface LoginOptions {
  token?: string;
  apiUrl?: string;
  email?: string;
  password?: string;
}

export async function loginWithToken(
  token: string,
  opts: { apiUrl?: string } = {},
): Promise<string> {
  const apiUrl = resolveApiUrl(opts);
  // Verify the token works before storing it.
  try {
    await apiRequest<{ user: { email: string } }>(apiUrl, "/api/auth/me", { token });
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      fail("That token was rejected by the backend (401/403). Not stored.");
    }
    throw e;
  }
  return saveSdkConfig({ token, apiUrl });
}

export async function loginWithPassword(
  email: string,
  secret: string,
  opts: { apiUrl?: string } = {},
): Promise<{ path: string; email: string }> {
  const apiUrl = resolveApiUrl(opts);
  let res: { token: string; user: { email: string } };
  try {
    res = await apiRequest(apiUrl, "/api/auth/login", {
      method: "POST",
      body: { email, password: secret },
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      fail("Invalid email or password.");
    }
    throw e;
  }
  const path = saveSdkConfig({ token: res!.token, apiUrl });
  return { path, email: res!.user.email };
}

export function registerLogin(program: Command): void {
  program
    .command("login")
    .description(
      "Sign in to the Universal AIoT backend and store the API token (or store a token directly with --token).",
    )
    .option("--token <jwt>", "store this bearer token instead of signing in (also accepts Firebase ID tokens)")
    .option("--api-url <url>", "backend API base URL (default http://localhost:4000 or AIOT_API_URL)")
    .option("--email <email>", "account email (skips the prompt)")
    .option("--password <password>", "account password (skips the prompt)")
    .action(async (opts: LoginOptions) => {
      header("Sign in");
      const apiUrl = resolveApiUrl(opts);
      console.log(`Backend: ${apiUrl}`);
      if (opts.token) {
        const path = await loginWithToken(opts.token, { apiUrl });
        console.log(`Token verified and stored at ${path} (0600).`);
        return;
      }
      const email =
        opts.email ??
        (await input({ message: "Email", validate: (v) => (v.includes("@") ? true : "Enter a valid email") }));
      const secret =
        opts.password ?? (await password({ message: "Password", mask: "*" }));
      if (!secret) fail("Password is required.");
      const { path, email: who } = await loginWithPassword(email, secret, { apiUrl });
      console.log(`Signed in as ${who}. Token stored at ${path} (0600).`);
    });
}
