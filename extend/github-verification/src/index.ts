/**
 * github-verification — the minimal Mailslot customization.
 *
 * Same architecture as Example 0 (packages/instance): install @mailslot/core,
 * re-export its worker, subclass `Inbox`. The only added behavior: when a GitHub
 * verification mail lands, pull the verification link out of it (via the base
 * class's in-process `extractLinks`) and stash it.
 *
 * This is the smallest example of the house architecture — just the `onStored`
 * hook reacting to one kind of inbound mail. No browser, no scheduling, no AI.
 * (browser-signup-agent is the same idea with Browser Rendering added to
 * actually *complete* the verification.)
 *
 * Use the minted address as a GitHub email (Settings → Emails → Add email), then
 *   GET /captured/<address>   → the verification link(s) caught for that inbox.
 */
import worker from "@mailslot/core";
import { Inbox as CoreInbox, MailslotMcp, type AgentEmail, type MessageSummary } from "@mailslot/core";
import { getAgentByName } from "agents";

type Capture = { messageId: string; url: string; at: number };

export class Inbox extends CoreInbox {
  protected async onStored(_email: AgentEmail, msg: MessageSummary): Promise<void> {
    // React only to GitHub's verification mail.
    if (!/github/i.test(msg.from) || !/verify/i.test(msg.subject)) return;

    const { links } = this.extractLinks(msg.id);
    const verifyUrl = links.find((l) => /verify|emails/i.test(l)) ?? links[0];
    if (!verifyUrl) return;

    this.saveCapture(msg.id, verifyUrl);
    console.log(`captured GitHub verification link for ${this.address}: ${verifyUrl}`);
  }

  /** Verification links caught for this inbox, newest first. */
  captures(): Capture[] {
    this.ensureTable();
    return this.sql<Capture>`
      SELECT message_id AS messageId, url, captured_at AS at FROM captures ORDER BY captured_at DESC`;
  }

  private ensureTable(): void {
    this.sql`CREATE TABLE IF NOT EXISTS captures (
      message_id TEXT PRIMARY KEY, url TEXT NOT NULL, captured_at INTEGER NOT NULL)`;
  }
  private saveCapture(messageId: string, url: string): void {
    this.ensureTable();
    this.sql`INSERT OR REPLACE INTO captures (message_id, url, captured_at)
      VALUES (${messageId}, ${url}, ${Date.now()})`;
  }
}

export { MailslotMcp };

// Core's worker, plus one route to read what was captured. Everything else
// delegates to core (which does its own auth).
export default {
  ...worker,
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/captured/")) {
      const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
      if (!token || token !== env.MAILSLOT_TOKEN) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }
      const address = decodeURIComponent(url.pathname.slice("/captured/".length)).toLowerCase();
      // env.Inbox is typed as core's Inbox; this deployment binds the subclass above.
      const inboxes = env.Inbox as unknown as DurableObjectNamespace<Inbox>;
      const agent = await getAgentByName(inboxes, address);
      return Response.json({ address, captures: await agent.captures() });
    }
    return worker.fetch!(request, env, ctx);
  }
} satisfies ExportedHandler<Cloudflare.Env>;
