import fs from "fs";

const SERVER_STARTUP_GRACE_PERIOD_MS = 3 * 60 * 1000;
const serverStartedAt = Date.now();

// ===== KEY GENERATION =====
const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";
let key = "";

for (let i = 0; i < 30; i++) {
  key += characters.charAt(Math.floor(Math.random() * characters.length));
}

// ===== WORLD SEED STORAGE =====
let worldSeed = "NOT SET";

// ===== WEBHOOK FILE =====
const file = new URL("./webhook_message_id.txt", import.meta.url);
const webhook =
  "https://discord.com/api/webhooks/1488644677790863411/f-4jU9pi5kAZxnMaDIQdhB4ej9cTLpM0ObDd-PitrmliGMIe9TzPnPHX1-ubI1WP6JWB";

if (!fs.existsSync(file)) {
  try {
    fs.writeFileSync(file, "", "utf8");
  } catch (error) {
    console.error("Failed to create required webhook message id cache:", error);
    process.exit(1);
  }
}

let messageIds = [];
try {
  messageIds = fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-5);
} catch (error) {
  console.error("Failed to load required webhook message id cache:", error);
  process.exit(1);
}
let shutdownHandled = false;
let startedMessageCreated = false;
let webhookQueue = Promise.resolve();

function writeMessageIds(ids = []) {
  try {
    fs.writeFileSync(file, ids.join("\n"), "utf8");
  } catch (error) {
    console.error("Failed to persist required webhook message id cache:", error);
    process.exit(1);
  }
}

function addMessageId(id) {
  if (typeof id !== "string" || id.length === 0) return;
  messageIds = [...messageIds, id].slice(-5);
  writeMessageIds(messageIds);
}

function buildEmbed(title, color, extraFields = []) {
  return {
    embeds: [
      {
        title,
        color,
        fields: [
          { name: "Admin Key", value: String(key), inline: false },
          { name: "World Seed", value: String(worldSeed), inline: false },
          ...extraFields,
          { name: "Time", value: new Date().toString(), inline: false }
        ]
      }
    ]
  };
}

async function deleteWebhookMessage(id) {
  if (!id) return true;
  try {
    const res = await fetch(`${webhook}/messages/${id}`, { method: "DELETE" });
    if (res.ok || res.status === 404) {
      return true;
    }
    console.error(
      `Failed to delete previous webhook message ${id}: ${res.status} ${res.statusText}`
    );
  } catch (error) {
    console.error("Failed to delete previous webhook message:", error);
  }
  return false;
}

async function createWebhookMessage(title, color, extraFields = [], persist = true) {
  try {
    const res = await fetch(`${webhook}?wait=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildEmbed(title, color, extraFields))
    });

    if (!res.ok) {
      console.error(
        `Webhook message creation failed: ${res.status} ${res.statusText}`
      );
      return null;
    }

    const data = await res.json();
    if (typeof data?.id === "string" && data.id.length > 0) {
      if (persist) {
        addMessageId(data.id);
      }
      return data.id;
    }

    console.error("Webhook message creation did not return a valid message id.", data);
  } catch (error) {
    console.error("Failed to create webhook message:", error);
  }

  return null;
}

async function editWebhookMessage(id, title, color, extraFields = []) {
  if (!id) return null;
  try {
    const res = await fetch(`${webhook}/messages/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildEmbed(title, color, extraFields))
    });

    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      console.error(
        `Webhook message update failed for ${id}: ${res.status} ${res.statusText}`
      );
      return null;
    }

    const data = await res.json();
    if (typeof data?.id === "string" && data.id.length > 0) {
      messageIds = [data.id];
      writeMessageIds(messageIds);
      return data.id;
    }
  } catch (error) {
    console.error("Failed to update existing webhook message:", error);
  }

  return null;
}

async function replaceWebhookMessage(title, color, extraFields = []) {
  const idsToDelete = [...new Set(messageIds)];
  const latestId = idsToDelete[idsToDelete.length - 1] || null;

  if (latestId) {
    const updatedId = await editWebhookMessage(latestId, title, color, extraFields);
    if (updatedId) {
      const staleIds = idsToDelete.filter((id) => id !== updatedId);
      for (const id of staleIds) {
        await deleteWebhookMessage(id);
      }
      return updatedId;
    }
  }

  const remainingIds = [];
  for (const id of idsToDelete) {
    const deleted = await deleteWebhookMessage(id);
    if (!deleted) remainingIds.push(id);
  }
  messageIds = remainingIds;
  writeMessageIds(messageIds);

  return await createWebhookMessage(title, color, extraFields, true);
}

function queueWebhookReplace(title, color, extraFields = []) {
  webhookQueue = webhookQueue
    .catch(() => {})
    .then(() => replaceWebhookMessage(title, color, extraFields));
  return webhookQueue;
}

export function logWorldStructureSeed(world, seed, structures) {
  console.log(`[WORLD ${world}] structure seed=${seed} structures=${structures}`);
  worldSeed = String(seed);

  if (world === "main" && !startedMessageCreated) {
    startedMessageCreated = true;
    void queueWebhookReplace("[ SERVER STARTED ]", 0x2ecc71);
  }
}

async function handleShutdown(reason) {
  if (shutdownHandled) return;
  shutdownHandled = true;

  await queueWebhookReplace("[ SERVER STOPPED ]", 0xe74c3c, [
    { name: "Reason", value: reason, inline: false }
  ]);
}

process.once("SIGINT", async () => {
  await handleShutdown("SIGINT (Ctrl+C)");
  process.exit(0);
});

process.once("SIGTERM", async () => {
  await handleShutdown("SIGTERM");
  process.exit(0);
});

process.once("uncaughtException", async (error) => {
  console.error("Uncaught exception:", error);
  await handleShutdown(`uncaughtException: ${error?.message || String(error)}`);
  process.exit(1);
});

process.once("unhandledRejection", async (error) => {
  console.error("Unhandled rejection:", error);
  await handleShutdown(`unhandledRejection: ${error?.message || String(error)}`);
  process.exit(1);
});

export const adminKey = key;
export function isServerStartupGracePeriodActive(now = Date.now()) {
  return now - serverStartedAt < SERVER_STARTUP_GRACE_PERIOD_MS;
}
