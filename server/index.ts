import cookieParser from "cookie-parser";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";
import { OAuth2Client } from "google-auth-library";
import express, { type ErrorRequestHandler, type NextFunction } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import multer from "multer";
import { z } from "zod";
import { config } from "./config.js";
import { Achievement, type AchievementDocument } from "./models/Achievement.js";
import { normalizeCertificateImage } from "./certificate-image.js";
import { Connection } from "./models/Connection.js";
import { Hackathon } from "./models/Hackathon.js";
import { HackathonSourceStatus } from "./models/HackathonSourceStatus.js";
import { Message } from "./models/Message.js";
import { Notification } from "./models/Notification.js";
import { Rating } from "./models/Rating.js";
import { Team, type TeamDocument } from "./models/Team.js";
import { User, toPublicProfile, toPublicUser, type UserDocument } from "./models/User.js";
import {
  createCsrfToken,
  createTotpUri,
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpSecret,
  verifyCsrfToken,
  verifyTotpCode,
} from "./security.js";
import { createNotification } from "./notifications.js";
import type { Request, Response } from "express";

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string };
    }
  }
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const app = express();
const cookieName = "hackconnect_session";
const csrfCookieName = "hackconnect_csrf";
const sessionDurationMs = 7 * 24 * 60 * 60 * 1000;
const uploadLimitBytes = 5 * 1024 * 1024;
const maxAchievementsPerUser = 25;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: uploadLimitBytes, files: 1, fields: 5, parts: 6 },
});
const googleClient = config.googleClientId
  ? new OAuth2Client(config.googleClientId)
  : null;

app.disable("x-powered-by");
if (config.isProduction) {
  app.set("trust proxy", 1);
}
app.use(helmet());
app.use(
  cors({
    origin: config.webOrigin,
    credentials: true,
  }),
);
app.use(express.json({ limit: "20kb" }));
app.use(cookieParser());
app.use((request, response, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    next();
    return;
  }

  const origin = request.get("origin");
  if (origin && origin !== config.webOrigin) {
    response.status(403).json({ error: "Request origin is not allowed." });
    return;
  }
  const referer = request.get("referer");
  if (!origin && referer) {
    try {
      if (new URL(referer).origin !== config.webOrigin) {
        response.status(403).json({ error: "Request origin is not allowed." });
        return;
      }
    } catch {
      response.status(403).json({ error: "Request origin is not allowed." });
      return;
    }
  }

  const cookieToken: unknown = request.cookies?.[csrfCookieName];
  const headerToken = request.get("x-csrf-token");
  if (
    !config.jwtSecret ||
    typeof cookieToken !== "string" ||
    !headerToken ||
    cookieToken !== headerToken ||
    !verifyCsrfToken(headerToken, config.jwtSecret)
  ) {
    response.status(403).json({ error: "CSRF token is missing or invalid. Refresh and try again." });
    return;
  }
  next();
});

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Try again later." },
});

const assistantRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 8,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "The team sidekick is busy. Try again in a minute." },
});

const workspaceWriteRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many workspace updates. Try again in a minute." },
});

const achievementReadRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 90,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many certificate requests. Try again in a minute." },
});

const registrationSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(254),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(30)
    .regex(/^[a-z0-9_]+$/, "Use only letters, numbers, and underscores."),
  password: z.string().min(8).max(72),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(72),
});

const googleSchema = z.object({
  credential: z.string().min(1).max(10000),
});

const planSchema = z.object({
  teamName: z.string().trim().min(1).max(100),
  idea: z.string().trim().min(10).max(3000),
  members: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        role: z.string().trim().min(1).max(100),
      }),
    )
    .max(12)
    .default([]),
});

const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  bio: z.string().trim().max(1000),
  role: z.string().trim().max(100),
  school: z.string().trim().max(120),
  location: z.string().trim().max(120),
  skills: z.array(z.string().trim().min(1).max(40)).max(20),
  profileVisibility: z.enum(["public", "private"]),
});

const connectionSchema = z.object({
  recipientId: z.string().regex(/^[a-f\d]{24}$/i),
});

const teamSchema = z.object({
  name: z.string().trim().min(2).max(100),
  idea: z.string().trim().min(10).max(3000),
  hackathon: z.string().trim().max(120).default(""),
});

const taskSchema = z.object({
  title: z.string().trim().min(1).max(240),
  assigneeId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
});

const teamMemberSchema = z.object({
  userId: z.string().regex(/^[a-f\d]{24}$/i),
  role: z.string().trim().min(1).max(80).default("Builder"),
});

const taskUpdateSchema = z.object({
  completed: z.boolean(),
});

const messageSchema = z.object({
  text: z.string().trim().min(1).max(4000),
});

const ratingSchema = z.object({
  revieweeId: z.string().regex(/^[a-f\d]{24}$/i),
  teamId: z.string().regex(/^[a-f\d]{24}$/i),
  score: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).default(""),
});

const hackathonSchema = z.object({
  saved: z.boolean().optional(),
  interested: z.boolean().optional(),
}).refine((value) => value.saved !== undefined || value.interested !== undefined);

const hackathonNotificationFiltersSchema = z.object({
  formats: z.array(z.enum(["online", "in-person", "hybrid"])).max(3),
  categories: z.array(z.string().trim().min(1).max(60)).max(20),
  destination: z.string().trim().max(120),
});
const notificationReadSchema = z.object({ read: z.boolean() });
const mfaCodeSchema = z.string().regex(/^\d{6}$/, "Enter the 6-digit authenticator code.");
const mfaChallengeSchema = z.object({
  challengeToken: z.string().min(1).max(2000),
  code: mfaCodeSchema,
});
const reauthenticationSchema = z.object({
  password: z.string().min(1).max(72).optional(),
  googleCredential: z.string().min(1).max(10000).optional(),
});
const mfaDisableSchema = reauthenticationSchema
  .extend({ code: mfaCodeSchema })
  .refine((value) => Boolean(value.password) !== Boolean(value.googleCredential));
const achievementUploadSchema = z.object({
  title: z.string().trim().min(1).max(120),
  issuer: z.string().trim().min(1).max(120),
  achievedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  publicVisible: z.enum(["true", "false"]),
  publicConsent: z.literal("on").optional(),
}).refine(
  (value) => value.publicVisible !== "true" || value.publicConsent === "on",
  { path: ["publicConsent"], message: "Confirm public visibility to publish this certificate." },
);
const achievementVisibilitySchema = z.object({
  publicVisible: z.boolean(),
  publicConsent: z.literal(true).optional(),
}).refine(
  (value) => !value.publicVisible || value.publicConsent === true,
  { path: ["publicConsent"], message: "Confirm public visibility to publish this certificate." },
);

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

function getUserId(request: Request): string {
  if (!request.auth) {
    throw new HttpError(401, "Please sign in to continue.");
  }
  return request.auth.userId;
}

