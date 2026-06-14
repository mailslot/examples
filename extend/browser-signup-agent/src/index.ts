/**
 * browser-signup-agent — a Mailslot deployment that signs ITSELF up for a
 * service, end to end, on Cloudflare.
 *
 * Same architecture as Example 0 (packages/instance): install @mailslot/core,
 * re-export its worker, and customize by subclassing `Inbox`. The customization
 * here uses the full Agents SDK:
 *
 *   • Browser Rendering (env.BROWSER) drives the signup form and, once the
 *     verification mail lands, reconnects to the same live session to type the
 *     code — the DO carries the session id across invocations.
 *   • the onStored hook fires the instant the verification mail is stored.
 *   • this.schedule hands the slow browser step a fresh CPU budget.
 *   • a Durable Object SQL row carries signup state across all of the above.
 *
 * Kick off:  POST /signup { "service": "example" }  → mints an address, submits
 *            it to the service, returns the address.
 * Inspect:   GET  /signup/<address>                 → current stage.
 */
import worker from "@mailslot/core";
import { Inbox as CoreInbox, MailslotMcp, type AgentEmail, type MessageSummary } from "@mailslot/core";
import { getAgentByName } from "agents";
import puppeteer from "@cloudflare/puppeteer";
import { TARGETS } from "./targets";

declare global {
  namespace Cloudflare {
    interface Env {
      /** Browser Rendering binding (wrangler.jsonc → "browser"). */
      BROWSER: Fetcher;
    }
  }
}

/** How long to keep the signup browser session alive waiting for the mail. */
const SESSION_KEEP_ALIVE_MS = 600_000;

type Stage = "submitted" | "verifying" | "done" | "failed";
type SignupRow = {
  service: string;
  stage: Stage;
  session_id: string | null;
  code: string | null;
  link: string | null;
  note: string | null;
};

export class Inbox extends CoreInbox {
  /** Drive the browser to put THIS inbox's address into a signup form. */
  async startSignup(service: string): Promise<{ ok: boolean; note: string }> {
    const target = TARGETS[service];
    if (!target) return { ok: false, note: `unknown service "${service}"` };

    let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
    try {
      browser = await puppeteer.launch(this.env.BROWSER, { keep_alive: SESSION_KEEP_ALIVE_MS });
      const page = await browser.newPage();
      await page.goto(target.url, { waitUntil: "domcontentloaded" });
      await page.type(target.emailSelector, this.address);
      await page.click(target.submitSelector);
      await page.waitForNetworkIdle({ idleTime: 1_000 }).catch(() => {});
      this.saveSignup({ service, stage: "submitted", session_id: browser.sessionId(), code: null, link: null, note: null });
      return { ok: true, note: `submitted ${this.address} to ${service}` };
    } catch (e) {
      this.saveSignup({ service, stage: "failed", session_id: null, code: null, link: null, note: String(e) });
      return { ok: false, note: String(e) };
    } finally {
      // Detach without closing so the session (and its page) stays alive for
      // onStored to reconnect to. close() would end it.
      browser?.disconnect();
    }
  }

  /**
   * The verification mail just landed. Extract the code/link in-process (the
   * base class's read tools), then hand the slow browser step to a scheduled
   * callback with a fresh CPU budget.
   */
  protected async onStored(_email: AgentEmail, msg: MessageSummary): Promise<void> {
    const s = this.loadSignup();
    if (!s || s.stage !== "submitted") return; // not mid-signup → ignore
    const target = TARGETS[s.service];
    if (!target) return;

    const verify = target.verify;
    if (verify.mode === "otp") {
      const { otp } = this.extractOtp(msg.id);
      if (!otp) return this.saveSignup({ ...s, stage: "failed", note: "no OTP in message" });
      this.saveSignup({ ...s, stage: "verifying", code: otp });
    } else {
      const { links } = this.extractLinks(msg.id);
      const match = verify.linkMatch;
      const link = match ? links.find((l) => l.includes(match)) : links[0];
      if (!link) return this.saveSignup({ ...s, stage: "failed", note: "no link in message" });
      this.saveSignup({ ...s, stage: "verifying", link });
    }
    await this.schedule(0, "completeVerification", {});
  }

