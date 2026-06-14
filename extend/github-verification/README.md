# github-verification

The **minimal** Mailslot customization. An `Inbox` subclass catches GitHub's
verification mail and pulls out the link, and that's the whole job. It's the
smallest example of the house architecture, so start here if the `extend` track
is new to you.

```
(add the minted address to GitHub)
verification mail arrives → onStored
extract_links → https://github.com/…/verify/…   [stashed]
GET /captured/<address> → the link
```

## Architecture

Same shape as [Example 0](https://github.com/mailslot/mailslot/tree/main/packages/instance):
install `@mailslot/core`, re-export its worker, subclass `Inbox`. This one adds
as little as a customization can:

| Capability | Used for |
|---|---|
| `onStored` hook | react to a specific inbound mail (GitHub + "verify") |
| base-class `extractLinks` | pull the verification URL in-process |
| Durable Object SQL | stash captured links per inbox |

No browser, no scheduling, no AI. For the version that actually *completes*
verification (a browser opens the link or types a code), see
[`../browser-signup-agent`](../browser-signup-agent).

## Deploy

```sh
npm install
npx wrangler secret put MAILSLOT_TOKEN
npx wrangler deploy --var EMAIL_DOMAIN:mail.example.com
```

Then enable Email Routing for the domain and point its catch-all at this worker.

## Run

```sh
TOKEN=<your token>
WORKER=https://mailslot-github-verification.<subdomain>.workers.dev

# Mint an address with core's API, add it to GitHub, then read what was caught:
ADDR=$(curl -s -XPOST "$WORKER/v1/addresses" -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"prefix":"gh"}' | jq -r .address)
echo "Add $ADDR to GitHub (Settings → Emails → Add email address)"

curl -s "$WORKER/captured/$ADDR" -H "Authorization: Bearer $TOKEN"
```

> GitHub gates account *signup* behind a CAPTCHA, so the trigger is adding the
> address as a verified email (or signing up in a browser). Opening the captured
> link while signed in as that account finishes the job.

> Heads up: running `tsc` here surfaces two upstream `TS2589` warnings from
> `@mailslot/core` ([mailslot/mailslot#11](https://github.com/mailslot/mailslot/issues/11)).
> They don't touch `wrangler deploy`, and your own code is unaffected.