function getRouteParam(request: Request, name: string): string {
  const value = request.params[name];
  if (typeof value !== "string") throw new HttpError(400, "Invalid request path.");
  return value;
}

async function findMemberTeam(teamId: string, userId: string) {
  if (!mongoose.isValidObjectId(teamId)) {
    throw new HttpError(404, "Team not found.");
  }
  const team = await Team.findOne({ _id: teamId, "members.userId": userId });
  if (!team) {
    throw new HttpError(404, "Team not found.");
  }
  return team;
}

function serializeTeam(team: TeamDocument) {
  return {
    id: team._id.toString(),
    name: team.name,
    idea: team.idea,
    hackathon: team.hackathon,
    ownerId: team.ownerId.toString(),
    members: team.members.map((member) => ({
      userId: member.userId.toString(),
      role: member.role,
    })),
    tasks: team.tasks.map((task) => ({
      id: task._id?.toString() ?? "",
      title: task.title,
      assigneeId: task.assigneeId?.toString() ?? null,
      completed: task.completed,
    })),
  };
}

function serializeAchievement(achievement: AchievementDocument) {
  const id = achievement._id.toString();
  return {
    id,
    title: achievement.title,
    issuer: achievement.issuer,
    achievedAt: achievement.achievedAt.toISOString(),
    publicVisible: achievement.publicVisible,
    imageUrl: `/api/achievements/${id}/image`,
  };
}

function requireDatabase(_request: Request, response: Response, next: NextFunction) {
  if (mongoose.connection.readyState !== 1) {
    response.status(503).json({ error: "Database is not connected yet." });
    return;
  }
  next();
}

function createSession(userId: string, response: Response) {
  if (!config.jwtSecret) {
    throw new HttpError(503, "Session signing is not configured.");
  }
  const token = jwt.sign({ sub: userId }, config.jwtSecret, {
    expiresIn: "7d",
    issuer: "hackconnect-api",
    audience: "hackconnect-web",
  });
  response.cookie(cookieName, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: config.isProduction ? "none" : "lax",
    maxAge: sessionDurationMs,
    path: "/",
  });
}

function clearSession(response: Response) {
  response.clearCookie(cookieName, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: config.isProduction ? "none" : "lax",
    path: "/",
  });
}

async function createMfaChallenge(userId: string, response: Response) {
  if (!config.jwtSecret) {
    throw new HttpError(503, "Session signing is not configured.");
  }
  const challengeId = randomUUID();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  const updated = await User.findByIdAndUpdate(
    userId,
    { $set: { mfaChallengeId: challengeId, mfaChallengeExpiresAt: expiresAt } },
    { new: true },
  ).select("_id");
  if (!updated) throw new HttpError(401, "Account not found. Please sign in again.");
  clearSession(response);
  const challengeToken = jwt.sign({ sub: userId, mfa: true, jti: challengeId }, config.jwtSecret, {
    expiresIn: "5m",
    issuer: "hackconnect-api",
    audience: "hackconnect-mfa",
  });
  response.setHeader("Cache-Control", "no-store");
  response.json({ mfaRequired: true, challengeToken });
}

function verifyMfaChallenge(token: string): { userId: string; challengeId: string } {
  if (!config.jwtSecret) throw new HttpError(503, "Session signing is not configured.");
  try {
    const payload = jwt.verify(token, config.jwtSecret, {
      issuer: "hackconnect-api",
      audience: "hackconnect-mfa",
    });
    if (
      typeof payload === "string" ||
      typeof payload.sub !== "string" ||
      payload.mfa !== true ||
      typeof payload.jti !== "string"
    ) {
      throw new Error("Invalid MFA challenge.");
    }
    return { userId: payload.sub, challengeId: payload.jti };
  } catch {
    throw new HttpError(401, "This sign-in challenge expired. Please sign in again.");
  }
}

async function verifyReauthentication(
  user: UserDocument | null,
  credentials: z.infer<typeof reauthenticationSchema>,
) {
  if (!user || Boolean(credentials.password) === Boolean(credentials.googleCredential)) {
    throw new HttpError(400, "Provide one valid reauthentication method.");
  }
  if (credentials.password) {
    if (
      !user.authProviders.includes("email") ||
      !user.passwordHash ||
      !(await bcrypt.compare(credentials.password, user.passwordHash))
    ) {
      throw new HttpError(401, "Reauthentication failed.");
    }
    return;
  }

  if (!credentials.googleCredential || !googleClient || !config.googleClientId) {
    throw new HttpError(401, "Reauthentication failed.");
  }
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credentials.googleCredential,
      audience: config.googleClientId,
    });
    const payload = ticket.getPayload();
    if (
      !payload?.sub ||
      payload.sub !== user.googleId ||
      payload.email_verified !== true
    ) {
      throw new Error("Google identity did not match.");
    }
  } catch {
    throw new HttpError(401, "Reauthentication failed.");
  }
}

function requireAuth(request: Request, _response: Response, next: NextFunction) {
  const token: unknown = request.cookies?.[cookieName];
  if (typeof token !== "string") {
    next(new HttpError(401, "Please sign in to continue."));
    return;
  }
  if (!config.jwtSecret) {
    next(new HttpError(503, "Session signing is not configured."));
    return;
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret, {
      issuer: "hackconnect-api",
      audience: "hackconnect-web",
    });
    if (typeof payload === "string" || typeof payload.sub !== "string") {
      next(new HttpError(401, "Your session is invalid. Please sign in again."));
      return;
    }
    request.auth = { userId: payload.sub };
    next();
  } catch {
    next(new HttpError(401, "Your session expired. Please sign in again."));
  }
}

function sendValidationError(response: Response, error: z.ZodError) {
  response.status(400).json({
    error: "Please check the submitted information.",
    details: error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    })),
  });
}

app.get("/api/health", (_request, response) => {
  response.json({
    status: "ok",
    ready: mongoose.connection.readyState === 1,
    database: mongoose.connection.readyState === 1 ? "connected" : "not connected",
    integrations: {
      google: Boolean(config.googleClientId),
      gemini: Boolean(config.geminiApiKey),
    },
  });
});

app.get("/api/auth/csrf", (request, response) => {
  if (!config.jwtSecret) throw new HttpError(503, "CSRF protection is not configured.");
  const existing: unknown = request.cookies?.[csrfCookieName];
  const csrfToken =
    typeof existing === "string" && verifyCsrfToken(existing, config.jwtSecret)
      ? existing
      : createCsrfToken(config.jwtSecret);
  response.cookie(csrfCookieName, csrfToken, {
    httpOnly: false,
    secure: config.isProduction,
    sameSite: config.isProduction ? "none" : "lax",
    maxAge: sessionDurationMs,
    path: "/",
  });
  response.setHeader("Cache-Control", "no-store");
  response.json({ csrfToken });
});

