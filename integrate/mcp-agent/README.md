# mcp-agent

**Track: integrate** (consume a deployed Mailslot)

The MCP version of the basic Mailslot loop. [`../quickstart-otp`](../quickstart-otp)
calls three HTTP endpoints directly for an OTP-specific flow. This one gives the
model Mailslot's MCP tools and lets the agent drive a generic email-reading
loop itself.

```
agent → create_address       → agent-x7f2@your-domain
you   → send mail there      → any email
agent → wait_for_message     → message summary
agent → get_message          → full email body
agent → summarize            → sender, subject, summary
```

It is intentionally small. There is no browser and no fake signup service here.
The trigger step is manual so the MCP behavior stays obvious and reproducible.
For end-to-end browser signup, use [`../../extend/browser-signup-agent`](../../extend/browser-signup-agent).

## Prerequisites

- A deployed Mailslot worker (`npx create-mailslot`), and its URL and API token.
- An OpenAI API key.
- Node 18+.

## Run

```sh
cp .env.example .env      # MAILSLOT_URL, MAILSLOT_TOKEN, OPENAI_API_KEY, OPENAI_MODEL
npm install
npm start
```

`npm start` is interactive. It does not finish by itself until mail arrives or
the wait times out.

Expected flow:

1. The script connects to your Mailslot MCP endpoint.
2. It prints the tools the agent can use.
3. The model calls `create_address`.
4. The script prints a fresh address.
5. You send any email to that address.
6. The model calls `wait_for_message` and pauses.
7. When the email arrives, the model calls `get_message` and summarizes it.

The tool list looks like this:

```text
Available Mailslot tools:
- create_address: mint one fresh address for this task
- wait_for_message: pause until matching mail arrives, or timeout
- get_message: fetch the full body for one message
- list_messages: browse recent inbox messages
- extract_otp: optional: extract a one-time code, read-once
- extract_links: optional: extract verification or magic links
```

The important moment looks like this:

```text
Fresh address created
Send email to: agent-b6mfgw@mailslot.dev
If wait_for_message starts, use this address and send the email then.

→ wait_for_message {"address":"agent-b6mfgw@mailslot.dev","timeout_s":60}

Waiting for email
Send an email now to: agent-b6mfgw@mailslot.dev
This pauses for up to 60 seconds. The process is not stuck.
```

If you do nothing, `wait_for_message` returns after the timeout and the run ends
without reading an email. That is expected.

For a quick smoke test that does **not** wait for email:

```sh
npm start -- "Create a fresh Mailslot address with prefix 'agent' and stop. Report only the address."
```

For the full email loop, send any email to the printed address. The agent waits
for the message, fetches the full body, and summarizes it.

You can also pass a custom task:

```sh
npm start -- "Create a fresh inbox, wait for an email, read it, and tell me who sent it."
```

## What it shows

The script connects to Mailslot over MCP:

```ts
const client = await createMCPClient({
  transport: {
    type: "http",
    url: `${MAILSLOT_URL}/mcp`,
    headers: { Authorization: `Bearer ${MAILSLOT_TOKEN}` }
  }
});

const tools = await client.tools();
```

Then it gives those tools to the model with a step cap:

```ts
await generateText({
  model: openai(OPENAI_MODEL),
  tools,
  stopWhen: stepCountIs(8),
  providerOptions: {
    openai: { parallelToolCalls: false }
  },
  prompt: task
});
```

Parallel tool calls are disabled on purpose. `wait_for_message` depends on the
actual address returned by `create_address`, so those calls must happen in
order.

The six tools come from the deployed worker:

| Tool | Use |
|---|---|
| `create_address` | Mint one fresh address for this task |
| `wait_for_message` | Long-poll until matching mail arrives |
| `get_message` | Fetch a full message by id |
| `list_messages` | Browse recent inbox messages |
| `extract_otp` | Pull the OTP from a message, read-once |
| `extract_links` | Pull verification or magic links |

## Why the example stops here

The tempting demo is "sign up for a real service and extract the verification
code." That belongs in a browser agent, not this first MCP example. Real
services bring selectors, CAPTCHA, bot defenses, and product-specific timing.
This example proves the reusable part: the agent can mint an inbox, wait for
mail, and read it through MCP.
