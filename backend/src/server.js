// src/server.js
import "dotenv/config";

const [{ ENV }, { createApp }] = await Promise.all([
  import("./config/env.js"),
  import("./app.js")
]);

const app = createApp();

const server = app.listen(ENV.PORT, () => {
  console.log(`API running on http://localhost:${ENV.PORT}`);
});

let isShuttingDown = false;

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);

  server.close(async (err) => {
    if (err) {
      console.error("Error closing HTTP server:", err);
      process.exitCode = 1;
    }

    try {
      // Import only on shutdown; Prisma may not have been used yet.
      const { disconnectPrisma } = await import("./config/prisma.js");
      await disconnectPrisma();
      console.log("✅ Prisma disconnected");
    } catch (e) {
      // If Prisma was never initialized, disconnect may be a no-op; treat as non-fatal.
      console.warn("ℹ️ Prisma disconnect skipped:", e?.message || e);
    }

    process.exit(process.exitCode ?? 0);
  });

  // Safety net: force exit if shutdown hangs
  setTimeout(() => {
    console.error("⏳ Force exit (shutdown timeout)");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));