app.post("/api/auth/register", authRateLimit, requireDatabase, async (request, response) => {
  const result = registrationSchema.safeParse(request.body);
  if (!result.success) {
    sendValidationError(response, result.error);
    return;
  }
  if (!config.jwtSecret) {
    throw new HttpError(503, "Session signing is not configured.");
  }

  const { fullName, email, username, password } = result.data;
  const duplicate = await User.findOne({ $or: [{ email }, { username }] }).select("_id");
  if (duplicate) {
    throw new HttpError(409, "That email or username is already in use.");
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      fullName,
      email,
      username,
      passwordHash,
      authProviders: ["email"],
      emailVerified: false,
      skills: [],
    });
    createSession(user._id.toString(), response);
    response.status(201).json({ user: toPublicUser(user) });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new HttpError(409, "That email or username is already in use.");
    }
    throw error;
  }
});

app.post("/api/auth/login", authRateLimit, requireDatabase, async (request, response) => {
  const result = loginSchema.safeParse(request.body);
  if (!result.success) {
    sendValidationError(response, result.error);
    return;
  }
  if (!config.jwtSecret) {
    throw new HttpError(503, "Session signing is not configured.");
  }

  const user = await User.findOne({ email: result.data.email }).select("+passwordHash");
  if (!user?.passwordHash || !(await bcrypt.compare(result.data.password, user.passwordHash))) {
    throw new HttpError(401, "Email or password is incorrect.");
  }

  if (user.mfaEnabled) {
    await createMfaChallenge(user._id.toString(), response);
    return;
  }
  createSession(user._id.toString(), response);
  response.json({ user: toPublicUser(user) });
});

app.post("/api/auth/google", authRateLimit, requireDatabase, async (request, response) => {
  const result = googleSchema.safeParse(request.body);
  if (!result.success) {
    sendValidationError(response, result.error);
    return;
  }
  if (!config.jwtSecret) {
    throw new HttpError(503, "Session signing is not configured.");
  }
  if (!googleClient || !config.googleClientId) {
    throw new HttpError(503, "Google sign-in is not configured yet.");
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: result.data.credential,
      audience: config.googleClientId,
    });
    payload = ticket.getPayload();
  } catch {
    throw new HttpError(401, "Google could not verify this sign-in. Please try again.");
  }

  if (!payload?.sub || !payload.email || payload.email_verified !== true || !payload.name) {
    throw new HttpError(401, "Google did not return a verified email for this account.");
  }

  let user = await User.findOne({ googleId: payload.sub });
  if (!user) {
    const existingEmailAccount = await User.findOne({ email: payload.email.toLowerCase() }).select("_id");
    if (existingEmailAccount) {
      throw new HttpError(
        409,
        "An account already uses this email. Sign in with its existing method before linking Google.",
      );
    }

    try {
      user = await User.create({
        fullName: payload.name,
        email: payload.email.toLowerCase(),
        googleId: payload.sub,
        avatarUrl: payload.picture,
        authProviders: ["google"],
        emailVerified: true,
        skills: [],
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new HttpError(409, "This Google account is already linked to another profile.");
      }
      throw error;
    }
  } else {
    user.avatarUrl = payload.picture ?? user.avatarUrl;
    await user.save();
  }

  if (user.mfaEnabled) {
    await createMfaChallenge(user._id.toString(), response);
    return;
  }
  createSession(user._id.toString(), response);
  response.json({ user: toPublicUser(user) });
});

app.post("/api/auth/mfa/verify", authRateLimit, requireDatabase, async (request, response) => {
  const result = mfaChallengeSchema.safeParse(request.body);
  if (!result.success) {
    sendValidationError(response, result.error);
    return;
  }
  const { userId, challengeId } = verifyMfaChallenge(result.data.challengeToken);
  const user = await User.findById(userId).select("+mfaSecret");
  if (!user?.mfaEnabled || !user.mfaSecret || !config.jwtSecret) {
    throw new HttpError(401, "This sign-in challenge is no longer valid. Please sign in again.");
  }

  let secret: string;
  try {
    secret = decryptTotpSecret(user.mfaSecret, config.jwtSecret);
  } catch {
    throw new HttpError(503, "Authenticator security is unavailable. Contact support.");
  }
  const step = verifyTotpCode(secret, result.data.code, Date.now(), user.mfaLastUsedStep);
  if (step === null) throw new HttpError(401, "The authenticator code is invalid or has already been used.");
  const consumed = await User.findOneAndUpdate(
    {
      _id: user._id,
      mfaEnabled: true,
      mfaChallengeId: challengeId,
      mfaChallengeExpiresAt: { $gt: new Date() },
      mfaLastUsedStep: { $lt: step },
    },
    {
      $set: { mfaLastUsedStep: step },
      $unset: { mfaChallengeId: 1, mfaChallengeExpiresAt: 1 },
    },
    { new: true },
  ).select("_id");
  if (!consumed) throw new HttpError(401, "The authenticator code is invalid or has already been used.");

  createSession(user._id.toString(), response);
  response.json({ user: toPublicUser(user) });
});

app.get("/api/auth/mfa/status", requireAuth, requireDatabase, async (request, response) => {
  const user = await User.findById(getUserId(request)).select("mfaEnabled authProviders");
  if (!user) throw new HttpError(404, "Account not found.");
  response.json({
    enabled: user.mfaEnabled,
    provider: user.authProviders.includes("google") ? "google" : "email",
  });
});

app.post(
  "/api/auth/mfa/setup",
  requireAuth,
  authRateLimit,
  requireDatabase,
  async (request, response) => {
    const result = reauthenticationSchema.safeParse(request.body);
    if (!result.success) {
      sendValidationError(response, result.error);
      return;
    }
    if (!config.jwtSecret) throw new HttpError(503, "Authenticator security is not configured.");
    const user = await User.findById(getUserId(request)).select("+passwordHash");
    if (!user) throw new HttpError(404, "Account not found.");
    await verifyReauthentication(user, result.data);
    if (user.mfaEnabled) throw new HttpError(409, "Authenticator MFA is already enabled.");

    const secret = generateTotpSecret();
    user.mfaPendingSecret = encryptTotpSecret(secret, config.jwtSecret);
    user.mfaPendingExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();
    response.setHeader("Cache-Control", "no-store");
    response.json({
      secret,
      otpauthUrl: createTotpUri(secret, user.email),
      expiresInSeconds: 600,
    });
  },
);

