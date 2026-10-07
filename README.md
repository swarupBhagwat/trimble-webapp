# trimble-webapp

4D construction-progress tracker over Trimble Connect models.

## Run

Needs Node 20+ (no npm install, no dependencies).

1. `cp .env.example .env` and fill in the values.
2. `cp projects.example.json projects.json` and fill in your models + share tokens.
3. `node --env-file=.env server.js` then open http://localhost:3000

`start.ps1` does the same behind a public Cloudflare tunnel (needs `cloudflared`).
