import "dotenv/config";
import { z } from "zod";

const optionalValue = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().optional(),
);

const configSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.string().url().default("https://your-project.vercel.app").transform((val) => val.replace(/\/+$/, "")),
  MONGODB_URI: optionalValue,
  JWT_SECRET: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(32).optional(),
  ),
  GOOGLE_CLIENT_ID: optionalValue,
  GEMINI_API_KEY: optionalValue,
  GEMINI_MODEL: z.string().min(1).default("gemini-3.8-flash"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const result = configSchema.safeParse(process.env);
if (!result.success) {
  const issues = result.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid server configuration: ${issues}`);
}

export const config = {
  port: result.data.PORT,
  webOrigin: result.data.WEB_ORIGIN,
  mongoUri: result.data.MONGODB_URI,
  jwtSecret: result.data.JWT_SECRET,
  googleClientId: result.data.GOOGLE_CLIENT_ID,
  geminiApiKey: result.data.GEMINI_API_KEY,
  geminiModel: result.data.GEMINI_MODEL,
  isProduction: result.data.NODE_ENV === "production",
};