app.post(
  "/api/auth/mfa/confirm",
  requireAuth,
  authRateLimit,
  requireDatabase,
  async (request, response) => {
    const result = z.object({ code: mfaCodeSchema }).safeParse(request.body);
    if (!result.success) {
      sendValidationError(response, result.error);
      return;
    }
    if (!config.jwtSecret) throw new HttpError(503, "Authenticator security is not configured.");
    const user = await User.findById(getUserId(request)).select("+mfaPendingSecret");
    if (!user || user.mfaEnabled || !user.mfaPendingSecret || !user.mfaPendingExpiresAt) {
      throw new HttpError(409, "Start authenticator setup again before confirming.");
    }
    if (user.mfaPendingExpiresAt.getTime() <= Date.now()) {
      user.mfaPendingSecret = undefined;
      user.mfaPendingExpiresAt = undefined;
      await user.save();
      throw new HttpError(410, "Authenticator setup expired. Start again.");
    }
    let secret: string;
    try {
      secret = decryptTotpSecret(user.mfaPendingSecret, config.jwtSecret);
    } catch {
      throw new HttpError(503, "Authenticator security is unavailable. Contact support.");
    }
    const step = verifyTotpCode(secret, result.data.code);
    if (step === null) throw new HttpError(400, "The authenticator code is invalid.");

    const enabled = await User.findOneAndUpdate(
      { _id: user._id, mfaEnabled: { $ne: true }, mfaPendingSecret: user.mfaPendingSecret },
      {
        $set: { mfaEnabled: true, mfaSecret: user.mfaPendingSecret, mfaLastUsedStep: step },
        $unset: { mfaPendingSecret: 1, mfaPendingExpiresAt: 1 },
      },
      { new: true },
    ).select("_id");
    if (!enabled) throw new HttpError(409, "Authenticator setup changed. Start again.");
    response.json({ enabled: true });
  },
);

app.post(
  "/api/auth/mfa/disable",
  requireAuth,
  authRateLimit,
  requireDatabase,
  async (request, response) => {
    const result = mfaDisableSchema.safeParse(request.body);
    if (!result.success) {
      sendValidationError(response, result.error);
      return;
    }
    if (!config.jwtSecret) throw new HttpError(503, "Authenticator security is not configured.");
    const user = await User.findById(getUserId(request)).select("+passwordHash +mfaSecret");
    if (!user?.mfaEnabled || !user.mfaSecret) {
      throw new HttpError(409, "Authenticator MFA is not enabled.");
    }
    await verifyReauthentication(user, result.data);
    let secret: string;
    try {
      secret = decryptTotpSecret(user.mfaSecret, config.jwtSecret);
    } catch {
      throw new HttpError(503, "Authenticator security is unavailable. Contact support.");
    }
    const step = verifyTotpCode(secret, result.data.code, Date.now(), user.mfaLastUsedStep);
    if (step === null) {
      throw new HttpError(401, "Reauthentication failed. Check your password and current authenticator code.");
    }
    const disabled = await User.findOneAndUpdate(
      { _id: user._id, mfaEnabled: true, mfaLastUsedStep: { $lt: step } },
      {
        $set: { mfaEnabled: false, mfaLastUsedStep: -1 },
        $unset: {
          mfaSecret: 1,
          mfaPendingSecret: 1,
          mfaPendingExpiresAt: 1,
          mfaChallengeId: 1,
          mfaChallengeExpiresAt: 1,
        },
      },
      { new: true },
    ).select("_id");
    if (!disabled) throw new HttpError(401, "That authenticator code was already used. Try the next code.");
    response.json({ enabled: false });
  },
);

app.get("/api/auth/me", requireAuth, requireDatabase, async (request, response) => {
  const user = await User.findById(request.auth?.userId);
  if (!user) {
    clearSession(response);
    throw new HttpError(401, "Your account could not be found. Please sign in again.");
  }
  response.json({ user: toPublicUser(user) });
});

app.get("/api/profile", requireAuth, requireDatabase, async (request, response) => {
  const user = await User.findById(getUserId(request));
  if (!user) throw new HttpError(404, "Account not found.");
  response.json({ profile: toPublicUser(user) });
});

app.get("/api/achievements", requireAuth, requireDatabase, async (request, response) => {
  const achievements = await Achievement.find({ ownerId: getUserId(request) })
    .sort({ achievedAt: -1 })
    .limit(50);
  response.json({ achievements: achievements.map(serializeAchievement) });
});

app.post(
  "/api/achievements",
  requireAuth,
  workspaceWriteRateLimit,
  requireDatabase,
  upload.single("certificate"),
  async (request, response) => {
    const result = achievementUploadSchema.safeParse(request.body);
    if (!result.success) {
      sendValidationError(response, result.error);
      return;
    }
    if (!request.file) throw new HttpError(400, "A photo certificate is required.");
    const ownerId = getUserId(request);
    if (await Achievement.countDocuments({ ownerId }) >= maxAchievementsPerUser) {
      throw new HttpError(409, `Profiles can contain up to ${maxAchievementsPerUser} achievements.`);
    }
    const achievedAt = new Date(`${result.data.achievedAt}T00:00:00.000Z`);
    if (
      Number.isNaN(achievedAt.getTime()) ||
      achievedAt.toISOString().slice(0, 10) !== result.data.achievedAt
    ) {
      throw new HttpError(400, "Enter a valid certificate date.");
    }

    let photo: Buffer;
    try {
      photo = await normalizeCertificateImage(request.file.buffer);
    } catch {
      throw new HttpError(400, "Upload a valid JPEG, PNG, or WebP certificate photo under 5 MiB.");
    }

    const achievement = await Achievement.create({
      ownerId: new mongoose.Types.ObjectId(ownerId),
      title: result.data.title,
      issuer: result.data.issuer,
      achievedAt,
      publicVisible: result.data.publicVisible === "true",
      image: photo,
    });
    response.status(201).json({ achievement: serializeAchievement(achievement) });
  },
);

app.get(
  "/api/users/:userId/achievements",
  achievementReadRateLimit,
  requireDatabase,
  async (request, response) => {
  const userId = getRouteParam(request, "userId");
  if (!mongoose.isValidObjectId(userId)) throw new HttpError(404, "Profile not found.");
  if (!(await User.exists({ _id: userId, profileVisibility: { $ne: "private" } }))) {
    throw new HttpError(404, "Profile not found.");
  }
  const achievements = await Achievement.find({ ownerId: userId, publicVisible: true })
    .sort({ achievedAt: -1 })
    .limit(50);
  response.json({ achievements: achievements.map(serializeAchievement) });
  },
);

