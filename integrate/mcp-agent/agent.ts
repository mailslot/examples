/**
 * mcp-agent — the integrate track with an actual agent loop.
 *
 * The script connects to a deployed Mailslot worker's /mcp endpoint, gives the
 * discovered tools to a model, and lets the model run:
 *
 *   create_address()   → print a fresh inbox
 *   wait_for_message() → wait while you send mail to it
 *   get_message()      → read and summarize the email
 *
 * Run: cp .env.example .env && <fill it in> && npm install && npm start
 */
import "dotenv/config";

import { createMCPClient } from "@ai-sdk/mcp";
import { openai, type OpenAILanguageModelResponsesOptions } from "@ai-sdk/openai";
import { generateText, stepCountIs } from "ai";

const MAILSLOT_URL = required("MAILSLOT_URL", ["https://mailslot.your-subdomain.workers.dev"]).replace(/\/$/, "");
const MAILSLOT_TOKEN = required("MAILSLOT_TOKEN", ["your-mailslot-token"]);
required("OPENAI_API_KEY", ["your-openai-api-key"]);
const OPENAI_MODEL = required("OPENAI_MODEL");

const DEFAULT_TASK = [
  "Use the mailslot tools to create a fresh email address with prefix 'agent'.",
  "Then wait for any message sent to that address.",
  "When a message arrives, fetch the full message body with get_message.",
  "Summarize the email in plain language.",
  "Report the address, sender, subject, and summary.",
  "After creating the address, make it obvious in your response/tool trace so a human can send mail to it."
].join(" ");

const TOOL_HELP: Record<string, string> = {
  create_address: "mint one fresh address for this task",
  wait_for_message: "pause until matching mail arrives, or timeout",
  get_message: "fetch the full body for one message",
  list_messages: "browse recent inbox messages",
  extract_otp: "optional: extract a one-time code, read-once",
  extract_links: "optional: extract verification or magic links"
};

const customTask = process.argv.slice(2).join(" ").trim();
const task = customTask || DEFAULT_TASK;

let client: Awaited<ReturnType<typeof createMCPClient>> | undefined;

try {
  console.log(`Connecting to ${MAILSLOT_URL}/mcp`);
  client = await createMCPClient({
    transport: {
      type: "http",
      url: `${MAILSLOT_URL}/mcp`,
      headers: { Authorization: `Bearer ${MAILSLOT_TOKEN}` }
    }
  });

  const tools = await client.tools();
  printTools(Object.keys(tools));
  console.log("\nTask:");
  console.log(task);
  printRunExpectation(Boolean(customTask));

  const result = await generateText({
    model: openai(OPENAI_MODEL),
    tools,
    stopWhen: stepCountIs(8),
    providerOptions: {
      openai: {
        parallelToolCalls: false
      } satisfies OpenAILanguageModelResponsesOptions
    },
    system: [
      "You are an email-reading agent.",
      "Use Mailslot tools for inbox work.",
      "Use one fresh address per task.",
      "Do not reuse an address.",
      "Call tools sequentially. Create the address first, then wait on that exact address.",
      "Prefer wait_for_message over polling list_messages.",
      "For the default task, fetch the full message with get_message and summarize it.",
      "Use extract_otp or extract_links only when the task explicitly asks for a code, verification link, or magic link.",
      "extract_otp is read-once, so do not call it for generic email-reading tasks."
    ].join(" "),
    prompt: task,
    experimental_onToolCallStart({ toolCall }) {
      console.log(`→ ${toolCall.toolName} ${JSON.stringify(toolCall.input)}`);
      announceToolStart(toolCall.toolName, toolCall.input);
    },
    experimental_onToolCallFinish(event) {
      if (event.success) {
        console.log(`← ${event.toolCall.toolName} ${stringifyToolOutput(event.output)}`);
        announceToolResult(event.toolCall.toolName, event.output);
      } else {
        console.log(`← ${event.toolCall.toolName} failed: ${String(event.error)}`);
      }
    },
    onStepFinish({ stepNumber, finishReason }) {
      console.log(`step ${stepNumber}: ${finishReason}`);
    }
  });

  console.log("\nFinal:");
  console.log(result.text);
} catch (error) {
  console.error("\nRun failed:");
  console.error(explainError(error));
  process.exitCode = 1;
} finally {
  await client?.close();
}

