# support-ticket-triage (planned)

**Track: extend** (customize the worker)

Support mail comes in, and the worker triages it on arrival. An `Inbox` subclass
classifies each message in `onStored` with Workers AI (`env.AI`) for urgency,
category, and intent, then routes it downstream (Slack or a ticketing system via
`fetch`) and optionally fires back an acknowledgement with `replyToEmail`.

*SDK use:* Workers AI · `onStored` · `replyToEmail`.

Same architecture as the built extend examples (extends `@mailslot/core`, see
[`../github-verification`](../github-verification)). `lead-qualification` is the
same shape with a different prompt, so fork it rather than rebuild.

Not built yet.