app.get(
  "/api/achievements/:achievementId/image",
  achievementReadRateLimit,
  requireDatabase,
  async (request, response) => {
  const achievementId = getRouteParam(request, "achievementId");
  if (!mongoose.isValidObjectId(achievementId)) throw new HttpError(404, "Certificate photo not found.");
  const token: unknown = request.cookies?.[cookieName];
  let ownerId: string | null = null;
  if (typeof token === "string" && config.jwtSecret) {
    try {
      const payload = jwt.verify(token, config.jwtSecret, {
        issuer: "hackconnect-api",
        audience: "hackconnect-web",
      });
      ownerId = typeof payload !== "string" && typeof payload.sub === "string" ? payload.sub : null;
    } catch {
      ownerId = null;
    }
  }
  const achievement = await Achievement.findById(achievementId).select("+image");
  if (!achievement) throw new HttpError(404, "Certificate photo not found.");
  const isOwner = ownerId === achievement.ownerId.toString();
  const isPublicProfile = achievement.publicVisible && Boolean(await User.exists({
    _id: achievement.ownerId,
    profileVisibility: { $ne: "private" },
  }));
  if (!isOwner && !isPublicProfile) throw new HttpError(404, "Certificate photo not found.");
  response.setHeader("Content-Type", "image/webp");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  response.setHeader("Cache-Control", "private, no-store");
  response.send(achievement.image);
  },
);

app.patch(
  "/api/achievements/:achievementId/visibility",
  requireAuth,
  workspaceWriteRateLimit,
  requireDatabase,
  async (request, response) => {
    const result = achievementVisibilitySchema.safeParse(request.body);
    if (!result.success) {
      sendValidationError(response, result.error);
      return;
    }
    const achievementId = getRouteParam(request, "achievementId");
    if (!mongoose.isValidObjectId(achievementId)) throw new HttpError(404, "Achievement not found.");
    const achievement = await Achievement.findOneAndUpdate(
      { _id: achievementId, ownerId: getUserId(request) },
      { $set: { publicVisible: result.data.publicVisible } },
      { new: true, runValidators: true },
    );
    if (!achievement) throw new HttpError(404, "Achievement not found.");
    response.json({ achievement: serializeAchievement(achievement) });
  },
);

app.delete(
  "/api/achievements/:achievementId",
  requireAuth,
  workspaceWriteRateLimit,
  requireDatabase,
  async (request, response) => {
    const achievementId = getRouteParam(request, "achievementId");
    if (!mongoose.isValidObjectId(achievementId)) throw new HttpError(404, "Achievement not found.");
    const deleted = await Achievement.findOneAndDelete({
      _id: achievementId,
      ownerId: getUserId(request),
    });
    if (!deleted) throw new HttpError(404, "Achievement not found.");
    response.status(204).end();
  },
);

app.put("/api/profile", requireAuth, workspaceWriteRateLimit, requireDatabase, async (request, response) => {
  const result = profileSchema.safeParse(request.body);
  if (!result.success) {
    sendValidationError(response, result.error);
    return;
  }
  const user = await User.findByIdAndUpdate(
    getUserId(request),
    { $set: result.data },
    { new: true, runValidators: true },
  );
  if (!user) throw new HttpError(404, "Account not found.");
  response.json({ profile: toPublicUser(user) });
});

app.get("/api/users", requireAuth, requireDatabase, async (request, response) => {
  const users = await User.find({
    _id: { $ne: getUserId(request) },
    profileVisibility: { $ne: "private" },
  })
    .sort({ createdAt: -1 })
    .limit(50);
  response.json({ users: users.map(toPublicProfile) });
});

app.get("/api/users/:userId", requireAuth, requireDatabase, async (request, response) => {
  const userId = getRouteParam(request, "userId");
  if (!mongoose.isValidObjectId(userId)) throw new HttpError(404, "Profile not found.");
  const user = await User.findOne({
    _id: userId,
    $or: [{ profileVisibility: { $ne: "private" } }, { _id: getUserId(request) }],
  });
  if (!user) throw new HttpError(404, "Profile not found.");
  response.json({ profile: toPublicProfile(user) });
});

app.get("/api/users/:userId/profile-page", requireAuth, requireDatabase, async (request, response) => {
  const userId = getRouteParam(request, "userId");
  if (!mongoose.isValidObjectId(userId)) throw new HttpError(404, "Profile not found.");
  const user = await User.findById(userId);
  if (!user) throw new HttpError(404, "Profile not found.");
  const isPublic = user.profileVisibility !== "private";
  response.json({
    isPublic,
    profile: isPublic ? toPublicProfile(user) : null,
  });
});

app.get("/api/users/:userId/ratings", requireDatabase, async (request, response) => {
  const userId = getRouteParam(request, "userId");
  if (!mongoose.isValidObjectId(userId)) throw new HttpError(404, "Profile not found.");
  if (!(await User.exists({ _id: userId }))) throw new HttpError(404, "Profile not found.");
  const ratings = await Rating.find({ revieweeId: userId }).sort({ createdAt: -1 }).limit(100);
  const reviewerIds = Array.from(new Set(ratings.map((rating) => rating.reviewerId.toString())));
  const reviewers = await User.find({ _id: { $in: reviewerIds }, profileVisibility: { $ne: "private" } });
  const profiles = new Map(reviewers.map((user) => [user._id.toString(), toPublicProfile(user)]));
  response.json({
    ratings: ratings.map((rating) => ({
      id: rating._id.toString(),
      reviewer: profiles.get(rating.reviewerId.toString()) ?? null,
      teamId: rating.teamId.toString(),
      score: rating.score,
      comment: rating.comment,
      createdAt: rating.createdAt?.toISOString() ?? "",
    })),
  });
});

app.get("/api/notifications", requireAuth, requireDatabase, async (request, response) => {
  const notifications = await Notification.find({ recipientId: getUserId(request) })
    .sort({ createdAt: -1 })
    .limit(100);
  const actorIds = Array.from(
    new Set(notifications.flatMap((item) => item.actorId ? [item.actorId.toString()] : [])),
  );
  const actors = await User.find({ _id: { $in: actorIds }, profileVisibility: { $ne: "private" } });
  const profiles = new Map(actors.map((user) => [user._id.toString(), toPublicProfile(user)]));
  response.json({
    notifications: notifications.map((item) => ({
      id: item._id.toString(),
      type: item.type,
      title: item.title,
      body: item.body,
      href: item.href,
      readAt: item.readAt?.toISOString() ?? null,
      createdAt: item.createdAt?.toISOString() ?? "",
      actor: item.actorId ? profiles.get(item.actorId.toString()) ?? null : null,
    })),
    unreadCount: notifications.filter((item) => !item.readAt).length,
  });
});

app.patch(
  "/api/notifications/:notificationId",
  requireAuth,
  workspaceWriteRateLimit,
  requireDatabase,
  async (request, response) => {
    const result = notificationReadSchema.safeParse(request.body);
    if (!result.success) {
      sendValidationError(response, result.error);
      return;
    }
    const notificationId = getRouteParam(request, "notificationId");
    if (!mongoose.isValidObjectId(notificationId)) throw new HttpError(404, "Notification not found.");
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, recipientId: getUserId(request) },
      { $set: { readAt: result.data.read ? new Date() : null } },
      { returnDocument: "after", runValidators: true },
    );
    if (!notification) throw new HttpError(404, "Notification not found.");
    response.json({ id: notification._id.toString(), readAt: notification.readAt?.toISOString() ?? null });
  },
);

