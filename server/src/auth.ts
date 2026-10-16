import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { sessions, users, type UserRow } from "./db.ts";

export function hashPassword(password: string, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

export function checkPassword(password: string, user: UserRow) {
  const { hash } = hashPassword(password, user.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(user.pass_hash, "hex"));
}

export function newSession(userId: number) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.create(token, userId);
  return token;
}

export const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

export function validateCredentials(username: unknown, password: unknown): string | null {
  if (typeof username !== "string" || !USERNAME_RE.test(username))
    return "Nick musi mieć 3-20 znaków: litery, cyfry lub _";
  if (typeof password !== "string" || password.length < 6 || password.length > 100)
    return "Hasło musi mieć co najmniej 6 znaków";
  return null;
}

/** gracz z tokenu; zbanowany nie wejdzie do gier (ban czasowy po wygaśnięciu przestaje działać) */
export function userFromToken(token: unknown): UserRow | undefined {
  const u = typeof token === "string" && token ? sessions.userFor(token) : undefined;
  return u && !users.activeBan(u) ? u : undefined;
}

export interface AuthedRequest extends Request {
  user: UserRow;
  token: string;
}

/** Middleware wymagające zalogowania (nagłówek Authorization: Bearer <token>) */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
  const raw = token ? sessions.userFor(token) : undefined;
  const ban = raw ? users.activeBan(raw) : null;
  // zbanowany: klient pokazuje ekran zbanowania (powód, podpis moderatora, czas)
  if (raw && ban) {
    res.status(403).json({ error: "To konto jest zablokowane", ban });
    return;
  }
  const user = raw;
  if (!user) {
    res.status(401).json({ error: "Zaloguj się ponownie" });
    return;
  }
  (req as AuthedRequest).user = user;
  (req as AuthedRequest).token = token;
  next();
}
