import { describe, expect, it, beforeEach } from "vitest";
import { importPerformanceCsv, getPerformanceDataByAthleteId, getImportStatusByMonth, resetMockStore } from "../server/db";

describe("Catapult CSV Import Unit Tests", () => {
  beforeEach(() => {
    resetMockStore();
  });

  it("should successfully parse and aggregate event-log CSV data to the mock data store", async () => {
    // 1. Check initial records for Sakura (athleteId = 1)
    const initialRecords = await getPerformanceDataByAthleteId(1);
    const initialLength = initialRecords.length;

    // 2. Event-log CSV format with Sakura's data
    const sampleCsv = `Category,Tag,start_time,DF Event,Intensity,Duration,Height (m),Basketball Load
20 Wada,IMA Accelerate,1783339200000,IMA Accelerate,1.77 Left,0.4,,
宮下 さくら,Basketball Jump,1783339201000,Basketball Jumping,1.04 Left,1.16,0.35,1.04
宮下 さくら,IMA Jump,1783339202000,IMA Jump,,0.35,0.58,
宮下 さくら,IMA Accelerate,1783339203000,IMA Accelerate,4.20 Left,0.22,,`;

    // 3. Import
    const result = await importPerformanceCsv(1, 1, sampleCsv, "test_import.csv");
    expect(result.success).toBe(true);
    expect(result.importedCount).toBe(1); // One aggregated record for Sakura

    // 4. Verify record was added
    const afterRecords = await getPerformanceDataByAthleteId(1);
    expect(afterRecords.length).toBe(initialLength + 1);

    // 5. Verify values of the imported record
    const latestImport = afterRecords[afterRecords.length - 1];
    expect(Number(latestImport.maxJumpHeight)).toBe(58); // max of 35cm and 58cm
    expect(Number(latestImport.totalLoad)).toBe(6.28); // 4.20 + 1.04 + 1.04 = 6.28
    expect(latestImport.totalJumps).toBe(2); // 2 jump rows
  });

  it("should handle English headers and calculate sessionType based on day of week", async () => {
    const initialRecords = await getPerformanceDataByAthleteId(2); // Hinata
    const initialLength = initialRecords.length;

    // 2026-07-05 is a Sunday, ensuring sessionType is "match"
    const matchTime = new Date("2026-07-05T12:00:00").getTime();
    const sampleCsv = `Category,Tag,start_time,DF Event,Intensity,Duration,Height (m),Basketball Load
日向 ひなた,Basketball Jump,${matchTime},Basketball Jumping,2.00 Left,1.2,0.715,1.5
日向 ひなた,IMA Accelerate,${matchTime + 1000},IMA Accelerate,4.80 Decel,0.5,,`;

    const result = await importPerformanceCsv(1, 1, sampleCsv, "test_import_en.csv");
    expect(result.success).toBe(true);
    expect(result.importedCount).toBe(1);

    const afterRecords = await getPerformanceDataByAthleteId(2);
    expect(afterRecords.length).toBe(initialLength + 1);

    const latestImport = afterRecords[afterRecords.length - 1];
    expect(Number(latestImport.maxJumpHeight)).toBe(71.5);
    expect(Number(latestImport.totalLoad)).toBe(8.30); // 2.00 + 1.5 + 4.80 = 8.30
    expect(latestImport.sessionType).toBe("match");
  });

  it("should skip rows where the athlete is not found in the team", async () => {
    const sampleCsv = `Category,Tag,start_time,DF Event,Intensity,Duration,Height (m),Basketball Load
99 存在しない選手,IMA Accelerate,1783339200000,IMA Accelerate,1.77 Left,0.4,,`;

    const result = await importPerformanceCsv(1, 1, sampleCsv, "test_unknown_athlete.csv");
    expect(result.success).toBe(true);
    expect(result.importedCount).toBe(0); // Should skip since athlete doesn't exist
    expect(result.unregisteredAthletes).toContain("存在しない選手 (No.99)");
  });

  it("should parse menu-based player load CSV and aggregate daily sum per athlete", async () => {
    const initialRecords = await getPerformanceDataByAthleteId(1); // Sakura
    const initialLength = initialRecords.length;

    // Menu load format: Period/Category, Jersey No, Date, Player Load
    const sampleCsv = `Period,Jersey No,Date,Player Load
W-up - Sakura,1,2026-06-25,69.08
Ball game - Sakura,1,2026-06-25,44.93
Ball control - Sakura,1,2026-06-25,152.35`;

    const result = await importPerformanceCsv(1, 1, sampleCsv, "test_menu_load.csv");
    expect(result.success).toBe(true);
    expect(result.importedCount).toBe(1);

    const afterRecords = await getPerformanceDataByAthleteId(1);
    expect(afterRecords.length).toBe(initialLength + 1);

    const latestImport = afterRecords.find(p => formatDateKey(p.date) === "2026-06-25");
    expect(latestImport).toBeDefined();
    expect(Number(latestImport!.totalLoad)).toBe(266.36); // 69.08 + 44.93 + 152.35 = 266.36
    expect(latestImport!.maxJumpHeight).toBeNull(); // No jump data in this CSV
  });

  it("should merge/UPSERT data when a record for the same day and athlete already exists", async () => {
    // 1. Create a day for Sakura with jump data
    const dateObj = new Date("2026-06-26T12:00:00");
    const dateStr = formatDateKey(dateObj);
    
    // Jump CSV
    const jumpCsv = `Category,Tag,start_time,DF Event,Intensity,Duration,Height (m),Basketball Load
宮下 さくら,Basketball Jump,${dateObj.getTime()},Basketball Jumping,,1.2,0.45,`;

    const jumpResult = await importPerformanceCsv(1, 1, jumpCsv, "test_upsert_jumps.csv");
    expect(jumpResult.success).toBe(true);

    const records1 = await getPerformanceDataByAthleteId(1);
    const jumpRecord = records1.find(p => formatDateKey(p.date) === "2026-06-26");
    expect(jumpRecord).toBeDefined();
    expect(Number(jumpRecord!.maxJumpHeight)).toBe(45);
    expect(jumpRecord!.totalLoad).toBeNull();

    // 2. Upload Load CSV for the same day
    const loadCsv = `Period,Jersey No,Date,Player Load
Ball game - Sakura,1,${dateStr},120.50`;

    const loadResult = await importPerformanceCsv(1, 1, loadCsv, "test_upsert_load.csv");
    expect(loadResult.success).toBe(true);

    // 3. Verify it was merged (no new record, just updated fields)
    const records2 = await getPerformanceDataByAthleteId(1);
    expect(records2.length).toBe(records1.length); // Count remains same

    const mergedRecord = records2.find(p => formatDateKey(p.date) === "2026-06-26");
    expect(mergedRecord).toBeDefined();
    expect(Number(mergedRecord!.maxJumpHeight)).toBe(45); // Jump data preserved
    expect(Number(mergedRecord!.totalLoad)).toBe(120.50); // Load data merged
  });

  it("should detect unregistered athletes in menu-based player load CSV", async () => {
    const sampleCsv = `Period,Jersey No,Date,Player Load
W-up - 存在しない選手A,99,2026-06-25,69.08
Ball game - 存在しない選手B,100,2026-06-25,44.93`;

    const result = await importPerformanceCsv(1, 1, sampleCsv, "test_menu_load_unknown.csv");
    expect(result.success).toBe(true);
    expect(result.importedCount).toBe(0);
    expect(result.unregisteredAthletes).toContain("存在しない選手A (No.99)");
    expect(result.unregisteredAthletes).toContain("存在しない選手A (No.99)");
    expect(result.unregisteredAthletes).toContain("存在しない選手B (No.100)");
  });

  it("should successfully retrieve and aggregate CSV import status by month", async () => {
    // 1. 2026-06-28 IMA
    const time28 = new Date("2026-06-28T12:00:00");
    const imaCsv = `Category,Tag,start_time,DF Event,Intensity,Duration,Height (m),Basketball Load
宮下 さくら,Basketball Jump,${time28.getTime()},Basketball Jumping,,1.2,0.45,`;
    await importPerformanceCsv(1, 1, imaCsv, "test_status_28.csv");

    // 2. 2026-06-29 Player Load
    const loadCsv = `Period,Jersey No,Date,Player Load
Ball game - Sakura,1,2026-06-29,150.00`;
    await importPerformanceCsv(1, 1, loadCsv, "test_status_29.csv");

    // 3. 2026-06-30 both
    const time30 = new Date("2026-06-30T12:00:00");
    const dualImaCsv = `Category,Tag,start_time,DF Event,Intensity,Duration,Height (m),Basketball Load
宮下 さくら,Basketball Jump,${time30.getTime()},Basketball Jumping,,1.2,0.40,`;
    await importPerformanceCsv(1, 1, dualImaCsv, "test_status_30_ima.csv");

    const dualLoadCsv = `Period,Jersey No,Date,Player Load
Ball game - Sakura,1,2026-06-30,200.00`;
    await importPerformanceCsv(1, 1, dualLoadCsv, "test_status_30_load.csv");

    // 4. Run database query function
    const status = await getImportStatusByMonth(1, 2026, 6);

    // 5. Verification
    const day28 = status.find(s => s.date === "2026-06-28");
    expect(day28).toBeDefined();
    expect(day28!.hasIma).toBe(true);
    expect(day28!.hasPlayerLoad).toBe(false);

    const day29 = status.find(s => s.date === "2026-06-29");
    expect(day29).toBeDefined();
    expect(day29!.hasIma).toBe(false);
    expect(day29!.hasPlayerLoad).toBe(true);

    const day30 = status.find(s => s.date === "2026-06-30");
    expect(day30).toBeDefined();
    expect(day30!.hasIma).toBe(true);
    expect(day30!.hasPlayerLoad).toBe(true);
  });

  it("should parse Wellness (Onetap) EAV format and map scaled metrics", async () => {
    const csv = `日付\t選手名\tチーム内ID\t項目名\t値\t内訳\t備考\tポジション
2026/6/1\t宮下 さくら\t16\t疲労感\t80\t\t\tOH
2026/6/1\t宮下 さくら\t16\t気分・モチベーション\t90\t\t\tOH
2026/6/1\t宮下 さくら\t16\t食欲\t70\t\t\tOH`;

    const result = await importPerformanceCsv(1, 1, csv, "onetap_wellness.csv");
    expect(result.success).toBe(true);

    const records = await getPerformanceDataByAthleteId(1);
    const latest = records.find(p => formatDateKey(p.date) === "2026-06-01");
    expect(latest).toBeDefined();
    expect(Number(latest!.wellnessFatigue)).toBe(8); // scaled to 1-10
    expect(Number(latest!.wellnessSleep)).toBe(7);    // appetite mapped to sleep dummy
    expect(Number(latest!.wellnessStress)).toBe(9);   // motivation mapped to stress
  });

  it("should parse sRPE format, sum Session RPE, and find max RPE", async () => {
    const csv = `トレーニング実施日,チーム内ID/番号,選手,セッション名称,分類,RPE,Session RPE
2026/6/2,1,宮下 さくら,WT,Weight,4,360
2026/6/2,1,宮下 さくら,Ball,Skill,6,480`;

    const result = await importPerformanceCsv(1, 1, csv, "srpe_june.csv");
    expect(result.success).toBe(true);

    const records = await getPerformanceDataByAthleteId(1);
    const latest = records.find(p => formatDateKey(p.date) === "2026-06-02");
    expect(latest).toBeDefined();
    expect(latest!.sRPE).toBe(840);    // 360 + 480
    expect(latest!.rpeValue).toBe(6);  // max of 4 and 6
  });

  it("should parse SOXAI format using email headers", async () => {
    const csv = `sakura@example.com
タイムスタンプ,QoLスコア,睡眠スコア,睡眠時間,就寝時間,起床時間,仮眠時間,入眠潜時,睡眠効率,中途覚醒時間,レム睡眠時間,浅い睡眠時間,深い睡眠時間,睡眠中の1分あたり平均呼吸数,安静時心拍数(睡眠時),安静時心拍変動（睡眠時）
2026/06/03,72,85,07:04,23:43,06:47,0,41,0.97,9,107,200,108,13.7,52,81.5`;

    const result = await importPerformanceCsv(1, 1, csv, "soxai.csv");
    expect(result.success).toBe(true);

    const records = await getPerformanceDataByAthleteId(1);
    const latest = records.find(p => formatDateKey(p.date) === "2026-06-03");
    expect(latest).toBeDefined();
    expect(Number(latest!.wellnessSleep)).toBe(9); // scaled sleep score
    expect(Number(latest!.hrv)).toBe(81.5);
    expect(latest!.avgHeartRate).toBe(52);
  });

  it("should parse Catapult IMA event log and calculate jump zones", async () => {
    const csv = `Category,Tag,start_time,event_time,end_time,Athlete,Position,Period,athlete_id,period_id,OF Event,Intensity (m/s),Direction,Duration,Movement Type,Basketball Load,Jump Attribute,Height (m)
1 宮下 さくら,Basketball Jumping,1782890000000,1782890000000,1782890000000,宮下 さくら,,Individual,1,1,Basketball Jumping,,,1,Jumping,,1.09,0.45
1 宮下 さくら,Basketball Jumping,1782890001000,1782890001000,1782890001000,宮下 さくら,,Individual,1,1,Basketball Jumping,,,1,Jumping,,1.09,0.35`;

    const result = await importPerformanceCsv(1, 1, csv, "catapult_ima.csv");
    expect(result.success).toBe(true);

    const records = await getPerformanceDataByAthleteId(1);
    // Find record by matching epoch timestamp date (approx June 2026 or dynamic eventTime fallback)
    const latest = records[records.length - 1]; 
    expect(latest).toBeDefined();
    expect(Number(latest.maxJumpHeight)).toBe(45);
    expect(Number(latest.avgJumpHeight)).toBe(40); // (45 + 35) / 2
    expect(latest.totalJumps).toBe(2);
    expect(latest.jumpsOver40cm).toBe(1);
    expect(latest.jumpZone3Count).toBe(1); // 30-40cm zone (35cm)
    expect(latest.jumpZone4Count).toBe(1); // 40-50cm zone (45cm)
  });
});

function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
