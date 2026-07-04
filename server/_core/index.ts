import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { seedDatabase } from "../db";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Enable CORS for all routes - reflect the request origin to support credentials
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );
    res.header("Access-Control-Allow-Credentials", "true");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageProxy(app);
  registerOAuthRoutes(app);

  app.get("/api/health", async (_req, res) => {
    try {
      const { getDb } = await import("../db");
      const { users, athletes, performanceData } = await import("../../drizzle/schema");
      const db = await getDb();
      if (!db) {
        res.json({ ok: true, store: "mock" });
        return;
      }
      const uCount = await db.select().from(users);
      const aCount = await db.select().from(athletes);
      const pCount = await db.select().from(performanceData);
      res.json({
        ok: true,
        users: uCount.map(u => ({ id: u.id, openId: u.openId, name: u.name, role: u.role, teamId: u.teamId })),
        athletes: aCount.map(a => ({ id: a.id, userId: a.userId, catapultName: a.catapultName, teamId: a.teamId })),
        performanceDataCount: pCount.length,
        performanceDataSample: pCount.slice(0, 5).map(p => ({ id: p.id, athleteId: p.athleteId, date: p.date, totalLoad: p.totalLoad }))
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  // Serve static assets from Expo Web export
  const publicPath = path.resolve(process.cwd(), "dist/web");
  app.use(express.static(publicPath));

  // Fallback route for React Single Page Application (SPA) Routing
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    res.sendFile(path.join(publicPath, "index.html"));
  });

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  // Run initial database seeding
  await seedDatabase();

  server.listen(port, () => {
    console.log(`[api] server listening on port ${port}`);
  });
}

startServer().catch(console.error);
