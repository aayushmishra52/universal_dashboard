# Publishing aiot-sdk

## 1. Check the name first

Before anything else, verify that **`aiot-sdk`** is available on the public registry:

```bash
npm view aiot-sdk version   # 404 = name is free; a version = taken
```

**If the name is taken**, publish under a scope instead. Rename in `package.json`:

```json
{
  "name": "@<your-username>/aiot-sdk",
  "publishConfig": { "access": "public" }
}
```

and update every reference to the bare name in this repo:

- `README.md` — badges, `npm i -g aiot-sdk`, `npx aiot-sdk`, programmatic import example
- `src/generate/render.ts` — the `packageRoot()` name check already accepts **both** `"aiot-sdk"` and `"@aiot/sdk-generator"`; add `"@<your-username>/aiot-sdk"` to that condition
- this file (`PUBLISHING.md`)

> Scoped packages default to restricted visibility; `publishConfig.access: "public"` (already set) is required either way.

## 2. Log in

```bash
npm login
# or, for CI: npm login with a granular access token stored as NPM_TOKEN
```

## 3. Final checks before publish

```bash
npm run build      # tsc must pass
npm test           # 33 tests must pass
npm pack --dry-run # inspect exactly what will be uploaded
```

`prepublishOnly` runs `npm run build` automatically, so `dist/` is always fresh at publish time.

### What `files` includes (and excludes)

```json
"files": ["dist", "templates", "README.md", "LICENSE"]
```

- `dist` — compiled CLI + programmatic API
- `templates` — the EJS templates `create` renders from (required at runtime — `packageRoot()` locates them next to `package.json`)
- `README.md`, `LICENSE`

**Excluded by design:** `src/`, `tests/`, `tsconfig.json`, docs, `PINNED_VERSIONS.md` stays out of the tarball too (it ships in the git repo). `node_modules` and `dist` are additionally covered by `.gitignore` for the repo; npm never publishes them.

## 4. Publish

```bash
npm publish
```

For a scoped name: `npm publish --access public` (the flag is redundant once `publishConfig` is set, but harmless).

## 5. Versioning

Use `npm version` — it bumps `package.json`, tags the commit, and (with the git hooks configured) keeps everything in sync:

```bash
npm version patch   # 1.0.0 → 1.0.1  (bug fixes)
npm version minor   # 1.0.0 → 1.1.0  (new sensors/commands, backwards compatible)
npm version major   # 1.0.0 → 2.0.0  (protocol or CLI breaking changes)
npm publish
git push --follow-tags
```

Keep the **protocol version** (`PROTOCOL_VERSION = "1.0"` in `src/contracts/topics.ts`) in lockstep with any change to topics or payload schemas; the CLI version and the protocol version are independent numbers.

## 6. Verify the published package

```bash
npm view aiot-sdk dist.tarball
npx -y aiot-sdk@latest --help
```

## 7. Checklist for each release

- [ ] `npm run build` and `npm test` green
- [ ] `PINNED_VERSIONS.md` still matches what `repair` installs
- [ ] CHANGELOG entry (if you keep one) / release notes written
- [ ] `npm version <patch|minor|major>` run
- [ ] `npm publish` succeeded
- [ ] `npx -y aiot-sdk@latest doctor` runs on a clean machine
