import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import * as db from "./db";
import { sdk } from "./_core/sdk";

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
    getPublicAthletes: publicProcedure
      .query(async () => {
        // Return active athletes for team 1 (default team)
        return db.getAthletesByTeamId(1);
      }),
    getMockToken: publicProcedure
      .input(z.object({
        openId: z.string(),
        name: z.string(),
      }))
      .mutation(async ({ input }) => {
        // Upsert the demo user into the database during login token generation.
        // Without this, the backend /api/auth/me query fails to validate the user details
        // against the database records, causing a redirect loop back to the login screen.
        let role: "coach" | "viewer" | "athlete" = "athlete";
        let email = "";
        const teamId = 1;
        
        if (input.openId === "democoach") {
          role = "coach";
          email = "admin@example.com";
        } else if (input.openId === "demoviewer") {
          role = "viewer";
          email = "viewer@example.com";
        } else {
          role = "athlete";
          // Try to look up existing registered user by openId to reuse their email
          const existingUser = await db.getUserByOpenId(input.openId);
          if (existingUser && existingUser.email) {
            email = existingUser.email;
          } else {
            // Fallback for default demo athletes
            if (input.openId === "demoathlete1") email = "sakura@example.com";
            else if (input.openId === "demoathlete2") email = "hinata@example.com";
            else if (input.openId === "demoathlete3") email = "mio@example.com";
            else email = `${input.openId}@example.com`;
          }
        }

        await db.upsertUser({
          openId: input.openId,
          name: input.name,
          email,
          loginMethod: "manus",
          role,
          teamId,
          lastSignedIn: new Date(),
        });

        const token = await sdk.createSessionToken(input.openId, { name: input.name });
        return { token };
      }),
  }),

  // Team management
  team: router({
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(255),
      }))
      .mutation(({ ctx, input }) => {
        if (ctx.user.role !== "coach" && ctx.user.role !== "admin") {
          throw new Error("Only coaches can create teams");
        }
        return db.createTeam(input.name, ctx.user.id);
      }),
    
    getByCoach: protectedProcedure
      .query(({ ctx }) => {
        if (ctx.user.role !== "coach" && ctx.user.role !== "admin") {
          throw new Error("Only coaches can view teams");
        }
        return db.getTeamsByCoachId(ctx.user.id);
      }),
    
    getById: protectedProcedure
      .input(z.object({ teamId: z.number() }))
      .query(({ input }) => db.getTeamById(input.teamId)),

    getSettings: protectedProcedure
      .input(z.object({ teamId: z.number() }))
      .query(({ input }) => db.getTeamSettings(input.teamId)),
    
    updateSettings: protectedProcedure
      .input(z.object({
        teamId: z.number(),
        baselineDays: z.number(),
        enabledMetrics: z.array(z.string()),
        baseDateMode: z.string(),
        baseFixedDate: z.string().nullable().optional(),
      }))
      .mutation(({ ctx, input }) => {
        if (ctx.user.role !== "coach" && ctx.user.role !== "admin") {
          throw new Error("Only coaches can update team settings");
        }
        return db.updateTeamSettings(input.teamId, input);
      }),
  }),

  // Athlete management
  athlete: router({
    create: protectedProcedure
      .input(z.object({
        userId: z.number(),
        teamId: z.number(),
        jerseyNumber: z.number().optional(),
        position: z.string().optional(),
      }))
      .mutation(({ ctx, input }) => {
        if (ctx.user.role !== "coach" && ctx.user.role !== "admin") {
          throw new Error("Only coaches can add athletes");
        }
        return db.createAthlete(input);
      }),
    
    register: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        email: z.string().email(),
        jerseyNumber: z.number().optional(),
        position: z.string().optional(),
        teamId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "coach" && ctx.user.role !== "admin") {
          throw new Error("Only coaches can register athletes");
        }
        const openId = `athlete_${input.email.replace(/[@.]/g, "_")}`;
        const existingUser = await db.getUserByOpenId(openId);
        let userId: number;
        if (existingUser) {
          userId = existingUser.id;
        } else {
          userId = await db.createAthleteUser({
            openId,
            name: input.name,
            email: input.email,
            teamId: input.teamId,
            loginMethod: "manus",
          });
        }
        const existingAthlete = await db.getAthleteByUserId(userId);
        if (existingAthlete) {
          return existingAthlete.id;
        }
        const athleteId = await db.createAthlete({
          userId,
          teamId: input.teamId,
          jerseyNumber: input.jerseyNumber,
          position: input.position,
        });
        return athleteId;
      }),
    
    getByTeam: protectedProcedure
      .input(z.object({ teamId: z.number() }))
      .query(({ input }) => db.getAthletesByTeamId(input.teamId)),
    
    batchSave: protectedProcedure
      .input(z.object({
        teamId: z.number(),
        athletes: z.array(z.object({
          id: z.number().optional(),
          name: z.string().min(1),
          email: z.string().email(),
          jerseyNumber: z.number().nullable(),
          position: z.string().nullable(),
          birthday: z.string().nullable(),
          height: z.number().nullable(),
          csvNames: z.string().nullable().optional(),
          onetapName: z.string().nullable().optional(),
          catapultName: z.string().nullable().optional(),
          soxaiEmail: z.string().nullable().optional(),
          isDeleted: z.boolean().optional(),
        }))
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "coach" && ctx.user.role !== "admin") {
          throw new Error("Only coaches can batch save athletes");
        }
        return db.batchSaveAthletes(input.teamId, input.athletes);
      }),
    
    getByUser: protectedProcedure
      .query(({ ctx }) => db.getAthleteByUserId(ctx.user.id)),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getAthleteById(input.id)),
  }),

  // Performance data management
  performance: router({
    create: protectedProcedure
      .input(z.object({
        athleteId: z.number(),
        teamId: z.number(),
        date: z.date(),
        sessionType: z.enum(["practice", "match"]),
        maxJumpHeight: z.number().optional(),
        avgJumpHeight: z.number().optional(),
        totalJumps: z.number().optional(),
        avgAcceleration: z.number().optional(),
        maxAcceleration: z.number().optional(),
        totalDistance: z.number().optional(),
        avgSpeed: z.number().optional(),
        maxSpeed: z.number().optional(),
        totalLoad: z.number().optional(),
        avgLoad: z.number().optional(),
        duration: z.number().optional(),
        rawCsvData: z.string().optional(),
      }))
      .mutation(({ ctx, input }) => {
        if (ctx.user.role !== "coach" && ctx.user.role !== "admin") {
          throw new Error("Only coaches can add performance data");
        }
        return db.createPerformanceData(input as any);
      }),
    
    getByAthlete: protectedProcedure
      .input(z.object({ athleteId: z.number(), limit: z.number().optional() }))
      .query(({ input }) => db.getPerformanceDataByAthleteId(input.athleteId, input.limit)),
    
    getByTeam: protectedProcedure
      .input(z.object({ teamId: z.number(), limit: z.number().optional() }))
      .query(({ input }) => db.getPerformanceDataByTeamId(input.teamId, input.limit)),
    
    getImportStatusByMonth: protectedProcedure
      .input(z.object({
        teamId: z.number(),
        year: z.number(),
        month: z.number(),
      }))
      .query(({ input }) => db.getImportStatusByMonth(input.teamId, input.year, input.month)),
    
    getLatest: protectedProcedure
      .input(z.object({ athleteId: z.number() }))
      .query(({ input }) => db.getLatestPerformanceDataByAthlete(input.athleteId)),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getPerformanceDataById(input.id)),

    importCsv: protectedProcedure
      .input(z.object({
        teamId: z.number(),
        csvText: z.string(),
        fileName: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "coach" && ctx.user.role !== "admin") {
          throw new Error("Only coaches can import CSV files");
        }
        return db.importPerformanceCsv(input.teamId, ctx.user.id, input.csvText, input.fileName);
      }),

    deleteCsvUpload: protectedProcedure
      .input(z.object({ uploadId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "coach" && ctx.user.role !== "admin") {
          throw new Error("Only coaches can delete CSV imports");
        }
        return db.deleteCsvUpload(input.uploadId);
      }),

    updateAthleteCsvNames: protectedProcedure
      .input(z.object({
        athleteId: z.number(),
        csvNames: z.string()
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "coach" && ctx.user.role !== "admin") {
          throw new Error("Only coaches can update mappings");
        }
        return db.updateAthleteCsvNames(input.athleteId, input.csvNames);
      }),
    
    getAthleteAnalytics: protectedProcedure
      .input(z.object({ athleteId: z.number() }))
      .query(({ input }) => db.getAthleteAnalytics(input.athleteId)),

    getTeamAnalytics: protectedProcedure
      .input(z.object({ teamId: z.number() }))
      .query(({ input }) => db.getTeamAnalytics(input.teamId)),

    saveCoachAdvice: protectedProcedure
      .input(z.object({
        athleteId: z.number(),
        advice: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "coach" && ctx.user.role !== "admin") {
          throw new Error("Only coaches can save advice");
        }
        return db.saveCoachAdvice(input.athleteId, input.advice);
      }),

    updateMetric: protectedProcedure
      .input(z.object({
        athleteId: z.number(),
        teamId: z.number(),
        dateStr: z.string(),
        metricKey: z.string(),
        value: z.number().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "coach" && ctx.user.role !== "admin") {
          throw new Error("Only coaches can update metrics");
        }
        return db.updatePerformanceMetric(
          input.athleteId,
          input.teamId,
          input.dateStr,
          input.metricKey,
          input.value
        );
      }),

    updateMetricsBatch: protectedProcedure
      .input(z.object({
        teamId: z.number(),
        dateStr: z.string(),
        updates: z.array(z.object({
          athleteId: z.number(),
          metricKey: z.string(),
          value: z.number().nullable(),
        }))
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "coach" && ctx.user.role !== "admin") {
          throw new Error("Only coaches can update metrics");
        }
        for (const u of input.updates) {
          await db.updatePerformanceMetric(
            u.athleteId,
            input.teamId,
            input.dateStr,
            u.metricKey,
            u.value
          );
        }
        return { success: true };
      }),
  }),

  // CSV upload management
  csvUpload: router({
    create: protectedProcedure
      .input(z.object({
        teamId: z.number(),
        fileName: z.string(),
        fileSize: z.number().optional(),
      }))
      .mutation(({ ctx, input }) => {
        if (ctx.user.role !== "coach" && ctx.user.role !== "admin") {
          throw new Error("Only coaches can upload CSV files");
        }
        return db.createCsvUpload({
          teamId: input.teamId,
          uploadedBy: ctx.user.id,
          fileName: input.fileName,
          fileSize: input.fileSize,
          status: "pending",
        });
      }),
    
    getByTeam: protectedProcedure
      .input(z.object({ teamId: z.number(), limit: z.number().optional() }))
      .query(({ input }) => db.getCsvUploadsByTeamId(input.teamId, input.limit)),
    
    updateStatus: protectedProcedure
      .input(z.object({
        uploadId: z.number(),
        status: z.enum(["pending", "processing", "completed", "failed"]),
        errorMessage: z.string().optional(),
      }))
      .mutation(({ ctx, input }) => {
        if (ctx.user.role !== "coach" && ctx.user.role !== "admin") {
          throw new Error("Only coaches can update upload status");
        }
        return db.updateCsvUploadStatus(input.uploadId, input.status, input.errorMessage);
      }),
  }),
});

export type AppRouter = typeof appRouter;
