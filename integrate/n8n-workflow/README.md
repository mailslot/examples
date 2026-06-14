# n8n-workflow (planned)

**Track: integrate** (consume a deployed Mailslot)

Mailslot's signed `message.received` webhook feeds n8n. Set `WEBHOOK_URL` (and
`WEBHOOK_SECRET`) on your Mailslot deployment, point it at an n8n Webhook node,
verify the HMAC, then branch and act (Slack, a sheet, a ticket).

It works today with n8n's raw **Webhook** node; the community node is on the
[Mailslot roadmap](https://github.com/mailslot/mailslot#roadmap). Will ship the
workflow JSON and setup notes.

Payload shape (`v:1`):

```json
{ "v": 1, "event": "message.received", "inbox": "...@your-domain",
  "message": { "id": "...", "from": "...", "subject": "...", "snippet": "...", "receivedAt": 0 } }
```

Not built yet.