function required(name: string, placeholders: string[] = []): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  if (placeholders.includes(value)) {
    console.error(`${name} is still set to the placeholder value from .env.example.`);
    process.exit(1);
  }
  return value;
}

function stringifyToolOutput(output: unknown): string {
  const payload = parseMcpPayload(output) ?? output;
  if (typeof payload === "string") return payload;
  return JSON.stringify(payload);
}

function explainError(error: unknown): string {
  if (error instanceof Error && /Incorrect API key provided/i.test(error.message)) {
    return [
      "OpenAI rejected OPENAI_API_KEY.",
      "Check that integrate/mcp-agent/.env contains the real key, not the .env.example placeholder.",
      "If you export OPENAI_API_KEY in your shell, that shell value wins over .env."
    ].join("\n");
  }
  return error instanceof Error ? error.message : String(error);
}

function announceToolStart(toolName: string, input: unknown): void {
  if (toolName !== "wait_for_message") return;

  const args = asRecord(input);
  const address = typeof args?.address === "string" ? args.address : "<address>";
  const timeout = typeof args?.timeout_s === "number" ? args.timeout_s : 60;

  console.log("\nWaiting for email");
  console.log(`Send an email now to: ${address}`);
  console.log(`This pauses for up to ${timeout} seconds. The process is not stuck.\n`);
}

function announceToolResult(toolName: string, output: unknown): void {
  const payload = asRecord(parseMcpPayload(output));
  if (!payload) return;

  if (toolName === "create_address" && typeof payload.address === "string") {
    console.log("\nFresh address created");
    console.log(`Send email to: ${payload.address}`);
    console.log("If wait_for_message starts, use this address and send the email then.\n");
    return;
  }

  if (toolName === "wait_for_message") {
    const message = asRecord(payload.message);
    if (!message) {
      console.log("\nNo email arrived before the wait timed out.\n");
      return;
    }
    console.log("\nEmail arrived");
    if (typeof message.subject === "string") console.log(`Subject: ${message.subject}`);
    if (typeof message.from === "string") console.log(`From: ${message.from}`);
    console.log("");
    return;
  }

  if (toolName === "get_message") {
    const subject = typeof payload.subject === "string" ? payload.subject : null;
    console.log("\nFull email fetched");
    if (subject) console.log(`Subject: ${subject}`);
    console.log("The agent will now summarize it.\n");
    return;
  }

  if (toolName === "extract_otp" && typeof payload.otp === "string") {
    console.log(`\nExtracted OTP: ${payload.otp}\n`);
    return;
  }

  if (toolName === "extract_links" && Array.isArray(payload.links) && typeof payload.links[0] === "string") {
    console.log(`\nFirst extracted link: ${payload.links[0]}\n`);
  }
}

function parseMcpPayload(output: unknown): unknown {
  const result = asRecord(output);
  if (!result || !Array.isArray(result.content)) return null;

  const textPart = result.content.find((part) => asRecord(part)?.type === "text");
  const text = asRecord(textPart)?.text;
  if (typeof text !== "string") return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function printRunExpectation(hasCustomTask: boolean): void {
  if (hasCustomTask) {
    console.log("\nCustom task supplied.");
    console.log("The model decides which Mailslot tools to call.");
    console.log("If it calls wait_for_message, the script pauses until mail arrives or the timeout expires.\n");
    return;
  }

  console.log("\nWhat happens next:");
  console.log("1. The agent creates a fresh Mailslot address.");
  console.log("2. Send any email to that address.");
  console.log("3. The agent waits for mail, reads it, then summarizes it.");
  console.log("The wait is expected. It times out if no email arrives.\n");
}

function printTools(toolNames: string[]): void {
  const knownTools = Object.keys(TOOL_HELP).filter((name) => toolNames.includes(name));
  const extraTools = toolNames.filter((name) => !(name in TOOL_HELP));
  const missingTools = Object.keys(TOOL_HELP).filter((name) => !toolNames.includes(name));

  console.log("\nAvailable Mailslot tools:");
  for (const name of knownTools) {
    console.log(`- ${name}: ${TOOL_HELP[name]}`);
  }
  for (const name of extraTools) {
    console.log(`- ${name}: server-provided tool`);
  }
  if (missingTools.length > 0) {
    console.log(`\nWarning: expected tools missing from this server: ${missingTools.join(", ")}`);
  }
}
