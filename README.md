# Private OpenCode on Cloudflare

This Worker hosts a private OpenCode V2 instance inside a SQLite Durable Object.

The V2 SDK (`@opencode-ai/sdk`) embeds OpenCode in-process. It does not open a
network listener. The Workerd profile (`@opencode-ai/sdk/workerd`) stores state
on Durable Object SQLite and stubs local filesystem, PTY, and process services.

This project uses the matching server profile (`@opencode-ai/server/workerd`) so
the same host is reachable over HTTP. Clients such as `opencode2 --server` and
`@opencode-ai/client` can attach.

## Limits of the Workerd profile

- No local filesystem, shell, or PTY
- Sessions, events, models, and the HTTP API persist on Durable Object SQLite
- Provider calls still go out to configured model APIs

## Setup

```sh
cp .dev.vars.example .dev.vars
```

Set `OPENCODE_SERVER_PASSWORD` in `.dev.vars`. Add provider keys there too, for
example `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`.

```sh
bun install
bun run types
bun run dev
```

## Deploy

Wrangler must be logged in first. The gzip bundle is about 3.6 MiB, so the
account needs a Workers paid plan (free plan limit is 3 MiB).

```sh
npx wrangler login
npx wrangler secret put OPENCODE_SERVER_PASSWORD
npx wrangler secret put ANTHROPIC_API_KEY
bun run deploy
```

## Connect

Username is always `opencode`. Password is the Worker secret.

```sh
export OPENCODE_SERVER_PASSWORD='your-password'
opencode2 --server https://oc-cf.<account>.workers.dev
```

Health check:

```sh
curl -u opencode:"$OPENCODE_SERVER_PASSWORD" \
  https://oc-cf.<account>.workers.dev/api/health
```

Typed client:

```ts
import { OpenCode } from "@opencode-ai/client"

const client = OpenCode.make({
  baseUrl: "https://oc-cf.<account>.workers.dev",
  headers: {
    authorization: `Basic ${btoa(`opencode:${process.env.OPENCODE_SERVER_PASSWORD}`)}`,
  },
})

await client.health.get()
```

## SDK embedding

To host OpenCode inside your own Durable Object without exposing HTTP, use the
SDK instead of the server fetch handler:

```ts
import { OpenCodeWorkerd } from "@opencode-ai/sdk/workerd"

this.opencode = state.blockConcurrencyWhile(() =>
  OpenCodeWorkerd.create({
    storage: state.storage,
    config: { default_agent: "build" },
  }),
)
```