app.post(
  "/api/notifications/read-all",
  requireAuth,
  workspaceWriteRateLimit,
  requireDatabase,
  async (request, response) => {
    await Notification.updateMany(
      { recipientId: getUserId(request), $or: [{ readAt: { $exists: false } }, { readAt: null }] },
      { $set: { readAt: new Date() } },
    );
    response.status(204).end();
  },
);

app.get("/api/connections", requireAuth, requireDatabase, async (request, response) => {
  const userId = getUserId(request);
  const connections = await Connection.find({
    $or: [{ requesterId: userId }, { recipientId: userId }],
  }).sort({ updatedAt: -1 });
  const ids = Array.from(
    new Set(
      connections.flatMap((connection) => [
        connection.requesterId.toString(),
        connection.recipientId.toString(),
      ]),
    ),
  );
  const users = await User.find({ _id: { $in: ids } });
  const profiles = new Map(users.map((user) => [user._id.toString(), toPublicProfile(user)]));
  response.json({
    connections: connections.map((connection) => ({
      id: connection._id.toString(),
      status: connection.status,
      requester: profiles.get(connection.requesterId.toString()) ?? null,
      recipient: profiles.get(connection.recipientId.toString()) ?? null,
      createdAt: connection.createdAt?.toISOString() ?? "",
    })),
  });
});

app.post("/api/connections", requireAuth, workspaceWriteRateLimit, requireDatabase, async (request, response) => {
  const result = connectionSchema.safeParse(request.body);
  if (!result.success) {
    sendValidationError(response, result.error);
    return;
  }
  const requesterId = getUserId(request);
  const { recipientId } = result.data;
  if (requesterId === recipientId) throw new HttpError(400, "You cannot connect with yourself.");
  if (!(await User.exists({ _id: recipientId }))) throw new HttpError(404, "Profile not found.");

  const existing = await Connection.findOne({
    $or: [
      { requesterId, recipientId },
      { requesterId: recipientId, recipientId: requesterId },
    ],
  });
  if (existing) throw new HttpError(409, "A connection request already exists.");
  const pairKey = [requesterId, recipientId].sort().join(":");
  let connection;
  try {
    connection = await Connection.create({ requesterId, recipientId, pairKey });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new HttpError(409, "A connection request already exists.");
    }
    throw error;
  }
  const requester = await User.findById(requesterId).select("fullName");
  await createNotification({
    recipientId,
    actorId: requesterId,
    type: "connection-request",
    title: "New connection request",
    body: `${requester?.fullName ?? "Someone"} wants to connect with you.`,
    href: "/connections",
    dedupeKey: `connection-request:${connection._id.toString()}`,
  });
  response.status(201).json({
    connection: {
      id: connection._id.toString(),
      status: connection.status,
      requesterId,
      recipientId,
    },
  });
});

app.patch("/api/connections/:connectionId", requireAuth, workspaceWriteRateLimit, requireDatabase, async (request, response) => {
  const connectionId = getRouteParam(request, "connectionId");
  if (!mongoose.isValidObjectId(connectionId)) {
    throw new HttpError(404, "Connection request not found.");
  }
  const result = z.object({ status: z.enum(["accepted", "declined"]) }).safeParse(request.body);
  if (!result.success) {
    sendValidationError(response, result.error);
    return;
  }
  const connection = await Connection.findOneAndUpdate(
    {
      _id: connectionId,
      recipientId: getUserId(request),
      status: "pending",
    },
    { $set: { status: result.data.status } },
    { new: true },
  );
  if (!connection) throw new HttpError(404, "Pending connection request not found.");
  if (result.data.status === "accepted") {
    const recipient = await User.findById(getUserId(request)).select("fullName");
    await createNotification({
      recipientId: connection.requesterId.toString(),
      actorId: getUserId(request),
      type: "connection-accepted",
      title: "Connection accepted",
      body: `${recipient?.fullName ?? "A teammate"} accepted your request.`,
      href: "/connections",
      dedupeKey: `connection-accepted:${connection._id.toString()}`,
    });
  }
  response.json({ id: connection._id.toString(), status: connection.status });
});

app.delete("/api/connections/:connectionId", requireAuth, workspaceWriteRateLimit, requireDatabase, async (request, response) => {
  const connectionId = getRouteParam(request, "connectionId");
  if (!mongoose.isValidObjectId(connectionId)) {
    throw new HttpError(404, "Connection not found.");
  }
  const deleted = await Connection.findOneAndDelete({
    _id: connectionId,
    $or: [{ requesterId: getUserId(request) }, { recipientId: getUserId(request) }],
  });
  if (!deleted) throw new HttpError(404, "Connection not found.");
  response.status(204).end();
});

app.get("/api/teams", requireAuth, requireDatabase, async (request, response) => {
  const teams = await Team.find({ "members.userId": getUserId(request) }).sort({ updatedAt: -1 });
  response.json({ teams: teams.map(serializeTeam) });
});

app.post("/api/teams", requireAuth, workspaceWriteRateLimit, requireDatabase, async (request, response) => {
  const result = teamSchema.safeParse(request.body);
  if (!result.success) {
    sendValidationError(response, result.error);
    return;
  }
  const userId = getUserId(request);
  const objectId = new mongoose.Types.ObjectId(userId);
  const team = await Team.create({
    ...result.data,
    ownerId: objectId,
    members: [{ userId: objectId, role: "Team lead" }],
    tasks: [],
  });
  response.status(201).json({ team: serializeTeam(team) });
});

