# mcp-agent (planned)

**Track: integrate** (consume a deployed Mailslot)

Point an agent at Mailslot's MCP endpoint and let *it* drive the loop, no
hard-coded steps. The agent calls `create_address`, triggers whatever needs an
email, then runs `wait_for_message` and `extract_otp` on its own.

```sh
claude mcp add mailslot $MAILSLOT_URL/mcp \
  --transport http --header "Authorization: Bearer $MAILSLOT_TOKEN"
```

> Goal: "Sign up for <service> with a fresh Mailslot address and complete email
> verification." The six tools (`create_address`, `list_messages`,
> `get_message`, `extract_otp`, `extract_links`, `wait_for_message`) are all the
> agent needs.

Not built yet. See [`../quickstart-otp`](../quickstart-otp) for the HTTP version
of the same loop.
