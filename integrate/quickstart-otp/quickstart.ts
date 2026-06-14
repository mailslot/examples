/**
 * quickstart-otp — the front door. The whole Mailslot loop in one file, against
 * a Mailslot you've already deployed. No worker to write, no browser, no deploy.
 *
 *   create_address()      → a fresh, disposable address
 *   wait_for_message()    → block until mail lands
 *   extract_otp()         → pull the code (read-once)
 *
 * Run:  cp .env.example .env && <fill it in> && npm install && npm start
 *
 * It mints an address and waits — send any email to it (from your phone) and
 * watch the code come out. In a real agent you'd trigger a signup that mails
 * this address, then extract the OTP exactly like this.
 */
import "dotenv/config";

const BASE = required("MAILSLOT_URL").replace(/\/$/, "");
const TOKEN = required("MAILSLOT_TOKEN");
const auth = { Authorization: `Bearer ${TOKEN}` };

async function main() {
  // 1. Mint a fresh address for this one task.
  const { address } = await api<{ address: string }>("POST", "/v1/addresses", { prefix: "demo" });
  console.log(`\n📬  ${address}`);
  console.log("    Send any email to it now — or wire it into a signup.\n");

  // 2. Block until something arrives (long-poll, up to 120s).
  console.log("⏳  Waiting for mail…");
  const { message } = await api<{ message: Msg | null }>(
    "GET",
    `/v1/inboxes/${encodeURIComponent(address)}/wait?timeout_s=120`
  );
  if (!message) {
    console.error("❌  Nothing arrived in time.");
    process.exit(1);
  }
  console.log(`✅  "${message.subject}" — from ${message.from}`);

  // 3. Pull the one-time code (read-once per message).
  const otp = await api<{ otp: string | null; error?: string }>(
    "POST",
    `/v1/inboxes/${encodeURIComponent(address)}/extract-otp`,
    { message_id: message.id }
  );
  console.log(otp.otp ? `\n🔑  Code: ${otp.otp}\n` : `\n(no code found: ${otp.error})\n`);
}

type Msg = { id: string; from: string; subject: string; snippet: string };

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { ...auth, "content-type": "application/json" } : auth,
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return v;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
