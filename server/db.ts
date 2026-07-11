import { eq, and, gte, lte, desc, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import fs from "fs";
import path from "path";
import { InsertUser, users, teams, athletes, performanceData, csvUploads, teamSettings, InsertAthlete, InsertPerformanceData, InsertCsvUpload, User, Team, Athlete, PerformanceData as PerfData, CsvUpload, TeamSettings } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes("localhost") || process.env.DATABASE_URL.includes("127.0.0.1") ? false : { rejectUnauthorized: false }
      });
      _db = drizzle(pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ==========================================
// IN-MEMORY MOCK DATA STORE FOR FALLBACK
// ==========================================
let mockUsers: User[] = [
  {
    id: 1,
    openId: "democoach",
    name: "スタッフ (管理者)",
    email: "admin@example.com",
    loginMethod: "manus",
    teamId: 1,
    role: "coach",
    password: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  },
  {
    id: 5,
    openId: "demoviewer",
    name: "スタッフ (閲覧用)",
    email: "viewer@example.com",
    loginMethod: "manus",
    teamId: 1,
    role: "viewer",
    password: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  },
  {
    id: 2,
    openId: "demoathlete1",
    name: "宮下 さくら",
    email: "sakura@example.com",
    loginMethod: "manus",
    teamId: 1,
    role: "athlete",
    password: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  },
  {
    id: 3,
    openId: "demoathlete2",
    name: "日向 ひなた",
    email: "hinata@example.com",
    loginMethod: "manus",
    teamId: 1,
    role: "athlete",
    password: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  },
  {
    id: 4,
    openId: "demoathlete3",
    name: "長谷川 みお",
    email: "mio@example.com",
    loginMethod: "manus",
    teamId: 1,
    role: "athlete",
    password: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  }
];

let mockTeams: Team[] = [
  {
    id: 1,
    name: "ひまわりVBC",
    coachId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
];

let mockAthletes: Athlete[] = [
  {
    id: 1,
    userId: 2,
    teamId: 1,
    jerseyNumber: 1,
    position: "セッター",
    birthday: "2008-05-12",
    height: "171.5" as any,
    csvNames: "Sakura Miyashita, Miyashita S., 宮下",
    onetapName: "宮下 さくら",
    catapultName: "Sakura Miyashita",
    soxaiEmail: "sakura@example.com",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 2,
    userId: 3,
    teamId: 1,
    jerseyNumber: 4,
    position: "アウトサイドヒッター",
    birthday: "2008-11-23",
    height: "168.0" as any,
    csvNames: "Hinata Hyuga, Hyuga H., 日向",
    onetapName: "日向 ひなた",
    catapultName: "Hinata Hyuga",
    soxaiEmail: "hinata@example.com",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 3,
    userId: 4,
    teamId: 1,
    jerseyNumber: 8,
    position: "ミドルブロッカー",
    birthday: "2009-02-05",
    height: "175.2" as any,
    csvNames: "Mio Hasegawa, Hasegawa M., 長谷川",
    onetapName: "長谷川 みお",
    catapultName: "Mio Hasegawa",
    soxaiEmail: "mio@example.com",
    createdAt: new Date(),
    updatedAt: new Date(),
  }
];

// Generate past 7 days of performance data for democodes
let mockPerformanceData: PerfData[] = [];
let mockTeamSettings: any[] = [];

export async function getTeamSettings(teamId: number): Promise<any> {
  const db = await getDb();
  if (!db) {
    let settings = mockTeamSettings.find(s => s.teamId === teamId);
    if (!settings) {
      settings = {
        id: mockTeamSettings.length + 1,
        teamId,
        baselineDays: 28,
        enabledMetrics: JSON.stringify([
          "totalJumps", "maxJumpHeight", "avgJumpHeight", "jumpVolume", "totalLoad", 
          "accelCount", "maxAcceleration", "sRPE", "rpeValue", "hrv", 
          "wellnessSleep", "wellnessFatigue", "wellnessSoreness", "wellnessStress"
        ]),
        baseDateMode: "rolling",
        baseFixedDate: null,
        updatedAt: new Date()
      };
      mockTeamSettings.push(settings);
    }
    return settings;
  }

  const res = await db.select().from(teamSettings).where(eq(teamSettings.teamId, teamId)).limit(1);
  if (res.length > 0) {
    return res[0];
  }

  const newSettings = {
    teamId,
    baselineDays: 28,
    enabledMetrics: JSON.stringify([
      "totalJumps", "maxJumpHeight", "avgJumpHeight", "jumpVolume", "totalLoad", 
      "accelCount", "maxAcceleration", "sRPE", "rpeValue", "hrv", 
      "wellnessSleep", "wellnessFatigue", "wellnessSoreness", "wellnessStress"
    ]),
    baseDateMode: "rolling",
    baseFixedDate: null
  };
  await db.insert(teamSettings).values(newSettings);
  const refetch = await db.select().from(teamSettings).where(eq(teamSettings.teamId, teamId)).limit(1);
  return refetch[0];
}

export async function updateTeamSettings(teamId: number, settings: { baselineDays: number; enabledMetrics: string[]; baseDateMode: string; baseFixedDate?: string | null }): Promise<any> {
  const db = await getDb();
  const enabledStr = JSON.stringify(settings.enabledMetrics);
  
  if (!db) {
    let mockS = mockTeamSettings.find(s => s.teamId === teamId);
    if (!mockS) {
      mockS = {
        id: mockTeamSettings.length + 1,
        teamId,
        baselineDays: settings.baselineDays,
        enabledMetrics: enabledStr,
        baseDateMode: settings.baseDateMode || "rolling",
        baseFixedDate: settings.baseFixedDate || null,
        updatedAt: new Date()
      };
      mockTeamSettings.push(mockS);
    } else {
      mockS.baselineDays = settings.baselineDays;
      mockS.enabledMetrics = enabledStr;
      mockS.baseDateMode = settings.baseDateMode || "rolling";
      mockS.baseFixedDate = settings.baseFixedDate || null;
      mockS.updatedAt = new Date();
    }
    return mockS;
  }

  const existing = await db.select().from(teamSettings).where(eq(teamSettings.teamId, teamId)).limit(1);
  if (existing.length > 0) {
    await db.update(teamSettings)
      .set({ 
        baselineDays: settings.baselineDays, 
        enabledMetrics: enabledStr, 
        baseDateMode: settings.baseDateMode || "rolling",
        baseFixedDate: settings.baseFixedDate || null,
        updatedAt: new Date() 
      })
      .where(eq(teamSettings.teamId, teamId));
  } else {
    await db.insert(teamSettings).values({
      teamId,
      baselineDays: settings.baselineDays,
      enabledMetrics: enabledStr,
      baseDateMode: settings.baseDateMode || "rolling",
      baseFixedDate: settings.baseFixedDate || null
    });
  }

  const refetch = await db.select().from(teamSettings).where(eq(teamSettings.teamId, teamId)).limit(1);
  return refetch[0];
}

const generateDemoPerformanceData = () => {
  const data: PerfData[] = [];
  let idCounter = 1;
  const now = new Date();
  
  for (let i = 28; i >= 1; i--) { // Extend to 28 days to fully support ACWR calculations!
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const sessionType = isWeekend ? "match" : "practice";
    
    // Helper to distribute jumps into 5 zones
    const distributeJumps = (total: number) => {
      const z1 = Math.floor(total * 0.10);
      const z2 = Math.floor(total * 0.20);
      const z3 = Math.floor(total * 0.30);
      const z4 = Math.floor(total * 0.25);
      const z5 = total - (z1 + z2 + z3 + z4);
      const over40 = z4 + z5;
      return { z1, z2, z3, z4, z5, over40 };
    };

    // Date base advice helper
    const getAdvice = (athleteId: number, dayIndex: number) => {
      if (dayIndex === 1) {
        if (athleteId === 1) return "セッターとしての運動量は適正です。自主練はトスワーク中心で継続しましょう。";
        if (athleteId === 2) return "運動量（ACWR）が急増しています。今日の自主練はジャンプ無しのストレッチのみに制限してください。";
        if (athleteId === 3) return "ジャンプ数が減少傾向にあります。膝の調子はどうですか？無理せずレシーブ練習を中心に。";
      }
      if (dayIndex === 5 && athleteId === 2) {
        return "ジャンプ時の膝の着地を意識して、疲労度を自己申告（RPE）してください。";
      }
      return null;
    };

    // Athlete 1: Sakura (Normal/Healthy)
    const sakuraJumps = Math.floor(30 + Math.random() * 25);
    const sakuraAvgHeight = 42 + Math.random() * 5;
    const sakuraJumpMetrics = distributeJumps(sakuraJumps);
    const sakuraLoad = 250 + Math.random() * 100;
    const sakuraAvgAcc = 1.7 + Math.random() * 0.4;
    const sakuraAccelCount = Math.floor(20 + Math.random() * 15);
    const sakuraDurationMin = Math.floor(90 + Math.random() * 30);
    const sakuraRpe = Math.floor(5 + Math.random() * 2); // Moderate fatigue (5-6)

    const isSakuraAnomaly = i === 1; // 昨日のデータに異常値を設定
    const sakuraJumpsFinal = isSakuraAnomaly ? 850 : sakuraJumps;
    const sakuraLoadFinal = isSakuraAnomaly ? 3500 : sakuraLoad;
    const maxJumpHeightFinal = isSakuraAnomaly ? 145.5 : (52 + Math.random() * 8);

    const sakuraRecord: any = {
      id: idCounter++,
      athleteId: 1,
      teamId: 1,
      date,
      sessionType,
      maxJumpHeight: maxJumpHeightFinal.toFixed(2) as any,
      avgJumpHeight: sakuraAvgHeight.toFixed(2) as any,
      totalJumps: sakuraJumpsFinal,
      jumpVolume: ((sakuraJumpsFinal * sakuraAvgHeight) / 100).toFixed(2) as any,
      jumpsOver40cm: sakuraJumpMetrics.over40,
      jumpZone1Count: sakuraJumpMetrics.z1,
      jumpZone2Count: sakuraJumpMetrics.z2,
      jumpZone3Count: sakuraJumpMetrics.z3,
      jumpZone4Count: sakuraJumpMetrics.z4,
      jumpZone5Count: sakuraJumpMetrics.z5,
      avgAcceleration: sakuraAvgAcc.toFixed(2) as any,
      maxAcceleration: (3.8 + Math.random() * 1.5).toFixed(2) as any,
      accelVolume: (sakuraAvgAcc * sakuraAccelCount).toFixed(2) as any,
      accelCount: sakuraAccelCount,
      totalDistance: (3800 + Math.random() * 1500).toFixed(2) as any,
      avgSpeed: (2.1 + Math.random() * 0.5).toFixed(2) as any,
      maxSpeed: (5.2 + Math.random() * 1.2).toFixed(2) as any,
      totalLoad: sakuraLoadFinal.toFixed(2) as any,
      avgLoad: (1.5 + Math.random() * 0.5).toFixed(2) as any,
      duration: sakuraDurationMin * 60,
      rawMenuData: JSON.stringify({
        loads: {
          "W-up": Number((sakuraLoadFinal * 0.15).toFixed(1)),
          "6v6": Number((sakuraLoadFinal * 0.60).toFixed(1)),
          "Individual": Number((sakuraLoadFinal * 0.25).toFixed(1))
        },
        ima: {
          "W-up": Math.round(sakuraAccelCount * 0.10),
          "6v6": Math.round(sakuraAccelCount * 0.70),
          "Individual": Math.round(sakuraAccelCount * 0.20)
        }
      }),
      coachAdvice: getAdvice(1, i),
      sRPE: sakuraRpe * sakuraDurationMin,
      rpeValue: sakuraRpe,
      hrv: null,
      highIntensityDistance: (150 + Math.random() * 100).toFixed(2) as any,
      avgHeartRate: null,
      physiologicalMarker: null,
      wellnessSleep: null,
      wellnessFatigue: null,
      wellnessSoreness: null,
      wellnessStress: null,
      rawCsvData: null,
      originalRawData: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const sakuraAnomalyCheck = checkPerformanceAnomaly(sakuraRecord);
    sakuraRecord.isAnomaly = sakuraAnomalyCheck.isAnomaly;
    sakuraRecord.anomalyDetails = sakuraAnomalyCheck.details;
    sakuraRecord.isCorrected = false;
    data.push(sakuraRecord);

    // Athlete 2: Hinata (Overworked & Divergence State in recent days)
    const hinataJumps = Math.floor(50 + Math.random() * 30);
    const hinataAvgHeight = 52 + Math.random() * 6;
    const hinataJumpMetrics = distributeJumps(hinataJumps);
    // Overwork hinata (elevate load recently)
    const loadMultiplier = i <= 5 ? 1.6 : 1.0; 
    const hinataLoad = (400 + Math.random() * 150) * loadMultiplier;
    const hinataAvgAcc = 2.1 + Math.random() * 0.6;
    const hinataAccelCount = Math.floor(30 + Math.random() * 20);
    const hinataDurationMin = Math.floor(90 + Math.random() * 30);
    
    // Simulate high subject fatigue vs low sleep in recent days (Divergence!)
    const hinataRpe = i <= 3 ? 9 : Math.floor(6 + Math.random() * 2); 
    const hinataSleep = i <= 3 ? 2 : Math.floor(3 + Math.random() * 2);
    const hinataFatigue = i <= 3 ? 1 : Math.floor(3 + Math.random() * 2);
    const hinataSoreness = i <= 3 ? 2 : Math.floor(3 + Math.random() * 2);

    data.push({
      id: idCounter++,
      athleteId: 2,
      teamId: 1,
      date,
      sessionType,
      maxJumpHeight: (68 + Math.random() * 9).toFixed(2) as any,
      avgJumpHeight: hinataAvgHeight.toFixed(2) as any,
      totalJumps: hinataJumps,
      jumpVolume: ((hinataJumps * hinataAvgHeight) / 100).toFixed(2) as any,
      jumpsOver40cm: hinataJumpMetrics.over40,
      jumpZone1Count: hinataJumpMetrics.z1,
      jumpZone2Count: hinataJumpMetrics.z2,
      jumpZone3Count: hinataJumpMetrics.z3,
      jumpZone4Count: hinataJumpMetrics.z4,
      jumpZone5Count: hinataJumpMetrics.z5,
      avgAcceleration: hinataAvgAcc.toFixed(2) as any,
      maxAcceleration: (4.8 + Math.random() * 2.1).toFixed(2) as any,
      accelVolume: (hinataAvgAcc * hinataAccelCount).toFixed(2) as any,
      accelCount: hinataAccelCount,
      totalDistance: (5200 + Math.random() * 2200).toFixed(2) as any,
      avgSpeed: (2.4 + Math.random() * 0.7).toFixed(2) as any,
      maxSpeed: (6.5 + Math.random() * 1.8).toFixed(2) as any,
      totalLoad: hinataLoad.toFixed(2) as any,
      avgLoad: (2.2 + Math.random() * 0.8).toFixed(2) as any,
      duration: hinataDurationMin * 60,
      rawMenuData: JSON.stringify({
        loads: {
          "W-up": Number((hinataLoad * 0.15).toFixed(1)),
          "6v6": Number((hinataLoad * 0.55).toFixed(1)),
          "Individual": Number((hinataLoad * 0.30).toFixed(1))
        },
        ima: {
          "W-up": Math.round(hinataAccelCount * 0.10),
          "6v6": Math.round(hinataAccelCount * 0.65),
          "Individual": Math.round(hinataAccelCount * 0.25)
        }
      }),
      coachAdvice: getAdvice(2, i),
      sRPE: hinataRpe * hinataDurationMin,
      rpeValue: hinataRpe,
      hrv: null,
      highIntensityDistance: (i <= 5 ? 300 + Math.random() * 150 : 120 + Math.random() * 80).toFixed(2) as any,
      avgHeartRate: null,
      physiologicalMarker: null,
      wellnessSleep: null,
      wellnessFatigue: null,
      wellnessSoreness: null,
      wellnessStress: null,
      rawCsvData: null,
      isAnomaly: false,
      anomalyDetails: null,
      isCorrected: false,
      originalRawData: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Athlete 3: Mio (Low load, high monotony)
    const mioJumps = Math.floor(40 + Math.random() * 20);
    const mioAvgHeight = 46 + Math.random() * 5;
    const mioJumpMetrics = distributeJumps(mioJumps);
    // Keep Mio load extremely uniform/monotonous
    const mioLoad = 300 + (i % 2 === 0 ? 10 : -10); // Standard load ~300. Extremely flat! High monotony.
    const mioAvgAcc = 1.9 + Math.random() * 0.5;
    const mioAccelCount = Math.floor(25 + Math.random() * 15);
    const mioDurationMin = 100; // Flat time
    const mioRpe = 5;

    data.push({
      id: idCounter++,
      athleteId: 3,
      teamId: 1,
      date,
      sessionType,
      maxJumpHeight: (60 + Math.random() * 7).toFixed(2) as any,
      avgJumpHeight: mioAvgHeight.toFixed(2) as any,
      totalJumps: mioJumps,
      jumpVolume: ((mioJumps * mioAvgHeight) / 100).toFixed(2) as any,
      jumpsOver40cm: mioJumpMetrics.over40,
      jumpZone1Count: mioJumpMetrics.z1,
      jumpZone2Count: mioJumpMetrics.z2,
      jumpZone3Count: mioJumpMetrics.z3,
      jumpZone4Count: mioJumpMetrics.z4,
      jumpZone5Count: mioJumpMetrics.z5,
      avgAcceleration: mioAvgAcc.toFixed(2) as any,
      maxAcceleration: (4.2 + Math.random() * 1.6).toFixed(2) as any,
      accelVolume: (mioAvgAcc * mioAccelCount).toFixed(2) as any,
      accelCount: mioAccelCount,
      totalDistance: (4500 + Math.random() * 1800).toFixed(2) as any,
      avgSpeed: (2.2 + Math.random() * 0.6).toFixed(2) as any,
      maxSpeed: (5.8 + Math.random() * 1.5).toFixed(2) as any,
      totalLoad: mioLoad.toFixed(2) as any,
      avgLoad: (1.8 + Math.random() * 0.6).toFixed(2) as any,
      duration: mioDurationMin * 60,
      rawMenuData: JSON.stringify({
        loads: {
          "W-up": Number((mioLoad * 0.15).toFixed(1)),
          "6v6": Number((mioLoad * 0.65).toFixed(1)),
          "Individual": Number((mioLoad * 0.20).toFixed(1))
        },
        ima: {
          "W-up": Math.round(mioAccelCount * 0.10),
          "6v6": Math.round(mioAccelCount * 0.70),
          "Individual": Math.round(mioAccelCount * 0.20)
        }
      }),
      coachAdvice: getAdvice(3, i),
      sRPE: mioRpe * mioDurationMin,
      rpeValue: mioRpe,
      hrv: null,
      highIntensityDistance: (80 + Math.random() * 50).toFixed(2) as any,
      avgHeartRate: null,
      physiologicalMarker: null,
      wellnessSleep: null,
      wellnessFatigue: null,
      wellnessSoreness: null,
      wellnessStress: null,
      rawCsvData: null,
      isAnomaly: false,
      anomalyDetails: null,
      isCorrected: false,
      originalRawData: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  return data;
};
mockPerformanceData = generateDemoPerformanceData();

const MOCK_ATHLETES_FILE = path.join(process.cwd(), "server/mock_athletes.json");
const MOCK_USERS_FILE = path.join(process.cwd(), "server/mock_users.json");
const MOCK_PERF_FILE = path.join(process.cwd(), "server/mock_performance.json");

export function saveMockStore() {
  try {
    fs.writeFileSync(MOCK_ATHLETES_FILE, JSON.stringify(mockAthletes, null, 2), "utf8");
    fs.writeFileSync(MOCK_USERS_FILE, JSON.stringify(mockUsers, null, 2), "utf8");
    fs.writeFileSync(MOCK_PERF_FILE, JSON.stringify(mockPerformanceData, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to save mock store to disk:", err);
  }
}

export function loadMockStore() {
  try {
    if (fs.existsSync(MOCK_ATHLETES_FILE)) {
      const data = fs.readFileSync(MOCK_ATHLETES_FILE, "utf8");
      mockAthletes = JSON.parse(data);
    }
    if (fs.existsSync(MOCK_USERS_FILE)) {
      const data = fs.readFileSync(MOCK_USERS_FILE, "utf8");
      mockUsers = JSON.parse(data);
    }
    if (fs.existsSync(MOCK_PERF_FILE)) {
      const data = fs.readFileSync(MOCK_PERF_FILE, "utf8");
      const parsed = JSON.parse(data);
      mockPerformanceData = parsed.map((p: any) => ({
        ...p,
        date: new Date(p.date),
        createdAt: new Date(p.createdAt),
        updatedAt: new Date(p.updatedAt)
      }));
    }
  } catch (err) {
    console.error("Failed to load mock store from disk:", err);
  }
}

loadMockStore();

let mockCsvUploads: CsvUpload[] = [];

// ==========================================
// DATABASE QUERY & UPDATE FUNCTIONS
// ==========================================

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Using Mock Store: upsertUser");
    const existing = mockUsers.find(u => u.openId === user.openId);
    const name = user.name ?? (existing ? existing.name : null);
    const email = user.email ?? (existing ? existing.email : null);
    const loginMethod = user.loginMethod ?? (existing ? existing.loginMethod : null);
    const role = user.role ?? (existing ? existing.role : (user.openId === ENV.ownerOpenId ? "admin" : "user"));
    const teamId = user.teamId ?? (existing ? existing.teamId : null);
    
    if (existing) {
      existing.name = name;
      existing.email = email;
      existing.loginMethod = loginMethod;
      existing.role = role;
      existing.teamId = teamId;
      if (user.password !== undefined) existing.password = user.password;
      existing.lastSignedIn = new Date();
      existing.updatedAt = new Date();
    } else {
      mockUsers.push({
        id: mockUsers.length + 1,
        openId: user.openId,
        name,
        email,
        loginMethod,
        teamId,
        role,
        password: user.password ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      });
    }
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod", "password"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function createAthleteUser(user: InsertUser): Promise<number> {
  const db = await getDb();
  const signedInAt = new Date();
  
  if (!db) {
    console.warn("[Database] Using Mock Store: createAthleteUser");
    const id = mockUsers.length + 1;
    mockUsers.push({
      id,
      openId: user.openId,
      name: user.name ?? null,
      email: user.email ?? null,
      loginMethod: user.loginMethod ?? "manus",
      teamId: user.teamId ?? null,
      role: "athlete",
      password: user.password ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: signedInAt,
    });
    return id;
  }

  const [result] = await db.insert(users).values({
    openId: user.openId,
    name: user.name,
    email: user.email,
    loginMethod: user.loginMethod ?? "manus",
    role: "athlete",
    teamId: user.teamId,
    password: user.password ?? null,
    lastSignedIn: signedInAt,
  }).returning();
  return result.id;
}


export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Using Mock Store: getUserByOpenId");
    return mockUsers.find(u => u.openId === openId);
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) {
    return mockUsers.find(u => u.id === id);
  }
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/**
 * Team queries
 */
export async function createTeam(name: string, coachId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Using Mock Store: createTeam");
    const id = mockTeams.length + 1;
    mockTeams.push({
      id,
      name,
      coachId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    // Update coach user's teamId
    const coach = mockUsers.find(u => u.id === coachId);
    if (coach) coach.teamId = id;
    return id;
  }
  
  const [result] = await db.insert(teams).values({ name, coachId }).returning();
  const teamId = result.id;
  // Update coach user's teamId in DB
  await db.update(users).set({ teamId }).where(eq(users.id, coachId));
  return teamId;
}

export async function getTeamById(teamId: number) {
  const db = await getDb();
  if (!db) return mockTeams.find(t => t.id === teamId);
  
  const result = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getTeamsByCoachId(coachId: number) {
  const db = await getDb();
  if (!db) return mockTeams.filter(t => t.coachId === coachId);
  
  return db.select().from(teams).where(eq(teams.coachId, coachId));
}

/**
 * Athlete queries
 */
export async function createAthlete(data: InsertAthlete) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Using Mock Store: createAthlete");
    const id = mockAthletes.length + 1;
    mockAthletes.push({
      id,
      userId: data.userId,
      teamId: data.teamId,
      jerseyNumber: data.jerseyNumber ?? null,
      position: data.position ?? null,
      birthday: data.birthday ?? null,
      height: data.height ?? null,
      csvNames: data.csvNames ?? null,
      onetapName: null,
      catapultName: null,
      soxaiEmail: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    
    // Update athlete user's teamId & role
    const athleteUser = mockUsers.find(u => u.id === data.userId);
    if (athleteUser) {
      athleteUser.teamId = data.teamId;
      athleteUser.role = "athlete";
    }
    return id;
  }
  
  const [result] = await db.insert(athletes).values(data).returning();
  const athleteId = result.id;
  // Update user team ID & role
  await db.update(users)
    .set({ teamId: data.teamId, role: "athlete" })
    .where(eq(users.id, data.userId));
  return athleteId;
}

export async function getAthleteByUserId(userId: number) {
  const db = await getDb();
  if (!db) return mockAthletes.find(a => a.userId === userId);
  
  const result = await db.select().from(athletes).where(eq(athletes.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAthleteById(id: number) {
  const db = await getDb();
  if (!db) return mockAthletes.find(a => a.id === id);
  
  const result = await db.select().from(athletes).where(eq(athletes.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAthletesByTeamId(teamId: number) {
  const db = await getDb();
  if (!db) {
    // Add user details to athlete records
    return mockAthletes
      .filter(a => a.teamId === teamId)
      .map(a => {
        const user = mockUsers.find(u => u.id === a.userId);
        return {
          ...a,
          user: user ? { name: user.name, email: user.email } : null
        };
      })
      .sort((a, b) => {
        const numA = a.jerseyNumber !== null && a.jerseyNumber !== undefined ? a.jerseyNumber : 9999;
        const numB = b.jerseyNumber !== null && b.jerseyNumber !== undefined ? b.jerseyNumber : 9999;
        return numA - numB;
      });
  }
  
  const teamAthletes = await db.select().from(athletes).where(eq(athletes.teamId, teamId));
  const result = [];
  for (const athlete of teamAthletes) {
    const user = await db.select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, athlete.userId))
      .limit(1);
    result.push({
      ...athlete,
      user: user.length > 0 ? user[0] : null
    });
  }

  // Sort by jerseyNumber ascending (nulls last)
  result.sort((a, b) => {
    const numA = a.jerseyNumber !== null && a.jerseyNumber !== undefined ? a.jerseyNumber : 9999;
    const numB = b.jerseyNumber !== null && b.jerseyNumber !== undefined ? b.jerseyNumber : 9999;
    return numA - numB;
  });

  return result;
}

export interface BatchSaveAthleteInput {
  id?: number;
  name: string;
  email: string;
  jerseyNumber: number | null;
  position: string | null;
  birthday: string | null;
  height: number | null;
  csvNames?: string | null;
  onetapName?: string | null;
  catapultName?: string | null;
  soxaiEmail?: string | null;
  password?: string | null;
  isDeleted?: boolean;
}

export async function batchSaveAthletes(teamId: number, athletesInput: BatchSaveAthleteInput[]): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Using Mock Store: batchSaveAthletes");
    for (const item of athletesInput) {
      if (item.isDeleted) {
        if (item.id) {
          // 削除
          const athleteIdx = mockAthletes.findIndex(a => a.id === item.id);
          if (athleteIdx !== -1) {
            const athlete = mockAthletes[athleteIdx];
            mockAthletes.splice(athleteIdx, 1);
            // 紐づく user も削除
            const userIdx = mockUsers.findIndex(u => u.id === athlete.userId);
            if (userIdx !== -1) {
              mockUsers.splice(userIdx, 1);
            }
          }
        }
      } else if (item.id) {
        // 更新
        const athlete = mockAthletes.find(a => a.id === item.id);
        if (athlete) {
          athlete.jerseyNumber = item.jerseyNumber;
          athlete.position = item.position;
          athlete.birthday = item.birthday;
          athlete.height = item.height !== null ? String(item.height) as any : null;
          athlete.csvNames = item.csvNames || null;
          athlete.onetapName = item.onetapName || null;
          athlete.catapultName = item.catapultName || null;
          athlete.soxaiEmail = item.soxaiEmail || null;
          athlete.updatedAt = new Date();
          
          const user = mockUsers.find(u => u.id === athlete.userId);
          if (user) {
            user.name = item.name;
            user.email = item.email;
            if (item.password !== undefined) user.password = item.password;
            user.updatedAt = new Date();
          }
        }
      } else {
        // 新規追加
        // 1. user 作成
        const userId = mockUsers.length + 1;
        const openId = `athlete_${item.email.replace(/[@.]/g, "_")}_${Date.now()}`;
        mockUsers.push({
          id: userId,
          openId,
          name: item.name,
          email: item.email,
          loginMethod: "manus",
          teamId,
          role: "athlete",
          password: item.password ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        });
        
        // 2. athlete 作成
        const athleteId = mockAthletes.length + 1;
        mockAthletes.push({
          id: athleteId,
          userId,
          teamId,
          jerseyNumber: item.jerseyNumber,
          position: item.position,
          birthday: item.birthday,
          height: item.height !== null ? String(item.height) as any : null,
          csvNames: item.csvNames || null,
          onetapName: item.onetapName || null,
          catapultName: item.catapultName || null,
          soxaiEmail: item.soxaiEmail || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }
    saveMockStore();
    return;
  }

  // DB 接続がある場合
  await db.transaction(async (tx) => {
    for (const item of athletesInput) {
      if (item.isDeleted) {
        if (item.id) {
          // 該当選手取得
          const [athlete] = await tx.select().from(athletes).where(eq(athletes.id, item.id)).limit(1);
          if (athlete) {
            // athlete レコード削除
            await tx.delete(athletes).where(eq(athletes.id, item.id));
            // user レコード削除
            await tx.delete(users).where(eq(users.id, athlete.userId));
          }
        }
      } else if (item.id) {
        // 更新
        const [athlete] = await tx.select().from(athletes).where(eq(athletes.id, item.id)).limit(1);
        if (athlete) {
          // users 更新
          const userUpdates: Record<string, any> = {
            name: item.name,
            email: item.email,
            updatedAt: new Date()
          };
          if (item.password !== undefined && item.password !== "") {
            userUpdates.password = item.password;
          }
          await tx.update(users)
            .set(userUpdates)
            .where(eq(users.id, athlete.userId));
          
          // athletes 更新
          await tx.update(athletes)
            .set({
              jerseyNumber: item.jerseyNumber,
              position: item.position,
              birthday: item.birthday,
              height: item.height !== null ? String(item.height) as any : null,
              csvNames: item.csvNames || null,
              onetapName: item.onetapName || null,
              catapultName: item.catapultName || null,
              soxaiEmail: item.soxaiEmail || null,
              updatedAt: new Date()
            })
            .where(eq(athletes.id, item.id));
        }
      } else {
        // 新規追加
        // 1. user レコード作成
        const openId = `athlete_${item.email.replace(/[@.]/g, "_")}_${Date.now()}`;
        const [userResult] = await tx.insert(users).values({
          openId,
          name: item.name,
          email: item.email,
          loginMethod: "manus",
          teamId,
          role: "athlete",
          password: item.password ?? null,
        }).returning();
        const userId = userResult.id;

        // 2. athlete レコード作成
        await tx.insert(athletes).values({
          userId,
          teamId,
          jerseyNumber: item.jerseyNumber,
          position: item.position,
          birthday: item.birthday,
          height: item.height !== null ? String(item.height) as any : null,
          csvNames: item.csvNames || null,
          onetapName: item.onetapName || null,
          catapultName: item.catapultName || null,
          soxaiEmail: item.soxaiEmail || null,
        });
      }
    }
  });
}

/**
 * Performance data queries
 */
export async function createPerformanceData(data: InsertPerformanceData) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Using Mock Store: createPerformanceData");
    const id = mockPerformanceData.length + 1;
    mockPerformanceData.push({
      id,
      athleteId: data.athleteId,
      teamId: data.teamId,
      date: new Date(data.date),
      sessionType: data.sessionType ?? "practice",
      maxJumpHeight: data.maxJumpHeight ? String(data.maxJumpHeight) as any : null,
      avgJumpHeight: data.avgJumpHeight ? String(data.avgJumpHeight) as any : null,
      totalJumps: data.totalJumps ?? null,
      
      jumpVolume: data.jumpVolume ? String(data.jumpVolume) as any : null,
      jumpsOver40cm: data.jumpsOver40cm ?? null,
      jumpZone1Count: data.jumpZone1Count ?? null,
      jumpZone2Count: data.jumpZone2Count ?? null,
      jumpZone3Count: data.jumpZone3Count ?? null,
      jumpZone4Count: data.jumpZone4Count ?? null,
      jumpZone5Count: data.jumpZone5Count ?? null,
      
      avgAcceleration: data.avgAcceleration ? String(data.avgAcceleration) as any : null,
      maxAcceleration: data.maxAcceleration ? String(data.maxAcceleration) as any : null,
      
      accelVolume: data.accelVolume ? String(data.accelVolume) as any : null,
      accelCount: data.accelCount ?? null,
      
      totalDistance: data.totalDistance ? String(data.totalDistance) as any : null,
      avgSpeed: data.avgSpeed ? String(data.avgSpeed) as any : null,
      maxSpeed: data.maxSpeed ? String(data.maxSpeed) as any : null,
      totalLoad: data.totalLoad ? String(data.totalLoad) as any : null,
      avgLoad: data.avgLoad ? String(data.avgLoad) as any : null,
      duration: data.duration ?? null,
      rawMenuData: data.rawMenuData ?? null,
      coachAdvice: data.coachAdvice ?? null,
      sRPE: data.sRPE ?? null,
      rpeValue: data.rpeValue ?? null,
      wellnessSleep: data.wellnessSleep ?? null,
      wellnessFatigue: data.wellnessFatigue ?? null,
      wellnessSoreness: data.wellnessSoreness ?? null,
      wellnessStress: data.wellnessStress ?? null,
      hrv: data.hrv ? String(data.hrv) as any : null,
      highIntensityDistance: data.highIntensityDistance ? String(data.highIntensityDistance) as any : null,
      avgHeartRate: data.avgHeartRate ?? null,
      physiologicalMarker: data.physiologicalMarker ? String(data.physiologicalMarker) as any : null,
      rawCsvData: data.rawCsvData ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
    return id;
  }
  
  const result = await db.insert(performanceData).values(data);
  return (result as any).insertId;
}

export async function getPerformanceDataByAthleteId(athleteId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) {
    return mockPerformanceData
      .filter(p => p.athleteId === athleteId)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-limit);
  }
  
  const list = await db.select().from(performanceData)
    .where(eq(performanceData.athleteId, athleteId))
    .orderBy(desc(performanceData.date))
    .limit(limit);

  return list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export async function getPerformanceDataByTeamId(teamId: number, dateStr?: string, limit: number = 1500) {
  const db = await getDb();
  if (!db) {
    let list = mockPerformanceData.filter(p => p.teamId === teamId);
    if (dateStr) {
      list = list.filter(p => {
        const d = new Date(p.date);
        return formatDateKey(d) === dateStr;
      });
    }
    return list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(-limit);
  }
  
  if (dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const startDate = new Date(y, m - 1, d, 0, 0, 0, 0);
    const endDate = new Date(y, m - 1, d, 23, 59, 59, 999);
    return db.select().from(performanceData)
      .where(
        and(
          eq(performanceData.teamId, teamId),
          gte(performanceData.date, startDate),
          lte(performanceData.date, endDate)
        )
      )
      .orderBy((table) => table.date)
      .limit(limit);
  }
  
  return db.select().from(performanceData)
    .where(eq(performanceData.teamId, teamId))
    .orderBy((table) => table.date)
    .limit(limit);
}

export async function getImportStatusByMonth(teamId: number, year: number, month: number) {
  const db = await getDb();
  
  // Date range for the requested month
  const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);
  
  let records: any[] = [];
  
  if (!db) {
    records = mockPerformanceData.filter(p => {
      const d = new Date(p.date);
      return p.teamId === teamId && d >= startDate && d <= endDate;
    });
  } else {
    records = await db.select()
      .from(performanceData)
      .where(
        and(
          eq(performanceData.teamId, teamId),
          gte(performanceData.date, startDate),
          lte(performanceData.date, endDate)
        )
      );
  }
  
  const statusMap: Record<string, { 
    hasIma: boolean; 
    hasPlayerLoad: boolean; 
    hasWellness: boolean; 
    hasSrpe: boolean; 
    hasSoxai: boolean; 
    hasMenu: boolean; 
    hasRpeLog: boolean;
  }> = {};
  
  for (const record of records) {
    const d = new Date(record.date);
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    
    if (!statusMap[dateKey]) {
      statusMap[dateKey] = { 
        hasIma: false, 
        hasPlayerLoad: false, 
        hasWellness: false, 
        hasSrpe: false, 
        hasSoxai: false, 
        hasMenu: false, 
        hasRpeLog: false 
      };
    }
    
    // 1. IMA (Event log)
    const hasImaFields = 
      record.maxJumpHeight !== null || 
      record.avgJumpHeight !== null || 
      record.totalJumps !== null || 
      record.avgAcceleration !== null || 
      record.maxAcceleration !== null;
      
    // 2. Player Load (PL)
    const hasLoadFields = 
      record.totalLoad !== null && 
      Number(record.totalLoad) > 0;

    // 3. Wellness (Onetap)
    const hasWellnessFields = 
      record.wellnessFatigue !== null || 
      record.wellnessSleep !== null || 
      record.wellnessStress !== null;

    // 4. sRPE (Total)
    const hasSrpeFields = record.sRPE !== null && Number(record.sRPE) > 0;

    // 5. SOXAI (hrv)
    const hasSoxaiFields = record.hrv !== null && Number(record.hrv) > 0;

    // 6. Menu (Menu Load)
    const hasMenuFields = record.rawMenuData !== null && record.rawMenuData.length > 2;

    // 7. RPE Log
    const hasRpeLogFields = record.rpeValue !== null && Number(record.rpeValue) > 0;
      
    if (hasImaFields) statusMap[dateKey].hasIma = true;
    if (hasLoadFields) statusMap[dateKey].hasPlayerLoad = true;
    if (hasWellnessFields) statusMap[dateKey].hasWellness = true;
    if (hasSrpeFields) statusMap[dateKey].hasSrpe = true;
    if (hasSoxaiFields) statusMap[dateKey].hasSoxai = true;
    if (hasMenuFields) statusMap[dateKey].hasMenu = true;
    if (hasRpeLogFields) statusMap[dateKey].hasRpeLog = true;
  }
  
  return Object.entries(statusMap).map(([date, status]) => ({
    date,
    ...status
  }));
}

export async function getLatestPerformanceDataByAthlete(athleteId: number) {
  const db = await getDb();
  if (!db) {
    const list = mockPerformanceData
      .filter(p => p.athleteId === athleteId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return list.length > 0 ? list[0] : undefined;
  }
  
  const result = await db.select().from(performanceData)
    .where(eq(performanceData.athleteId, athleteId))
    .orderBy(desc(performanceData.date))
    .limit(1);
  
  return result.length > 0 ? result[0] : undefined;
}

export async function getPerformanceDataByAthleteAndDate(athleteId: number, dateStr: string) {
  const db = await getDb();
  if (!db) {
    return mockPerformanceData.find(p => {
      const d = new Date(p.date);
      return p.athleteId === athleteId && formatDateKey(d) === dateStr;
    });
  }

  const [y, m, d] = dateStr.split("-").map(Number);
  const startDate = new Date(y, m - 1, d, 0, 0, 0, 0);
  const endDate = new Date(y, m - 1, d, 23, 59, 59, 999);

  const result = await db.select().from(performanceData)
    .where(
      and(
        eq(performanceData.athleteId, athleteId),
        gte(performanceData.date, startDate),
        lte(performanceData.date, endDate)
      )
    )
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getPerformanceDataById(id: number) {
  const db = await getDb();
  if (!db) {
    return mockPerformanceData.find(p => p.id === id);
  }
  const result = await db.select().from(performanceData).where(eq(performanceData.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/**
 * CSV upload history queries
 */
export async function createCsvUpload(data: InsertCsvUpload) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Using Mock Store: createCsvUpload");
    const id = mockCsvUploads.length + 1;
    mockCsvUploads.push({
      id,
      teamId: data.teamId,
      uploadedBy: data.uploadedBy,
      fileName: data.fileName,
      fileSize: data.fileSize ?? null,
      recordsImported: data.recordsImported ?? null,
      status: data.status ?? "pending",
      errorMessage: null,
      createdAt: new Date(),
    });
    return id;
  }
  
  const [result] = await db.insert(csvUploads).values(data).returning();
  return result.id;
}

export async function getCsvUploadsByTeamId(teamId: number, limit: number = 20) {
  const db = await getDb();
  if (!db) {
    return mockCsvUploads
      .filter(c => c.teamId === teamId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }
  
  return db.select().from(csvUploads)
    .where(eq(csvUploads.teamId, teamId))
    .orderBy((table) => table.createdAt)
    .limit(limit);
}

export async function updateCsvUploadStatus(uploadId: number, status: "pending" | "processing" | "completed" | "failed", errorMessage?: string, recordsImported?: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Using Mock Store: updateCsvUploadStatus");
    const upload = mockCsvUploads.find(c => c.id === uploadId);
    if (upload) {
      upload.status = status;
      if (errorMessage !== undefined) upload.errorMessage = errorMessage;
      if (recordsImported !== undefined) upload.recordsImported = recordsImported;
    }
    return;
  }
  
  const updateData: Record<string, unknown> = { status };
  if (errorMessage !== undefined) {
    updateData.errorMessage = errorMessage;
  }
  if (recordsImported !== undefined) {
    updateData.recordsImported = recordsImported;
  }
  
  await db.update(csvUploads).set(updateData).where(eq(csvUploads.id, uploadId));
}

// ==========================================
// CSV PARSING & IMPORT LOGIC
// ==========================================

const parseDateFlexible = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  const cleaned = dateStr.trim().replace(/^["']|["']$/g, "");
  
  // 1. Try standard JS Date parsing
  const d = new Date(cleaned);
  if (!isNaN(d.getTime())) return d;

  // 2. Try extraction using regex for format like YYYY/MM/DD, YY/MM/DD or YYYY年MM月DD日
  const match = cleaned.match(/(\d{4}|\d{2})[-/年\s](\d{1,2})[-/月\s](\d{1,2})[日]?/);
  if (match) {
    let year = parseInt(match[1], 10);
    if (year < 100) year += 2000; // Correct 2-digit years
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    const parsed = new Date(year, month, day);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return null;
};

const formatDateKey = (date: Date | string) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

async function findExistingPerformanceData(db: any, athleteId: number, dateObj: Date) {
  if (!db) {
    const targetKey = formatDateKey(dateObj);
    return mockPerformanceData.find(p => p.athleteId === athleteId && formatDateKey(p.date) === targetKey);
  }
  
  const startDate = new Date(dateObj);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(dateObj);
  endDate.setHours(23, 59, 59, 999);
  
  const result = await db.select()
    .from(performanceData)
    .where(
      and(
        eq(performanceData.athleteId, athleteId),
        gte(performanceData.date, startDate),
        lte(performanceData.date, endDate)
      )
    )
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

function findAthleteByCsvName(teamAthletes: any[], name: string, platform?: "onetap" | "catapult" | "soxai") {
  if (name) {
    const numMatch = name.match(/\b\d+\b/) || name.match(/\d+/);
    if (numMatch) {
      const jerseyNum = parseInt(numMatch[0], 10);
      const matchedByJersey = teamAthletes.find(a => a.jerseyNumber === jerseyNum);
      if (matchedByJersey) {
        return matchedByJersey;
      }
    }
  }

  const cleanName = (raw: string) => {
    if (!raw) return "";
    let cleaned = raw.trim();
    // Remove W-up - or Individual - prefixes
    cleaned = cleaned.replace(/^(Individual\s*-\s*|W-up\s*-\s*|individual\s*-\s*|w-up\s*-\s*)/i, "");
    // Remove jersey number prefix (e.g. "15 Yanagi" -> "Yanagi")
    cleaned = cleaned.replace(/^[\d\s#]+/, "");
    // Remove all spaces and lowercase
    return cleaned.replace(/\s+/g, "").toLowerCase();
  };

  const searchName = cleanName(name);
  if (!searchName) return null;

  // 1. Exact cleaned match first
  const exactMatch = teamAthletes.find(a => {
    if (platform === "onetap" && a.onetapName) {
      if (cleanName(a.onetapName) === searchName) return true;
    }
    if (platform === "catapult" && a.catapultName) {
      if (cleanName(a.catapultName) === searchName) return true;
    }
    const dbName = a.user?.name || "";
    if (cleanName(dbName) === searchName) return true;
    return false;
  });
  if (exactMatch) return exactMatch;

  // 2. Partial cleaned match fallback
  return teamAthletes.find(a => {
    // Check custom platform mappings
    if (platform === "onetap" && a.onetapName) {
      const oName = cleanName(a.onetapName);
      if (oName.includes(searchName) || searchName.includes(oName)) return true;
    }
    if (platform === "catapult" && a.catapultName) {
      const cName = cleanName(a.catapultName);
      if (cName.includes(searchName) || searchName.includes(cName)) return true;
    }
    if (platform === "soxai" && a.soxaiEmail) {
      const sEmail = a.soxaiEmail.trim().toLowerCase();
      if (sEmail === name.trim().toLowerCase()) return true;
    }

    // Fallback to User name check
    const dbName = cleanName(a.user?.name || "");
    if (dbName && (dbName.includes(searchName) || searchName.includes(dbName))) {
      return true;
    }
    
    // Fallback to csvNames alias check
    const csvNamesStr = a.csvNames || "";
    if (csvNamesStr) {
      const aliases = csvNamesStr.split(",").map((n: string) => cleanName(n));
      return aliases.some((alias: string) => alias === searchName || alias.includes(searchName) || searchName.includes(alias));
    }
    return false;
  });
}

async function mergePerformanceData(db: any, teamId: number, data: any) {
  const existing = await findExistingPerformanceData(db, data.athleteId, data.date);
  const defaultSessionType = data.date ? (new Date(data.date).getDay() === 0 || new Date(data.date).getDay() === 6 ? "match" as const : "practice" as const) : "practice" as const;

  let rawCsvObj: any = {};
  if (data.rawCsvData) {
    try {
      rawCsvObj = JSON.parse(data.rawCsvData);
    } catch (e) {}
  }
  const currentKey = `${rawCsvObj.fileName || "unknown_file.csv"}_${rawCsvObj.sessionType || "auto"}`;

  let existingRawCsvObj: any = {};
  if (existing && existing.rawCsvData) {
    try {
      const parsed = JSON.parse(existing.rawCsvData);
      if (parsed && typeof parsed === "object") {
        existingRawCsvObj = parsed;
      }
    } catch (e) {}
  }

  const fileDataMap = existingRawCsvObj.fileData || {};

  const additiveFields = [
    "totalLoad",
    "totalJumps",
    "jumpVolume",
    "jumpsOver40cm",
    "jumpZone1Count",
    "jumpZone2Count",
    "jumpZone3Count",
    "jumpZone4Count",
    "jumpZone5Count",
    "accelCount"
  ];

  const currentFileData: any = {};
  let hasNewAdditiveData = false;
  
  for (const field of additiveFields) {
    if (data[field] !== undefined && data[field] !== null && data[field] !== "") {
      currentFileData[field] = parseFloat(data[field]);
      hasNewAdditiveData = true;
    }
  }

  if (hasNewAdditiveData) {
    fileDataMap[currentKey] = currentFileData;
  }

  const calculatedSums: any = {};
  if (Object.keys(fileDataMap).length > 0) {
    for (const field of additiveFields) {
      let sum = 0;
      let hasValue = false;
      for (const fName of Object.keys(fileDataMap)) {
        if (fileDataMap[fName][field] !== undefined && fileDataMap[fName][field] !== null) {
          sum += fileDataMap[fName][field];
          hasValue = true;
        }
      }
      if (hasValue) {
        if (field === "totalLoad" || field === "jumpVolume") {
          calculatedSums[field] = sum.toFixed(2);
        } else {
          calculatedSums[field] = Math.round(sum);
        }
      }
    }
  }

  const newRawCsvData = JSON.stringify({
    ...rawCsvObj,
    fileData: fileDataMap
  });

  const mergeMaxField = (newVal: any, existingVal: any) => {
    const valA = newVal !== undefined && newVal !== null && newVal !== "" ? parseFloat(newVal) : null;
    const valB = existingVal !== undefined && existingVal !== null && existingVal !== "" ? parseFloat(existingVal) : null;
    
    const safeA = valA !== null && !isNaN(valA) ? valA : null;
    const safeB = valB !== null && !isNaN(valB) ? valB : null;

    if (safeA !== null && safeB !== null) {
      return Math.max(safeA, safeB).toFixed(2);
    }
    return safeA !== null ? safeA.toFixed(2) : (safeB !== null ? safeB.toFixed(2) : null);
  };

  const mergeField = (newVal: any, existingVal: any, defaultVal: any = null) => {
    if (newVal !== undefined && newVal !== null && newVal !== "") {
      const parsed = parseFloat(newVal);
      if (isNaN(parsed) && (typeof newVal === "string" && (newVal.toLowerCase() === "nan" || newVal === ""))) {
        // Skip and default
      } else {
        return newVal;
      }
    }
    return existingVal !== undefined && existingVal !== null && existingVal !== "" ? existingVal : defaultVal;
  };

  const mergeAdditiveField = (newVal: any, existingVal: any, calculatedVal: any) => {
    if (calculatedVal !== undefined && calculatedVal !== null && !isNaN(parseFloat(calculatedVal))) {
      return calculatedVal;
    }
    if (newVal !== undefined && newVal !== null && newVal !== "") {
      const parsed = parseFloat(newVal);
      if (!isNaN(parsed)) return newVal;
    }
    return existingVal !== undefined && existingVal !== null ? existingVal : null;
  };

  // Merge rawMenuData structures safely (playerLoads, jumpVolumes, accelVolumes)
  let mergedMenuObj: any = {};
  if (existing && existing.rawMenuData) {
    try {
      const parsed = JSON.parse(existing.rawMenuData);
      if (parsed && typeof parsed === "object") {
        mergedMenuObj = { ...parsed };
      }
    } catch (e) {}
  }
  if (!mergedMenuObj || typeof mergedMenuObj !== "object") {
    mergedMenuObj = {};
  }

  let newMenuObj: any = {};
  if (data.rawMenuData) {
    try {
      const parsed = JSON.parse(data.rawMenuData);
      if (parsed && typeof parsed === "object") {
        newMenuObj = parsed;
      }
    } catch (e) {}
  }
  if (!newMenuObj || typeof newMenuObj !== "object") {
    newMenuObj = {};
  }
  const keysToMerge = ["playerLoads", "jumpVolumes", "accelVolumes"];
  for (const key of keysToMerge) {
    if (newMenuObj[key]) {
      mergedMenuObj[key] = mergedMenuObj[key] || {};
      for (const mName of Object.keys(newMenuObj[key])) {
        const val = parseFloat(newMenuObj[key][mName]);
        if (!isNaN(val)) {
          mergedMenuObj[key][mName] = val;
        }
      }
    }
  }
  for (const key of Object.keys(newMenuObj)) {
    if (!keysToMerge.includes(key)) {
      mergedMenuObj[key] = newMenuObj[key];
    }
  }
  const finalRawMenuData = Object.keys(mergedMenuObj).length > 0 ? JSON.stringify(mergedMenuObj) : null;

  const mergedData = {
    ...data,
    sessionType: mergeField(data.sessionType, existing?.sessionType, defaultSessionType),
    maxJumpHeight: mergeMaxField(data.maxJumpHeight, existing?.maxJumpHeight),
    avgJumpHeight: mergeField(data.avgJumpHeight, existing?.avgJumpHeight, null),
    totalJumps: mergeAdditiveField(data.totalJumps, existing?.totalJumps, calculatedSums.totalJumps),
    jumpVolume: mergeAdditiveField(data.jumpVolume, existing?.jumpVolume, calculatedSums.jumpVolume),
    jumpsOver40cm: mergeAdditiveField(data.jumpsOver40cm, existing?.jumpsOver40cm, calculatedSums.jumpsOver40cm),
    jumpZone1Count: mergeAdditiveField(data.jumpZone1Count, existing?.jumpZone1Count, calculatedSums.jumpZone1Count),
    jumpZone2Count: mergeAdditiveField(data.jumpZone2Count, existing?.jumpZone2Count, calculatedSums.jumpZone2Count),
    jumpZone3Count: mergeAdditiveField(data.jumpZone3Count, existing?.jumpZone3Count, calculatedSums.jumpZone3Count),
    jumpZone4Count: mergeAdditiveField(data.jumpZone4Count, existing?.jumpZone4Count, calculatedSums.jumpZone4Count),
    jumpZone5Count: mergeAdditiveField(data.jumpZone5Count, existing?.jumpZone5Count, calculatedSums.jumpZone5Count),
    
    avgAcceleration: mergeField(data.avgAcceleration, existing?.avgAcceleration, null),
    maxAcceleration: mergeMaxField(data.maxAcceleration, existing?.maxAcceleration),
    accelVolume: mergeField(data.accelVolume, existing?.accelVolume, null),
    accelCount: mergeAdditiveField(data.accelCount, existing?.accelCount, calculatedSums.accelCount),
    
    totalDistance: mergeField(data.totalDistance, existing?.totalDistance, "0.00"),
    avgSpeed: mergeField(data.avgSpeed, existing?.avgSpeed, "0.00"),
    maxSpeed: mergeField(data.maxSpeed, existing?.maxSpeed, "0.00"),
    totalLoad: mergeAdditiveField(data.totalLoad, existing?.totalLoad, calculatedSums.totalLoad),
    avgLoad: mergeField(data.avgLoad, existing?.avgLoad, null),
    duration: mergeField(data.duration, existing?.duration, null),
    rawMenuData: finalRawMenuData,
    sRPE: mergeField(data.sRPE, existing?.sRPE, null),
    rpeValue: mergeField(data.rpeValue, existing?.rpeValue, null),
    wellnessSleep: mergeField(data.wellnessSleep, existing?.wellnessSleep, null),
    wellnessFatigue: mergeField(data.wellnessFatigue, existing?.wellnessFatigue, null),
    wellnessSoreness: mergeField(data.wellnessSoreness, existing?.wellnessSoreness),
    wellnessStress: mergeField(data.wellnessStress, existing?.wellnessStress),
    hrv: mergeField(data.hrv, existing?.hrv),
    highIntensityDistance: mergeField(data.highIntensityDistance, existing?.highIntensityDistance),
    avgHeartRate: mergeField(data.avgHeartRate, existing?.avgHeartRate),
    physiologicalMarker: mergeField(data.physiologicalMarker, existing?.physiologicalMarker),
    coachAdvice: mergeField(data.coachAdvice, existing?.coachAdvice),
    rawCsvData: newRawCsvData,
  };

  // 異常判定と補正状態のリセット
  // 新しいCSVから同じ日付のデータが再度アップロードされた場合は、
  // 以前の補正状態をリセットし、最初から補正・承認のし直しができるようにします。
  let isAnomaly = false;
  let anomalyDetails = null;
  let isCorrected = false;
  let originalRawData = null;

  const anomalyCheck = checkPerformanceAnomaly(mergedData);
  if (anomalyCheck.isAnomaly) {
    isAnomaly = true;
    anomalyDetails = anomalyCheck.details;
  }

  const finalMerged = {
    ...mergedData,
    isAnomaly,
    anomalyDetails,
    isCorrected,
    originalRawData
  };

  if (existing) {
    if (!db) {
      Object.assign(existing, finalMerged);
      existing.updatedAt = new Date();
    } else {
      await db.update(performanceData).set(finalMerged as any).where(eq(performanceData.id, existing.id));
    }
  } else {
    if (!db) {
      const newId = mockPerformanceData.length + 1;
      mockPerformanceData.push({
        id: newId,
        ...finalMerged,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
    } else {
      await db.insert(performanceData).values(finalMerged as any);
    }
  }
}

export async function importPerformanceCsv(
  teamId: number,
  uploadedBy: number,
  csvText: string,
  rawFileName?: string | null,
  targetSessionType: "practice" | "individual" | "match" | "auto" = "auto"
) {
  const db = await getDb();
  const fileName = rawFileName || "catapult_import.csv";
  
  // Create history record
  const uploadId = await createCsvUpload({
    teamId,
    uploadedBy,
    fileName,
    fileSize: csvText.length,
    status: "processing"
  });

  try {
    const getFallbackDate = (fName: string) => {
      const p1 = fName.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
      if (p1) {
        const d = new Date(parseInt(p1[1], 10), parseInt(p1[2], 10) - 1, parseInt(p1[3], 10));
        if (!isNaN(d.getTime())) return d;
      }
      const p2 = fName.match(/(\d{4})(\d{2})(\d{2})/);
      if (p2) {
        const d = new Date(parseInt(p2[1], 10), parseInt(p2[2], 10) - 1, parseInt(p2[3], 10));
        if (!isNaN(d.getTime())) return d;
      }
      const p3 = fName.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
      if (p3) {
        const d = new Date(parseInt(p3[3], 10), parseInt(p3[1], 10) - 1, parseInt(p3[2], 10));
        if (!isNaN(d.getTime())) return d;
      }
      return new Date();
    };

    const runInParallelBatches = async <T>(
      items: T[], 
      batchSize: number, 
      processor: (item: T) => Promise<void>
    ) => {
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        await Promise.all(batch.map(processor));
      }
    };

    const lines = csvText.split(/\r?\n/);
    if (lines.length < 2) {
      throw new Error("CSV file is empty or missing headers");
    }

    let headerLine = lines[0];
    const isSoxaiType = csvText.includes("睡眠スコア") && csvText.includes("安静時心拍数");
    if (isSoxaiType) {
      const foundHeader = lines.find(l => l.includes("タイムスタンプ"));
      if (foundHeader) headerLine = foundHeader;
    }

    let delimiter = ",";
    for (const line of lines) {
      if (line.includes("\t")) {
        delimiter = "\t";
        break;
      } else if (line.includes(";")) {
        delimiter = ";";
        break;
      }
    }
    const headers = headerLine.split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ""));
    
    const findHeaderIndex = (keys: string[]) => {
      return headers.findIndex(h => h && keys.some(k => h.toLowerCase().includes(k.toLowerCase())));
    };

    // Detection flags for 7 user formats
    const isWellnessOnetap = findHeaderIndex(["項目名", "項目"]) !== -1 && findHeaderIndex(["値", "スコア", "回答", "value"]) !== -1 && (findHeaderIndex(["選手名", "選手", "名前", "氏名", "氏名・ニックネーム", "name"]) !== -1 || findHeaderIndex(["内訳"]) !== -1);
    const isSRPE = findHeaderIndex(["トレーニング実施日"]) !== -1 && findHeaderIndex(["Session RPE"]) !== -1;
    const isSoxai = csvText.includes("睡眠スコア") && csvText.includes("安静時心拍数");
    
    // Enhanced IMA Log detection to prevent misclassification as isMenuLoadLog
    const isImaLog = 
      (findHeaderIndex(["OF Event"]) !== -1 || findHeaderIndex(["OFEvent"]) !== -1) &&
      (findHeaderIndex(["Jump Attribute"]) !== -1 || findHeaderIndex(["Intensity (m/s)"]) !== -1 || findHeaderIndex(["Direction"]) !== -1 || findHeaderIndex(["Height (m)"]) !== -1);

    // Fallbacks to standard types
    const tagIdx = findHeaderIndex(["tag", "タグ"]);
    const intensityIdx = findHeaderIndex(["intensity", "強度"]);
    const dfEventIdx = findHeaderIndex(["df event", "dfevent", "イベント"]);
    const loadIdx = findHeaderIndex(["total player load", "player load", "load", "運動量", "value"]);
    const dateIdx = findHeaderIndex(["date", "日付"]);
    const jerseyIdx = findHeaderIndex(["jersey", "no", "背番号"]);
    const rpeIdx = findHeaderIndex(["rpe", "自覚的運動強度", "主観"]);
    const sessionTimeIdx = findHeaderIndex(["time", "練習時間", "時間(分)", "分", "duration"]);

    const isEventLog = !isImaLog && (tagIdx !== -1 || intensityIdx !== -1 || dfEventIdx !== -1);
    const isRpeLog = !isSRPE && (rpeIdx !== -1 && sessionTimeIdx !== -1 && !isEventLog);
    const isMenuLoadLog = !isWellnessOnetap && !isSRPE && !isSoxai && !isImaLog && loadIdx !== -1 && !isEventLog && !isRpeLog;

    // Logging import flags for backend diagnosis
    console.log(`[CSV Import] fileName: ${fileName}, fileSize: ${csvText.length} bytes, delimiter: "${delimiter}"`);
    console.log(`[CSV Import] headers: ${JSON.stringify(headers)}`);
    console.log(`[CSV Import] Flags -> isWellnessOnetap: ${isWellnessOnetap}, isSRPE: ${isSRPE}, isSoxai: ${isSoxai}, isImaLog: ${isImaLog}`);
    console.log(`[CSV Import] Flags -> isEventLog: ${isEventLog}, isRpeLog: ${isRpeLog}, isMenuLoadLog: ${isMenuLoadLog}`);

    const teamAthletes = await getAthletesByTeamId(teamId);
    let importedCount = 0;
    const unregisteredSet = new Set<string>();

    const parseCsvLine = (line: string) => {
      const values = [];
      let currentVal = "";
      let inQuotes = false;
      for (let charIdx = 0; charIdx < line.length; charIdx++) {
        const char = line[charIdx];
        if (char === '"' || char === "'") {
          inQuotes = !inQuotes;
        } else if (char === delimiter && !inQuotes) {
          values.push(currentVal.trim().replace(/^["']|["']$/g, ""));
          currentVal = "";
        } else {
          currentVal += char;
        }
      }
      values.push(currentVal.trim().replace(/^["']|["']$/g, ""));
      return values;
    };

    if (isWellnessOnetap) {
      const dateCol = findHeaderIndex(["日付", "日時", "回答日時", "date"]);
      const nameCol = findHeaderIndex(["選手名", "選手", "名前", "氏名", "氏名・ニックネーム", "name", "内訳"]);
      const itemCol = findHeaderIndex(["項目名", "項目", "item", "metric"]);
      const valCol = findHeaderIndex(["値", "スコア", "回答", "value"]);

      if (dateCol === -1 || nameCol === -1 || itemCol === -1 || valCol === -1) {
        throw new Error("Wellness (Onetap) headers are missing.");
      }

      interface WellnessGroup {
        athleteName: string;
        dateObj: Date;
        fatigue?: number;
        sleep?: number;
        soreness?: number;
        stress?: number;
        motivation?: number;
        appetite?: number;
      }
      const wellnessGroups = new Map<string, WellnessGroup>();

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const vals = parseCsvLine(line);
        if (vals.length <= Math.max(dateCol, nameCol, itemCol, valCol)) continue;

        const dateStr = vals[dateCol];
        const nameStr = vals[nameCol];
        const itemStr = vals[itemCol];
        const valNum = parseFloat(vals[valCol]);

        if (!dateStr || !nameStr || isNaN(valNum)) continue;

        const dateObj = parseDateFlexible(dateStr);
        if (!dateObj) continue;

        const dateKey = formatDateKey(dateObj);
        const groupKey = `${nameStr}_${dateKey}`;

        if (!wellnessGroups.has(groupKey)) {
          wellnessGroups.set(groupKey, { athleteName: nameStr, dateObj });
        }
        const g = wellnessGroups.get(groupKey)!;
        const cleanedItem = itemStr.replace(/\s+/g, "").toLowerCase();
        if (cleanedItem.includes("疲労感") || cleanedItem.includes("疲労") || cleanedItem.includes("fatigue") || cleanedItem.includes("しんどさ")) {
          g.fatigue = valNum;
        }
        if (cleanedItem.includes("睡眠") || cleanedItem.includes("睡眠の質") || cleanedItem.includes("sleep")) {
          g.sleep = valNum;
        }
        if (cleanedItem.includes("気分") || cleanedItem.includes("モチベーション") || cleanedItem.includes("精神") || cleanedItem.includes("メンタル") || cleanedItem.includes("ストレス") || cleanedItem.includes("motivation") || cleanedItem.includes("stress")) {
          g.motivation = valNum;
        }
        if (cleanedItem.includes("食欲") || cleanedItem.includes("食事") || cleanedItem.includes("appetite")) {
          g.appetite = valNum;
        }
      }

      const wellnessList = Array.from(wellnessGroups.values());
      for (const wg of wellnessList) {
        const matchedAthlete = findAthleteByCsvName(teamAthletes, wg.athleteName, "onetap");
        if (!matchedAthlete) {
          unregisteredSet.add(wg.athleteName);
          continue;
        }

        const fatigueVal = wg.fatigue !== undefined ? Math.round(wg.fatigue) : undefined;
        const stressVal = wg.motivation !== undefined ? Math.round(wg.motivation) : undefined;
        const appetiteVal = wg.appetite !== undefined ? Math.round(wg.appetite) : undefined;

        await mergePerformanceData(db, teamId, {
          athleteId: matchedAthlete.id,
          teamId,
          date: wg.dateObj,
          wellnessFatigue: fatigueVal,
          wellnessSleep: undefined,
          wellnessStress: stressVal,
          wellnessSoreness: appetiteVal,
          sessionType: targetSessionType !== "auto" ? targetSessionType : "practice",
          rawCsvData: JSON.stringify({ note: "Onetap Wellness EAV", fileName, sessionType: targetSessionType !== "auto" ? targetSessionType : "practice" })
        });
        importedCount++;
      }

    } else if (isSRPE) {
      const dateCol = findHeaderIndex(["トレーニング実施日"]);
      const nameCol = findHeaderIndex(["選手"]);
      const rpeCol = findHeaderIndex(["RPE"]);
      const srpeCol = findHeaderIndex(["Session RPE"]);
      const categoryCol = findHeaderIndex(["分類", "セッション", "メニュー", "カテゴリ", "カテゴリー", "type", "session", "menu", "category"]);

      if (dateCol === -1 || nameCol === -1 || rpeCol === -1 || srpeCol === -1) {
        throw new Error("sRPE CSV headers are missing.");
      }

      interface SrpeGroup {
        athleteName: string;
        dateObj: Date;
        rpeValues: number[];
        srpeValues: number[];
        ballSrpeValues: number[];
        sandCSrpeValues: number[];
      }
      const srpeGroups = new Map<string, SrpeGroup>();

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const vals = parseCsvLine(line);
        if (vals.length <= Math.max(dateCol, nameCol, rpeCol, srpeCol)) continue;

        const dateStr = vals[dateCol];
        const nameStr = vals[nameCol];
        const rpeVal = parseInt(vals[rpeCol], 10);
        const srpeVal = parseInt(vals[srpeCol], 10);
        const catStr = categoryCol !== -1 && vals[categoryCol] ? vals[categoryCol].trim() : "";

        if (!dateStr || !nameStr) continue;

        const dateObj = parseDateFlexible(dateStr);
        if (!dateObj) continue;

        const dateKey = formatDateKey(dateObj);
        const groupKey = `${nameStr}_${dateKey}`;

        if (!srpeGroups.has(groupKey)) {
          srpeGroups.set(groupKey, { 
            athleteName: nameStr, 
            dateObj, 
            rpeValues: [], 
            srpeValues: [],
            ballSrpeValues: [],
            sandCSrpeValues: []
          });
        }
        const g = srpeGroups.get(groupKey)!;
        if (!isNaN(rpeVal)) g.rpeValues.push(rpeVal);
        if (!isNaN(srpeVal)) {
          g.srpeValues.push(srpeVal);
          const catLower = catStr.toLowerCase();
          if (catLower === "skill" || catLower === "game" || catLower.includes("バレー") || catLower.includes("ボール")) {
            g.ballSrpeValues.push(srpeVal);
          } else {
            g.sandCSrpeValues.push(srpeVal);
          }
        }
      }

      const srpeList = Array.from(srpeGroups.values());
      for (const sg of srpeList) {
        const matchedAthlete = findAthleteByCsvName(teamAthletes, sg.athleteName, "onetap");
        if (!matchedAthlete) {
          unregisteredSet.add(sg.athleteName);
          continue;
        }

        const sumSrpe = sg.srpeValues.reduce((a, b) => a + b, 0);
        const ballSrpe = sg.ballSrpeValues.reduce((a, b) => a + b, 0);
        const sandCSrpe = sg.sandCSrpeValues.reduce((a, b) => a + b, 0);
        const maxRpe = sg.rpeValues.length > 0 ? Math.max(...sg.rpeValues) : 0;

        await mergePerformanceData(db, teamId, {
          athleteId: matchedAthlete.id,
          teamId,
          date: sg.dateObj,
          sRPE: sumSrpe,
          rpeValue: maxRpe,
          rawMenuData: JSON.stringify({ sRpeBall: ballSrpe, sRpeSandC: sandCSrpe }),
          sessionType: targetSessionType !== "auto" ? targetSessionType : "practice",
          rawCsvData: JSON.stringify({ note: "sRPE log", fileName, sessionType: targetSessionType !== "auto" ? targetSessionType : "practice" })
        });
        importedCount++;
      }

    } else if (isSoxai) {
      let currentEmail = "";
      interface SoxaiRecord {
        email: string;
        dateObj: Date;
        sleepScore: number;
        rhr: number;
        hrvVal: number;
      }
      const soxaiRecords: SoxaiRecord[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        if (line.includes("@") && !line.includes("\t") && !line.includes(",")) {
          currentEmail = line.replace(/["']/g, "").trim();
          continue;
        }

        if (line.includes("タイムスタンプ")) continue;

        const vals = parseCsvLine(line);
        if (vals.length < 16 || !currentEmail) continue;

        const dateStr = vals[0];
        const sleepScore = parseInt(vals[2], 10);
        const rhr = parseInt(vals[14], 10);
        const hrvVal = parseFloat(vals[15]);

        if (!dateStr) continue;
        const dateObj = new Date(dateStr);
        if (isNaN(dateObj.getTime())) continue;

        soxaiRecords.push({ email: currentEmail, dateObj, sleepScore, rhr, hrvVal });
      }

      for (const rec of soxaiRecords) {
        const matchedAthlete = teamAthletes.find(a => 
          (a.soxaiEmail && a.soxaiEmail.toLowerCase() === rec.email.toLowerCase()) ||
          (a.user?.email?.toLowerCase() === rec.email.toLowerCase())
        );
        if (!matchedAthlete) {
          unregisteredSet.add(rec.email);
          continue;
        }

        const sleepVal = isNaN(rec.sleepScore) ? undefined : Math.round(rec.sleepScore);

        await mergePerformanceData(db, teamId, {
          athleteId: matchedAthlete.id,
          teamId,
          date: rec.dateObj,
          wellnessSleep: sleepVal,
          hrv: isNaN(rec.hrvVal) ? undefined : rec.hrvVal.toFixed(2),
          avgHeartRate: isNaN(rec.rhr) ? undefined : rec.rhr,
          sessionType: targetSessionType !== "auto" ? targetSessionType : "practice",
          rawCsvData: JSON.stringify({ note: "SOXAI biometric", fileName, sessionType: targetSessionType !== "auto" ? targetSessionType : "practice" })
        });
        importedCount++;
      }

    } else if (isImaLog) {
      const athleteCol = findHeaderIndex(["athlete", "選手", "名前", "athlete_id", "name"]);
      const tagCol = findHeaderIndex(["tag", "移動", "of event"]);
      const heightCol = findHeaderIndex(["height", "高さ", "jump height"]);
      const intensityCol = findHeaderIndex(["intensity", "強度"]);
      const eventTimeCol = findHeaderIndex(["event_time", "time", "時間"]);
      const periodCol = findHeaderIndex(["period", "ピリオド", "メニュー", "セッション"]);

      if (athleteCol === -1 || tagCol === -1) {
        throw new Error("IMA log is missing Athlete or Tag headers");
      }

      interface ImaGroup {
        athleteName: string;
        jerseyNumber: number | null;
        sessionType: "practice" | "individual";
        dateObj: Date;
        jumps: number[];
        accelerations: number[];
        menuJumps: Record<string, number[]>;
        menuAccelerations: Record<string, number[]>;
      }
      const imaGroups = new Map<string, ImaGroup>();

      const fallbackDate = getFallbackDate(fileName);

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const vals = parseCsvLine(line);
        if (vals.length <= Math.max(athleteCol, tagCol)) continue;

        const rawAthlete = vals[athleteCol];
        const tag = vals[tagCol] || "";
        if (!rawAthlete) continue;

        let jNum: number | null = null;
        const numMatch = rawAthlete.match(/^\s*(\d+)/) || rawAthlete.match(/\b\d+\b/);
        if (numMatch) {
          jNum = parseInt(numMatch[1] || numMatch[0], 10);
        }

        let dateObj = fallbackDate;
        if (eventTimeCol !== -1 && vals[eventTimeCol]) {
          const timeMs = parseFloat(vals[eventTimeCol]);
          if (!isNaN(timeMs)) dateObj = new Date(timeMs);
        }

        // Determine sessionType from Period column if 'auto' is selected
        let rowSessionType: "practice" | "individual" = "practice";
        if (targetSessionType !== "auto") {
          rowSessionType = targetSessionType === "match" ? "practice" : targetSessionType;
        } else {
          const isIndividualRow = periodCol !== -1 && vals[periodCol] && vals[periodCol].trim().toLowerCase() === "individual";
          rowSessionType = isIndividualRow ? "individual" : "practice";
        }

        const dateKey = formatDateKey(dateObj);
        const groupKey = `${rawAthlete.trim()}_${rowSessionType}_${dateKey}`;

        if (!imaGroups.has(groupKey)) {
          imaGroups.set(groupKey, {
            athleteName: rawAthlete.trim(),
            jerseyNumber: jNum,
            sessionType: rowSessionType,
            dateObj,
            jumps: [],
            accelerations: [],
            menuJumps: {},
            menuAccelerations: {}
          });
        }
        const g = imaGroups.get(groupKey)!;
        const periodName = periodCol !== -1 && vals[periodCol] ? vals[periodCol].trim() : "全体";

        if (tag.includes("Jump") || tag.includes("Jumping")) {
          if (heightCol !== -1 && vals[heightCol]) {
            const hVal = parseFloat(vals[heightCol]);
            if (!isNaN(hVal) && hVal > 0) {
              const heightCm = hVal < 2.5 ? hVal * 100 : hVal;
              g.jumps.push(heightCm);
              g.menuJumps[periodName] = g.menuJumps[periodName] || [];
              g.menuJumps[periodName].push(heightCm);
            }
          }
        } else if (tag.includes("Acceleration")) {
          if (intensityCol !== -1 && vals[intensityCol]) {
            const intVal = parseFloat(vals[intensityCol]);
            if (!isNaN(intVal)) {
              g.accelerations.push(intVal);
              g.menuAccelerations[periodName] = g.menuAccelerations[periodName] || [];
              g.menuAccelerations[periodName].push(intVal);
            }
          }
        }
      }

      const imaList = Array.from(imaGroups.values());
      for (const ig of imaList) {
        let matchedAthlete = null;
        if (ig.jerseyNumber !== null) {
          matchedAthlete = teamAthletes.find(a => a.jerseyNumber === ig.jerseyNumber);
        }
        if (!matchedAthlete) {
          matchedAthlete = findAthleteByCsvName(teamAthletes, ig.athleteName, "catapult");
        }

        if (!matchedAthlete) {
          if (ig.jerseyNumber !== null) {
            unregisteredSet.add(`${ig.athleteName} (No.${ig.jerseyNumber})`);
          } else {
            unregisteredSet.add(ig.athleteName);
          }
          continue;
        }

        const maxJumpHeight = ig.jumps.length > 0 ? Math.max(...ig.jumps) : undefined;
        const avgJumpHeight = ig.jumps.length > 0 ? ig.jumps.reduce((a, b) => a + b, 0) / ig.jumps.length : undefined;
        const totalJumps = ig.jumps.length;

        const jumpVolume = ig.jumps.length > 0 ? ig.jumps.reduce((a, b) => a + b, 0) : 0;
        const jumpsOver40cm = ig.jumps.filter(j => j >= 40).length;
        const jumpZone1Count = ig.jumps.filter(j => j < 20).length;
        const jumpZone2Count = ig.jumps.filter(j => j >= 20 && j < 30).length;
        const jumpZone3Count = ig.jumps.filter(j => j >= 30 && j < 40).length;
        const jumpZone4Count = ig.jumps.filter(j => j >= 40 && j < 50).length;
        const jumpZone5Count = ig.jumps.filter(j => j >= 50).length;

        const maxAcceleration = ig.accelerations.length > 0 ? Math.max(...ig.accelerations) : undefined;
        const avgAcceleration = ig.accelerations.length > 0 ? ig.accelerations.reduce((a, b) => a + b, 0) / ig.accelerations.length : undefined;
        const accelCount = ig.accelerations.length;

        const jumpVolumes: Record<string, number> = {};
        for (const mName of Object.keys(ig.menuJumps)) {
          const sum = ig.menuJumps[mName].reduce((a, b) => a + b, 0);
          jumpVolumes[mName] = parseFloat(sum.toFixed(2));
        }

        const accelVolumes: Record<string, number> = {};
        for (const mName of Object.keys(ig.menuAccelerations)) {
          const sum = ig.menuAccelerations[mName].reduce((a, b) => a + b, 0);
          accelVolumes[mName] = parseFloat(sum.toFixed(2));
        }

        await mergePerformanceData(db, teamId, {
          athleteId: matchedAthlete.id,
          teamId,
          date: ig.dateObj,
          maxJumpHeight: maxJumpHeight ? maxJumpHeight.toFixed(2) : undefined,
          avgJumpHeight: avgJumpHeight ? avgJumpHeight.toFixed(2) : undefined,
          totalJumps,
          jumpVolume: jumpVolume.toFixed(2),
          jumpsOver40cm,
          jumpZone1Count,
          jumpZone2Count,
          jumpZone3Count,
          jumpZone4Count,
          jumpZone5Count,
          maxAcceleration: maxAcceleration ? maxAcceleration.toFixed(2) : undefined,
          avgAcceleration: avgAcceleration ? avgAcceleration.toFixed(2) : undefined,
          accelCount,
          sessionType: ig.sessionType,
          rawMenuData: JSON.stringify({ jumpVolumes, accelVolumes }),
          rawCsvData: JSON.stringify({ note: "Catapult IMA events", fileName, sessionType: ig.sessionType })
        });
        importedCount++;
      }

    } else if (isEventLog) {
      const categoryIdx = findHeaderIndex(["category", "選手", "名前", "athlete", "player", "name"]);
      const startTimeIdx = findHeaderIndex(["start_time", "starttime", "開始時間"]);
      const epochIdx = findHeaderIndex(["epoch", "time", "時間"]);
      const durationIdx = findHeaderIndex(["duration", "時間(秒)", "秒"]);
      const heightIdx = findHeaderIndex(["height", "高さ", "jump height", "ジャンプ高"]);
      const basketballLoadIdx = findHeaderIndex(["basketball l", "load", "負荷", "運動量"]);

      if (categoryIdx === -1) {
        throw new Error("CSV is missing 'Category' (Athlete Name) column for Event Log");
      }

      interface AggregatedEvent {
        athleteName: string;
        jerseyNumber: number | null;
        dateKey: string;
        dateObj: Date;
        jumps: number[];
        accelerations: number[];
        loads: number[];
        durations: number[];
        timestamps: number[];
      }
      const aggregations = new Map<string, AggregatedEvent>();

      const cleanAthleteName = (raw: string) => {
        return raw.replace(/^[\d\s#]+/, "").trim();
      };
      const extractJerseyNumber = (raw: string): number | null => {
        const match = raw.trim().match(/^(\d+)/);
        return match ? parseInt(match[1], 10) : null;
      };
      const extractNumber = (val: string): number | undefined => {
        if (!val) return undefined;
        const match = val.match(/^[+-]?\d+(\.\d+)?/);
        return match ? parseFloat(match[0]) : undefined;
      };

      const fallbackDate = getFallbackDate(fileName);

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = parseCsvLine(line);
        if (values.length < headers.length) continue;

        const rawCategory = values[categoryIdx];
        if (!rawCategory || rawCategory.toLowerCase() === "category") continue;
        
        const athleteName = cleanAthleteName(rawCategory);
        if (!athleteName) continue;

        let timeMs = NaN;
        if (epochIdx !== -1 && values[epochIdx]) {
          timeMs = parseFloat(values[epochIdx]);
        } else if (startTimeIdx !== -1 && values[startTimeIdx]) {
          timeMs = parseFloat(values[startTimeIdx]);
        }
        
        let dateObj = fallbackDate;
        if (!isNaN(timeMs)) dateObj = new Date(timeMs);

        const dateKey = formatDateKey(dateObj);
        const groupKey = `${athleteName}_${dateKey}`;
        const jerseyNumber = extractJerseyNumber(rawCategory);

        if (!aggregations.has(groupKey)) {
          aggregations.set(groupKey, {
            athleteName,
            jerseyNumber,
            dateKey,
            dateObj,
            jumps: [],
            accelerations: [],
            loads: [],
            durations: [],
            timestamps: []
          });
        }
        const agg = aggregations.get(groupKey)!;

        if (!isNaN(timeMs)) agg.timestamps.push(timeMs);
        if (durationIdx !== -1 && values[durationIdx]) {
          const dur = parseFloat(values[durationIdx]);
          if (!isNaN(dur)) agg.durations.push(dur);
        }

        const tag = tagIdx !== -1 ? values[tagIdx].toLowerCase() : "";
        const dfEvent = dfEventIdx !== -1 ? values[dfEventIdx].toLowerCase() : "";

        if (tag.includes("jump") || dfEvent.includes("jump")) {
          if (heightIdx !== -1 && values[heightIdx]) {
            const hVal = parseFloat(values[heightIdx]);
            if (!isNaN(hVal)) {
              const heightCm = hVal < 2.5 ? hVal * 100 : hVal;
              agg.jumps.push(heightCm);
            }
          }
        }

        if (intensityIdx !== -1 && values[intensityIdx]) {
          const intensityNum = extractNumber(values[intensityIdx]);
          if (intensityNum !== undefined && !isNaN(intensityNum)) {
            agg.accelerations.push(intensityNum);
            agg.loads.push(intensityNum);
          }
        }

        if (basketballLoadIdx !== -1 && values[basketballLoadIdx]) {
          const loadNum = parseFloat(values[basketballLoadIdx]);
          if (!isNaN(loadNum)) agg.loads.push(loadNum);
        }
      }

      const eventList = Array.from(aggregations.values());
      for (const agg of eventList) {
        let matchedAthlete = null;
        if (agg.jerseyNumber !== null) {
          matchedAthlete = teamAthletes.find(a => a.jerseyNumber === agg.jerseyNumber);
        }
        if (!matchedAthlete) {
          matchedAthlete = findAthleteByCsvName(teamAthletes, agg.athleteName, "catapult");
        }

        if (!matchedAthlete) {
          if (agg.jerseyNumber !== null) {
            unregisteredSet.add(`${agg.athleteName} (No.${agg.jerseyNumber})`);
          } else {
            unregisteredSet.add(agg.athleteName);
          }
          continue;
        }

        const maxJumpHeight = agg.jumps.length > 0 ? Math.max(...agg.jumps) : undefined;
        const avgJumpHeight = agg.jumps.length > 0 ? agg.jumps.reduce((a, b) => a + b, 0) / agg.jumps.length : undefined;
        const totalJumps = agg.jumps.length;

        const jumpVolume = agg.jumps.length > 0 ? agg.jumps.reduce((a, b) => a + b, 0) / 100 : 0;
        const jumpsOver40cm = agg.jumps.filter(j => j >= 40).length;
        const jumpZone1Count = agg.jumps.filter(j => j < 20).length;
        const jumpZone2Count = agg.jumps.filter(j => j >= 20 && j < 30).length;
        const jumpZone3Count = agg.jumps.filter(j => j >= 30 && j < 40).length;
        const jumpZone4Count = agg.jumps.filter(j => j >= 40 && j < 50).length;
        const jumpZone5Count = agg.jumps.filter(j => j >= 50).length;

        const maxAcceleration = agg.accelerations.length > 0 ? Math.max(...agg.accelerations) : undefined;
        const avgAcceleration = agg.accelerations.length > 0 ? agg.accelerations.reduce((a, b) => a + b, 0) / agg.accelerations.length : undefined;
        const accelCount = agg.accelerations.length;

        let duration = 0;
        if (agg.timestamps.length > 1) {
          duration = Math.floor((Math.max(...agg.timestamps) - Math.min(...agg.timestamps)) / 1000);
        } else {
          duration = Math.floor(agg.durations.reduce((a, b) => a + b, 0));
        }
        if (duration === 0) duration = 3600;

        await mergePerformanceData(db, teamId, {
          athleteId: matchedAthlete.id,
          teamId,
          date: agg.dateObj,
          maxJumpHeight: maxJumpHeight ? maxJumpHeight.toFixed(2) : undefined,
          avgJumpHeight: avgJumpHeight ? avgJumpHeight.toFixed(2) : undefined,
          totalJumps,
          jumpVolume: jumpVolume.toFixed(2),
          jumpsOver40cm,
          jumpZone1Count,
          jumpZone2Count,
          jumpZone3Count,
          jumpZone4Count,
          jumpZone5Count,
          maxAcceleration: maxAcceleration ? maxAcceleration.toFixed(2) : undefined,
          avgAcceleration: avgAcceleration ? avgAcceleration.toFixed(2) : undefined,
          accelCount,
          totalLoad: agg.loads.length > 0 ? agg.loads.reduce((a, b) => a + b, 0).toFixed(2) : undefined,
          duration,
          sessionType: targetSessionType !== "auto" ? targetSessionType : "practice",
          rawCsvData: JSON.stringify({ note: "Event Log Parser", fileName, sessionType: targetSessionType !== "auto" ? targetSessionType : "practice" })
        });
        importedCount++;
      }

    } else if (isMenuLoadLog) {
      const categoryIdx = findHeaderIndex(["category", "選手", "名前", "athlete", "player", "period", "activity", "menu", "メニュー", "name"]);

      if (categoryIdx === -1 || dateIdx === -1) {
        throw new Error("CSV is missing Athlete Name/Menu or Date columns");
      }

      interface LoadGroup {
        athleteId: number;
        athleteName: string;
        sessionType: "practice" | "individual";
        dateObj: Date;
        loads: number[];
        menuLoads: Record<string, number>;
      }
      const loadAggregations = new Map<string, LoadGroup>();

      const fallbackDate = getFallbackDate(fileName);

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = parseCsvLine(line);
        if (values.length < 2) continue;

        let matchedAthlete = null;
        if (jerseyIdx !== -1 && values[jerseyIdx]) {
          const jNum = parseInt(values[jerseyIdx], 10);
          if (!isNaN(jNum)) matchedAthlete = teamAthletes.find(a => a.jerseyNumber === jNum);
        }

        if (!matchedAthlete && values[categoryIdx]) {
          const rawName = values[categoryIdx];
          const cleanName = rawName.includes(" - ") 
            ? rawName.split(" - ").pop()!.trim() 
            : (rawName.includes("-") ? rawName.split("-").pop()!.trim() : rawName.trim());
          matchedAthlete = findAthleteByCsvName(teamAthletes, cleanName, "catapult");
        }

        if (!matchedAthlete) {
          if (values[categoryIdx]) {
            const rawName = values[categoryIdx];
            const cleanName = rawName.includes(" - ") 
              ? rawName.split(" - ").pop()!.trim() 
              : (rawName.includes("-") ? rawName.split("-").pop()!.trim() : rawName.trim());
            let jNum = null;
            if (jerseyIdx !== -1 && values[jerseyIdx]) {
              const parsedJ = parseInt(values[jerseyIdx], 10);
              if (!isNaN(parsedJ)) jNum = parsedJ;
            }
            if (jNum !== null) {
              unregisteredSet.add(`${cleanName} (No.${jNum})`);
            } else {
              unregisteredSet.add(cleanName);
            }
          }
          continue;
        }

        let dateObj = fallbackDate;
        if (dateIdx !== -1 && values[dateIdx]) {
          const parsed = new Date(values[dateIdx]);
          if (!isNaN(parsed.getTime())) dateObj = parsed;
        }

        let menuName = "全体";
        if (values[categoryIdx] && values[categoryIdx].includes("-")) {
          const rawCat = values[categoryIdx];
          if (rawCat.includes(" - ")) {
            menuName = rawCat.split(" - ")[0].trim();
          } else {
            const parts = rawCat.split("-");
            if (parts.length > 1) {
              parts.pop();
              menuName = parts.join("-").trim();
            } else {
              menuName = rawCat.trim();
            }
          }
        }

        let rowSessionType: "practice" | "individual" = "practice";
        if (targetSessionType !== "auto") {
          rowSessionType = targetSessionType === "match" ? "practice" : targetSessionType;
        } else {
          const lowerMenu = menuName.toLowerCase();
          if (lowerMenu.includes("individual") || lowerMenu.includes("自主") || lowerMenu.includes("自主練")) {
            rowSessionType = "individual";
          }
        }

        const dateKey = formatDateKey(dateObj);
        const groupKey = `${matchedAthlete.id}_${rowSessionType}_${dateKey}`;
        const loadVal = parseFloat(values[loadIdx]);
        if (isNaN(loadVal)) continue;

        if (!loadAggregations.has(groupKey)) {
          loadAggregations.set(groupKey, {
            athleteId: matchedAthlete.id,
            athleteName: matchedAthlete.user?.name || "Unknown",
            sessionType: rowSessionType,
            dateObj,
            loads: [],
            menuLoads: {}
          });
        }
        const group = loadAggregations.get(groupKey)!;
        group.loads.push(loadVal);
        group.menuLoads[menuName] = (group.menuLoads[menuName] || 0) + loadVal;
      }

      const menuList = Array.from(loadAggregations.values());
      for (const agg of menuList) {
        const totalLoad = agg.loads.reduce((a, b) => a + b, 0);

        await mergePerformanceData(db, teamId, {
          athleteId: agg.athleteId,
          teamId,
          date: agg.dateObj,
          totalLoad: totalLoad.toFixed(2),
          rawMenuData: JSON.stringify({ playerLoads: agg.menuLoads }),
          sessionType: agg.sessionType,
          rawCsvData: JSON.stringify({ note: "Menu Load Parser", fileName, sessionType: agg.sessionType })
        });
        importedCount++;
      }

    } else if (isRpeLog) {
      const athleteNameIdx = findHeaderIndex(["選手", "名前", "athlete", "player", "name"]);
      const categoryCol = findHeaderIndex(["分類", "セッション", "メニュー", "カテゴリ", "カテゴリー", "category", "type", "session", "menu"]);

      let finalAthleteNameIdx = athleteNameIdx;
      let finalCategoryCol = categoryCol;

      if (finalAthleteNameIdx === -1 && finalCategoryCol !== -1) {
        finalAthleteNameIdx = finalCategoryCol;
        finalCategoryCol = -1;
      }

      if (finalAthleteNameIdx === -1) {
        throw new Error("CSV is missing Athlete Name column for sRPE Log");
      }

      const sleepIdx = findHeaderIndex(["sleep", "睡眠"]);
      const fatigueIdx = findHeaderIndex(["fatigue", "疲労"]);
      const sorenessIdx = findHeaderIndex(["soreness", "張り", "筋肉の張り"]);
      const stressIdx = findHeaderIndex(["stress", "ストレス"]);
      const hrvIdx = findHeaderIndex(["hrv", "心拍変動"]);

      interface RpeRecord {
        athleteName: string;
        dateObj: Date;
        rpeVal: number;
        durationMin: number;
        categoryStr?: string;
        sleepVal?: number;
        fatigueVal?: number;
        sorenessVal?: number;
        stressVal?: number;
        hrvVal?: number;
      }
      const rpeRecords: RpeRecord[] = [];

      const fallbackDate = getFallbackDate(fileName);

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = parseCsvLine(line);
        if (values.length < headers.length) continue;

        const athleteName = values[finalAthleteNameIdx].replace(/^[\d\s#]+/, "").trim();
        if (athleteName.toLowerCase() === "athlete" || athleteName.toLowerCase() === "player" || athleteName === "選手名") {
          continue;
        }

        let dateObj = fallbackDate;
        if (dateIdx !== -1 && values[dateIdx]) {
          const parsed = parseDateFlexible(values[dateIdx]);
          if (parsed) dateObj = parsed;
        }

        const rpeVal = parseInt(values[rpeIdx], 10);
        const durationMin = parseInt(values[sessionTimeIdx], 10);
        if (isNaN(rpeVal)) continue;

        const sleepVal = sleepIdx !== -1 && values[sleepIdx] ? parseInt(values[sleepIdx], 10) : undefined;
        const fatigueVal = fatigueIdx !== -1 && values[fatigueIdx] ? parseInt(values[fatigueIdx], 10) : undefined;
        const sorenessVal = sorenessIdx !== -1 && values[sorenessIdx] ? parseInt(values[sorenessIdx], 10) : undefined;
        const stressVal = stressIdx !== -1 && values[stressIdx] ? parseInt(values[stressIdx], 10) : undefined;
        const hrvVal = hrvIdx !== -1 && values[hrvIdx] ? parseInt(values[hrvIdx], 10) : undefined;
        const categoryStr = finalCategoryCol !== -1 && values[finalCategoryCol] ? values[finalCategoryCol].trim() : "";

        rpeRecords.push({
          athleteName,
          dateObj,
          rpeVal,
          durationMin,
          categoryStr,
          sleepVal,
          fatigueVal,
          sorenessVal,
          stressVal,
          hrvVal
        });
      }

      for (const rec of rpeRecords) {
        const matchedAthlete = findAthleteByCsvName(teamAthletes, rec.athleteName, "onetap");
        if (!matchedAthlete) {
          unregisteredSet.add(rec.athleteName);
          continue;
        }

        const calculatedSrpe = isNaN(rec.durationMin) ? 0 : rec.rpeVal * rec.durationMin;
        
        let ballSrpe = 0;
        let sandCSrpe = 0;
        
        if (rec.categoryStr) {
          const catLower = rec.categoryStr.toLowerCase();
          if (catLower === "skill" || catLower === "game" || catLower.includes("バレー") || catLower.includes("ボール")) {
            ballSrpe = calculatedSrpe;
          } else {
            sandCSrpe = calculatedSrpe;
          }
        } else {
          ballSrpe = calculatedSrpe;
        }

        await mergePerformanceData(db, teamId, {
          athleteId: matchedAthlete.id,
          teamId,
          date: rec.dateObj,
          duration: isNaN(rec.durationMin) ? undefined : rec.durationMin * 60,
          sRPE: calculatedSrpe,
          rpeValue: rec.rpeVal,
          wellnessSleep: rec.sleepVal !== undefined && !isNaN(rec.sleepVal) ? rec.sleepVal : undefined,
          wellnessFatigue: rec.fatigueVal !== undefined && !isNaN(rec.fatigueVal) ? rec.fatigueVal : undefined,
          wellnessSoreness: rec.sorenessVal !== undefined && !isNaN(rec.sorenessVal) ? rec.sorenessVal : undefined,
          wellnessStress: rec.stressVal !== undefined && !isNaN(rec.stressVal) ? rec.stressVal : undefined,
          hrv: rec.hrvVal !== undefined && !isNaN(rec.hrvVal) ? rec.hrvVal : undefined,
          rawMenuData: JSON.stringify({ sRpeBall: ballSrpe, sRpeSandC: sandCSrpe }),
          sessionType: targetSessionType !== "auto" ? targetSessionType : "practice",
          rawCsvData: JSON.stringify({ note: "sRPE/Wellness Parser", fileName, sessionType: targetSessionType !== "auto" ? targetSessionType : "practice" })
        });
        importedCount++;
      }

    } else {
      throw new Error(`Could not recognize CSV format. Detected headers: ${JSON.stringify(headers)}. Expected event log format, menu-based Player Load format, or sRPE format (RPE, Duration/Time, Category).`);
    }

    await updateCsvUploadStatus(uploadId, "completed", undefined, importedCount);
    return { success: true, importedCount, unregisteredAthletes: Array.from(unregisteredSet) };
  } catch (error: any) {
    console.error("[CSV Import] Failed to import CSV:", error);
    let errorDetail = error.message || "Unknown error during parsing";
    if (error.detail) errorDetail += ` (Detail: ${error.detail})`;
    if (error.code) errorDetail += ` (Code: ${error.code})`;
    if (error.hint) errorDetail += ` (Hint: ${error.hint})`;
    
    await updateCsvUploadStatus(uploadId, "failed", errorDetail);
    throw new Error(errorDetail);
  }
}

export async function getAthleteAnalytics(athleteId: number, targetDateStr?: string, acwrMetricStr?: string) {
  const db = await getDb();
  
  // 1. Get athlete profile and team details
  let athleteInfo: any = null;
  let teamId = 1;
  let position = "";
  
  if (!db) {
    const a = mockAthletes.find(item => item.id === athleteId);
    if (a) {
      const u = mockUsers.find(item => item.id === a.userId);
      athleteInfo = { ...a, user: u };
      teamId = a.teamId;
      position = a.position || "";
    }
  } else {
    const res = await db.select().from(athletes).where(eq(athletes.id, athleteId)).limit(1);
    if (res.length > 0) {
      const a = res[0];
      const u = await db.select().from(users).where(eq(users.id, a.userId)).limit(1);
      athleteInfo = { ...a, user: u[0] };
      teamId = a.teamId;
      position = a.position || "";
    }
  }

  if (!athleteInfo) {
    throw new Error("Athlete not found");
  }

  // 2. Fetch all performance records for this athlete, sorted by date (newest first)
  let allPerf: any[] = [];
  if (!db) {
    allPerf = mockPerformanceData
      .filter(p => p.athleteId === athleteId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  } else {
    allPerf = await db.select()
      .from(performanceData)
      .where(eq(performanceData.athleteId, athleteId))
      .orderBy(desc(performanceData.date));
  }

  // 3. Target session data (default to newest if targetDateStr is not provided or not found)
  let latestSession = null;
  if (targetDateStr) {
    latestSession = allPerf.find(p => formatDateKey(new Date(p.date)) === targetDateStr) || null;
  }
  if (!latestSession && allPerf.length > 0) {
    latestSession = allPerf[0];
  }

  // 4. Calculate ACWR (Acute:Chronic Workload Ratio) based on chosen metric
  const calculateACWR = () => {
    if (allPerf.length === 0) return { acwr: 1.0, acute: 0, chronic: 0, status: "normal" as const };

    const today = latestSession ? new Date(latestSession.date) : new Date();
    const oneDay = 24 * 60 * 60 * 1000;
    
    const metricKey = acwrMetricStr === "jumpVolume" ? "jumpVolume" : acwrMetricStr === "accelVolume" ? "accelVolume" : "totalLoad";

    // Create an array of loads for past 28 days
    const dailyLoads = Array(28).fill(0);
    for (let i = 0; i < 28; i++) {
      const targetDateStrKey = formatDateKey(new Date(today.getTime() - i * oneDay));
      const record = allPerf.find(p => formatDateKey(new Date(p.date)) === targetDateStrKey);
      if (record && record[metricKey]) {
        dailyLoads[i] = Number(record[metricKey]);
      }
    }

    // Acute: past 7 days (index 0 to 6)
    const acuteSum = dailyLoads.slice(0, 7).reduce((a, b) => a + b, 0);
    const acuteAvg = acuteSum / 7;

    // Chronic: past 28 days (index 0 to 27)
    const chronicSum = dailyLoads.reduce((a, b) => a + b, 0);
    const chronicAvg = chronicSum / 28;

    const acwr = chronicAvg > 0 ? acuteAvg / chronicAvg : 1.0;
    
    let status: "underwork" | "normal" | "danger" = "normal";
    if (acwr < 0.8) {
      status = "underwork";
    } else if (acwr >= 1.5) {
      status = "danger";
    }

    return {
      acwr: Number(acwr.toFixed(2)),
      acute: Number(acuteAvg.toFixed(1)),
      chronic: Number(chronicAvg.toFixed(1)),
      status
    };
  };

  const acwrData = calculateACWR();

  // 5. Monotony and Strain (for past 7 days)
  const calculateMonotonyAndStrain = () => {
    if (allPerf.length === 0) return { monotony: 1.0, strain: 0 };
    
    const today = new Date();
    const oneDay = 24 * 60 * 60 * 1000;
    const weeklyLoads: number[] = [];
    
    for (let i = 0; i < 7; i++) {
      const targetDateStr = formatDateKey(new Date(today.getTime() - i * oneDay));
      const record = allPerf.find(p => formatDateKey(new Date(p.date)) === targetDateStr);
      weeklyLoads.push(record && record.totalLoad ? Number(record.totalLoad) : 0);
    }

    const sum = weeklyLoads.reduce((a, b) => a + b, 0);
    const mean = sum / 7;
    
    if (mean === 0) return { monotony: 0, strain: 0 };

    const variance = weeklyLoads.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / 7;
    const stdDev = Math.sqrt(variance);

    // Monotony = mean / stdDev.
    const monotony = stdDev > 0 ? mean / stdDev : (sum > 0 ? 3.0 : 0);
    const strain = sum * monotony;

    return {
      monotony: Number(monotony.toFixed(2)),
      strain: Number(strain.toFixed(1))
    };
  };

  const monotonyData = calculateMonotonyAndStrain();

  // 6. Chronological Trend (Up to 30 sessions, oldest first)
  const trendData = [...allPerf]
    .slice(0, 30)
    .reverse()
    .map(p => ({
      date: p.date,
      dateStr: new Date(p.date).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }),
      totalLoad: p.totalLoad ? Number(p.totalLoad) : 0,
      jumpVolume: p.jumpVolume ? Number(p.jumpVolume) : 0,
      totalJumps: p.totalJumps ? Number(p.totalJumps) : 0,
      avgJumpHeight: p.avgJumpHeight ? Number(p.avgJumpHeight) : 0,
      sRPE: p.sRPE ? Number(p.sRPE) : 0,
      rpeValue: p.rpeValue ? Number(p.rpeValue) : 0,
      wellnessSleep: p.wellnessSleep ? Number(p.wellnessSleep) : 0,
      wellnessFatigue: p.wellnessFatigue ? Number(p.wellnessFatigue) : 0,
      wellnessSoreness: p.wellnessSoreness ? Number(p.wellnessSoreness) : 0,
      wellnessStress: p.wellnessStress ? Number(p.wellnessStress) : 0,
      hrv: p.hrv ? Number(p.hrv) : 0,
      highIntensityDistance: p.highIntensityDistance ? Number(p.highIntensityDistance) : 0,
      avgHeartRate: p.avgHeartRate ? Number(p.avgHeartRate) : 0,
      physiologicalMarker: p.physiologicalMarker ? Number(p.physiologicalMarker) : 0,
      coachAdvice: p.coachAdvice || null,
      rawMenuData: p.rawMenuData ? JSON.parse(p.rawMenuData) : null
    }));

  // 7. Day of Week averages (曜日比較用: 過去28日間)
  const dayOfWeekAverages = () => {
    const daysData = Array(7).fill(null).map(() => ({ sum: 0, count: 0 }));
    
    allPerf.slice(0, 28).forEach(p => {
      const d = new Date(p.date);
      const day = d.getDay();
      if (p.totalLoad) {
        daysData[day].sum += Number(p.totalLoad);
        daysData[day].count += 1;
      }
    });

    const jDays = ["日", "月", "火", "水", "木", "金", "土"];
    return daysData.map((d, idx) => ({
      dayName: jDays[idx],
      avgLoad: d.count > 0 ? Number((d.sum / d.count).toFixed(1)) : 0
    }));
  };

  const dowData = dayOfWeekAverages();

  // 8. Group Comparison (Team & Position comparison)
  const groupComparison = async () => {
    let teamPerf: any[] = [];
    let posPerf: any[] = [];

    // Athlete's own 28-day averages
    const own28 = allPerf.slice(0, 28);
    const ownCount = own28.length || 1;
    const ownAvg = {
      totalLoad: own28.reduce((sum, p) => sum + (p.totalLoad ? Number(p.totalLoad) : 0), 0) / ownCount,
      totalJumps: own28.reduce((sum, p) => sum + (p.totalJumps ? Number(p.totalJumps) : 0), 0) / ownCount,
      jumpVolume: own28.reduce((sum, p) => sum + (p.jumpVolume ? Number(p.jumpVolume) : 0), 0) / ownCount,
      avgJumpHeight: own28.reduce((sum, p) => sum + (p.avgJumpHeight ? Number(p.avgJumpHeight) : 0), 0) / ownCount,
    };

    if (!db) {
      const teamAthletesIds = mockAthletes.filter(a => a.teamId === teamId).map(a => a.id);
      teamPerf = mockPerformanceData.filter(p => teamAthletesIds.includes(p.athleteId));
      
      const posAthletesIds = mockAthletes.filter(a => a.teamId === teamId && a.position === position).map(a => a.id);
      posPerf = mockPerformanceData.filter(p => posAthletesIds.includes(p.athleteId));
    } else {
      const teamAthletesIds = (await db.select({ id: athletes.id }).from(athletes).where(eq(athletes.teamId, teamId))).map(a => a.id);
      if (teamAthletesIds.length > 0) {
        teamPerf = await db.select().from(performanceData).where(inArray(performanceData.athleteId, teamAthletesIds));
      }

      const posAthletesIds = (await db.select({ id: athletes.id }).from(athletes).where(and(eq(athletes.teamId, teamId), eq(athletes.position, position)))).map(a => a.id);
      if (posAthletesIds.length > 0) {
        posPerf = await db.select().from(performanceData).where(inArray(performanceData.athleteId, posAthletesIds));
      }
    }

    const calcGroupAvg = (records: any[]) => {
      const count = records.length || 1;
      return {
        totalLoad: records.reduce((sum, p) => sum + (p.totalLoad ? Number(p.totalLoad) : 0), 0) / count,
        totalJumps: records.reduce((sum, p) => sum + (p.totalJumps ? Number(p.totalJumps) : 0), 0) / count,
        jumpVolume: records.reduce((sum, p) => sum + (p.jumpVolume ? Number(p.jumpVolume) : 0), 0) / count,
        avgJumpHeight: records.reduce((sum, p) => sum + (p.avgJumpHeight ? Number(p.avgJumpHeight) : 0), 0) / count,
      };
    };

    const teamAvg = calcGroupAvg(teamPerf);
    const posAvg = calcGroupAvg(posPerf);

    return {
      own: {
        totalLoad: Number(ownAvg.totalLoad.toFixed(1)),
        totalJumps: Number(ownAvg.totalJumps.toFixed(1)),
        jumpVolume: Number(ownAvg.jumpVolume.toFixed(2)),
        avgJumpHeight: Number(ownAvg.avgJumpHeight.toFixed(1)),
      },
      team: {
        totalLoad: Number(teamAvg.totalLoad.toFixed(1)),
        totalJumps: Number(teamAvg.totalJumps.toFixed(1)),
        jumpVolume: Number(teamAvg.jumpVolume.toFixed(2)),
        avgJumpHeight: Number(teamAvg.avgJumpHeight.toFixed(1)),
      },
      position: {
        totalLoad: Number(posAvg.totalLoad.toFixed(1)),
        totalJumps: Number(posAvg.totalJumps.toFixed(1)),
        jumpVolume: Number(posAvg.jumpVolume.toFixed(2)),
        avgJumpHeight: Number(posAvg.avgJumpHeight.toFixed(1)),
      }
    };
  };

  const compData = await groupComparison();

  // Generate individual practice guidance dynamically based on ACWR and subjective fatigue
  const generateIndividualPracticeGuidance = () => {
    const latest = trendData.length > 0 ? trendData[trendData.length - 1] : null;
    const acwr = acwrData.acwr;
    const fatigue = latest ? latest.wellnessFatigue : 5;
    const soreness = latest ? latest.wellnessSoreness : 5;

    if (acwr >= 1.5 || fatigue <= 2 || soreness <= 2) {
      return {
        level: "danger" as const,
        title: "積極的休養（ジャンプ禁止・ストレッチ推奨）",
        desc: `現在の急慢性負荷比（ACWR: ${acwr}）または主観的疲労が非常に高い状態です。筋肉の張りや関節への過度な負担を防ぐため、本日の自主練でのジャンプは禁止し、ストレッチや静的リカバリーに専念してください。`
      };
    } else if (acwr >= 1.2 || monotonyData.monotony >= 2.0) {
      return {
        level: "warning" as const,
        title: "調整練習（自主練制限、低負荷のみ）",
        desc: `練習の単調度（${monotonyData.monotony}）が高まるか、ACWR（${acwr}）が上昇傾向です。自主練は30分以内に制限し、ジャンプ高を抑えたスキル確認やレシーブフォームの確認程度に留めてください。`
      };
    } else if (acwr < 0.8) {
      return {
        level: "underwork" as const,
        title: "運動量追加推奨（アクティブ活動）",
        desc: `最近の運動負荷が不足しています（ACWR: ${acwr}）。コンディショニング低下を防ぐため、自主練でサーブ練習や強度の高い動きを少し追加し、心肺機能・筋力を維持しましょう。`
      };
    } else {
      return {
        level: "normal" as const,
        title: "通常コンディション（制限なし）",
        desc: `現在の疲労バランスは最適です（ACWR: ${acwr}）。技術課題に応じた自主練習を通常通り行ってください。練習後のストレッチは忘れずに行いましょう。`
      };
    }
  };

  const guidance = generateIndividualPracticeGuidance();

  // Helper to calculate mean and standard deviation
  const calcMeanAndSd = (values: number[]) => {
    if (values.length === 0) return { mean: 0, sd: 0 };
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    const sd = Math.sqrt(variance);
    return { mean, sd };
  };

  // Z-Score and Signal Light calculation based on baselineDays settings
  const calculateSignalLight = async () => {
    const settings = await getTeamSettings(athleteInfo.teamId);
    const baselineDays = settings.baselineDays;
    const enabledMetrics = JSON.parse(settings.enabledMetrics) as string[];

    // 当日を含まない過去のデータを取得
    const baseDateMode = settings.baseDateMode || "rolling";
    const baseFixedDate = settings.baseFixedDate;
    
    let pastSessions = [];
    if (baseDateMode === "fixed" && baseFixedDate) {
      const fixedTime = new Date(baseFixedDate).getTime();
      pastSessions = allPerf.slice(1).filter(p => {
        const pTime = new Date(p.date).getTime();
        return pTime >= fixedTime;
      }).slice(0, baselineDays);
    } else {
      pastSessions = allPerf.slice(1, 1 + baselineDays);
    }
    
    // 全指標の定義
    const metricDefinitions = [
      { key: "totalJumps", name: "ジャンプ量", type: "load" as const },
      { key: "sRPE", name: "sRPE", type: "load" as const },
      { key: "sRpeBall", name: "sRPE(Ball)", type: "load" as const },
      { key: "sRpeSandC", name: "sRPE(S&C)", type: "load" as const },
      { key: "hrv", name: "HRV", type: "state" as const },
      { key: "wellnessSoreness", name: "筋肉痛(DOMS)", type: "state" as const },
      { key: "wellnessSleep", name: "睡眠の質", type: "state" as const },
      { key: "wellnessFatigue", name: "主観的疲労感", type: "state" as const },
      { key: "totalDistance", name: "走行距離", type: "load" as const },
      { key: "highIntensityDistance", name: "高強度走行距離", type: "load" as const },
      { key: "avgHeartRate", name: "平均心拍数", type: "load" as const },
      { key: "physiologicalMarker", name: "生理学マーカー(CK)", type: "load" as const },
    ];

    const getVal = (p: any, key: string): number | null => {
      if (!p) return null;
      if (key === "sRpeBall" || key === "sRpeSandC") {
        try {
          const menuData = p.rawMenuData ? JSON.parse(p.rawMenuData) : {};
          const val = menuData[key];
          return val !== undefined && val !== null ? Number(val) : null;
        } catch (e) {
          return null;
        }
      }
      const val = p[key];
      return val !== undefined && val !== null ? Number(val) : null;
    };

    const baselines: Record<string, { mean: number; sd: number; val: number | null; zScore: number; status: "green" | "yellow" | "red" }> = {};
    const signals: Record<string, "green" | "yellow" | "red"> = {};
    
    let isDataAccumulating = pastSessions.length < 3;

    metricDefinitions.forEach(m => {
      const pastVals = pastSessions
        .map(p => getVal(p, m.key))
        .filter((v): v is number => v !== null && !isNaN(v));
      const stats = calcMeanAndSd(pastVals);
      
      const latestVal = latestSession ? getVal(latestSession, m.key) : null;
      
      let zScore = 0;
      if (stats.sd > 0 && latestVal !== null && !isNaN(latestVal)) {
        zScore = (latestVal - stats.mean) / stats.sd;
      }
      
      let status: "green" | "yellow" | "red" = "green";
      
      if (!isDataAccumulating && stats.sd > 0 && latestVal !== null && !isNaN(latestVal)) {
        if (m.type === "load") {
          // 負荷や生理学マーカー（CK等）は高値で警告
          if (zScore > 1.5) status = "red";
          else if (zScore > 1.0) status = "yellow";
        } else {
          // 状態系（睡眠・疲労・DOMS・HRV）は低値でコンディション低下警告
          if (zScore < -1.5) status = "red";
          else if (zScore < -1.0) status = "yellow";
        }
      }
      
      signals[m.key] = status;
      baselines[m.key] = {
        mean: Number(stats.mean.toFixed(2)),
        sd: Number(stats.sd.toFixed(2)),
        val: latestVal,
        zScore: Number(zScore.toFixed(2)),
        status
      };
    });

    // 総合ステータス（トグルで有効になっている指標のみで判定）
    let overallStatus: "green" | "yellow" | "red" = "green";
    const activeSignals = Object.keys(signals)
      .filter(k => enabledMetrics.includes(k))
      .map(k => signals[k]);
      
    if (activeSignals.includes("red")) {
      overallStatus = "red";
    } else if (activeSignals.includes("yellow")) {
      overallStatus = "yellow";
    }

    // 自動テキスト要約
    const activeZStats: Record<string, any> = {};
    const activeSignalsObj: Record<string, string> = {};
    enabledMetrics.forEach(k => {
      activeZStats[k] = baselines[k];
      activeSignalsObj[k] = signals[k];
    });

    const metricHistory: Record<string, number[]> = {};
    metricDefinitions.forEach(m => {
      const vals = allPerf
        .slice(0, 14)
        .map(p => getVal(p, m.key))
        .filter((v): v is number => v !== null && !isNaN(v))
        .reverse();
      metricHistory[m.key] = vals;
    });

    const autoSummary = isDataAccumulating 
      ? "データ蓄積中（正常🟢）です。過去3日分のデータが集まると自動判定が始まります。"
      : generateAutoSummary(activeSignalsObj, activeZStats);

    return {
      status: overallStatus,
      statusText: autoSummary,
      jumps: signals["totalJumps"],
      sRPE: signals["sRPE"],
      wellness: signals["wellnessFatigue"], // Fallback representation
      hrv: signals["hrv"],
      baselines,
      metricHistory,
      isDataAccumulating,
      enabledMetrics
    };
  };

  const generateAutoSummary = (signals: Record<string, string>, metricsZ: Record<string, { zScore: number; val: number; mean: number; sd: number }>) => {
    const reds = Object.keys(signals).filter(k => signals[k] === "red");
    const yellows = Object.keys(signals).filter(k => signals[k] === "yellow");

    if (reds.length === 0 && yellows.length === 0) {
      return "すべてのコンディション指標が個人基準の範囲内にあり、良好な準備状態（Ready）を維持しています。";
    }

    const translateKey = (k: string) => {
      if (k === "totalJumps") return "ジャンプ量";
      if (k === "sRPE") return "主観的運動強度(sRPE)";
      if (k === "hrv") return "心拍変動(HRV)";
      if (k === "wellnessSoreness") return "筋肉痛(DOMS)";
      if (k === "wellnessSleep") return "睡眠の質";
      if (k === "wellnessFatigue") return "主観的疲労感";
      if (k === "totalDistance") return "走行距離";
      if (k === "highIntensityDistance") return "高強度走行距離";
      if (k === "avgHeartRate") return "平均心拍数";
      if (k === "physiologicalMarker") return "生理学マーカー(CK)";
      return k;
    };

    let summaryText = "";
    if (reds.length > 0) {
      const redNames = reds.map(translateKey).join("、");
      summaryText += `【要確認】${redNames}が個人基準値から大幅に逸脱しています。`;
      
      const hasHighLoad = reds.includes("totalJumps") || reds.includes("sRPE") || reds.includes("highIntensityDistance");
      const hasLowRecovery = reds.includes("hrv") || reds.includes("wellnessSleep") || reds.includes("wellnessFatigue");
      const hasMuscleDamage = reds.includes("wellnessSoreness") || reds.includes("physiologicalMarker");

      if (hasHighLoad && hasLowRecovery) {
        summaryText += "高負荷に伴う自律神経疲労および回復不全の強い兆候が見られます。積極的な休養と練習制限を強く推奨します。";
      } else if (hasHighLoad) {
        summaryText += "急激なトレーニング負荷超過の兆候があります。傷害予防のため今日の負荷を抑えてください。";
      } else if (hasLowRecovery) {
        summaryText += "自律神経または主観的コンディションの著しい低下が起きています。睡眠・栄養・ケアの優先を推奨します。";
      } else if (hasMuscleDamage) {
        summaryText += "筋肉の微細損傷および局所疲労が深刻化している兆候があります。マッサージや交代浴等による積極的リカバリーが必要です。";
      }
    } else if (yellows.length > 0) {
      const yellowNames = yellows.map(translateKey).join("、");
      summaryText += `【注意】${yellowNames}にベースラインからの逸脱が認められます。`;
      
      const hasLoad = yellows.includes("totalJumps") || yellows.includes("sRPE");
      const hasRecovery = yellows.includes("hrv") || yellows.includes("wellnessSleep");
      if (hasLoad && hasRecovery) {
        summaryText += "疲労が蓄積しつつあります。練習前後のケアを丁寧に行い、これ以上の負荷上昇を避けてください。";
      } else {
        summaryText += "コンディションのバランスにやや乱れがあります。今日の体調変化に留意して練習を行ってください。";
      }
    }

    return summaryText;
  };

  const signalLight = await calculateSignalLight();

  return {
    athlete: athleteInfo,
    latestSession,
    acwr: acwrData,
    monotony: monotonyData,
    trend: trendData,
    dayOfWeekAverages: dowData,
    comparison: compData,
    guidance,
    signalLight
  };
}

export async function getTeamAnalytics(teamId: number) {
  const db = await getDb();
  
  // Helper to calculate mean and standard deviation
  const calcMeanAndSd = (values: number[]) => {
    if (values.length === 0) return { mean: 0, sd: 0 };
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    const sd = Math.sqrt(variance);
    return { mean, sd };
  };

  const generateAutoSummaryForTeam = (signals: Record<string, string>, metricsZ: Record<string, { zScore: number; val: number; mean: number; sd: number }>) => {
    const reds = Object.keys(signals).filter(k => signals[k] === "red");
    const yellows = Object.keys(signals).filter(k => signals[k] === "yellow");

    if (reds.length === 0 && yellows.length === 0) {
      return "すべての指標が個人基準の範囲内（良好）です。";
    }

    const translateKey = (k: string) => {
      if (k === "totalJumps") return "ジャンプ量";
      if (k === "sRPE") return "sRPE";
      if (k === "hrv") return "HRV";
      if (k === "wellnessSoreness") return "筋肉痛(DOMS)";
      if (k === "wellnessSleep") return "睡眠";
      if (k === "wellnessFatigue") return "疲労感";
      if (k === "totalDistance") return "走行距離";
      if (k === "highIntensityDistance") return "高強度走行距離";
      if (k === "avgHeartRate") return "心拍数";
      if (k === "physiologicalMarker") return "CK値";
      return k;
    };

    let summaryText = "";
    if (reds.length > 0) {
      const redNames = reds.map(translateKey).join("、");
      summaryText += `【要確認】${redNames}が個人基準値から大幅に逸脱しています。`;
    } else if (yellows.length > 0) {
      const yellowNames = yellows.map(translateKey).join("、");
      summaryText += `【注意】${yellowNames}に軽度の逸脱を検出。`;
    }

    return summaryText;
  };

  const settings = await getTeamSettings(teamId);
  const baselineDays = settings.baselineDays;
  const enabledMetrics = JSON.parse(settings.enabledMetrics) as string[];

  // 1. Fetch athletes in the team
  let athleteList: any[] = [];
  if (!db) {
    athleteList = mockAthletes
      .filter(a => a.teamId === teamId)
      .map(a => {
        const u = mockUsers.find(user => user.id === a.userId);
        return { ...a, user: u };
      });
  } else {
    const res = await db.select().from(athletes).where(eq(athletes.teamId, teamId));
    for (const a of res) {
      const u = await db.select().from(users).where(eq(users.id, a.userId)).limit(1);
      athleteList.push({ ...a, user: u[0] });
    }
  }

  // 2. Fetch performance data for the team
  let perfList: any[] = [];
  if (!db) {
    perfList = mockPerformanceData
      .filter(p => p.teamId === teamId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  } else {
    perfList = await db.select()
      .from(performanceData)
      .where(eq(performanceData.teamId, teamId))
      .orderBy(desc(performanceData.date));
  }

  const today = new Date();
  const oneDay = 24 * 60 * 60 * 1000;

  // 3. Multi-factor Alerts calculation for all athletes
  const athleteMetrics = [];
  for (const athlete of athleteList) {
    const athletePerf = perfList.filter(p => p.athleteId === athlete.id);
    if (athletePerf.length === 0) continue;

    const dailyLoads = Array(28).fill(0);
    for (let i = 0; i < 28; i++) {
      const targetDateStr = formatDateKey(new Date(today.getTime() - i * oneDay));
      const record = athletePerf.find(p => formatDateKey(new Date(p.date)) === targetDateStr);
      if (record && record.totalLoad) {
        dailyLoads[i] = Number(record.totalLoad);
      }
    }

    const acuteSum = dailyLoads.slice(0, 7).reduce((sum, val) => sum + val, 0);
    const acuteAvg = acuteSum / 7;
    const chronicSum = dailyLoads.reduce((sum, val) => sum + val, 0);
    const chronicAvg = chronicSum / 28;

    const acwr = chronicAvg > 0 ? acuteAvg / chronicAvg : 1.0;

    const weeklyLoads = dailyLoads.slice(0, 7);
    const sum = weeklyLoads.reduce((a, b) => a + b, 0);
    const mean = sum / 7;
    let monotony = 0;
    if (mean > 0) {
      const variance = weeklyLoads.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / 7;
      const stdDev = Math.sqrt(variance);
      monotony = stdDev > 0 ? mean / stdDev : (sum > 0 ? 3.0 : 0);
    }
    const strain = sum * monotony;

    const latestPerf = athletePerf[0];
    let isDivergent = false;
    let rpeValue = 0;
    let wellnessSleep = 5;
    let wellnessFatigue = 5;
    let coachAdvice = null;
    if (latestPerf) {
      rpeValue = latestPerf.rpeValue ? Number(latestPerf.rpeValue) : 0;
      wellnessSleep = latestPerf.wellnessSleep ? Number(latestPerf.wellnessSleep) : 5;
      wellnessFatigue = latestPerf.wellnessFatigue ? Number(latestPerf.wellnessFatigue) : 5;
      coachAdvice = latestPerf.coachAdvice || null;

      const load = latestPerf.totalLoad ? Number(latestPerf.totalLoad) : 0;
      if ((load < 200 && rpeValue >= 8) || wellnessSleep <= 2 || wellnessFatigue <= 2) {
        isDivergent = true;
      }
    }

    // --- Zスコア個人基準判定の開始 ---
    const baseDateMode = settings.baseDateMode || "rolling";
    const baseFixedDate = settings.baseFixedDate;
    
    let pastSessions = [];
    if (baseDateMode === "fixed" && baseFixedDate) {
      const fixedTime = new Date(baseFixedDate).getTime();
      pastSessions = athletePerf.slice(1).filter(p => {
        const pTime = new Date(p.date).getTime();
        return pTime >= fixedTime;
      }).slice(0, baselineDays);
    } else {
      pastSessions = athletePerf.slice(1, 1 + baselineDays);
    }
    const isDataAccumulating = pastSessions.length < 3;

    const metricDefinitions = [
      { key: "totalJumps", name: "ジャンプ量", type: "load" as const },
      { key: "sRPE", name: "sRPE", type: "load" as const },
      { key: "sRpeBall", name: "sRPE(Ball)", type: "load" as const },
      { key: "sRpeSandC", name: "sRPE(S&C)", type: "load" as const },
      { key: "hrv", name: "HRV", type: "state" as const },
      { key: "wellnessSoreness", name: "筋肉痛(DOMS)", type: "state" as const },
      { key: "wellnessSleep", name: "睡眠の質", type: "state" as const },
      { key: "wellnessFatigue", name: "主観的疲労感", type: "state" as const },
      { key: "totalDistance", name: "走行距離", type: "load" as const },
      { key: "highIntensityDistance", name: "高強度走行距離", type: "load" as const },
      { key: "avgHeartRate", name: "平均心拍数", type: "load" as const },
      { key: "physiologicalMarker", name: "生理学マーカー(CK)", type: "load" as const },
    ];

    const getVal = (p: any, key: string): number | null => {
      if (!p) return null;
      if (key === "sRpeBall" || key === "sRpeSandC") {
        try {
          const menuData = p.rawMenuData ? JSON.parse(p.rawMenuData) : {};
          const val = menuData[key];
          return val !== undefined && val !== null ? Number(val) : null;
        } catch (e) {
          return null;
        }
      }
      const val = p[key];
      return val !== undefined && val !== null ? Number(val) : null;
    };

    const baselines: Record<string, { mean: number; sd: number; val: number | null; zScore: number; status: "green" | "yellow" | "red" }> = {};
    const signals: Record<string, "green" | "yellow" | "red"> = {};

    metricDefinitions.forEach(m => {
      const pastVals = pastSessions
        .map(p => getVal(p, m.key))
        .filter((v): v is number => v !== null && !isNaN(v));
      const stats = calcMeanAndSd(pastVals);
      const latestVal = latestPerf ? getVal(latestPerf, m.key) : null;
      
      let zScore = 0;
      if (stats.sd > 0 && latestVal !== null && !isNaN(latestVal)) {
        zScore = (latestVal - stats.mean) / stats.sd;
      }
      
      let status: "green" | "yellow" | "red" = "green";
      
      if (!isDataAccumulating && stats.sd > 0 && latestVal !== null && !isNaN(latestVal)) {
        if (m.type === "load") {
          if (zScore > 1.5) status = "red";
          else if (zScore > 1.0) status = "yellow";
        } else {
          if (zScore < -1.5) status = "red";
          else if (zScore < -1.0) status = "yellow";
        }
      }
      
      signals[m.key] = status;
      baselines[m.key] = {
        mean: Number(stats.mean.toFixed(2)),
        sd: Number(stats.sd.toFixed(2)),
        val: latestVal,
        zScore: Number(zScore.toFixed(2)),
        status
      };
    });

    // 総合ステータス（トグルで有効になっている指標のみで判定）
    let overallStatus: "green" | "yellow" | "red" = "green";
    const activeSignals = Object.keys(signals)
      .filter(k => enabledMetrics.includes(k))
      .map(k => signals[k]);
      
    if (activeSignals.includes("red")) {
      overallStatus = "red";
    } else if (activeSignals.includes("yellow")) {
      overallStatus = "yellow";
    }

    const activeZStats: Record<string, any> = {};
    const activeSignalsObj: Record<string, string> = {};
    enabledMetrics.forEach(k => {
      activeZStats[k] = baselines[k];
      activeSignalsObj[k] = signals[k];
    });

    const autoSummary = isDataAccumulating 
      ? "データ蓄積中（正常🟢）です。"
      : generateAutoSummaryForTeam(activeSignalsObj, activeZStats);

    const metricHistory: Record<string, number[]> = {};
    metricDefinitions.forEach(m => {
      // Get values for the past 14 days, filtering out nulls, and sort chronologically (oldest to newest)
      const vals = athletePerf
        .slice(0, 14)
        .map(p => getVal(p, m.key))
        .filter((v): v is number => v !== null && !isNaN(v))
        .reverse();
      metricHistory[m.key] = vals;
    });

    athleteMetrics.push({
      athleteId: athlete.id,
      name: athlete.user?.name || `選手${athlete.jerseyNumber}`,
      jerseyNumber: athlete.jerseyNumber,
      position: athlete.position,
      csvNames: athlete.csvNames,
      acwr: Number(acwr.toFixed(2)),
      acute: Number(acuteAvg.toFixed(1)),
      chronic: Number(chronicAvg.toFixed(1)),
      monotony: Number(monotony.toFixed(2)),
      strain: Number(strain.toFixed(1)),
      rpeValue,
      wellnessSleep,
      wellnessFatigue,
      isDivergent,
      coachAdvice,
      
      // Zスコア判定の追加
      overallStatus,
      statusText: autoSummary,
      baselines,
      metricHistory,
      isDataAccumulating,
      enabledMetrics
    });
  }

  const teamAvgStrain = athleteMetrics.length > 0 ? athleteMetrics.reduce((sum, m) => sum + m.strain, 0) / athleteMetrics.length : 0;

  const alertAthletes = athleteMetrics.map(m => {
    let status: "danger" | "chronic_fatigue" | "divergence" | "underwork" | "normal" = "normal";

    if (m.acwr >= 1.5) {
      status = "danger";
    } else if (m.monotony >= 2.0 && m.strain >= teamAvgStrain * 1.3) {
      status = "chronic_fatigue";
    } else if (m.isDivergent) {
      status = "divergence";
    } else if (m.acwr < 0.8) {
      status = "underwork";
    }

    return {
      ...m,
      status
    };
  });
  alertAthletes.sort((a, b) => {
    const numA = a.jerseyNumber !== null && a.jerseyNumber !== undefined ? a.jerseyNumber : 9999;
    const numB = b.jerseyNumber !== null && b.jerseyNumber !== undefined ? b.jerseyNumber : 9999;
    return numA - numB;
  });

  // 4. Chronological Trend (Past 30 days)
  const teamTrend = [];
  for (let i = 29; i >= 0; i--) {
    const targetDate = new Date(today.getTime() - i * oneDay);
    const targetDateStr = formatDateKey(targetDate);
    const dateLabel = targetDate.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });

    const dayRecords = perfList.filter(p => formatDateKey(new Date(p.date)) === targetDateStr);
    
    if (dayRecords.length > 0) {
      const sumLoad = dayRecords.reduce((sum, r) => sum + (r.totalLoad ? Number(r.totalLoad) : 0), 0);
      const sumJumps = dayRecords.reduce((sum, r) => sum + (r.totalJumps ? Number(r.totalJumps) : 0), 0);
      const sumJumpVolume = dayRecords.reduce((sum, r) => sum + (r.jumpVolume ? Number(r.jumpVolume) : 0), 0);

      teamTrend.push({
        dateStr: dateLabel,
        avgLoad: Number((sumLoad / dayRecords.length).toFixed(1)),
        avgJumps: Number((sumJumps / dayRecords.length).toFixed(1)),
        avgJumpVolume: Number((sumJumpVolume / dayRecords.length).toFixed(2)),
      });
    } else {
      teamTrend.push({
        dateStr: dateLabel,
        avgLoad: 0,
        avgJumps: 0,
        avgJumpVolume: 0,
      });
    }
  }

  // 5. Position Comparison (Past 28 days)
  const positionMap: Record<string, { sumLoad: number; sumJumps: number; count: number }> = {};
  const recentPerf = perfList.filter(p => {
    const pDate = new Date(p.date);
    return today.getTime() - pDate.getTime() <= 28 * oneDay;
  });

  recentPerf.forEach(p => {
    const athlete = athleteList.find(a => a.id === p.athleteId);
    const pos = athlete?.position || "その他";
    if (!positionMap[pos]) {
      positionMap[pos] = { sumLoad: 0, sumJumps: 0, count: 0 };
    }
    positionMap[pos].sumLoad += p.totalLoad ? Number(p.totalLoad) : 0;
    positionMap[pos].sumJumps += p.totalJumps ? Number(p.totalJumps) : 0;
    positionMap[pos].count += 1;
  });

  const positionComparison = Object.keys(positionMap).map(pos => {
    const data = positionMap[pos];
    return {
      position: pos,
      avgLoad: Number((data.sumLoad / data.count).toFixed(1)),
      avgJumps: Number((data.sumJumps / data.count).toFixed(1)),
    };
  });

  // 6. Individual Practice Status (Latest Session Date)
  let latestDateStr = "";
  if (perfList.length > 0) {
    const sortedDates = [...perfList].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    latestDateStr = formatDateKey(new Date(sortedDates[0].date));
  }

  const individualPractice = athleteList.map(athlete => {
    const athletePerf = perfList.find(p => 
      p.athleteId === athlete.id && formatDateKey(new Date(p.date)) === latestDateStr
    );

    let individualLoad = 0;
    let hasData = false;

    if (athletePerf) {
      hasData = true;
      if (athletePerf.rawMenuData) {
        try {
          const menuData = JSON.parse(athletePerf.rawMenuData);
          individualLoad = Number(menuData["Individual"] || menuData["自主練"] || 0);
        } catch (e) {
          // ignore
        }
      }
    }

    const metric = alertAthletes.find(m => m.athleteId === athlete.id);

    return {
      athleteId: athlete.id,
      name: athlete.user?.name || `選手${athlete.jerseyNumber}`,
      jerseyNumber: athlete.jerseyNumber,
      position: athlete.position,
      individualLoad: Number(individualLoad.toFixed(1)),
      totalLoad: athletePerf && athletePerf.totalLoad ? Number(athletePerf.totalLoad) : 0,
      hasData,
      acwr: metric ? metric.acwr : 1.0,
      guidanceLevel: metric ? (metric.acwr >= 1.5 || metric.wellnessFatigue <= 2 ? "danger" : metric.acwr >= 1.2 ? "warning" : metric.acwr < 0.8 ? "underwork" : "normal") : "normal"
    };
  });
  individualPractice.sort((a, b) => {
    const numA = a.jerseyNumber !== null && a.jerseyNumber !== undefined ? a.jerseyNumber : 9999;
    const numB = b.jerseyNumber !== null && b.jerseyNumber !== undefined ? b.jerseyNumber : 9999;
    return numA - numB;
  });

  // 7. Menu averages (Past 28 days) with jump count mapping
  const menuMap: Record<string, { sumLoad: number; sumJumps: number; count: number }> = {};
  recentPerf.forEach(p => {
    if (p.rawMenuData) {
      try {
        const menuData = JSON.parse(p.rawMenuData);
        const totalJumpsVal = p.totalJumps ? Number(p.totalJumps) : 0;
        const totalLoadVal = p.totalLoad ? Number(p.totalLoad) : 1;

        Object.keys(menuData).forEach(menuName => {
          const load = Number(menuData[menuName]);
          if (!isNaN(load)) {
            if (!menuMap[menuName]) {
              menuMap[menuName] = { sumLoad: 0, sumJumps: 0, count: 0 };
            }
            menuMap[menuName].sumLoad += load;
            const ratio = load / totalLoadVal;
            menuMap[menuName].sumJumps += totalJumpsVal * ratio;
            menuMap[menuName].count += 1;
          }
        });
      } catch (e) {
        // ignore
      }
    }
  });

  const menuAverages = Object.keys(menuMap).map(menuName => {
    const data = menuMap[menuName];
    return {
      menuName,
      avgLoad: Number((data.sumLoad / data.count).toFixed(1)),
      avgJumps: Number((data.sumJumps / data.count).toFixed(1)),
    };
  });
  menuAverages.sort((a, b) => b.avgLoad - a.avgLoad);

  return {
    latestDateStr,
    athletes: alertAthletes,
    trend: teamTrend,
    positionComparison,
    individualPractice,
    menuAverages
  };
}

export async function saveCoachAdvice(athleteId: number, advice: string) {
  const db = await getDb();
  
  // Find latest performance record for the athlete
  let latestRecord = null;
  if (!db) {
    const allPerf = mockPerformanceData
      .filter(p => p.athleteId === athleteId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (allPerf.length > 0) {
      latestRecord = allPerf[0];
    }
  } else {
    const res = await db.select()
      .from(performanceData)
      .where(eq(performanceData.athleteId, athleteId))
      .orderBy(desc(performanceData.date))
      .limit(1);
    if (res.length > 0) {
      latestRecord = res[0];
    }
  }

  if (latestRecord) {
    if (!db) {
      const idx = mockPerformanceData.findIndex(p => p.id === latestRecord.id);
      if (idx !== -1) {
        mockPerformanceData[idx].coachAdvice = advice;
      }
    } else {
      await db.update(performanceData)
        .set({ coachAdvice: advice, updatedAt: new Date() })
        .where(eq(performanceData.id, latestRecord.id));
    }
    return { success: true };
  } else {
    const dateObj = new Date();
    const newPerf = {
      athleteId,
      teamId: 1, // default
      date: dateObj,
      sessionType: "practice" as const,
      coachAdvice: advice,
    };
    if (!db) {
      const mockId = mockPerformanceData.length + 1;
      mockPerformanceData.push({
        id: mockId,
        ...newPerf,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
    } else {
      await db.insert(performanceData).values(newPerf as any);
    }
    return { success: true };
  }
}

export async function updatePerformanceMetric(
  athleteId: number,
  teamId: number,
  dateStr: string,
  metricKey: string,
  value: number | null
) {
  const db = await getDb();
  const date = new Date(dateStr);
  
  let existing = null;
  if (!db) {
    existing = mockPerformanceData.find(
      p => p.athleteId === athleteId && formatDateKey(new Date(p.date)) === formatDateKey(date)
    );
  } else {
    const res = await db.select()
      .from(performanceData)
      .where(and(
        eq(performanceData.athleteId, athleteId),
        eq(sql`DATE(${performanceData.date})`, sql`DATE(${dateStr})`)
      ))
      .limit(1);
    if (res.length > 0) existing = res[0];
  }

  const updateFields: any = {};
  const getMappedValue = (val: number | null, isInt: boolean, isString: boolean) => {
    if (val === null) return null;
    if (isString) return String(val);
    return isInt ? Math.floor(val) : val;
  };

  if (metricKey === "totalJumps") updateFields.totalJumps = getMappedValue(value, true, false);
  else if (metricKey === "sRPE") updateFields.sRPE = getMappedValue(value, true, false);
  else if (metricKey === "hrv") updateFields.hrv = getMappedValue(value, false, true);
  else if (metricKey === "wellnessSoreness") updateFields.wellnessSoreness = getMappedValue(value, true, false);
  else if (metricKey === "wellnessSleep") updateFields.wellnessSleep = getMappedValue(value, true, false);
  else if (metricKey === "wellnessFatigue") updateFields.wellnessFatigue = getMappedValue(value, true, false);
  else if (metricKey === "totalDistance") updateFields.totalDistance = getMappedValue(value, false, true);
  else if (metricKey === "highIntensityDistance") updateFields.highIntensityDistance = getMappedValue(value, false, true);
  else if (metricKey === "avgHeartRate") updateFields.avgHeartRate = getMappedValue(value, true, false);
  else if (metricKey === "physiologicalMarker") updateFields.physiologicalMarker = getMappedValue(value, false, true);
  else if (metricKey === "sRpeBall" || metricKey === "sRpeSandC") {
    let menuData: Record<string, number> = {};
    if (existing && existing.rawMenuData) {
      try {
        menuData = JSON.parse(existing.rawMenuData);
      } catch (e) {
        menuData = {};
      }
    }
    if (value === null) {
      delete menuData[metricKey];
    } else {
      menuData[metricKey] = value;
    }
    updateFields.rawMenuData = JSON.stringify(menuData);
    
    // Automatically recalculate sum sRPE
    const ballVal = menuData["sRpeBall"] || 0;
    const sandCVal = menuData["sRpeSandC"] || 0;
    updateFields.sRPE = ballVal + sandCVal;
  }

  if (metricKey === "totalJumps") {
    updateFields.jumpVolume = value !== null ? String(((value * 40) / 100).toFixed(2)) : null;
  }

  if (metricKey === "totalJumps" || metricKey === "totalDistance") {
    const valNum = value !== null ? value : 0;
    updateFields.totalLoad = value !== null ? String((200 + valNum * 0.5).toFixed(2)) : null;
  }

  if (existing) {
    if (!db) {
      const idx = mockPerformanceData.findIndex(p => p.id === existing.id);
      if (idx !== -1) {
        mockPerformanceData[idx] = {
          ...mockPerformanceData[idx],
          ...updateFields,
          updatedAt: new Date()
        };
      }
    } else {
      await db.update(performanceData)
        .set({ ...updateFields, updatedAt: new Date() })
        .where(eq(performanceData.id, existing.id));
    }
  } else {
    const newRecord = {
      athleteId,
      teamId,
      date,
      sessionType: "practice" as const,
      ...updateFields,
    };
    if (!db) {
      const mockId = mockPerformanceData.length + 1;
      mockPerformanceData.push({
        id: mockId,
        ...newRecord,
        createdAt: new Date(),
        updatedAt: new Date()
      } as any);
    } else {
      await db.insert(performanceData).values(newRecord as any);
    }
  }
  return { success: true };
}

export function resetMockStore() {
  mockPerformanceData = [];
  mockCsvUploads = [];
}

export async function seedDatabase() {
  const db = await getDb();
  if (!db) {
    console.log("[Database] Skipping seeding for mock store");
    return;
  }

  try {
    // Fix auto-increment sequences in PostgreSQL if any manual IDs or tables were inserted
    try {
      await db.execute(sql`SELECT setval('athletes_id_seq', COALESCE((SELECT MAX(id)+1 FROM athletes), 1), false);`);
      await db.execute(sql`SELECT setval('users_id_seq', COALESCE((SELECT MAX(id)+1 FROM users), 1), false);`);
      await db.execute(sql`SELECT setval('teams_id_seq', COALESCE((SELECT MAX(id)+1 FROM teams), 1), false);`);
      console.log("[Database] Sequences synchronized successfully");
    } catch (seqError) {
      console.warn("[Database] Sequence synchronization warning:", seqError);
    }

    // 1. Seed initial team
    const existingTeams = await db.select().from(teams).limit(1);
    if (existingTeams.length === 0) {
      console.log("[Database] Seeding initial team...");
      await db.insert(teams).values({
        id: 1,
        name: "VolleyTrack Team",
        coachId: 1,
      });
    }

    // 1.5. Seed/Update default team settings with updated metrics keys
    const metricsToEnable = JSON.stringify([
      "totalJumps", "maxJumpHeight", "avgJumpHeight", "jumpVolume", "totalLoad", 
      "accelCount", "maxAcceleration", "sRPE", "rpeValue", "hrv", 
      "wellnessSleep", "wellnessFatigue", "wellnessSoreness", "wellnessStress"
    ]);
    const existingSettings = await db.select().from(teamSettings).where(eq(teamSettings.teamId, 1)).limit(1);
    if (existingSettings.length === 0) {
      console.log("[Database] Seeding initial team settings...");
      await db.insert(teamSettings).values({
        teamId: 1,
        baselineDays: 28,
        enabledMetrics: metricsToEnable,
        baseDateMode: "rolling",
        baseFixedDate: null
      });
    } else {
      console.log("[Database] Updating team settings to match new CSV schema keys...");
      await db.update(teamSettings).set({ enabledMetrics: metricsToEnable }).where(eq(teamSettings.teamId, 1));
    }

    // 2. Seed coach/admin user
    const existingCoach = await db.select().from(users).where(eq(users.openId, "democoach")).limit(1);
    if (existingCoach.length === 0) {
      console.log("[Database] Seeding coach user...");
      await db.insert(users).values({
        id: 1,
        openId: "democoach",
        name: "スタッフ (管理者)",
        email: "admin@example.com",
        loginMethod: "manus",
        role: "coach",
        teamId: 1,
      });
    } else if (existingCoach[0].teamId !== 1) {
      console.log("[Database] Fixing coach user teamId...");
      await db.update(users).set({ teamId: 1 }).where(eq(users.id, 1));
    }

    // 3. Seed viewer user
    const existingViewer = await db.select().from(users).where(eq(users.openId, "demoviewer")).limit(1);
    if (existingViewer.length === 0) {
      console.log("[Database] Seeding viewer user...");
      await db.insert(users).values({
        id: 5,
        openId: "demoviewer",
        name: "スタッフ (閲覧用)",
        email: "viewer@example.com",
        loginMethod: "manus",
        role: "viewer",
        teamId: 1,
      });
    }

    // 4. Seed athlete users & records (including real volleyball team players)
    const athletesToSeed = [
      { name: "山下 晴奈", openId: "athlete_yamashita", email: "airybees.sportsmed.2019+12@gmail.com", jersey: 1, pos: "OH", catapult: "Haruna Yamashita", onetap: "山下 晴奈", soxai: "airybees.sportsmed.2019+12@gmail.com" },
      { name: "野田 祐希", openId: "athlete_noda", email: "0fb20756729306w@ezweb.ne.jp", jersey: 16, pos: "OH", catapult: "Yuki Noda", onetap: "野田 祐希", soxai: "0fb20756729306w@ezweb.ne.jp" },
      { name: "福本 瞳", openId: "athlete_fukumoto", email: "fukumoto@example.com", jersey: 6, pos: "L", catapult: "Hitomi Fukumoto", onetap: "福本 瞳", soxai: "" },
      { name: "和田 栞菜", openId: "athlete_wada", email: "airybees.sportsmed.2019+07@gmail.com", jersey: 20, pos: "MB", catapult: "Kanna Wada", onetap: "和田栞菜", soxai: "airybees.sportsmed.2019+07@gmail.com" },
      { name: "中元 南", openId: "athlete_nakamoto", email: "nakamoto@example.com", jersey: 8, pos: "OH", catapult: "Minami Nakamoto", onetap: "中元 南", soxai: "" },
      { name: "イェーモンミャ", openId: "athlete_yeemonmyat", email: "yeemonmyat@example.com", jersey: 17, pos: "OH", catapult: "Yee Mon Myat", onetap: "イェーモンミャ", soxai: "" },
      { name: "川岸 友沙", openId: "athlete_kawagishi", email: "kawagishi@example.com", jersey: 19, pos: "OH", catapult: "Yusa Kawagishi", onetap: "川岸 友沙", soxai: "" },
      { name: "柳 千嘉", openId: "athlete_yanagi", email: "yanagi@example.com", jersey: 15, pos: "S", catapult: "Chika Yanagi", onetap: "柳 千嘉", soxai: "" },
      { name: "大崎 琴未", openId: "athlete_osaki", email: "osaki@example.com", jersey: 22, pos: "MB", catapult: "Kotomi Osaki", onetap: "大崎 琴未", soxai: "" },
      { name: "石倉 沙姫", openId: "athlete_ishikura", email: "ishikura@example.com", jersey: 10, pos: "OH", catapult: "Saki Ishikura", onetap: "石倉 沙姫", soxai: "" },
      { name: "山上 有紀", openId: "athlete_yamagami", email: "yamagami@example.com", jersey: 18, pos: "MB", catapult: "Yuki Yamagami", onetap: "山上 有紀", soxai: "" },
    ];

    const allUsers = await db.select().from(users);

    for (const a of athletesToSeed) {
      try {
        let existingUser = await db.select().from(users).where(eq(users.openId, a.openId)).limit(1);
        if (existingUser.length === 0) {
          const cleanString = (s: string | null) => (s || "").replace(/\s+/g, "");
          const matched = allUsers.find(u => cleanString(u.name) === cleanString(a.name) && u.role === "athlete");
          if (matched) {
            existingUser = [matched];
          }
        }
        
        let uId = 0;
        if (existingUser.length === 0) {
          console.log(`[Database] Seeding athlete user: ${a.name}`);
          const insertedUser = await db.insert(users).values({
            openId: a.openId,
            name: a.name,
            email: a.email,
            loginMethod: "manus",
            role: "athlete",
            teamId: 1,
          }).returning({ id: users.id });
          uId = insertedUser[0].id;
        } else {
          uId = existingUser[0].id;
          if (existingUser[0].teamId !== 1) {
            await db.update(users).set({ teamId: 1 }).where(eq(users.id, uId));
          }
        }

        const existingAthlete = await db.select().from(athletes).where(eq(athletes.userId, uId)).limit(1);
        if (existingAthlete.length === 0) {
          console.log(`[Database] Seeding athlete record: ${a.name}`);
          await db.insert(athletes).values({
            userId: uId,
            teamId: 1,
            jerseyNumber: a.jersey,
            position: a.pos,
            onetapName: a.onetap,
            catapultName: a.catapult,
            soxaiEmail: a.soxai || null,
          });
        } else {
          // すでに選手が存在している場合は、手動で修正されたポジションや背番号を上書きしない
          await db.update(athletes).set({
            onetapName: a.onetap || existingAthlete[0].onetapName,
            catapultName: a.catapult || existingAthlete[0].catapultName,
            soxaiEmail: a.soxai || existingAthlete[0].soxaiEmail,
            teamId: 1,
          }).where(eq(athletes.userId, uId));
        }
      } catch (itemError) {
        console.error(`[Database] Failed to seed player ${a.name}:`, itemError);
      }
    }
    console.log("[Database] Seeding completed successfully!");
  } catch (error) {
    console.error("[Database] Seeding failed:", error);
  }
}

export async function deleteCsvUpload(uploadId: number): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  if (!db) {
    const idx = mockCsvUploads.findIndex(c => c.id === uploadId);
    if (idx !== -1) {
      const upload = mockCsvUploads[idx];
      mockCsvUploads.splice(idx, 1);
      mockPerformanceData = mockPerformanceData.filter(p => {
        try {
          const raw = JSON.parse(p.rawCsvData || "{}");
          return raw.fileName !== upload.fileName;
        } catch {
          return true;
        }
      });
      return { success: true };
    }
    return { success: false, error: "Mock upload record not found" };
  }

  try {
    const upload = await db.select().from(csvUploads).where(eq(csvUploads.id, uploadId)).limit(1);
    if (upload.length === 0) {
      return { success: false, error: "Upload record not found" };
    }

    const fileName = upload[0].fileName;

    // Delete performance data records imported from this CSV file
    await db.delete(performanceData)
      .where(sql`${performanceData.rawCsvData} LIKE ${`%"fileName":"${fileName}"%`}`);

    // Delete the CSV upload history record
    await db.delete(csvUploads).where(eq(csvUploads.id, uploadId));

    return { success: true };
  } catch (error: any) {
    console.error("[Database] Failed to delete CSV upload:", error);
    return { success: false, error: error.message || "Database delete failure" };
  }
}

export async function updateAthleteCsvNames(athleteId: number, csvNames: string): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  if (!db) {
    const a = mockAthletes.find(item => item.id === athleteId);
    if (a) {
      a.csvNames = csvNames;
      saveMockStore();
    }
    return { success: true };
  }

  try {
    await db.update(athletes)
      .set({ csvNames })
      .where(eq(athletes.id, athleteId));
    return { success: true };
  } catch (error: any) {
    console.error("[Database] Failed to update athlete csvNames:", error);
    return { success: false, error: error.message || "Database update failure" };
  }
}

export function checkPerformanceAnomaly(data: any): { isAnomaly: boolean; details: string | null } {
  const totalJumps = data.totalJumps ? Number(data.totalJumps) : 0;
  const totalLoad = data.totalLoad ? Number(data.totalLoad) : 0;
  const maxJumpHeight = data.maxJumpHeight ? Number(data.maxJumpHeight) : 0;
  const accelCount = data.accelCount ? Number(data.accelCount) : 0;

  const anomalies: string[] = [];
  if (totalJumps > 300) {
    anomalies.push(`ジャンプ数: ${totalJumps}回 (閾値: 300回)`);
  }
  if (totalLoad > 2000) {
    anomalies.push(`PlayerLoad: ${totalLoad.toFixed(1)} (閾値: 2000)`);
  }
  if (maxJumpHeight > 110) {
    anomalies.push(`最大ジャンプ高: ${maxJumpHeight.toFixed(1)}cm (閾値: 110cm)`);
  }
  if (accelCount > 500) {
    anomalies.push(`加速回数: ${accelCount}回 (閾値: 500回)`);
  }

  if (anomalies.length > 0) {
    return { isAnomaly: true, details: anomalies.join(", ") };
  }
  return { isAnomaly: false, details: null };
}

export async function correctPerformanceAnomaly(
  recordId: number, 
  metricsToCorrect: string[] = ["totalLoad", "totalJumps", "avgJumpHeight", "accelCount"]
): Promise<void> {
  const db = await getDb();
  
  // 1. 対象レコードを取得
  let record: any = null;
  if (!db) {
    record = mockPerformanceData.find(p => p.id === recordId);
  } else {
    const res = await db.select().from(performanceData).where(eq(performanceData.id, recordId)).limit(1);
    record = res[0] || null;
  }
  
  if (!record) {
    throw new Error("対象のデータレコードが見つかりません。");
  }

  // 2. 選手のポジションを取得
  let position = "";
  let teamId = record.teamId;
  if (!db) {
    const ath = mockAthletes.find(a => a.id === record.athleteId);
    position = ath?.position || "";
  } else {
    const res = await db.select().from(athletes).where(eq(athletes.id, record.athleteId)).limit(1);
    position = res[0]?.position || "";
  }

  // 3. 同じポジションの選手の「正常データ」を直近28日分取得し平均を計算
  let samePosLoads: number[] = [];
  let samePosJumps: number[] = [];
  let samePosJumpHeights: number[] = [];
  let samePosAccels: number[] = [];
  
  let samePosMaxHeights: number[] = [];
  let samePosOver40s: number[] = [];
  let samePosAvgLoads: number[] = [];
  let samePosAvgAccels: number[] = [];
  let samePosMaxAccels: number[] = [];
  let samePosZone1Count: number[] = [];
  let samePosZone2Count: number[] = [];
  let samePosZone3Count: number[] = [];
  let samePosZone4Count: number[] = [];
  let samePosZone5Count: number[] = [];

  if (!db) {
    const samePosAthIds = mockAthletes.filter(a => a.teamId === teamId && a.position === position).map(a => a.id);
    const normalRecords = mockPerformanceData.filter(p => 
      samePosAthIds.includes(p.athleteId) && 
      !p.isAnomaly && 
      p.id !== recordId
    );
    samePosLoads = normalRecords.map(p => Number(p.totalLoad || 0));
    samePosJumps = normalRecords.map(p => Number(p.totalJumps || 0));
    samePosJumpHeights = normalRecords.map(p => Number(p.avgJumpHeight || 0));
    samePosAccels = normalRecords.map(p => Number(p.accelCount || 0));
    
    samePosMaxHeights = normalRecords.map(p => Number(p.maxJumpHeight || 0));
    samePosOver40s = normalRecords.map(p => Number(p.jumpsOver40cm || 0));
    samePosAvgLoads = normalRecords.map(p => Number(p.avgLoad || 0));
    samePosAvgAccels = normalRecords.map(p => Number(p.avgAcceleration || 0));
    samePosMaxAccels = normalRecords.map(p => Number(p.maxAcceleration || 0));
    samePosZone1Count = normalRecords.map(p => Number(p.jumpZone1Count || 0));
    samePosZone2Count = normalRecords.map(p => Number(p.jumpZone2Count || 0));
    samePosZone3Count = normalRecords.map(p => Number(p.jumpZone3Count || 0));
    samePosZone4Count = normalRecords.map(p => Number(p.jumpZone4Count || 0));
    samePosZone5Count = normalRecords.map(p => Number(p.jumpZone5Count || 0));
  } else {
    const samePosAthletes = await db.select().from(athletes).where(and(eq(athletes.teamId, teamId), eq(athletes.position, position)));
    const samePosAthIds = samePosAthletes.map(a => a.id);
    if (samePosAthIds.length > 0) {
      const normalRecords = await db.select()
        .from(performanceData)
        .where(and(
          inArray(performanceData.athleteId, samePosAthIds),
          eq(performanceData.isAnomaly, false),
          sql`${performanceData.id} != ${recordId}`
        ));
      samePosLoads = normalRecords.map(p => Number(p.totalLoad || 0));
      samePosJumps = normalRecords.map(p => Number(p.totalJumps || 0));
      samePosJumpHeights = normalRecords.map(p => Number(p.avgJumpHeight || 0));
      samePosAccels = normalRecords.map(p => Number(p.accelCount || 0));

      samePosMaxHeights = normalRecords.map(p => Number(p.maxJumpHeight || 0));
      samePosOver40s = normalRecords.map(p => Number(p.jumpsOver40cm || 0));
      samePosAvgLoads = normalRecords.map(p => Number(p.avgLoad || 0));
      samePosAvgAccels = normalRecords.map(p => Number(p.avgAcceleration || 0));
      samePosMaxAccels = normalRecords.map(p => Number(p.maxAcceleration || 0));
      samePosZone1Count = normalRecords.map(p => Number(p.jumpZone1Count || 0));
      samePosZone2Count = normalRecords.map(p => Number(p.jumpZone2Count || 0));
      samePosZone3Count = normalRecords.map(p => Number(p.jumpZone3Count || 0));
      samePosZone4Count = normalRecords.map(p => Number(p.jumpZone4Count || 0));
      samePosZone5Count = normalRecords.map(p => Number(p.jumpZone5Count || 0));
    }
  }

  const avg = (arr: number[], fallback: number) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : fallback;

  // ポジション平均値
  const fallbackJumps = position.includes("setter") ? 30 : position.includes("blocker") ? 75 : 55;
  const fallbackLoad = 350;
  const fallbackHeight = 35;
  const fallbackAccel = 80;

  const correctedJumps = Math.round(avg(samePosJumps, fallbackJumps));
  const correctedLoad = Number(avg(samePosLoads, fallbackLoad).toFixed(2));
  const correctedHeight = Number(avg(samePosJumpHeights, fallbackHeight).toFixed(2));
  const correctedAccel = Math.round(avg(samePosAccels, fallbackAccel));

  const correctedMaxHeight = Number(avg(samePosMaxHeights, 45).toFixed(2));
  const correctedOver40 = Math.round(avg(samePosOver40s, 10));
  const correctedAvgLoad = Number(avg(samePosAvgLoads, 1.8).toFixed(2));
  const correctedAvgAcc = Number(avg(samePosAvgAccels, 1.9).toFixed(2));
  const correctedMaxAcc = Number(avg(samePosMaxAccels, 4.0).toFixed(2));
  const correctedZone1 = Math.round(avg(samePosZone1Count, 5));
  const correctedZone2 = Math.round(avg(samePosZone2Count, 10));
  const correctedZone3 = Math.round(avg(samePosZone3Count, 15));
  const correctedZone4 = Math.round(avg(samePosZone4Count, 12));
  const correctedZone5 = Math.round(avg(samePosZone5Count, 10));

  // 元の生データ退避用JSON (関連指標含む)
  const originalRawDataJson = record.originalRawData || JSON.stringify({
    totalJumps: record.totalJumps,
    avgJumpHeight: record.avgJumpHeight ? String(record.avgJumpHeight) : "0",
    maxJumpHeight: record.maxJumpHeight ? String(record.maxJumpHeight) : "0",
    jumpVolume: record.jumpVolume ? String(record.jumpVolume) : "0",
    jumpsOver40cm: record.jumpsOver40cm,
    jumpZone1Count: record.jumpZone1Count,
    jumpZone2Count: record.jumpZone2Count,
    jumpZone3Count: record.jumpZone3Count,
    jumpZone4Count: record.jumpZone4Count,
    jumpZone5Count: record.jumpZone5Count,
    totalLoad: record.totalLoad ? String(record.totalLoad) : "0",
    avgLoad: record.avgLoad ? String(record.avgLoad) : "0",
    rawMenuData: record.rawMenuData,
    accelCount: record.accelCount,
    avgAcceleration: record.avgAcceleration ? String(record.avgAcceleration) : "0",
    maxAcceleration: record.maxAcceleration ? String(record.maxAcceleration) : "0",
    accelVolume: record.accelVolume ? String(record.accelVolume) : "0",
    isAnomaly: record.isAnomaly,
    anomalyDetails: record.anomalyDetails
  });

  const finalLoad = metricsToCorrect.includes("totalLoad") ? correctedLoad : Number(record.totalLoad || 0);
  const finalJumps = metricsToCorrect.includes("totalJumps") ? correctedJumps : record.totalJumps;
  const finalHeight = metricsToCorrect.includes("totalJumps") ? correctedHeight : Number(record.avgJumpHeight || 0);
  const finalAvgAcc = metricsToCorrect.includes("accelCount") ? correctedAvgAcc : Number(record.avgAcceleration || 0);
  const finalAccelCount = metricsToCorrect.includes("accelCount") ? correctedAccel : record.accelCount;

  // 4. アップデートフィールドの構築 (指定された項目と関連指標を補正)
  const updateFields = {
    totalJumps: finalJumps,
    avgJumpHeight: finalHeight.toFixed(2),
    maxJumpHeight: metricsToCorrect.includes("totalJumps") ? correctedMaxHeight.toFixed(2) : record.maxJumpHeight,
    jumpVolume: ((finalJumps * finalHeight) / 100).toFixed(2),
    jumpsOver40cm: metricsToCorrect.includes("totalJumps") ? correctedOver40 : record.jumpsOver40cm,
    jumpZone1Count: metricsToCorrect.includes("totalJumps") ? correctedZone1 : record.jumpZone1Count,
    jumpZone2Count: metricsToCorrect.includes("totalJumps") ? correctedZone2 : record.jumpZone2Count,
    jumpZone3Count: metricsToCorrect.includes("totalJumps") ? correctedZone3 : record.jumpZone3Count,
    jumpZone4Count: metricsToCorrect.includes("totalJumps") ? correctedZone4 : record.jumpZone4Count,
    jumpZone5Count: metricsToCorrect.includes("totalJumps") ? correctedZone5 : record.jumpZone5Count,
    
    totalLoad: finalLoad.toFixed(2),
    avgLoad: metricsToCorrect.includes("totalLoad") ? correctedAvgLoad.toFixed(2) : record.avgLoad,
    rawMenuData: JSON.stringify({
      loads: metricsToCorrect.includes("totalLoad") ? {
        "W-up": Number((finalLoad * 0.15).toFixed(1)),
        "6v6": Number((finalLoad * 0.60).toFixed(1)),
        "Individual": Number((finalLoad * 0.25).toFixed(1))
      } : (
        (() => {
          try {
            const p = JSON.parse(record.rawMenuData || "{}");
            return p.loads || p;
          } catch(e) { return {}; }
        })()
      ),
      ima: metricsToCorrect.includes("accelCount") ? {
        "W-up": Math.round(finalAccelCount * 0.10),
        "6v6": Math.round(finalAccelCount * 0.70),
        "Individual": Math.round(finalAccelCount * 0.20)
      } : (
        (() => {
          try {
            const p = JSON.parse(record.rawMenuData || "{}");
            return p.ima || {};
          } catch(e) { return {}; }
        })()
      )
    }),

    accelCount: finalAccelCount,
    avgAcceleration: finalAvgAcc.toFixed(2),
    maxAcceleration: metricsToCorrect.includes("accelCount") ? correctedMaxAcc.toFixed(2) : record.maxAcceleration,
    accelVolume: (finalAvgAcc * finalAccelCount).toFixed(2),

    isAnomaly: true,
    anomalyDetails: record.anomalyDetails || (metricsToCorrect.length === 0 ? "指導者により正常判定（補正なし）" : "指導者による手動判定・補正"),
    isCorrected: true,
    originalRawData: originalRawDataJson,
    updatedAt: new Date()
  };

  if (!db) {
    const idx = mockPerformanceData.findIndex(p => p.id === recordId);
    if (idx !== -1) {
      mockPerformanceData[idx] = {
        ...mockPerformanceData[idx],
        ...updateFields
      } as any;
    }
    saveMockStore();
  } else {
    await db.update(performanceData)
      .set(updateFields as any)
      .where(eq(performanceData.id, recordId));
  }
}

export async function getUncorrectedAnomalies(teamId: number) {
  const db = await getDb();
  let list: any[] = [];
  
  if (!db) {
    const athIds = mockAthletes.filter(a => a.teamId === teamId).map(a => a.id);
    list = mockPerformanceData.filter(p => 
      athIds.includes(p.athleteId) && 
      p.isAnomaly && 
      !p.isCorrected
    );
  } else {
    const athletesList = await db.select().from(athletes).where(eq(athletes.teamId, teamId));
    const athIds = athletesList.map(a => a.id);
    if (athIds.length > 0) {
      list = await db.select()
        .from(performanceData)
        .where(and(
          inArray(performanceData.athleteId, athIds),
          eq(performanceData.isAnomaly, true),
          eq(performanceData.isCorrected, false)
        ));
    }
  }

  const athletesData = await getAthletesByTeamId(teamId);
  return list.map(item => {
    const ath = athletesData.find(a => a.id === item.athleteId);
    return {
      id: item.id,
      athleteId: item.athleteId,
      athleteName: ath?.user?.name || `選手${ath?.jerseyNumber}`,
      jerseyNumber: ath?.jerseyNumber,
      position: ath?.position || "",
      date: item.date,
      anomalyDetails: item.anomalyDetails,
      totalJumps: item.totalJumps,
      totalLoad: item.totalLoad ? Number(item.totalLoad) : 0,
      maxJumpHeight: item.maxJumpHeight ? Number(item.maxJumpHeight) : 0
    };
  });
}

export async function rollbackPerformanceAnomaly(recordId: number): Promise<void> {
  const db = await getDb();
  
  // 1. 対象レコードを取得
  let record: any = null;
  if (!db) {
    record = mockPerformanceData.find(p => p.id === recordId);
  } else {
    const res = await db.select().from(performanceData).where(eq(performanceData.id, recordId)).limit(1);
    record = res[0] || null;
  }
  
  if (!record || !record.originalRawData) {
    throw new Error("元の生データが見つからないか、補正されていないため元に戻せません。");
  }

  const orig = JSON.parse(record.originalRawData);
  const rollbackFields = {
    totalJumps: orig.totalJumps,
    avgJumpHeight: orig.avgJumpHeight,
    maxJumpHeight: orig.maxJumpHeight,
    jumpVolume: orig.jumpVolume,
    jumpsOver40cm: orig.jumpsOver40cm,
    jumpZone1Count: orig.jumpZone1Count,
    jumpZone2Count: orig.jumpZone2Count,
    jumpZone3Count: orig.jumpZone3Count,
    jumpZone4Count: orig.jumpZone4Count,
    jumpZone5Count: orig.jumpZone5Count,
    totalLoad: orig.totalLoad,
    avgLoad: orig.avgLoad,
    rawMenuData: orig.rawMenuData,
    accelCount: orig.accelCount,
    avgAcceleration: orig.avgAcceleration,
    maxAcceleration: orig.maxAcceleration,
    accelVolume: orig.accelVolume,
    isAnomaly: orig.isAnomaly,
    anomalyDetails: orig.anomalyDetails,
    isCorrected: false,
    originalRawData: null,
    updatedAt: new Date()
  };

  if (!db) {
    const idx = mockPerformanceData.findIndex(p => p.id === recordId);
    if (idx !== -1) {
      mockPerformanceData[idx] = {
        ...mockPerformanceData[idx],
        ...rollbackFields
      } as any;
    }
    saveMockStore();
  } else {
    await db.update(performanceData)
      .set(rollbackFields as any)
      .where(eq(performanceData.id, recordId));
  }
}


