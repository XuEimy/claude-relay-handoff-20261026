# Claude reverse + kelaodeyun handoff (2026-10-26)

Private archive of the Claude page reverse-engineering package and the kelaodeyun relay-station project.

## Contents
- `claude-reverse-20261026/` — Claude UI reconstruction source, reverse notes, raw evidence, QA notes
- `kelaodeyun/` — relay-station front/back end, research on ten relays, design assets, evidence, backups, deploy templates, existing builds
- `交付说明.md` — delivery notes (Chinese)
- `MANIFEST.json` — per-file size and SHA-256

## Notes
- Dependencies are not packaged; reinstall from each project's lockfile.
- Existing `dist` builds may be older than current source; rebuild before use.
- No real `.env`, local demo passwords, node_modules, or runtime databases are included (`.env.example` kept).
- The Claude reconstruction is a local mock; the relay demo is not proof of a live Claude upstream or payment integration.