  /** Scheduled: reconnect to the live session and submit the code, or open the link. */
  async completeVerification(): Promise<void> {
    const s = this.loadSignup();
    if (!s || s.stage !== "verifying") return;
    const target = TARGETS[s.service];
    if (!target) return;

    const verify = target.verify;
    try {
      if (verify.mode === "otp" && s.code) {
        if (!s.session_id) throw new Error("browser session was lost");
        const browser = await puppeteer.connect(this.env.BROWSER, s.session_id);
        const page = (await browser.pages())[0] ?? (await browser.newPage());
        await page.type(verify.otpSelector, s.code);
        await page.click(verify.otpSubmitSelector);
        await page.waitForNetworkIdle({ idleTime: 1_000 }).catch(() => {});
        await browser.close();
      } else if (s.link) {
        const browser = await puppeteer.launch(this.env.BROWSER);
        const page = await browser.newPage();
        await page.goto(s.link, { waitUntil: "domcontentloaded" });
        await page.waitForNetworkIdle({ idleTime: 1_000 }).catch(() => {});
        await browser.close();
      }
      this.saveSignup({ ...s, stage: "done", note: null });
    } catch (e) {
      this.saveSignup({ ...s, stage: "failed", note: String(e) });
    }
  }

  /** Current signup status (exposed via GET /signup/<address>). */
  status(): SignupRow | null {
    return this.loadSignup();
  }

  // --- one-row signup state, alongside core's messages table in this DO -------
  private ensureTable(): void {
    this.sql`CREATE TABLE IF NOT EXISTS signup (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      service TEXT NOT NULL, stage TEXT NOT NULL,
      session_id TEXT, code TEXT, link TEXT, note TEXT
    )`;
  }
  private loadSignup(): SignupRow | null {
    this.ensureTable();
    return this.sql<SignupRow>`SELECT service, stage, session_id, code, link, note FROM signup WHERE id = 1`[0] ?? null;
  }
  private saveSignup(r: SignupRow): void {
    this.ensureTable();
    this.sql`INSERT INTO signup (id, service, stage, session_id, code, link, note)
      VALUES (1, ${r.service}, ${r.stage}, ${r.session_id}, ${r.code}, ${r.link}, ${r.note})
      ON CONFLICT(id) DO UPDATE SET
        service = excluded.service, stage = excluded.stage, session_id = excluded.session_id,
        code = excluded.code, link = excluded.link, note = excluded.note`;
  }
}

export { MailslotMcp };

// Core's worker (email routing + /v1 + /mcp), plus two routes: start a signup
// and read its status. Everything else delegates to core (which does its own auth).
export default {
  ...worker,
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/signup" || url.pathname.startsWith("/signup/")) {
      if (!authorized(request, env)) return Response.json({ error: "unauthorized" }, { status: 401 });
      return handleSignup(request, env, url);
    }
    return worker.fetch!(request, env, ctx);
  }
} satisfies ExportedHandler<Cloudflare.Env>;

async function handleSignup(request: Request, env: Cloudflare.Env, url: URL): Promise<Response> {
  if (!env.EMAIL_DOMAIN) return Response.json({ error: "EMAIL_DOMAIN not configured" }, { status: 500 });
  // env.Inbox is typed as core's Inbox; this deployment binds the subclass above.
  const inboxes = env.Inbox as unknown as DurableObjectNamespace<Inbox>;

  if (request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { service?: string; prefix?: string };
    const service = body.service ?? "";
    if (!TARGETS[service]) {
      return Response.json({ error: `unknown service "${service}"`, services: Object.keys(TARGETS) }, { status: 400 });
    }
    const local = `${body.prefix ?? "signup"}-${crypto.randomUUID().slice(0, 8)}`;
    const address = `${local}@${env.EMAIL_DOMAIN.toLowerCase()}`;
    const agent = await getAgentByName(inboxes, address);
    const result = await agent.startSignup(service);
    return Response.json({ address, ...result }, { status: result.ok ? 201 : 400 });
  }

  if (request.method === "GET") {
    const address = decodeURIComponent(url.pathname.slice("/signup/".length)).toLowerCase();
    if (!address.includes("@")) return Response.json({ error: "GET /signup/<address>" }, { status: 400 });
    const agent = await getAgentByName(inboxes, address);
    return Response.json({ address, status: await agent.status() });
  }

  return Response.json({ error: "not found" }, { status: 404 });
}

function authorized(request: Request, env: Cloudflare.Env): boolean {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return token.length > 0 && token === env.MAILSLOT_TOKEN;
}
