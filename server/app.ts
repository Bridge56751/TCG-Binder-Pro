import express from "express";
import type { Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import rateLimit from "express-rate-limit";
import { registerRoutes } from "./routes";

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

const app = express();

function setupCors(app: express.Application) {
  app.use((req, res, next) => {
    const origin = req.header("origin");

    const allowedOrigins = new Set<string>();

    if (process.env.REPLIT_DEV_DOMAIN) {
      allowedOrigins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }
    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        allowedOrigins.add(`https://${d.trim()}`);
      });
    }
    if (process.env.ALLOWED_ORIGINS) {
      process.env.ALLOWED_ORIGINS.split(",").forEach((o) => {
        allowedOrigins.add(o.trim());
      });
    }

    const isLocalhost =
      origin?.startsWith("http://localhost:") ||
      origin?.startsWith("http://127.0.0.1:");

    if (!origin || allowedOrigins.has(origin) || isLocalhost) {
      if (origin) {
        res.header("Access-Control-Allow-Origin", origin);
      } else {
        res.header("Access-Control-Allow-Origin", "*");
      }
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Credentials", "true");
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });
}

function setupBodyParsing(app: express.Application) {
  app.use(
    express.json({
      limit: "10mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false }));
}

function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    const reqPath = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      if (!reqPath.startsWith("/api")) return;

      const duration = Date.now() - start;

      let logLine = `${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      console.log(logLine);
    });

    next();
  });
}

function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });
}

function setupSession(app: express.Application) {
  const isProduction = process.env.NODE_ENV === "production";
  const PgStore = connectPgSimple(session);

  app.set("trust proxy", 1);

  const rawDbUrl = process.env.GOOGLE_CLOUD_DATABASE_URL;
  const dbUrl = rawDbUrl ? rawDbUrl.replace(/[\?&]sslmode=[^&]*/g, "") : undefined;
  const pgStore = new PgStore({
    conObject: {
      connectionString: dbUrl,
      ssl: dbUrl ? { rejectUnauthorized: false } : undefined,
    },
    createTableIfMissing: true,
    errorLog: (err: Error) => {
      console.error("Session store error (non-fatal):", err.message);
    },
  });

  pgStore.on("error", (err: Error) => {
    console.error("PgStore connection error (non-fatal):", err.message);
  });

  const sessionMiddleware = session({
    store: pgStore,
    secret: process.env.SESSION_SECRET || "cardvault-dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
    },
  });

  app.use((req, res, next) => {
    sessionMiddleware(req, res, (err) => {
      if (err) {
        console.error("Session middleware error (continuing without session):", err.message);
        next();
      } else {
        next();
      }
    });
  });
}

function setupRateLimiting(app: express.Application) {
  const limiterDefaults = {
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
  };

  const scanLimiter = rateLimit({
    ...limiterDefaults,
    windowMs: 60 * 1000,
    max: 15,
    keyGenerator: (req) => {
      return req.session?.userId || req.ip || "unknown";
    },
    message: { message: "Too many scans. Please wait a minute before scanning again." },
  });

  const authLimiter = rateLimit({
    ...limiterDefaults,
    windowMs: 60 * 1000,
    max: 10,
    message: { message: "Too many attempts. Please wait a minute and try again." },
  });

  const passwordLimiter = rateLimit({
    ...limiterDefaults,
    windowMs: 60 * 60 * 1000,
    max: 12,
    message: { message: "Too many login attempts. Please wait an hour and try again." },
  });

  const strictAuthLimiter = rateLimit({
    ...limiterDefaults,
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { message: "Too many attempts. Please wait 15 minutes and try again." },
  });

  const emailLimiter = rateLimit({
    ...limiterDefaults,
    windowMs: 60 * 1000,
    max: 3,
    message: { message: "Too many email requests. Please wait a minute." },
  });

  const aiLimiter = rateLimit({
    ...limiterDefaults,
    windowMs: 60 * 1000,
    max: 10,
    keyGenerator: (req) => {
      return req.session?.userId || req.ip || "unknown";
    },
    message: { message: "Too many AI requests. Please wait a minute." },
  });

  const collectionLimiter = rateLimit({
    ...limiterDefaults,
    windowMs: 60 * 1000,
    max: 30,
    keyGenerator: (req) => {
      return req.session?.userId || req.ip || "unknown";
    },
    message: { message: "Too many collection requests. Please slow down." },
  });

  const tcgApiLimiter = rateLimit({
    ...limiterDefaults,
    windowMs: 60 * 1000,
    max: 60,
    message: { message: "Too many requests. Please wait a moment." },
  });

  const destructiveLimiter = rateLimit({
    ...limiterDefaults,
    windowMs: 60 * 60 * 1000,
    max: 3,
    keyGenerator: (req) => {
      return req.session?.userId || req.ip || "unknown";
    },
    message: { message: "Too many requests. Please wait before trying again." },
  });

  app.use("/api/identify-card", scanLimiter);
  app.use("/api/correct-card", aiLimiter);
  app.use("/api/search-cards", aiLimiter);

  app.use("/api/auth/login", passwordLimiter, authLimiter);
  app.use("/api/auth/register", authLimiter);
  app.use("/api/auth/apple", authLimiter);
  app.use("/api/auth/verify-email", authLimiter);
  app.use("/api/auth/request-reset", authLimiter);
  app.use("/api/auth/reset-password", strictAuthLimiter);
  app.use("/api/auth/resend-verification", emailLimiter);
  app.use("/api/auth/upgrade-premium", authLimiter);
  app.use("/api/auth/delete-account", destructiveLimiter);

  app.use("/api/collection/sync", collectionLimiter);
  app.use("/api/collection/cards-meta", collectionLimiter);
  app.use("/api/collection/value", collectionLimiter);

  app.use("/api/tcg", tcgApiLimiter);
  app.use("/api/search", tcgApiLimiter);
}

async function createApp() {
  setupCors(app);
  setupBodyParsing(app);
  setupSession(app);
  setupRateLimiting(app);
  setupRequestLogging(app);

  await registerRoutes(app);

  setupErrorHandler(app);

  return app;
}

const appPromise = createApp();

export { app, appPromise };
export default app;
