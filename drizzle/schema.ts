import { integer, pgTable, text, timestamp, varchar, numeric, boolean, serial } from "drizzle-orm/pg-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = pgTable("users", {
  /**
   * Surrogate primary key. Managed by the database.
   * Use this for relations between tables.
   */
  id: serial("id").primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  teamId: integer("teamId"), // Team association for coaches and athletes
  role: varchar("role", { length: 30 }).default("user").notNull(), // "user" | "admin" | "coach" | "athlete"
  password: varchar("password", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Add athleteRole to user role enum for easier role checking
export type UserRole = "user" | "admin" | "coach" | "athlete" | "viewer";

/**
 * Teams table - represents a volleyball team
 */
export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  coachId: integer("coachId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Team = typeof teams.$inferSelect;
export type InsertTeam = typeof teams.$inferInsert;

/**
 * Athletes table - represents team members (players)
 */
export const athletes = pgTable("athletes", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  teamId: integer("teamId").notNull(),
  jerseyNumber: integer("jerseyNumber"),
  position: varchar("position", { length: 50 }), // e.g., "setter", "middle blocker", etc.
  birthday: varchar("birthday", { length: 50 }),
  height: numeric("height", { precision: 5, scale: 1 }),
  csvNames: text("csvNames"),
  onetapName: varchar("onetapName", { length: 100 }),
  catapultName: varchar("catapultName", { length: 100 }),
  soxaiEmail: varchar("soxaiEmail", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Athlete = typeof athletes.$inferSelect;
export type InsertAthlete = typeof athletes.$inferInsert;

/**
 * Performance data table - stores Catapult CSV data
 */
export const performanceData = pgTable("performanceData", {
  id: serial("id").primaryKey(),
  athleteId: integer("athleteId").notNull(),
  teamId: integer("teamId").notNull(),
  date: timestamp("date").notNull(),
  sessionType: varchar("sessionType", { length: 30 }).default("practice").notNull(), // "practice" | "match"
  
  // Catapult metrics
  maxJumpHeight: numeric("maxJumpHeight", { precision: 10, scale: 2 }), // cm
  avgJumpHeight: numeric("avgJumpHeight", { precision: 10, scale: 2 }), // cm
  totalJumps: integer("totalJumps"),
  
  // New Jump Metrics
  jumpVolume: numeric("jumpVolume", { precision: 10, scale: 2 }), // sum of heights in meters
  jumpsOver40cm: integer("jumpsOver40cm"),
  jumpZone1Count: integer("jumpZone1Count"), // <20cm
  jumpZone2Count: integer("jumpZone2Count"), // 20-30cm
  jumpZone3Count: integer("jumpZone3Count"), // 30-40cm
  jumpZone4Count: integer("jumpZone4Count"), // 40-50cm
  jumpZone5Count: integer("jumpZone5Count"), // 50cm+
  
  avgAcceleration: numeric("avgAcceleration", { precision: 10, scale: 2 }), // m/s²
  maxAcceleration: numeric("maxAcceleration", { precision: 10, scale: 2 }), // m/s²
  
  // New Accel Metrics
  accelVolume: numeric("accelVolume", { precision: 10, scale: 2 }),
  accelCount: integer("accelCount"),
  
  totalDistance: numeric("totalDistance", { precision: 10, scale: 2 }), // meters
  avgSpeed: numeric("avgSpeed", { precision: 10, scale: 2 }), // m/s
  maxSpeed: numeric("maxSpeed", { precision: 10, scale: 2 }), // m/s
  
  totalLoad: numeric("totalLoad", { precision: 10, scale: 2 }), // arbitrary units
  avgLoad: numeric("avgLoad", { precision: 10, scale: 2 }),
  
  duration: integer("duration"), // seconds
  
  // New Menu/Period load storage
  rawMenuData: text("rawMenuData"), // JSON stringified menu-wise load mapping
  
  // Coach advice
  rawCsvData: text("rawCsvData"), // JSON stringified or raw CSV
  coachAdvice: text("coachAdvice"),
  
  // Subjective / sRPE / Wellness
  sRPE: integer("sRPE"),
  rpeValue: integer("rpeValue"),
  wellnessSleep: integer("wellnessSleep"),
  wellnessFatigue: integer("wellnessFatigue"),
  wellnessSoreness: integer("wellnessSoreness"),
  wellnessStress: integer("wellnessStress"),
  hrv: numeric("hrv", { precision: 5, scale: 2 }),
  highIntensityDistance: numeric("highIntensityDistance", { precision: 7, scale: 2 }),
  avgHeartRate: integer("avgHeartRate"),
  physiologicalMarker: numeric("physiologicalMarker", { precision: 7, scale: 2 }),
  
  isAnomaly: boolean("isAnomaly").default(false).notNull(),
  anomalyDetails: text("anomalyDetails"),
  isCorrected: boolean("isCorrected").default(false).notNull(),
  originalRawData: text("originalRawData"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type PerformanceData = typeof performanceData.$inferSelect;
export type InsertPerformanceData = typeof performanceData.$inferInsert;

/**
 * CSV upload history - tracks file uploads for audit
 */
export const csvUploads = pgTable("csvUploads", {
  id: serial("id").primaryKey(),
  teamId: integer("teamId").notNull(),
  uploadedBy: integer("uploadedBy").notNull(), // User ID of coach
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileSize: integer("fileSize"), // bytes
  recordsImported: integer("recordsImported"),
  status: varchar("status", { length: 30 }).default("pending").notNull(), // "pending" | "processing" | "completed" | "failed"
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const teamSettings = pgTable("teamSettings", {
  id: serial("id").primaryKey(),
  teamId: integer("teamId").notNull(),
  baselineDays: integer("baselineDays").default(28).notNull(),
  enabledMetrics: text("enabledMetrics").default("[]").notNull(),
  baseDateMode: varchar("baseDateMode", { length: 20 }).default("rolling").notNull(),
  baseFixedDate: varchar("baseFixedDate", { length: 20 }),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type TeamSettings = typeof teamSettings.$inferSelect;
export type InsertTeamSettings = typeof teamSettings.$inferInsert;

export type CsvUpload = typeof csvUploads.$inferSelect;
export type InsertCsvUpload = typeof csvUploads.$inferInsert;
