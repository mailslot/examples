# quickstart-otp

**Start here.** The whole Mailslot loop in one file. You point it at a Mailslot
you've already deployed, and that's it: no worker to write, no browser, no second
deploy.

```
create_address()   → demo-x7f2@your-domain
wait_for_message() → blocks until mail lands
extract_otp()      → "482913"   [read-once]
```

## Prerequisites

- A deployed Mailslot worker (`npx create-mailslot`), and its URL and API token.
- Node 18+.

## Run

```sh
cp .env.example .env      # MAILSLOT_URL, MAILSLOT_TOKEN
npm install
npm start
```

It mints an address and waits. Send any email to it from your phone and watch the
code come out. In a real agent you'd trigger a signup that mails this address,
then extract the OTP exactly like this.

## What it shows

Plain HTTP (`fetch`, no SDK) against the three tools that close an email loop:

| Endpoint | Tool |
|---|---|
| `POST /v1/addresses` | `create_address` |
| `GET  /v1/inboxes/:address/wait` | `wait_for_message` |
| `POST /v1/inboxes/:address/extract-otp` | `extract_otp` (read-once) |

This is the **integrate** track: your code consumes a running Mailslot. To
customize the worker itself (auto-reply, browser signups, triage), see
[`../../extend`](../../extend).