app.post(
  "/api/teams/:teamId/members",
  requireAuth,
  workspaceWriteRateLimit,
  requireDatabase,
  async (request, response) => {
    const result = teamMemberSchema.safeParse(request.body);
    if (!result.success) {
      sendValidationError(response, result.error);
      return;
    }

    const teamId = getRouteParam(request, "teamId");
    const ownerId = getUserId(request);
    if (!mongoose.isValidObjectId(teamId)) throw new HttpError(404, "Team not found.");
    const team = await Team.findOne({ _id: teamId, ownerId });
    if (!team) throw new HttpError(404, "Team not found or you are not its owner.");

    const memberId = new mongoose.Types.ObjectId(result.data.userId);
    if (memberId.toString() === ownerId) {
      throw new HttpError(400, "You are already a member of this team.");
    }
    if (!(await User.exists({ _id: memberId }))) throw new HttpError(404, "Profile not found.");
    if (team.members.some((member) => member.userId.toString() === memberId.toString())) {
      throw new HttpError(409, "This person is already on the team.");
    }

    const acceptedConnection = await Connection.exists({
      status: "accepted",
      $or: [
        { requesterId: ownerId, recipientId: memberId },
        { requesterId: memberId, recipientId: ownerId },
      ],
    });
    if (!acceptedConnection) {
      throw new HttpError(403, "You can invite accepted connections to your team.");
    }

    const updatedTeam = await Team.findOneAndUpdate(
      {
        _id: teamId,
        ownerId,
        members: { $not: { $elemMatch: { userId: memberId } } },
      },
      { $push: { members: { userId: memberId, role: result.data.role } } },
      { returnDocument: "after", runValidators: true },
    );
    if (!updatedTeam) throw new HttpError(409, "This person is already on the team.");
    await createNotification({
      recipientId: memberId.toString(),
      actorId: ownerId,
      type: "team-update",
      title: "Added to a team",
      body: `You were added to ${updatedTeam.name}.`,
      href: "/teams",
      dedupeKey: `team-member:${updatedTeam._id.toString()}:${memberId.toString()}`,
    });
    const otherMembers = updatedTeam.members
      .map((member) => member.userId.toString())
      .filter((userId) => userId !== ownerId && userId !== memberId.toString());
    await Promise.all(otherMembers.map((userId) => createNotification({
      recipientId: userId,
      actorId: ownerId,
      type: "team-update",
      title: "Teammate joined",
      body: `A new teammate joined ${updatedTeam.name}.`,
      href: "/teams",
      dedupeKey: `team-member:${updatedTeam._id.toString()}:${memberId.toString()}`,
    })));
    response.status(201).json({ team: serializeTeam(updatedTeam) });
  },
);

app.post("/api/teams/:teamId/tasks", requireAuth, workspaceWriteRateLimit, requireDatabase, async (request, response) => {
  const result = taskSchema.safeParse(request.body);
  if (!result.success) {
    sendValidationError(response, result.error);
    return;
  }
  const userId = getUserId(request);
  const team = await findMemberTeam(getRouteParam(request, "teamId"), userId);
  const assigneeId = result.data.assigneeId ?? userId;
  if (!team.members.some((member) => member.userId.toString() === assigneeId)) {
    throw new HttpError(400, "Tasks can only be assigned to a team member.");
  }
  team.tasks.push({
    title: result.data.title,
    assigneeId: new mongoose.Types.ObjectId(assigneeId),
    completed: false,
  });
  await team.save();
  response.status(201).json({ team: serializeTeam(team) });
});

app.patch(
  "/api/teams/:teamId/tasks/:taskId",
  requireAuth,
  workspaceWriteRateLimit,
  requireDatabase,
  async (request, response) => {
    const result = taskUpdateSchema.safeParse(request.body);
    if (!result.success) {
      sendValidationError(response, result.error);
      return;
    }
    const team = await findMemberTeam(getRouteParam(request, "teamId"), getUserId(request));
    const taskId = getRouteParam(request, "taskId");
    const task = team.tasks.find((candidate) => candidate._id?.toString() === taskId);
    if (!task) throw new HttpError(404, "Task not found.");
    task.completed = result.data.completed;
    await team.save();
    response.json({ team: serializeTeam(team) });
  },
);

app.get(
  "/api/teams/:teamId/messages",
  requireAuth,
  requireDatabase,
  async (request, response) => {
    const teamId = getRouteParam(request, "teamId");
    await findMemberTeam(teamId, getUserId(request));
    const messages = await Message.find({ teamId })
      .sort({ createdAt: -1 })
      .limit(100);
    const senderIds = Array.from(new Set(messages.map((message) => message.senderId.toString())));
    const senders = await User.find({ _id: { $in: senderIds } });
    const profiles = new Map(senders.map((user) => [user._id.toString(), toPublicProfile(user)]));
    response.json({
      messages: messages.reverse().map((message) => ({
        id: message._id.toString(),
        text: message.text,
        sender: profiles.get(message.senderId.toString()) ?? null,
        createdAt: message.createdAt?.toISOString() ?? "",
      })),
    });
  },
);

app.post(
  "/api/teams/:teamId/messages",
  requireAuth,
  workspaceWriteRateLimit,
  requireDatabase,
  async (request, response) => {
    const result = messageSchema.safeParse(request.body);
    if (!result.success) {
      sendValidationError(response, result.error);
      return;
    }
    const userId = getUserId(request);
    const teamId = getRouteParam(request, "teamId");
    const team = await findMemberTeam(teamId, userId);
    const message = await Message.create({
      teamId: new mongoose.Types.ObjectId(teamId),
      senderId: new mongoose.Types.ObjectId(userId),
      text: result.data.text,
    });
    const sender = await User.findById(userId).select("fullName");
    const otherMembers = team.members
      .map((member) => member.userId.toString())
      .filter((memberId) => memberId !== userId);
    await Promise.all(otherMembers.map((memberId) => createNotification({
      recipientId: memberId,
      actorId: userId,
      type: "team-message",
      title: `New message in ${team.name}`,
      body: `${sender?.fullName ?? "A teammate"}: ${result.data.text.slice(0, 180)}`,
      href: "/chat",
      dedupeKey: `team-message:${message._id.toString()}`,
    })));
    response.status(201).json({
      message: {
        id: message._id.toString(),
        text: message.text,
        senderId: userId,
        createdAt: message.createdAt?.toISOString() ?? "",
      },
    });
  },
);

app.get("/api/hackathons", requireAuth, requireDatabase, async (request, response) => {
  const user = await User.findById(getUserId(request)).select("savedHackathons eventInterests");
  if (!user) throw new HttpError(404, "Account not found.");
  response.json({
    saved: user.savedHackathons,
    interested: user.eventInterests,
  });
});

app.put(
  "/api/hackathons/:slug",
  requireAuth,
  workspaceWriteRateLimit,
  requireDatabase,
  async (request, response) => {
    const slug = getRouteParam(request, "slug");
    if (!(await Hackathon.exists({ slug, active: true }))) throw new HttpError(404, "Hackathon not found.");
    const result = hackathonSchema.safeParse(request.body);
    if (!result.success) {
      sendValidationError(response, result.error);
      return;
    }
    const addToSet: Record<string, string> = {};
    const pull: Record<string, string> = {};
    if (result.data.saved !== undefined) {
      (result.data.saved ? addToSet : pull).savedHackathons = slug;
    }
    if (result.data.interested !== undefined) {
      (result.data.interested ? addToSet : pull).eventInterests = slug;
    }
    const updates = {
      ...(Object.keys(addToSet).length ? { $addToSet: addToSet } : {}),
      ...(Object.keys(pull).length ? { $pull: pull } : {}),
    };
    const user = await User.findByIdAndUpdate(getUserId(request), updates, {
      new: true,
      projection: "savedHackathons eventInterests",
    });
    if (!user) throw new HttpError(404, "Account not found.");
    response.json({ saved: user.savedHackathons, interested: user.eventInterests });
  },
);

