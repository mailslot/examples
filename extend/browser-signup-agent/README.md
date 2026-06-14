# browser-signup-agent

The canonical Mailslot demo, as a **Cloudflare deployment**. A worker that signs
*itself* up for a service, start to finish. Browser Rendering drives the form,
and the `onStored` hook clears verification the moment the mail lands. All of it
on infrastructure you own, with a throwaway address.

```
POST /signup {service}      → mints signup-x7f2@your-domain, submits it
(verification mail arrives)
onStored → extract_otp      → "482913"   [read-once]
this.schedule → reconnect to the live browser session → type the code → done
```

## Architecture

Same shape as [Example 0](https://github.com/mailslot/mailslot/tree/main/packages/instance):
install `@mailslot/core`, re-export its worker, subclass `Inbox`. The
customization in `src/index.ts` reaches for the full Agents SDK:

| Capability | Used for |
|---|---|
| Browser Rendering (`env.BROWSER`) | drive the signup form; reconnect to the **same** session to type the OTP |
| `onStored` hook | react the instant the verification mail is stored |
| `this.schedule` | run the slow browser step in a fresh invocation |
| Durable Object SQL | carry signup state (incl. the browser session id) across invocations |
| base-class read tools | `extractOtp` / `extractLinks` in-process, no HTTP round-trip |

The two-phase split is necessary. The verification mail arrives in a *separate*
worker invocation, so the signup browser session stays alive (`keep_alive`) and
gets reconnected by session id when the mail lands. Magic-link targets skip all
that; the link just opens statelessly.

## Prerequisites

- A Cloudflare account with **Browser Rendering** and **Email Routing** enabled.
- A domain on Cloudflare for `EMAIL_DOMAIN` (see the
  [Mailslot domain reality check](https://github.com/mailslot/mailslot#quick-start)).

## Configure your target

Edit `src/targets.ts`. The email loop is identical for every service; only the
browser steps differ:

- `url`, `emailSelector`, `submitSelector`: the signup form.
- `verify.mode`: `"otp"` (code typed back into the kept-alive session) or
  `"link"` (confirmation link opened statelessly).

Pick a target without a CAPTCHA on signup. Bot defenses are the realistic blocker
here, not Mailslot.

## Deploy

```sh
npm install
npx wrangler secret put MAILSLOT_TOKEN
npx wrangler deploy --var EMAIL_DOMAIN:mail.example.com
```

Then enable Email Routing for the domain and point its catch-all at this worker
(same as any Mailslot deploy).

## Run

```sh
TOKEN=<your token>
WORKER=https://mailslot-browser-signup-agent.<subdomain>.workers.dev

# kick off a signup; returns the disposable address it used
curl -s -XPOST "$WORKER/signup" -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"service":"example"}'

# poll the stage: submitted → verifying → done
curl -s "$WORKER/signup/<address>" -H "Authorization: Bearer $TOKEN"
```

> Want resilient selectors instead of hard-coded ones? Swap the `page.type`
> targets for an `env.AI` call that finds the field from the page HTML; the
> Agents SDK gives you the AI binding too. I left it out on purpose. It puts an
> LLM in the loop, and explicit selectors are easier to debug.

> Heads up: running `tsc` here surfaces two upstream `TS2589` warnings from
> `@mailslot/core` ([mailslot/mailslot#11](https://github.com/mailslot/mailslot/issues/11)).
> They don't touch `wrangler deploy`, and your own code is unaffected.
