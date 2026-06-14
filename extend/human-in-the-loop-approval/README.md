# human-in-the-loop-approval (planned)

**Track: extend** (customize the worker)

Sometimes an agent should stop and ask a human first. An `Inbox` subclass sends
the approval request (via `replyToEmail` or its own channel), then `onStored`
catches the human's emailed yes or no, parses the decision, and resumes. A
`this.schedule` timeout covers the case where nobody replies.

*SDK use:* `onStored` · DO SQL state · `this.schedule` · `replyToEmail`.

Same architecture as the built extend examples (extends `@mailslot/core`). The
wait-for-reply half is the natural Mailslot fit.

Not built yet.
