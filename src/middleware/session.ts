import ConnectPgSimple from "connect-pg-simple";
import session from "express-session";
import { Pool } from "pg";
import { env, isProduction } from "@/config/env.js";

const pgPool = new Pool({ connectionString: env.DATABASE_URL });

const PgSession = ConnectPgSimple(session);

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const sessionMiddleware = session({
  store: new PgSession({
    pool: pgPool,
    tableName: "session",
    createTableIfMissing: false, // table is managed by Prisma migrations
  }),
  name: "kstacks.sid",
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_MS,
  },
});
