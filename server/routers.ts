import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import * as db from "./db";
import { sdk } from "./_core/sdk";
import { eq } from "drizzle-orm";
import { users, athletes } from "../drizzle/schema";

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

    login: publicProcedure
      .input(z.object({
        role: z.enum(["coach", "viewer", "athlete"]),
        athleteId: z.number().optional(),
        password: z.string()
      }))
      .mutation(async ({ input }) => {
        const database = await db.getDb();
        if (!database) {
          // Mock mode
          let openId = "";
          let expectedPassword = "";
          let name = "";
          let email = "";
          if (input.role === "coach") {
            openId = "democoach";
            expectedPassword = "admin123";
            name = "スタッフ (管理者)";
            email = "admin@example.com";
          } else if (input.role === "viewer") {
            openId = "demoviewer";
            expectedPassword = "viewer123";
            name = "スタッフ (閲覧用)";
            email = "viewer@example.com";
          } else {
            if (!input.athleteId) throw new Error("選手が選択されていません。");
            const mockAth = (await db.getAthletesByTeamId(1)).find(a => a.id === input.athleteId);
            if (!mockAth) throw new Error("選手が見つかりません。");
            email = mockAth.user?.email || `athlete_${mockAth.id}@example.com`;
            openId = `athlete_${email.replace(/[@.]/g, "_")}`;
            expectedPassword = "athlete123";
            name = mockAth.user?.name || `選手${mockAth.jerseyNumber}`;
          }
          
          const matchedMockUser = await db.getUserByOpenId(openId);
          const finalPass = matchedMockUser?.password || expectedPassword;
          if (input.password !== finalPass) {
            throw new Error("パスワードが正しくありません。");
          }
          
          const token = await sdk.createSessionToken(openId, { name });
          return { token, user: { openId, name, email, role: input.role, teamId: 1 } };
        }

        // Live DB mode
        let userObj = null;
        let defaultPass = "";
        
        if (input.role === "coach") {
          userObj = await database.select().from(users).where(eq(users.role, "coach")).limit(1).then(r => r[0]);
          defaultPass = "admin123";
        } else if (input.role === "viewer") {
          userObj = await database.select().from(users).where(eq(users.role, "viewer")).limit(1).then(r => r[0]);
          defaultPass = "viewer123";
        } else {
          if (!input.athleteId) throw new Error("選手が選択されていません。");
          const ath = await database.select().from(athletes).where(eq(athletes.id, input.athleteId)).limit(1).then(r => r[0]);
          if (!ath) throw new Error("選手が見つかりません。");
          userObj = await database.select().from(users).where(eq(users.id, ath.userId)).limit(1).then(r => r[0]);
          defaultPass = "athlete123";
        }

        if (!userObj) {
          throw new Error("対象のユーザーアカウントが見つかりません。");
        }

        const expectedPass = userObj.password || defaultPass;
        if (input.password !== expectedPass) {
          throw new Error("パスワードが正しくありません。");
        }

        const token = await sdk.createSessionToken(userObj.openId, { name: userObj.name || undefined });
        return { token, user: userObj };
      }),

    changePassword: protectedProcedure
      .input(z.object({
        userId: z.number().optional(),
        newPassword: z.string().min(4, "パスワードは4文字以上で指定してください。")
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await db.getDb();
        const isCoach = ctx.user.role === "coach" || ctx.user.role === "admin";
        
        // Find target user
        let targetUserId = ctx.user.id;
        if (input.userId && isCoach) {
          // If admin changes athlete password, map athleteId to userId
          const ath = database 
            ? await database.select().from(athletes).where(eq(athletes.id, input.userId)).limit(1).then(r => r[0])
            : (await db.getAthletesByTeamId(1)).find(a => a.id === input.userId);
          
          if (!ath) throw new Error("選手が見つかりません。");
          targetUserId = ath.userId;
        }

        if (targetUserId !== ctx.user.id && !isCoach) {
          throw new Error("パスワードを変更する権限がありません。");
        }

        if (!database) {
          // Mock mode
          const user = await db.getUserById(targetUserId);
          if (user) {
            user.password = input.newPassword;
            user.updatedAt = new Date();
          }
          return { success: true };
        }

        // Live DB mode
        await database.update(users)
          .set({ password: input.newPassword, updatedAt: new Date() })
          .where(eq(users.id, targetUserId));

        return { success: true };
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
          password: z.string().nullable().optional(),
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
      .input(z.object({ 
        teamId: z.number(), 
        date: z.string().optional(),
        limit: z.number().optional() 
      }))
      .query(({ input }) => db.getPerformanceDataByTeamId(input.teamId, input.date, input.limit)),
    
    getImportStatusByMonth: protectedProcedure
      .input(z.object({
        teamId: z.number(),
        year: z.number(),
        month: z.number(),
      }))
      .query(({ input }) => db.getImportStatusByMonth(input.teamId, input.year, input.month)),
    
    getByAthleteAndDate: protectedProcedure
      .input(z.object({ athleteId: z.number(), date: z.string() }))
      .query(({ input }) => db.getPerformanceDataByAthleteAndDate(input.athleteId, input.date)),

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
        sessionType: z.enum(["practice", "individual", "match", "auto"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "coach" && ctx.user.role !== "admin") {
          throw new Error("Only coaches can import CSV files");
        }
        return db.importPerformanceCsv(input.teamId, ctx.user.id, input.csvText, input.fileName, input.sessionType);
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
      .input(z.object({ 
        athleteId: z.number(), 
        date: z.string().optional(),
        acwrMetric: z.enum(["totalLoad", "jumpVolume", "accelVolume"]).optional()
      }))
      .query(({ input }) => db.getAthleteAnalytics(input.athleteId, input.date, input.acwrMetric)),

    getTeamAnalytics: protectedProcedure
      .input(z.object({ teamId: z.number() }))
      .query(({ input }) => db.getTeamAnalytics(input.teamId)),

    getUncorrectedAnomalies: protectedProcedure
      .input(z.object({ teamId: z.number() }))
      .query(({ input }) => db.getUncorrectedAnomalies(input.teamId)),

    correctAnomaly: protectedProcedure
      .input(z.object({ 
        recordId: z.number(),
        metricsToCorrect: z.array(z.string()).optional()
      }))
      .mutation(async ({ input }) => {
        await db.correctPerformanceAnomaly(input.recordId, input.metricsToCorrect);
        return { success: true };
      }),

    rollbackAnomaly: protectedProcedure
      .input(z.object({ recordId: z.number() }))
      .mutation(async ({ input }) => {
        await db.rollbackPerformanceAnomaly(input.recordId);
        return { success: true };
      }),

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
