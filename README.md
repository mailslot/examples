# Mailslot examples

You've got a Mailslot running. Now what do you actually do with it?

That's what this folder is for: small, working examples of an agent closing the
loop through email. It mints an address, waits for the mail, and pulls out the
code or the link. Two tracks, depending on where you're starting from:

- **[`integrate/`](integrate)**: you have an agent or app and just want it to
  *use* Mailslot, over MCP or HTTP. No worker to write. Start here; it's almost
  certainly what you want first.
- **[`extend/`](extend)**: you want to change Mailslot itself. Subclass `Inbox`,
  react the moment mail lands, lean on the full Cloudflare Agents SDK. Whole
  deployments.

Before `extend/`, read Example 0. It's not here. It lives in the main repo as
[`packages/instance`](https://github.com/mailslot/mailslot/tree/main/packages/instance),
the starter `npx create-mailslot` gives you. Everything in `extend/` is shaped
like it, so I point at it rather than repeat it.

---

## `integrate/`: your agent uses Mailslot

The small one: your code calls six tools over MCP or plain HTTP. No deploy, no
worker.

| Example | What it shows | Status |
|---|---|---|
| **[quickstart-otp](integrate/quickstart-otp)** | the 30-second win: mint → wait → extract OTP, in one file over HTTP | ✅ built |
| **[mcp-agent](integrate/mcp-agent)** | point an agent at the MCP endpoint and let it drive the loop | ✅ built |
| **[n8n-workflow](integrate/n8n-workflow)** | the signed `message.received` webhook → n8n | stub |

The loop, in plain HTTP:

```
POST /v1/addresses                          → create_address
GET  /v1/inboxes/:address/wait              → wait_for_message
POST /v1/inboxes/:address/extract-otp       → extract_otp  (read-once)
POST /v1/inboxes/:address/extract-links     → extract_links
GET  /v1/inboxes/:address/messages[/:id]    → list / get
```

Same six tools over MCP:

```sh
claude mcp add mailslot $MAILSLOT_URL/mcp --transport http \
  --header "Authorization: Bearer $MAILSLOT_TOKEN"
```

## `extend/`: you change the worker

Here you're not a client of Mailslot. Your code runs inside it. Each example
installs `@mailslot/core`, re-exports its worker, and subclasses `Inbox` to react
the instant mail arrives, then uses what the Agents SDK offers (a browser, a
schedule, state, a model). Ordered small to big:

| Example | What it shows | Status |
|---|---|---|
| **[github-verification](extend/github-verification)** | the minimal customization: `onStored` + `extractLinks` | ✅ built |
| **[support-ticket-triage](extend/support-ticket-triage)** | `onStored` → `env.AI` classify → route + ack | stub |
| **[human-in-the-loop-approval](extend/human-in-the-loop-approval)** | catch a human's emailed yes/no, resume; `this.schedule` timeout | stub |
| **[browser-signup-agent](extend/browser-signup-agent)** | the flagship: Browser Rendering signs itself up, `onStored` clears verification | ✅ built |

**Running many inboxes.** One `Inbox` *class*, but one Durable Object instance
per address, each with its own isolated state. Minting many addresses is the
normal mode, and concurrent inboxes never cross wires (`browser-signup-agent`
uses a fresh address per signup for exactly this reason).

All addresses in a deployment share one behavior. To run *different* behaviors in
one worker, branch on `this.address` inside your subclass (route `signup-*` vs
`ticket-*`). No core change needed. The examples stay one-behavior-each for
clarity; a do-everything deployment is just a router on top.

---

## Conventions

- **integrate:** self-contained and `degit`-able; plain `fetch`/SDK, two env
  vars (`MAILSLOT_URL`, `MAILSLOT_TOKEN`), `npm start`. No deploy.
- **extend:** shaped like Example 0, with `package.json` (`@mailslot/core` +
  `agents`), `wrangler.jsonc` (binds the `Inbox` subclass + `MailslotMcp`,
  migration `v1`, its own R2 bucket), `tsconfig`, `src/index.ts`. Customize
  through `onStored` and the Agents SDK; never reach into core internals.