app.get("/api/ratings", requireAuth, requireDatabase, async (request, response) => {
  const ratings = await Rating.find({ revieweeId: getUserId(request) }).sort({ createdAt: -1 });
  const reviewerIds = Array.from(new Set(ratings.map((rating) => rating.reviewerId.toString())));
  const reviewers = await User.find({ _id: { $in: reviewerIds } });
  const profiles = new Map(reviewers.map((user) => [user._id.toString(), toPublicProfile(user)]));
  response.json({
    ratings: ratings.map((rating) => ({
      id: rating._id.toString(),
      reviewer: profiles.get(rating.reviewerId.toString()) ?? null,
      teamId: rating.teamId.toString(),
      score: rating.score,
      comment: rating.comment,
      createdAt: rating.createdAt?.toISOString() ?? "",
    })),
  });
});

app.get("/api/hackathons/catalog", requireDatabase, async (_request, response) => {
  const events = await Hackathon.find({ active: true })
    .sort({ startDate: 1, name: 1 })
    .limit(500);
  response.json({
    events: events.map((event) => ({
      id: event._id.toString(),
      slug: event.slug,
      source: event.source,
      name: event.name,
      description: event.description,
      categories: event.categories,
      format: event.format,
      venue: event.venue,
      city: event.city,
      region: event.region,
      country: event.country,
      startDate: event.startDate?.toISOString() ?? null,
      endDate: event.endDate?.toISOString() ?? null,
      registrationDeadline: event.registrationDeadline?.toISOString() ?? null,
      registrationUrl: event.registrationUrl,
      teamSize: event.teamSize ?? "",
      prize: event.prize ?? "",
      lastSeenAt: event.lastSeenAt.toISOString(),
    })),
  });
});

app.get("/api/hackathons/sources", requireDatabase, async (_request, response) => {
  const sources = await HackathonSourceStatus.find().sort({ source: 1 });
  response.json({
    sources: sources.map((source) => ({
      id: source.source,
      status: source.status,
      checkedAt: source.checkedAt.toISOString(),
      eventCount: source.eventCount,
      message: source.message,
    })),
  });
});

app.get("/api/hackathons/notification-filters", requireAuth, requireDatabase, async (request, response) => {
  const user = await User.findById(getUserId(request)).select("hackathonNotificationFilters");
  if (!user) throw new HttpError(404, "Account not found.");
  response.json({
    filters: user.hackathonNotificationFilters ?? { formats: [], categories: [], destination: "" },
  });
});

app.put(
  "/api/hackathons/notification-filters",
  requireAuth,
  workspaceWriteRateLimit,
  requireDatabase,
  async (request, response) => {
    const result = hackathonNotificationFiltersSchema.safeParse(request.body);
    if (!result.success) {
      sendValidationError(response, result.error);
      return;
    }
    const user = await User.findByIdAndUpdate(
      getUserId(request),
      { $set: { hackathonNotificationFilters: result.data } },
      { returnDocument: "after", runValidators: true },
    ).select("hackathonNotificationFilters");
    if (!user) throw new HttpError(404, "Account not found.");
    response.json({ filters: user.hackathonNotificationFilters });
  },
);

app.post("/api/ratings", requireAuth, workspaceWriteRateLimit, requireDatabase, async (request, response) => {
  const result = ratingSchema.safeParse(request.body);
  if (!result.success) {
    sendValidationError(response, result.error);
    return;
  }
  const reviewerId = getUserId(request);
  if (reviewerId === result.data.revieweeId) throw new HttpError(400, "You cannot rate yourself.");
  const team = await findMemberTeam(result.data.teamId, reviewerId);
  if (!team.members.some((member) => member.userId.toString() === result.data.revieweeId)) {
    throw new HttpError(400, "Ratings are only available for teammates.");
  }
  try {
    const rating = await Rating.create({ ...result.data, reviewerId });
    const reviewer = await User.findById(reviewerId).select("fullName");
    await createNotification({
      recipientId: result.data.revieweeId,
      actorId: reviewerId,
      type: "rating",
      title: "New teammate review",
      body: `${reviewer?.fullName ?? "A teammate"} left you a ${rating.score}-star review.`,
      href: "/ratings",
      dedupeKey: `rating:${rating._id.toString()}`,
    });
    response.status(201).json({ id: rating._id.toString() });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new HttpError(409, "You have already rated this teammate for this team.");
    }
    throw error;
  }
});

app.post("/api/auth/logout", (_request, response) => {
  clearSession(response);
  response.status(204).end();
});

app.post(
  "/api/assistant/plan",
  requireAuth,
  assistantRateLimit,
  async (request, response) => {
    const result = planSchema.safeParse(request.body);
    if (!result.success) {
      sendValidationError(response, result.error);
      return;
    }
    if (!config.geminiApiKey) {
      throw new HttpError(503, "The Gemini API key is not configured yet.");
    }

    const memberLines = result.data.members
      .map((member) => `- ${member.name}: ${member.role}`)
      .join("\n");
    const prompt = [
      "You are a practical, encouraging hackathon team sidekick.",
      "Create a concise one-week plan with 3-5 clear tasks, suggested owners by role, and one check-in milestone.",
      "Do not claim to perform work or access external systems.",
      `Team: ${result.data.teamName}`,
      `Idea: ${result.data.idea}`,
      `Members:\n${memberLines || "- Roles not provided yet"}`,
    ].join("\n\n");

    try {
      const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
      const interaction = await ai.interactions.create({
        model: config.geminiModel,
        input: prompt,
      });
      const plan = interaction.output_text?.trim();
      if (!plan) {
        throw new HttpError(502, "The AI provider returned an empty plan. Try again.");
      }
      response.json({ plan });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      console.error("Gemini request failed:", error instanceof Error ? error.message : "unknown error");
      throw new HttpError(502, "The AI provider could not create a plan. Try again later.");
    }
  },
);

app.use((_request, response) => {
  response.status(404).json({ error: "API endpoint not found." });
});

const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }
  if (error instanceof HttpError) {
    response.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof multer.MulterError) {
    const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    response.status(status).json({
      error: status === 413
        ? "Certificate photos must be 5 MiB or smaller."
        : "The certificate upload is invalid.",
    });
    return;
  }
  console.error("Unhandled API error:", error);
  response.status(500).json({ error: "Something went wrong. Please try again." });
};
app.use(errorHandler);

if (config.mongoUri) {
  try {
    await mongoose.connect(config.mongoUri);
    console.info("MongoDB connected.");
    } catch (error) {
    console.error("MongoDB connection failed:", error);
  }

} else {
  console.warn("MONGODB_URI is not configured; database routes will return 503.");
}

const PORT = config.port;

app.listen(PORT, "0.0.0.0", () => {
  console.info(`HackConnect API listening on port ${PORT}`);
});