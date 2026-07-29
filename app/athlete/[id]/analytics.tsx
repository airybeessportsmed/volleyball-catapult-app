import React, { useState, useMemo } from "react";
import { ScrollView, Text, View, TouchableOpacity, ActivityIndicator, useWindowDimensions, Modal } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import Svg, { Circle, Rect, Line, Text as SvgText, Path, Polyline } from "react-native-svg";

export const METRICS_MAP = [
  { key: "totalJumps", label: "ジャンプ量", desc: "外的負荷: ジャンプ回数", unit: "回", polarity: "positive", category: "load_ext" },
  { key: "sRPE", label: "sRPE(全体)", desc: "内の負荷: 練習強度×時間", unit: "AU", polarity: "positive", category: "load_int" },
  { key: "hrv", label: "HRV (心拍変動)", desc: "客観状態: 自律神経回復指標", unit: "ms", polarity: "positive", category: "state_obj" },
  { key: "wellnessSleep", label: "睡眠スコア (SOXAI)", desc: "客観状態: SOXAI睡眠総合スコア", unit: "点", polarity: "positive", category: "state_obj" },
  { key: "soxaiSleepDuration", label: "睡眠時間 (SOXAI)", desc: "客観状態: 実睡眠時間", unit: "分", polarity: "positive", category: "state_obj" },
  { key: "soxaiBedTime", label: "全就床時間 (SOXAI)", desc: "客観状態: ベッドに入っていた時間", unit: "分", polarity: "positive", category: "state_obj" },
  { key: "soxaiAwakeTime", label: "中途覚醒時間 (SOXAI)", desc: "客観状態: 睡眠中に目が覚めていた時間", unit: "分", polarity: "negative", category: "state_obj" },
  { key: "soxaiRemSleep", label: "レム睡眠時間 (SOXAI)", desc: "客観状態: 浅いレム睡眠の時間", unit: "分", polarity: "positive", category: "state_obj" },
  { key: "soxaiLightSleep", label: "浅い睡眠時間 (SOXAI)", desc: "客観状態: ノンレム浅い睡眠の時間", unit: "分", polarity: "positive", category: "state_obj" },
  { key: "soxaiDeepSleep", label: "深い睡眠時間 (SOXAI)", desc: "客観状態: ノンレム深い睡眠の時間", unit: "分", polarity: "positive", category: "state_obj" },
  { key: "soxaiSleepEfficiency", label: "睡眠効率 (SOXAI)", desc: "客観状態: 睡眠効率割合", unit: "%", polarity: "positive", category: "state_obj" },
  { key: "soxaiBedTimeStr", label: "就床時刻 (SOXAI)", desc: "客観状態: ベッドに入った時刻", unit: "時刻", polarity: "positive", category: "state_obj" },
  { key: "soxaiWakeTimeStr", label: "起床時刻 (SOXAI)", desc: "客観状態: 目が覚めた時刻", unit: "時刻", polarity: "positive", category: "state_obj" },
  { key: "wellnessFatigue", label: "主観的疲労感", desc: "主観状態: コンディション・元気度", unit: "点", polarity: "positive", category: "state_subj" },
  { key: "wellnessSoreness", label: "食欲", desc: "主観状態: 内臓疲労・食欲", unit: "点", polarity: "positive", category: "state_subj" },
  { key: "wellnessStress", label: "気分・モチベーション", desc: "主観状態: 精神的コンディション", unit: "点", polarity: "positive", category: "state_subj" },
  { key: "totalDistance", label: "総走行距離", desc: "外的負荷: 移動距離", unit: "m", polarity: "positive", category: "load_ext" },
  { key: "highIntensityDistance", label: "高速走行距離", desc: "外的負荷: 高速移動距離", unit: "m", polarity: "positive", category: "load_ext" },
  { key: "avgHeartRate", label: "平均心拍数", desc: "客観負荷: 循環器系負荷", unit: "bpm", polarity: "positive", category: "load_int" },
  { key: "physiologicalMarker", label: "生理学マーカー(CK)", desc: "客観状態: 血液生化学(筋肉損傷)", unit: "U/L", polarity: "positive", category: "state_obj" },
] as const;

function ZScoreBar({ label, zScore = 0, status = "green", val = 0, baselineMean = 0, unit = "", history = [], polarity = "positive" }: {
  label: string;
  zScore?: number;
  status?: "green" | "yellow" | "red";
  val?: number;
  baselineMean?: number;
  unit?: string;
  history?: number[];
  polarity?: "positive" | "negative";
}) {
  const sparklineWidth = 55;
  const sparklineHeight = 22;
  let sparklinePoints = "";
  
  const safeZScore = isNaN(zScore) || !isFinite(zScore) ? 0 : zScore;
  const safeBaselineMean = isNaN(baselineMean) || !isFinite(baselineMean) ? 0 : baselineMean;
  const safeVal = isNaN(val) || !isFinite(val) ? 0 : val;
  const safeHistory = Array.isArray(history) ? history.filter(v => v !== null && !isNaN(v) && isFinite(v)) : [];

  if (safeHistory.length > 1) {
    const minVal = Math.min(...safeHistory);
    const maxVal = Math.max(...safeHistory);
    const valDiff = maxVal - minVal;
    const stepX = sparklineWidth / (safeHistory.length - 1);
    
    const pts = safeHistory.map((v, idx) => {
      const x = idx * stepX;
      const y = sparklineHeight - 3 - (valDiff > 0 ? ((v - minVal) / valDiff) * (sparklineHeight - 6) : (sparklineHeight - 6) / 2);
      return `${x},${y}`;
    });
    sparklinePoints = pts.join(" ");
  }

  const pinPercent = Math.min(100, Math.max(0, ((safeZScore + 3) / 6) * 100));
  
  let reliabilityText = "データ不足";
  let reliabilityBg = "#E2E8F0";
  let reliabilityColor = "#64748B";
  
  if (safeHistory.length >= 14) {
    reliabilityText = "信頼性 高";
    reliabilityBg = "#DBEAFE";
    reliabilityColor = "#1D4ED8";
  } else if (safeHistory.length >= 7) {
    reliabilityText = "信頼性 中";
    reliabilityBg = "#FEF3C7";
    reliabilityColor = "#D97706";
  } else if (safeHistory.length >= 3) {
    reliabilityText = "信頼性 低";
    reliabilityBg = "#FEE2E2";
    reliabilityColor = "#DC2626";
  }

  const positiveColors = ["#D0E1FD", "#E2F0D9", "#E2F0D9", "#FFF2CC", "#FCE4D6"];
  const negativeColors = ["#FCE4D6", "#FFF2CC", "#E2F0D9", "#E2F0D9", "#D0E1FD"];
  const colors = polarity === "positive" ? positiveColors : negativeColors;

  const getPinColor = (s: string) => {
    if (s === "red") return "#C00000";
    if (s === "yellow") return "#7F6000";
    return "#385723";
  };

  const diffMaxMin = safeHistory.length > 0 ? Math.max(...safeHistory) - Math.min(...safeHistory) : 0;
  const lastHistoryVal = safeHistory.length > 0 ? safeHistory[safeHistory.length - 1] : 0;
  const minHistoryVal = safeHistory.length > 0 ? Math.min(...safeHistory) : 0;

  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginVertical: 6, paddingVertical: 4, borderBottomWidth: 1, borderColor: "#F1F5F9" }}>
      <View style={{ width: 105, gap: 2 }}>
        <Text style={{ fontSize: 12, color: "#1E293B", fontWeight: "bold" }}>{label}</Text>
        {safeHistory.length > 1 ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            <Svg width={sparklineWidth} height={sparklineHeight}>
              <Polyline
                fill="none"
                stroke="#FF6B35"
                strokeWidth="1.5"
                points={sparklinePoints}
              />
              <Circle
                cx={sparklineWidth}
                cy={sparklineHeight - 3 - (diffMaxMin > 0 ? ((lastHistoryVal - minHistoryVal) / diffMaxMin) * (sparklineHeight - 6) : (sparklineHeight - 6) / 2)}
                r="2.5"
                fill="#FF6B35"
              />
            </Svg>
          </View>
        ) : (
          <Text style={{ fontSize: 8, color: "#CBD5E1", fontStyle: "italic" }}>データ蓄積中</Text>
        )}
      </View>

      <View style={{ width: 85, gap: 1 }}>
        <Text style={{ fontSize: 11, fontWeight: "bold", color: "#1E293B" }}>
          {safeVal % 1 === 0 ? safeVal : safeVal.toFixed(1)} <Text style={{ fontSize: 8, fontWeight: "normal", color: "#64748B" }}>{unit}</Text>
        </Text>
        <Text style={{ fontSize: 8, color: "#94A3B8" }}>
          基準: {safeBaselineMean.toFixed(1)}
        </Text>
      </View>

      <View style={{ flex: 1, height: 26, justifyContent: "center", position: "relative" }}>
        <View style={{ flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: "#E2E8F0" }}>
          <View style={{ flex: 1.5, backgroundColor: colors[0] }} />
          <View style={{ flex: 0.5, backgroundColor: colors[1] }} />
          <View style={{ flex: 2, backgroundColor: colors[2] }} />
          <View style={{ flex: 0.5, backgroundColor: colors[3] }} />
          <View style={{ flex: 1.5, backgroundColor: colors[4] }} />
        </View>

        <View style={{ position: "absolute", left: "50%", top: 4, bottom: 4, width: 1.5, backgroundColor: "#64748B", zIndex: 1 }} />

        <View style={{ position: "absolute", left: `${pinPercent}%`, marginLeft: -4, top: 2, width: 8, height: 16, zIndex: 10, alignItems: "center" }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: getPinColor(status), borderWidth: 1.5, borderColor: "#FFFFFF" }} />
          <View style={{ width: 1.5, height: 8, backgroundColor: getPinColor(status) }} />
        </View>
        
        <Text style={{ position: "absolute", left: `${Math.min(80, Math.max(0, pinPercent - 15))}%`, bottom: -6, fontSize: 8, fontWeight: "bold", color: getPinColor(status) }}>
          {safeZScore > 0 ? `+${safeZScore.toFixed(1)}` : safeZScore.toFixed(1)} SD
        </Text>
      </View>

      <View style={{ width: 65, alignItems: "flex-end" }}>
        <View style={{ backgroundColor: reliabilityBg, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 }}>
          <Text style={{ fontSize: 8, fontWeight: "bold", color: reliabilityColor }}>
            {reliabilityText}
          </Text>
        </View>
      </View>
    </View>
  );
}

const getYesterday = (dateStr: string) => {
  try {
    const d = new Date(dateStr);
    d.setDate(d.getDate() - 1);
    return d.toLocaleDateString("sv-SE");
  } catch (e) {
    return dateStr;
  }
};

const formatDateLabel = (dateStr: string) => {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch (e) {
    return dateStr;
  }
};

export default function AthleteAnalyticsScreen() {
  const { width: windowWidth } = useWindowDimensions();
  const { id } = useLocalSearchParams();
  const athleteId = Number(id);
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<"summary" | "jumps" | "menu" | "comparison" | "sleep">("summary");
  const [rawDate, setRawDate] = useState(new Date().toLocaleDateString("sv-SE"));
  const [acwrMetric, setAcwrMetric] = useState<"totalLoad" | "jumpVolume" | "accelVolume">("totalLoad");
  const [menuMetric, setMenuMetric] = useState<"load" | "ima">("load");
  const [chartLeftMetric, setChartLeftMetric] = useState<string>("totalLoad");
  const [chartRightMetric, setChartRightMetric] = useState<string>("sRPE");
  const [metricSelectorModalOpen, setMetricSelectorModalOpen] = useState(false);
  const [selectorTargetAxis, setSelectorTargetAxis] = useState<"left" | "right">("left");
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1);
  const [correctLoad, setCorrectLoad] = useState(true);
  const [correctJumps, setCorrectJumps] = useState(true);
  const [correctAccel, setCorrectAccel] = useState(true);

  // Fetch specific athlete profile
  const { data: athlete, isLoading: athleteLoading } = trpc.athlete.getById.useQuery(
    { id: athleteId },
    { enabled: !!athleteId }
  );

  // Fetch full analytics dashboard data for this athlete
  const { data: analytics, isLoading: analyticsLoading, isFetching, refetch } = trpc.performance.getAthleteAnalytics.useQuery(
    { athleteId: athleteId || 0, date: rawDate, acwrMetric },
    { 
      enabled: !!athleteId,
      placeholderData: (prev) => prev
    }
  );

  // Automatically adjust selected date state to match the returned actual session date.
  // This ensures if a player has pre-entered today's wellness check but has no catapult load data yet,
  // we fallback to the latest training day and display that day in the calendar header.
  React.useEffect(() => {
    if (analytics?.latestSession?.date) {
      const actualDate = new Date(analytics.latestSession.date);
      const actualDateStr = actualDate.toLocaleDateString("sv-SE");
      if (actualDateStr !== rawDate) {
        setRawDate(actualDateStr);
        setCalYear(actualDate.getFullYear());
        setCalMonth(actualDate.getMonth() + 1);
      }
    }
  }, [analytics?.latestSession?.date, rawDate]);

  const correctAnomalyMutation = trpc.performance.correctAnomaly.useMutation();
  const rollbackAnomalyMutation = trpc.performance.rollbackAnomaly.useMutation();

  // Show full screen indicator only on initial load (when we don't have any analytics data yet)
  if (athleteLoading || (analyticsLoading && !analytics)) {
    return (
      <ScreenContainer className="flex items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#FF6B35" />
      </ScreenContainer>
    );
  }

  if (!athlete) {
    return (
      <ScreenContainer className="flex items-center justify-center bg-background p-6">
        <View className="bg-surface rounded-3xl border border-border p-8 items-center justify-center gap-4 max-w-sm shadow-sm">
          <IconSymbol size={48} name="info.circle.fill" color="#FF6B35" />
          <Text className="text-lg font-bold text-foreground text-center">選手が見つかりません</Text>
          <Text className="text-sm text-muted text-center leading-relaxed">
            指定されたIDの選手データが存在しないか、アクセス権がありません。
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  if (!analytics || !analytics.latestSession) {
    return (
      <ScreenContainer className="bg-background">
        <View className="px-6 py-4 border-b border-border bg-surface flex-row items-center gap-3">
          <TouchableOpacity onPress={() => router.back()} className="p-1">
            <IconSymbol size={20} name="chevron.left" color="#4B5563" />
          </TouchableOpacity>
          <View>
            <Text className="text-xl font-bold text-foreground">トレンド分析</Text>
            <Text className="text-xs text-muted">
              {(athlete as any).user?.name} | {athlete.position || "ポジション未設定"} #{athlete.jerseyNumber || ""}
            </Text>
          </View>
        </View>
        <View className="flex-1 items-center justify-center p-6 gap-4">
          <View className="w-16 h-16 bg-muted/20 rounded-full items-center justify-center">
            <IconSymbol size={28} name="doc.text.fill" color="#9CA3AF" />
          </View>
          <Text className="text-base font-bold text-foreground text-center">データが見つかりません</Text>
          <Text className="text-xs text-muted text-center max-w-xs leading-relaxed">
            この選手にインポートされたCatapultデータがまだありません。インポート画面からCSVデータを読み込んでください。
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  const latest = analytics.latestSession;

  // ----------------------------------------------------
  // ACWR Indicator rendering helpers
  // ----------------------------------------------------
  const renderACWRGauge = () => {
    const acwrVal = analytics.acwr.acwr;
    const acute = analytics.acwr.acute;
    const chronic = analytics.acwr.chronic;
    const status = analytics.acwr.status;

    const safeAcwrVal = isNaN(acwrVal) || !isFinite(acwrVal) ? 1.0 : acwrVal;
    const safeAcute = isNaN(acute) || !isFinite(acute) ? 0.0 : acute;
    const safeChronic = isNaN(chronic) || !isFinite(chronic) ? 0.0 : chronic;

    const clampedVal = Math.max(0.0, Math.min(2.0, safeAcwrVal));
    const percent = (clampedVal / 2.0) * 100;

    let statusText = "適正負荷";
    let statusDesc = "怪我のリスクが低く、効率良くトレーニングができています。";
    let statusColor = "text-emerald-500";
    let statusBg = "bg-emerald-500/10";

    if (status === "underwork") {
      statusText = "アンダーワーク";
      statusDesc = "トレーニング負荷が不十分で、体力やパフォーマンスが低下するリスクがあります。";
      statusColor = "text-amber-500";
      statusBg = "bg-amber-500/10";
    } else if (status === "danger") {
      statusText = "オーバーワーク (危険)";
      statusDesc = "急激な負荷の上昇が検出されました。怪我のリスクが極めて高い危険ゾーンです！";
      statusColor = "text-red-500";
      statusBg = "bg-red-500/10";
    }

    return (
      <View className="bg-surface rounded-3xl border border-border p-5 shadow-sm gap-4">
        <View className="flex-row justify-between items-center">
          <View>
            <Text className="text-sm font-bold text-foreground">ACWR (急慢性負荷比)</Text>
            <Text className="text-[10px] text-muted font-medium">怪我予防のコンディショニング指標</Text>
          </View>
          <View className={`px-3 py-1 rounded-full ${statusBg}`}>
            <Text className={`text-xs font-bold ${statusColor}`}>{statusText}</Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", backgroundColor: "#F1F5F9", padding: 3, borderRadius: 12, marginVertical: 4 }}>
          {[
            { key: "totalLoad", label: "PlayerLoad" },
            { key: "jumpVolume", label: "Jump Volume" },
            { key: "accelVolume", label: "Accel Volume" }
          ].map(opt => {
            const isSelected = acwrMetric === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                onPress={() => setAcwrMetric(opt.key as any)}
                style={{
                  flex: 1,
                  paddingVertical: 6,
                  borderRadius: 9,
                  backgroundColor: isSelected ? "#FFFFFF" : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                  shadowColor: isSelected ? "#000" : "transparent",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: isSelected ? 0.1 : 0,
                  shadowRadius: 1,
                  elevation: isSelected ? 1 : 0
                }}
              >
                <Text style={{ fontSize: 10, fontWeight: "bold", color: isSelected ? "#0F172A" : "#64748B" }}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View className="gap-2.5 my-2">
          <View className="h-6 w-full bg-muted/30 rounded-full overflow-hidden flex-row border border-border/40 relative">
            <View style={{ width: "40%" }} className="bg-amber-500/10 h-full border-r border-border/10 justify-center pl-2">
              <Text className="text-[8px] text-amber-600 font-extrabold">低負荷</Text>
            </View>
            <View style={{ width: "35%" }} className="bg-emerald-500/20 h-full border-r border-border/10 justify-center pl-2">
              <Text className="text-[8px] text-emerald-600 font-extrabold">適正ゾーン (0.8~1.5)</Text>
            </View>
            <View style={{ width: "25%" }} className="bg-red-500/10 h-full justify-center pl-2">
              <Text className="text-[8px] text-red-600 font-extrabold">危険</Text>
            </View>

            <View 
              style={{ left: `${percent}%` as any, transform: [{ translateX: -6 }] }} 
              className="absolute -top-0.5 -bottom-0.5 w-3 bg-foreground border border-surface rounded-full shadow items-center justify-center"
            />
          </View>
          
          <View className="flex-row justify-between px-1">
            <Text className="text-[9px] text-muted font-mono font-medium">0.0 (休息)</Text>
            <Text className="text-[9px] text-muted font-mono font-medium">0.8</Text>
            <Text className="text-[9px] text-muted font-mono font-medium">1.5</Text>
            <Text className="text-[9px] text-muted font-mono font-medium">2.0+</Text>
          </View>
        </View>

        <View className="flex-row justify-between items-center bg-muted/10 p-3 rounded-2xl border border-border/40">
          <View className="items-center flex-1">
            <Text className="text-[9px] text-muted font-bold mb-0.5">ACWRスコア</Text>
            <Text className="text-xl font-extrabold text-foreground font-mono">{safeAcwrVal.toFixed(2)}</Text>
          </View>
          <View className="w-[1px] h-8 bg-border" />
          <View className="items-center flex-1">
            <Text className="text-[9px] text-muted font-bold mb-0.5">急性的負荷 (7日間平均)</Text>
            <Text className="text-base font-extrabold text-foreground font-mono">{safeAcute}</Text>
          </View>
          <View className="w-[1px] h-8 bg-border" />
          <View className="items-center flex-1">
            <Text className="text-[9px] text-muted font-bold mb-0.5">慢性的負荷 (28日間平均)</Text>
            <Text className="text-base font-extrabold text-foreground font-mono">{safeChronic}</Text>
          </View>
        </View>

        <Text className="text-[11px] text-muted leading-relaxed font-normal">{statusDesc}</Text>

        <View className="flex-row gap-3 mt-1">
          <View className="flex-1 bg-surface border border-border p-3 rounded-2xl flex-row items-center justify-between">
            <View className="gap-0.5">
              <Text className="text-[9px] text-muted font-bold">単調度 (Monotony)</Text>
              <Text className="text-[10px] text-muted font-normal">日々の練習負荷の偏り</Text>
            </View>
            <Text className="text-sm font-extrabold text-foreground font-mono">{analytics.monotony.monotony}</Text>
          </View>
          
          <View className="flex-1 bg-surface border border-border p-3 rounded-2xl flex-row items-center justify-between">
            <View className="gap-0.5">
              <Text className="text-[9px] text-muted font-bold">負担度 (Strain)</Text>
              <Text className="text-[10px] text-muted font-normal">疲労の蓄積予測値</Text>
            </View>
            <Text className="text-sm font-extrabold text-foreground font-mono">{analytics.monotony.strain}</Text>
          </View>
        </View>
      </View>
    );
  };

  // ----------------------------------------------------
  // Jump detail & Zone counts rendering helpers
  // ----------------------------------------------------
  const renderJumpAnalytics = () => {
    const z1 = latest.jumpZone1Count || 0;
    const z2 = latest.jumpZone2Count || 0;
    const z3 = latest.jumpZone3Count || 0;
    const z4 = latest.jumpZone4Count || 0;
    const z5 = latest.jumpZone5Count || 0;
    
    const zones = [
      { name: "Zone 1 (~30cm)", count: z1, color: "bg-blue-500/20 text-blue-700" },
      { name: "Zone 2 (30~35cm)", count: z2, color: "bg-cyan-500/20 text-cyan-700" },
      { name: "Zone 3 (35~40cm)", count: z3, color: "bg-amber-500/20 text-amber-700" },
      { name: "Zone 4 (40~50cm)", count: z4, color: "bg-orange-500/30 text-orange-700" },
      { name: "Zone 5 (50cm~)", count: z5, color: "bg-red-500/30 text-red-700" },
    ];
    
    const totalJumps = latest.totalJumps || 0;
    const jumpsOver40 = latest.jumpsOver40cm || 0;
    const ratio40 = totalJumps > 0 ? ((jumpsOver40 / totalJumps) * 100).toFixed(1) : "0.0";
    
    const maxCount = Math.max(...zones.map(z => z.count), 1);

    let menuJumps: Record<string, { count: number; volume: number; avg: number; max: number; top5Avg: number }> = {};
    try {
      if (latest.rawMenuData) {
        const parsed = typeof latest.rawMenuData === "string" ? JSON.parse(latest.rawMenuData) : latest.rawMenuData;
        if (parsed && parsed.jumpsDetail && parsed.jumpsDetail.menuJumps) {
          menuJumps = parsed.jumpsDetail.menuJumps;
        }
      }
    } catch (e) {
      console.warn("Failed to parse jumpsDetail", e);
    }

    return (
      <View className="bg-surface rounded-3xl border border-border p-5 shadow-sm gap-5">
        <View>
          <Text className="text-sm font-bold text-foreground">ジャンプ詳細分析</Text>
          <Text className="text-[10px] text-muted font-medium">高さ別のジャンプ強度とボリューム</Text>
        </View>

        <View className="flex-row gap-3">
          <View className="flex-1 bg-primary/5 border border-primary/10 p-3.5 rounded-2xl">
            <Text className="text-[9px] text-muted font-bold mb-1">Jump Volume (総ジャンプ高)</Text>
            <Text className="text-base font-extrabold text-primary font-mono">
              {latest.jumpVolume ? `${Number(latest.jumpVolume).toFixed(1)} m` : "--"}
            </Text>
          </View>
          <View className="flex-1 bg-secondary/5 border border-secondary/10 p-3.5 rounded-2xl">
            <Text className="text-[9px] text-muted font-bold mb-1">40cm以上の割合</Text>
            <Text className="text-base font-extrabold text-secondary font-mono">
              {ratio40}%
            </Text>
          </View>
        </View>

        <View className="flex-row gap-3">
          <View className="flex-1 bg-accent/5 border border-accent/10 p-3.5 rounded-2xl">
            <Text className="text-[9px] text-muted font-bold mb-1">平均ジャンプ高 (全数)</Text>
            <Text className="text-base font-extrabold text-accent font-mono">
              {latest.avgJumpHeight ? `${Number(latest.avgJumpHeight).toFixed(1)} cm` : "--"}
            </Text>
          </View>
          <View className="flex-1 bg-accent/5 border border-accent/10 p-3.5 rounded-2xl">
            <Text className="text-[9px] text-muted font-bold mb-1">平均ジャンプ高 (Top5)</Text>
            <Text className="text-base font-extrabold text-accent font-mono">
              {(latest as any).top5JumpHeight ? `${Number((latest as any).top5JumpHeight).toFixed(1)} cm` : "--"}
            </Text>
          </View>
        </View>

        <View className="gap-3">
          <Text className="text-xs font-bold text-foreground pb-1 border-b border-border/50">Zone分けジャンプ回数</Text>
          
          <View className="gap-3 mt-1">
            {zones.map((z, idx) => {
              const barPercent = `${(z.count / maxCount) * 100}%`;
              return (
                <View key={idx} className="flex-row items-center gap-3">
                  <Text className="text-[10px] font-bold text-muted w-24">{z.name}</Text>
                  <View className="flex-1 h-5 bg-muted/20 rounded-lg overflow-hidden relative justify-center">
                    <View 
                      style={{ width: barPercent as any }} 
                      className={`h-full ${z.color.split(" ")[0]} rounded-lg absolute`}
                    />
                    <Text className="text-[9px] font-extrabold text-foreground pl-2.5 z-10 font-mono">
                      {z.count} 回
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {Object.keys(menuJumps).length > 0 && (
          <View className="gap-3 mt-2">
            <Text className="text-xs font-bold text-foreground pb-1 border-b border-border/50">メニュー別ジャンプ詳細</Text>
            <View className="bg-muted/10 rounded-2xl border border-border/40 overflow-hidden">
              <View className="flex-row bg-muted/20 p-2.5 border-b border-border/40">
                <Text className="text-[9px] font-bold text-muted flex-2">メニュー名</Text>
                <Text className="text-[9px] font-bold text-muted flex-1 text-center">回数</Text>
                <Text className="text-[9px] font-bold text-muted flex-1 text-center">ボリューム</Text>
                <Text className="text-[9px] font-bold text-muted flex-1 text-center">平均</Text>
                <Text className="text-[9px] font-bold text-muted flex-1 text-center">最大</Text>
                <Text className="text-[9px] font-bold text-muted flex-1 text-center">Top5平均</Text>
              </View>
              {Object.entries(menuJumps).map(([mName, detail], idx) => (
                <View key={idx} className="flex-row p-2.5 border-b border-border/20 items-center">
                  <Text className="text-[9px] font-bold text-foreground flex-2">{mName}</Text>
                  <Text className="text-[9px] font-bold text-foreground flex-1 text-center">{detail.count}回</Text>
                  <Text className="text-[9px] font-bold text-foreground flex-1 text-center">{(detail.volume / 100).toFixed(2)}m</Text>
                  <Text className="text-[9px] font-bold text-foreground flex-1 text-center">{detail.avg.toFixed(1)}cm</Text>
                  <Text className="text-[9px] font-bold text-foreground flex-1 text-center">{detail.max.toFixed(1)}cm</Text>
                  <Text className="text-[9px] font-bold text-foreground flex-1 text-center">{detail.top5Avg.toFixed(1)}cm</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {!!latest.duration && (
          <View className="bg-muted/10 p-4 rounded-2xl border border-border/40 flex-row justify-between items-center">
            <View className="gap-0.5">
              <Text className="text-xs font-bold text-foreground">ジャンプ頻度</Text>
              <Text className="text-[10px] text-muted font-normal">練習時間1分間あたりのジャンプ数</Text>
            </View>
            <Text className="text-base font-extrabold text-foreground font-mono">
              {(() => {
                const durMin = Number(latest.duration) / 60;
                if (durMin <= 0 || isNaN(durMin) || !isFinite(durMin)) return "--";
                const freq = totalJumps / durMin;
                return isNaN(freq) || !isFinite(freq) ? "--" : freq.toFixed(2);
              })()} 回/分
            </Text>
          </View>
        )}
      </View>
    );
  };

  // ----------------------------------------------------
  // Menu-wise Load Breakdown rendering helpers
  // ----------------------------------------------------
  const renderMenuLoadAnalytics = () => {
    let menuLoads: Record<string, number> = {};
    let menuIma: Record<string, number> = {};
    let menuAccels: Record<string, { count: number; volume: number; avg: number; max: number; top5Avg: number }> = {};
    let zoneAccels = { under2_5: 0, between2_5_3_5: 0, over3_5: 0 };
    let directionAccels: Record<string, { count: number; volume: number }> = {};

    try {
      if (latest.rawMenuData) {
        const parsed = typeof latest.rawMenuData === "string" ? JSON.parse(latest.rawMenuData) : latest.rawMenuData;
        if (parsed && parsed.loads) {
          menuLoads = parsed.loads;
          menuIma = parsed.ima || {};
        } else {
          menuLoads = parsed || {};
          const totalIma = latest.accelCount || 0;
          const rawTotalLoad = latest.totalLoad ? Number(latest.totalLoad) : 0;
          const totalLoad = isNaN(rawTotalLoad) || !isFinite(rawTotalLoad) || rawTotalLoad <= 0 ? 1 : rawTotalLoad;
          Object.entries(menuLoads).forEach(([name, val]) => {
            const rawVal = Number(val);
            const safeRawVal = isNaN(rawVal) || !isFinite(rawVal) ? 0 : rawVal;
            menuIma[name] = Math.round((safeRawVal / totalLoad) * totalIma);
          });
        }

        if (parsed && parsed.accelsDetail) {
          menuAccels = parsed.accelsDetail.menuAccels || {};
          zoneAccels = parsed.accelsDetail.zoneAccels || zoneAccels;
          directionAccels = parsed.accelsDetail.directionAccels || {};
        }
      }
    } catch (e) {
      console.warn("Failed to parse rawMenuData", e);
    }

    const isLoad = menuMetric === "load";
    const targetData = isLoad ? menuLoads : menuIma;

    const menuItems = Object.entries(targetData).map(([name, val]) => {
      const num = Number(val);
      return {
        name,
        value: isNaN(num) || !isFinite(num) || num < 0 ? 0 : num
      };
    }).sort((a, b) => b.value - a.value);

    const totalSum = menuItems.reduce((a, b) => a + b.value, 0) || 1;

    return (
      <View className="bg-surface rounded-3xl border border-border p-5 shadow-sm gap-5">
        <View className="flex-row justify-between items-start">
          <View>
            <Text className="text-sm font-bold text-foreground">
              {isLoad ? "練習メニュー別運動量 (PlayerLoad)" : "練習メニュー別加速回数 (IMA)"}
            </Text>
            <Text className="text-[10px] text-muted font-medium">
              {isLoad ? "メニューごとの負荷配分と自主練の運動量" : "メニューごとの加速・動作アクションの回数"}
            </Text>
          </View>

          {/* 指標切り替えセグメントトグル */}
          <View className="flex-row bg-muted/30 p-0.5 rounded-xl border border-border/40">
            <TouchableOpacity
              onPress={() => setMenuMetric("load")}
              className={`px-3 py-1.5 rounded-lg ${isLoad ? "bg-surface shadow-xs" : ""}`}
            >
              <Text className={`text-[10px] font-bold ${isLoad ? "text-foreground" : "text-muted"}`}>運動量</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setMenuMetric("ima")}
              className={`px-3 py-1.5 rounded-lg ${!isLoad ? "bg-surface shadow-xs" : ""}`}
            >
              <Text className={`text-[10px] font-bold ${!isLoad ? "text-foreground" : "text-muted"}`}>IMA加速</Text>
            </TouchableOpacity>
          </View>
        </View>

        {menuItems.length > 0 ? (
          <View className="gap-5">
            <View className="h-6 w-full rounded-full overflow-hidden flex-row border border-border/30 bg-muted/20">
              {menuItems.map((item, idx) => {
                const itemPercent = `${(item.value / totalSum) * 100}%`;
                const colors = [
                  "bg-primary",
                  "bg-secondary",
                  "bg-accent",
                  "bg-emerald-500",
                  "bg-indigo-500"
                ];
                const bgClass = colors[idx % colors.length];
                return (
                  <View 
                    key={idx} 
                    style={{ width: itemPercent as any }} 
                    className={`${bgClass} h-full`}
                  />
                );
              })}
            </View>

            <View className="gap-3">
              {menuItems.map((item, idx) => {
                const percentVal = ((item.value / totalSum) * 100).toFixed(1);
                const colors = [
                  "bg-primary text-white",
                  "bg-secondary text-white",
                  "bg-accent text-foreground",
                  "bg-emerald-500 text-white",
                  "bg-indigo-500 text-white"
                ];
                const labelColorClass = colors[idx % colors.length];
                const isIndividual = item.name.toLowerCase().includes("individual") || item.name.includes("自主練");

                return (
                  <View 
                    key={idx} 
                    className={`flex-row justify-between items-center p-3 rounded-2xl border ${
                      isIndividual ? "bg-amber-500/5 border-amber-500/30 scale-[1.02]" : "border-border/60 bg-muted/5"
                    }`}
                  >
                    <View className="flex-row items-center gap-2.5">
                      <View className={`px-2.5 py-1 rounded-lg ${labelColorClass}`}>
                        <Text className="text-[9px] font-extrabold">{idx + 1}</Text>
                      </View>
                      <View>
                        <Text className="text-xs font-bold text-foreground">
                          {item.name} {isIndividual && "🏋️ (自主練)"}
                        </Text>
                        <Text className="text-[9px] text-muted">全体に占める割合: {percentVal}%</Text>
                      </View>
                    </View>
                    
                    <Text className="text-sm font-extrabold text-foreground font-mono">
                      {item.value.toFixed(isLoad ? 1 : 0)}
                      <Text className="text-[10px] font-normal text-muted ml-0.5">
                        {isLoad ? "" : "回"}
                      </Text>
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* 加速度ゾーン別分布 */}
            {(zoneAccels.under2_5 + zoneAccels.between2_5_3_5 + zoneAccels.over3_5 > 0) && (
              <View className="gap-3 mt-2">
                <Text className="text-xs font-bold text-foreground pb-1 border-b border-border/50">加速度ゾーン別分布</Text>
                <View className="gap-3 mt-1">
                  {[
                    { name: "弱加速 (~2.5 m/s)", count: zoneAccels.under2_5, color: "bg-emerald-500/20 text-emerald-700" },
                    { name: "中加速 (2.5~3.5 m/s)", count: zoneAccels.between2_5_3_5, color: "bg-amber-500/20 text-amber-700" },
                    { name: "強加速 (3.5 m/s~)", count: zoneAccels.over3_5, color: "bg-red-500/30 text-red-700" }
                  ].map((zone, idx) => {
                    const totalZAccels = zoneAccels.under2_5 + zoneAccels.between2_5_3_5 + zoneAccels.over3_5;
                    const percent = totalZAccels > 0 ? (zone.count / totalZAccels) * 100 : 0;
                    return (
                      <View key={idx} className="flex-row items-center gap-3">
                        <Text className="text-[10px] font-bold text-muted w-28">{zone.name}</Text>
                        <View className="flex-1 h-5 bg-muted/20 rounded-lg overflow-hidden relative justify-center">
                          <View 
                            style={{ width: `${percent}%` as any }} 
                            className={`h-full ${zone.color.split(" ")[0]} rounded-lg absolute`}
                          />
                          <Text className="text-[9px] font-extrabold text-foreground pl-2.5 z-10 font-mono">
                            {zone.count} 回 ({percent.toFixed(1)}%)
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* 加速度の方向別集計 */}
            {Object.keys(directionAccels).length > 0 && (
              <View className="gap-3 mt-2">
                <Text className="text-xs font-bold text-foreground pb-1 border-b border-border/50">加速度の方向別集計</Text>
                <View className="flex-row flex-wrap gap-2.5 mt-1">
                  {Object.entries(directionAccels).map(([dir, info], idx) => (
                    <View key={idx} className="flex-1 min-w-[45%] bg-muted/10 p-3 rounded-2xl border border-border/40 gap-1">
                      <Text className="text-[9px] font-extrabold text-muted">{dir}</Text>
                      <Text className="text-sm font-black text-foreground font-mono">
                        {info.count} 回
                        <Text className="text-[9px] font-normal text-muted ml-1">
                          (Vol: {info.volume.toFixed(1)} m/s)
                        </Text>
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* メニュー別加速詳細 */}
            {Object.keys(menuAccels).length > 0 && (
              <View className="gap-3 mt-2">
                <Text className="text-xs font-bold text-foreground pb-1 border-b border-border/50">メニュー別加速詳細</Text>
                <View className="bg-muted/10 rounded-2xl border border-border/40 overflow-hidden mt-1">
                  <View className="flex-row bg-muted/20 p-2.5 border-b border-border/40">
                    <Text className="text-[9px] font-bold text-muted flex-2">メニュー名</Text>
                    <Text className="text-[9px] font-bold text-muted flex-1 text-center">回数</Text>
                    <Text className="text-[9px] font-bold text-muted flex-1 text-center">ボリューム</Text>
                    <Text className="text-[9px] font-bold text-muted flex-1 text-center">平均</Text>
                    <Text className="text-[9px] font-bold text-muted flex-1 text-center">最高</Text>
                    <Text className="text-[9px] font-bold text-muted flex-1 text-center">Top5平均</Text>
                  </View>
                  {Object.entries(menuAccels).map(([mName, detail], idx) => (
                    <View key={idx} className="flex-row p-2.5 border-b border-border/20 items-center">
                      <Text className="text-[9px] font-bold text-foreground flex-2">{mName}</Text>
                      <Text className="text-[9px] font-bold text-foreground flex-1 text-center">{detail.count}回</Text>
                      <Text className="text-[9px] font-bold text-foreground flex-1 text-center">{detail.volume.toFixed(1)}</Text>
                      <Text className="text-[9px] font-bold text-foreground flex-1 text-center">{detail.avg.toFixed(2)}</Text>
                      <Text className="text-[9px] font-bold text-foreground flex-1 text-center">{detail.max.toFixed(2)}</Text>
                      <Text className="text-[9px] font-bold text-foreground flex-1 text-center">{detail.top5Avg.toFixed(2)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        ) : (
          <View className="py-8 items-center justify-center">
            <Text className="text-xs text-muted">メニュー別データが登録されていません。</Text>
          </View>
        )}
      </View>
    );
  };

  // ----------------------------------------------------
  // 自主練 (Individual) 特化ダッシュボード helper
  // ----------------------------------------------------
  const renderIndividualDashboard = () => {
    // 直近7日分の日付リストを生成 (過去7日)
    const today = new Date(rawDate);
    const last7Days: { dateStr: string; label: string; load: number; jumps: number; maxJump: number; hasData: boolean }[] = [];
    
    const historyList = (analytics as any)?.trend || (analytics as any)?.history || [];
    const fmtDate = (dateVal: any) => {
      const dateObj = new Date(dateVal);
      return isNaN(dateObj.getTime()) ? "" : dateObj.toLocaleDateString("sv-SE");
    };

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toLocaleDateString("sv-SE");
      const label = `${d.getMonth() + 1}/${d.getDate()}`;
      
      // この日の自主練データ (sessionType === "individual")
      const indPerf = historyList.find((p: any) => {
        const pDate = fmtDate(p.date);
        return pDate === dateStr && (p.sessionType === "individual" || p.sessionType === "auto");
      });

      let load = 0;
      let jumps = 0;
      let maxJump = 0;
      let hasData = false;

      if (indPerf && indPerf.sessionType === "individual") {
        hasData = true;
        load = indPerf.totalLoad ? Number(indPerf.totalLoad) : 0;
        jumps = indPerf.totalJumps ? Number(indPerf.totalJumps) : 0;
        maxJump = indPerf.maxJumpHeight ? Number(indPerf.maxJumpHeight) : 0;
      } else {
        // rawMenuData から individual / 自主練 項目を検索
        const dayPerf = historyList.find((p: any) => fmtDate(p.date) === dateStr && p.rawMenuData);
        if (dayPerf) {
          try {
            const menuObj = typeof dayPerf.rawMenuData === "string" ? JSON.parse(dayPerf.rawMenuData) : dayPerf.rawMenuData;
            const loads = menuObj.loads || menuObj.playerLoads || {};
            const indKey = Object.keys(loads).find(k => k.toLowerCase().includes("individual") || k.includes("自主"));
            if (indKey && loads[indKey]) {
              hasData = true;
              load = Number(loads[indKey]);
              jumps = dayPerf.totalJumps ? Math.round(Number(dayPerf.totalJumps) * 0.3) : 0;
              maxJump = dayPerf.maxJumpHeight ? Number(dayPerf.maxJumpHeight) : 0;
            }
          } catch (e) {}
        }
      }

      last7Days.push({ dateStr, label, load, jumps, maxJump, hasData });
    }

    const totalIndDays = last7Days.filter(d => d.hasData).length;
    const totalIndJumps = last7Days.reduce((sum, d) => sum + d.jumps, 0);
    const totalIndLoad = last7Days.reduce((sum, d) => sum + d.load, 0);
    const maxIndJumpHeight = Math.max(...last7Days.map(d => d.maxJump), 0);

    const maxGraphLoad = Math.max(...last7Days.map(d => d.load), 50);

    return (
      <View style={{ backgroundColor: "#FFFFFF", borderRadius: 24, padding: 20, borderWidth: 1, borderColor: "#F59E0B30", shadowColor: "#0F172A", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4, gap: 16 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ backgroundColor: "#FEF3C7", padding: 8, borderRadius: 12 }}>
              <Text style={{ fontSize: 16 }}>🏋️</Text>
            </View>
            <View>
              <Text style={{ fontSize: 14, fontWeight: "bold", color: "#0F172A" }}>自主練 (Individual) 特化ダッシュボード</Text>
              <Text style={{ fontSize: 10, color: "#64748B" }}>直近1週間 (7日間) の自主練習実績・成果</Text>
            </View>
          </View>
          <View style={{ backgroundColor: "#FFFBEB", borderBottomWidth: 1, borderColor: "#FCD34D", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
            <Text style={{ fontSize: 10, fontWeight: "bold", color: "#D97706" }}>直近7日間</Text>
          </View>
        </View>

        {/* サマリー4列カード */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1, backgroundColor: "#FFFBEB", padding: 10, borderRadius: 12, borderWidth: 1, borderColor: "#FCD34D" }}>
            <Text style={{ fontSize: 9, color: "#B45309", fontWeight: "bold" }}>自主練 実施日数</Text>
            <Text style={{ fontSize: 16, fontWeight: "800", color: "#92400E", marginTop: 2 }}>{totalIndDays} <Text style={{ fontSize: 10, fontWeight: "normal" }}>/ 7日</Text></Text>
          </View>
          <View style={{ flex: 1, backgroundColor: "#FEF3C7", padding: 10, borderRadius: 12, borderWidth: 1, borderColor: "#FBBF24" }}>
            <Text style={{ fontSize: 9, color: "#B45309", fontWeight: "bold" }}>累計ジャンプ</Text>
            <Text style={{ fontSize: 16, fontWeight: "800", color: "#92400E", marginTop: 2 }}>{totalIndJumps} <Text style={{ fontSize: 10, fontWeight: "normal" }}>回</Text></Text>
          </View>
          <View style={{ flex: 1, backgroundColor: "#FEF3C7", padding: 10, borderRadius: 12, borderWidth: 1, borderColor: "#FBBF24" }}>
            <Text style={{ fontSize: 9, color: "#B45309", fontWeight: "bold" }}>累計 PL負荷</Text>
            <Text style={{ fontSize: 16, fontWeight: "800", color: "#92400E", marginTop: 2 }}>{totalIndLoad.toFixed(1)} <Text style={{ fontSize: 10, fontWeight: "normal" }}>PL</Text></Text>
          </View>
          <View style={{ flex: 1, backgroundColor: "#FFFBEB", padding: 10, borderRadius: 12, borderWidth: 1, borderColor: "#FCD34D" }}>
            <Text style={{ fontSize: 9, color: "#B45309", fontWeight: "bold" }}>最高ジャンプ高</Text>
            <Text style={{ fontSize: 16, fontWeight: "800", color: "#92400E", marginTop: 2 }}>{maxIndJumpHeight > 0 ? maxIndJumpHeight.toFixed(1) : "--"} <Text style={{ fontSize: 10, fontWeight: "normal" }}>cm</Text></Text>
          </View>
        </View>

        {/* 直近7日間の日別自主練 棒グラフ */}
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 11, fontWeight: "bold", color: "#475569" }}>📊 日別 自主練運動量 (Player Load)</Text>
          <View style={{ flexDirection: "row", height: 110, alignItems: "flex-end", gap: 8, paddingHorizontal: 4, paddingTop: 10 }}>
            {last7Days.map((d, idx) => {
              const heightPercent = d.hasData ? Math.min(100, Math.max(15, (d.load / maxGraphLoad) * 100)) : 0;
              return (
                <View key={idx} style={{ flex: 1, alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
                  {d.hasData && (
                    <Text style={{ fontSize: 8, fontWeight: "bold", color: "#D97706", marginBottom: 2 }}>
                      {d.load.toFixed(0)}
                    </Text>
                  )}
                  <View style={{
                    width: "80%",
                    height: d.hasData ? `${heightPercent}%` : 4,
                    backgroundColor: d.hasData ? "#F59E0B" : "#F1F5F9",
                    borderRadius: 6,
                    borderWidth: d.hasData ? 0 : 1,
                    borderColor: "#E2E8F0"
                  }} />
                  <Text style={{ fontSize: 9, fontWeight: d.hasData ? "bold" : "normal", color: d.hasData ? "#D97706" : "#94A3B8", marginTop: 4 }}>
                    {d.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>
    );
  };

  // ----------------------------------------------------
  // 💤 SOXAI 睡眠ステージ分析 (タイムライン & 内訳)
  // ----------------------------------------------------
  const renderSleepStageAnalytics = () => {
    const trend = (analytics as any)?.trend || (analytics as any)?.history || [];
    
    // SOXAIデータが含まれるレコードを日付降順で抽出
    let sleepRecords = trend
      .filter((p: any) => {
        const hasScore = p.wellnessSleep !== undefined && p.wellnessSleep !== null;
        const soxai = p.soxaiData ? (typeof p.soxaiData === "string" ? JSON.parse(p.soxaiData) : p.soxaiData) : {};
        const hasBedTime = soxai.soxaiBedTimeStr !== undefined || soxai.soxaiSleepDuration !== undefined;
        return hasScore || hasBedTime;
      })
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

    let isUsingDemoData = false;
    if (sleepRecords.length === 0) {
      isUsingDemoData = true;
      const today = new Date();
      sleepRecords = [
        {
          date: new Date(today.getTime() - 0 * 24 * 60 * 60 * 1000).toISOString(),
          wellnessSleep: 82,
          hrv: 58,
          soxaiData: JSON.stringify({
            soxaiBedTimeStr: "01:35",
            soxaiWakeTimeStr: "05:42",
            soxaiDeepSleep: 120,
            soxaiLightSleep: 180,
            soxaiRemSleep: 60,
            soxaiAwakeTime: 40,
            soxaiSleepDuration: 360
          })
        },
        {
          date: new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
          wellnessSleep: 79,
          hrv: 62,
          soxaiData: JSON.stringify({
            soxaiBedTimeStr: "23:26",
            soxaiWakeTimeStr: "06:03",
            soxaiDeepSleep: 90,
            soxaiLightSleep: 240,
            soxaiRemSleep: 80,
            soxaiAwakeTime: 20,
            soxaiSleepDuration: 410
          })
        },
        {
          date: new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          wellnessSleep: 85,
          hrv: 65,
          soxaiData: JSON.stringify({
            soxaiBedTimeStr: "00:21",
            soxaiWakeTimeStr: "05:15",
            soxaiDeepSleep: 140,
            soxaiLightSleep: 160,
            soxaiRemSleep: 70,
            soxaiAwakeTime: 15,
            soxaiSleepDuration: 370
          })
        }
      ];
    }

    const parseTimeToMinutes = (timeStr: string | null | undefined): number | null => {
      if (!timeStr) return null;
      const parts = timeStr.trim().split(":");
      if (parts.length < 2) return null;
      let hrs = parseInt(parts[0], 10);
      const mins = parseInt(parts[1], 10);
      if (isNaN(hrs) || isNaN(mins)) return null;
      if (hrs < 12) hrs += 24; // 00:00〜11:59は翌日扱い
      return hrs * 60 + mins;
    };

    const formatMinutesToTime = (totalMins: number): string => {
      let hrs = Math.floor(totalMins / 60);
      const mins = totalMins % 60;
      if (hrs >= 24) hrs -= 24;
      return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
    };

    // タイムラインの基準時間 (前日17:00〜当日17:00の24時間 = 1440分)
    const timelineStart = 17 * 60; // 1020分
    const timelineEnd = 41 * 60; // 2460分 (翌日17:00)
    const totalTimelineMins = timelineEnd - timelineStart;

    const getMockedTimelineSegments = (deep: number, light: number, rem: number, awake: number) => {
      const rawSegments = [
        { type: "awake", val: awake * 0.15 },
        { type: "light", val: light * 0.20 },
        { type: "deep", val: deep * 0.35 },
        { type: "light", val: light * 0.25 },
        { type: "rem", val: rem * 0.30 },
        { type: "deep", val: deep * 0.45 },
        { type: "light", val: light * 0.30 },
        { type: "rem", val: rem * 0.40 },
        { type: "deep", val: deep * 0.20 },
        { type: "light", val: light * 0.25 },
        { type: "rem", val: rem * 0.30 },
        { type: "awake", val: awake * 0.85 }
      ];

      const filtered = rawSegments.filter(s => s.val > 0);
      const totalVal = filtered.reduce((acc, cur) => acc + cur.val, 0);
      if (totalVal === 0) return [];
      
      return filtered.map(s => ({
        type: s.type,
        percent: (s.val / totalVal) * 100
      }));
    };

    return (
      <View style={{ backgroundColor: "#FFFFFF", borderRadius: 24, padding: 20, borderWidth: 1, borderColor: "#E2E8F0", shadowColor: "#0F172A", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4, gap: 16 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderColor: "#F1F5F9", paddingBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ backgroundColor: "#EEF2FF", padding: 8, borderRadius: 12 }}>
              <Text style={{ fontSize: 16 }}>💤</Text>
            </View>
            <View>
              <Text style={{ fontSize: 14, fontWeight: "bold", color: "#0F172A" }}>SOXAI 睡眠ステージ履歴</Text>
              <Text style={{ fontSize: 10, color: "#64748B" }}>日々の睡眠効率、ステージ割合および自律神経(HRV)回復推移</Text>
            </View>
          </View>
        </View>

        {isUsingDemoData && (
          <View style={{ backgroundColor: "#EFF6FF", borderColor: "#BFDBFE", borderWidth: 1, borderRadius: 12, padding: 12 }}>
            <Text style={{ fontSize: 11, color: "#1E40AF", fontWeight: "bold" }}>💡 デモデータ表示中</Text>
            <Text style={{ fontSize: 10, color: "#2563EB", marginTop: 2 }}>SOXAIリングの測定データ（CSV）がまだ未登録のため、プレビュー用のサンプルデータを表示しています。CSVデータをアップロードすると、実際の測定結果が自動で反映されます。</Text>
          </View>
        )}

        {/* 凡例 */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, backgroundColor: "#F8FAFC", padding: 10, borderRadius: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View style={{ width: 10, height: 10, backgroundColor: "#4338CA", borderRadius: 2 }} />
            <Text style={{ fontSize: 9, color: "#475569", fontWeight: "bold" }}>深い睡眠</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View style={{ width: 10, height: 10, backgroundColor: "#818CF8", borderRadius: 2 }} />
            <Text style={{ fontSize: 9, color: "#475569", fontWeight: "bold" }}>浅い睡眠</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View style={{ width: 10, height: 10, backgroundColor: "#C7D2FE", borderRadius: 2 }} />
            <Text style={{ fontSize: 9, color: "#475569", fontWeight: "bold" }}>レム睡眠</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View style={{ width: 10, height: 10, backgroundColor: "#FBBF24", borderRadius: 2 }} />
            <Text style={{ fontSize: 9, color: "#475569", fontWeight: "bold" }}>覚醒</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View style={{ width: 10, height: 10, backgroundColor: "#94A3B8", borderRadius: 2 }} />
            <Text style={{ fontSize: 9, color: "#475569", fontWeight: "bold" }}>仮眠</Text>
          </View>
        </View>

        {/* 時間軸目盛りヘッダー */}
        <View style={{ flexDirection: "row", gap: 10, paddingRight: 4, borderBottomWidth: 1, borderColor: "#E2E8F0", paddingBottom: 6 }}>
          <View style={{ width: 145 }} /> {/* 日付(80) + スコア(65) + ギャップ */}
          <View style={{ flex: 1, height: 16, position: "relative" }}>
            {[18, 20, 22, 0, 2, 4, 6, 8, 10, 12, 14, 16].map((hour) => {
              let targetMins = hour * 60;
              if (hour < 17) targetMins += 24 * 60; // 翌日扱い
              const percent = ((targetMins - timelineStart) / totalTimelineMins) * 100;
              return (
                <View key={hour} style={{ position: "absolute", left: `${percent}%`, marginLeft: -10, width: 20, alignItems: "center" }}>
                  <Text style={{ fontSize: 8, color: "#94A3B8", fontWeight: "bold" }}>{hour}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* リスト表示 */}
        <ScrollView style={{ maxHeight: 500 }} showsVerticalScrollIndicator={true}>
          <View style={{ gap: 12 }}>
            {sleepRecords.length > 0 ? (
              sleepRecords.map((p: any, idx: number) => {
                const dateLabel = new Date(p.date).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" });
                const soxai = p.soxaiData ? (typeof p.soxaiData === "string" ? JSON.parse(p.soxaiData) : p.soxaiData) : {};
                
                const bedTimeStr = soxai.soxaiBedTimeStr || "--:--";
                const wakeTimeStr = soxai.soxaiWakeTimeStr || "--:--";
                const sleepScore = p.wellnessSleep || "--";
                const hrvVal = p.hrv ? `${Math.round(Number(p.hrv))}ms` : "--";

                const bedMin = parseTimeToMinutes(soxai.soxaiBedTimeStr);
                const wakeMin = parseTimeToMinutes(soxai.soxaiWakeTimeStr);

                const deep = Number(soxai.soxaiDeepSleep) || 0;
                const light = Number(soxai.soxaiLightSleep) || 0;
                const rem = Number(soxai.soxaiRemSleep) || 0;
                const awake = Number(soxai.soxaiAwakeTime) || 0;

                // タイムライン描画計算
                let showTimelineBar = false;
                let leftMarginPercent = 0;
                let barWidthPercent = 0;
                let segments: Array<{ type: string; percent: number }> = [];

                if (bedMin !== null && wakeMin !== null && wakeMin > bedMin) {
                  showTimelineBar = true;
                  const totalBedMins = wakeMin - bedMin;
                  leftMarginPercent = Math.max(0, Math.min(100, ((bedMin - timelineStart) / totalTimelineMins) * 100));
                  barWidthPercent = Math.max(10, Math.min(100 - leftMarginPercent, (totalBedMins / totalTimelineMins) * 100));
                  segments = getMockedTimelineSegments(deep, light, rem, awake);
                }

                // 就寝・起床時間はないが、睡眠時間はある場合は「仮眠」扱い
                const isNapOnly = !showTimelineBar && (Number(soxai.soxaiSleepDuration) > 0);

                return (
                  <View key={idx} style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderColor: "#F1F5F9", paddingVertical: 10, gap: 10 }}>
                    {/* 日付・基本情報 */}
                    <View style={{ width: 80 }}>
                      <Text style={{ fontSize: 12, fontWeight: "bold", color: "#0F172A" }}>{dateLabel}</Text>
                      <View style={{ flexDirection: "row", gap: 4, marginTop: 2 }}>
                        <Text style={{ fontSize: 9, color: "#64748B" }}>就床: {bedTimeStr}</Text>
                      </View>
                      <View style={{ flexDirection: "row", gap: 4 }}>
                        <Text style={{ fontSize: 9, color: "#64748B" }}>起床: {wakeTimeStr}</Text>
                      </View>
                    </View>

                    {/* スコア・HRV */}
                    <View style={{ width: 65, gap: 2, alignItems: "center" }}>
                      <View style={{ backgroundColor: "#F0FDF4", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: "#DCFCE7" }}>
                        <Text style={{ fontSize: 10, fontWeight: "bold", color: "#166534" }}>{sleepScore}点</Text>
                      </View>
                      <View style={{ backgroundColor: "#EFF6FF", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: "#DBEAFE" }}>
                        <Text style={{ fontSize: 10, fontWeight: "bold", color: "#1D4ED8" }}>{hrvVal}</Text>
                      </View>
                    </View>

                    {/* 積み上げグラフ (タイムライン風) */}
                    <View style={{ flex: 1, height: 26, backgroundColor: "#F8FAFC", borderRadius: 8, overflow: "hidden", position: "relative", justifyContent: "center" }}>
                      {/* 2時間おきのグリッド背景縦線 */}
                      {[18, 20, 22, 0, 2, 4, 6, 8, 10, 12, 14, 16].map((hour) => {
                        let targetMins = hour * 60;
                        if (hour < 17) targetMins += 24 * 60;
                        const percent = ((targetMins - timelineStart) / totalTimelineMins) * 100;
                        return (
                          <View
                            key={hour}
                            style={{
                              position: "absolute",
                              left: `${percent}%`,
                              top: 0,
                              bottom: 0,
                              width: 1,
                              backgroundColor: "#E2E8F0"
                            }}
                          />
                        );
                      })}

                      {showTimelineBar ? (
                        <View style={{
                          position: "absolute",
                          left: `${leftMarginPercent}%`,
                          width: `${barWidthPercent}%`,
                          height: 16,
                          borderRadius: 4,
                          overflow: "hidden",
                          flexDirection: "row"
                        }}>
                          {segments.map((seg, sIdx) => {
                            const colorsMap: Record<string, string> = {
                              deep: "#4338CA",
                              light: "#818CF8",
                              rem: "#C7D2FE",
                              awake: "#FBBF24"
                            };
                            return (
                              <View
                                key={sIdx}
                                style={{
                                  width: `${seg.percent}%`,
                                  height: "100%",
                                  backgroundColor: colorsMap[seg.type] || "#CBD5E1"
                                }}
                              />
                            );
                          })}
                        </View>
                      ) : isNapOnly ? (
                        /* 仮眠のみ */
                        <View style={{
                          position: "absolute",
                          left: "40%",
                          width: "20%",
                          height: 12,
                          backgroundColor: "#94A3B8",
                          borderRadius: 4,
                          justifyContent: "center",
                          alignItems: "center"
                        }}>
                          <Text style={{ fontSize: 7, color: "#FFFFFF", fontWeight: "bold" }}>仮眠 {(Number(soxai.soxaiSleepDuration)).toFixed(0)}分</Text>
                        </View>
                      ) : (
                        <Text style={{ fontSize: 8, color: "#94A3B8", textAlign: "center", fontStyle: "italic" }}>睡眠データ未登録</Text>
                      )}
                    </View>
                  </View>
                );
              })
            ) : (
              <View style={{ paddingVertical: 24, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 12, color: "#64748B", fontStyle: "italic" }}>SOXAI睡眠データが登録されていません。</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    );
  };

  // ----------------------------------------------------
  // Comparison (Team & Position) rendering helpers
  // ----------------------------------------------------
  const renderComparisonAnalytics = () => {
    const comp = analytics.comparison;
    const own = comp.own;
    const team = comp.team;
    const pos = comp.position;

    const metrics = [
      { key: "totalLoad", title: "平均運動量", unit: "", isInt: true },
      { key: "totalJumps", title: "平均ジャンプ回数", unit: "回", isInt: true },
      { key: "jumpVolume", title: "平均総ジャンプ高 (Volume)", unit: "m", isInt: false },
      { key: "avgJumpHeight", title: "平均ジャンプ高 (全数平均)", unit: "cm", isInt: true },
      { key: "top5JumpHeight", title: "平均ジャンプ高 (Top5平均)", unit: "cm", isInt: true },
    ];

    return (
      <View className="bg-surface rounded-3xl border border-border p-5 shadow-sm gap-6">
        <View>
          <Text className="text-sm font-bold text-foreground">チーム・ポジション比較</Text>
          <Text className="text-[10px] text-muted font-medium">過去28日間の練習平均値の比較</Text>
        </View>

        <View className="gap-5">
          {metrics.map((m, idx) => {
            const rawOwnVal = own ? (own as any)[m.key] : 0;
            const rawTeamVal = team ? (team as any)[m.key] : 0;
            const rawPosVal = pos ? (pos as any)[m.key] : 0;

            const ownVal = isNaN(rawOwnVal) || rawOwnVal === null || rawOwnVal === undefined ? 0 : Number(rawOwnVal);
            const teamVal = isNaN(rawTeamVal) || rawTeamVal === null || rawTeamVal === undefined ? 0 : Number(rawTeamVal);
            const posVal = isNaN(rawPosVal) || rawPosVal === null || rawPosVal === undefined ? 0 : Number(rawPosVal);
            
            const maxVal = Math.max(ownVal, teamVal, posVal, 1);
            
            const ownWidth = `${(ownVal / maxVal) * 100}%`;
            const teamWidth = `${(teamVal / maxVal) * 100}%`;
            const posWidth = `${(posVal / maxVal) * 100}%`;

            return (
              <View key={idx} className="gap-2.5 pb-4 border-b border-border/40">
                <Text className="text-xs font-bold text-foreground">{m.title}</Text>
                
                <View className="gap-2 mt-1">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-[9px] text-muted w-14 font-semibold">自分</Text>
                    <View className="flex-1 h-3.5 bg-muted/20 rounded-full overflow-hidden relative mr-4">
                      <View style={{ width: ownWidth as any }} className="h-full bg-primary rounded-full absolute" />
                    </View>
                    <Text className="text-[10px] font-bold text-foreground font-mono w-14 text-right">
                      {m.isInt ? Math.round(ownVal) : ownVal.toFixed(2)} {m.unit}
                    </Text>
                  </View>

                  <View className="flex-row items-center justify-between">
                    <Text className="text-[9px] text-muted w-14 font-semibold">{athlete.position || "ポジション"}</Text>
                    <View className="flex-1 h-3.5 bg-muted/20 rounded-full overflow-hidden relative mr-4">
                      <View style={{ width: posWidth as any }} className="h-full bg-secondary rounded-full absolute" />
                    </View>
                    <Text className="text-[10px] font-bold text-foreground font-mono w-14 text-right">
                      {m.isInt ? Math.round(posVal) : posVal.toFixed(2)} {m.unit}
                    </Text>
                  </View>

                  <View className="flex-row items-center justify-between">
                    <Text className="text-[9px] text-muted w-14 font-semibold">チーム平均</Text>
                    <View className="flex-1 h-3.5 bg-muted/20 rounded-full overflow-hidden relative mr-4">
                      <View style={{ width: teamWidth as any }} className="h-full bg-muted rounded-full absolute" />
                    </View>
                    <Text className="text-[10px] font-bold text-foreground font-mono w-14 text-right">
                      {m.isInt ? Math.round(teamVal) : teamVal.toFixed(2)} {m.unit}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  // ----------------------------------------------------
  // Trend line chart rendering helpers (uses react-native-svg)
  // ----------------------------------------------------
  const renderGuidanceAndAdvice = () => {
    const guidance = analytics.guidance;
    const advice = latest.coachAdvice;

    let guidanceBg = "bg-emerald-50";
    let guidanceBorder = "border-emerald-200";
    let guidanceText = "text-emerald-800";
    let guidanceIcon = "checkmark.circle.fill";
    let guidanceIconColor = "#10B981";

    if (guidance.level === "danger") {
      guidanceBg = "bg-red-50";
      guidanceBorder = "border-red-200";
      guidanceText = "text-red-800";
      guidanceIcon = "exclamationmark.octagon.fill";
      guidanceIconColor = "#EF4444";
    } else if (guidance.level === "warning") {
      guidanceBg = "bg-amber-50";
      guidanceBorder = "border-amber-200";
      guidanceText = "text-amber-800";
      guidanceIcon = "exclamationmark.triangle.fill";
      guidanceIconColor = "#F59E0B";
    } else if (guidance.level === "underwork") {
      guidanceBg = "bg-blue-50";
      guidanceBorder = "border-blue-200";
      guidanceText = "text-blue-800";
      guidanceIcon = "arrow.down.circle.fill";
      guidanceIconColor = "#3B82F6";
    }

    return (
      <View className="gap-4">
        {/* 自主練推奨ガイダンス */}
        <View className={`rounded-3xl border ${guidanceBorder} ${guidanceBg} p-5 shadow-sm gap-2.5`}>
          <View className="flex-row items-center gap-2">
            <IconSymbol size={20} name={guidanceIcon as any} color={guidanceIconColor} />
            <Text className={`text-sm font-extrabold ${guidanceText}`}>自主練推奨プラン: {guidance.title}</Text>
          </View>
          <Text className={`text-[11px] leading-relaxed ${guidanceText} opacity-90`}>
            {guidance.desc}
          </Text>
        </View>

        {/* コーチからのアドバイス */}
        {advice && (
          <View className="bg-purple-50 rounded-3xl border border-purple-200 p-5 shadow-sm gap-2.5">
            <View className="flex-row items-center gap-2">
              <IconSymbol size={20} name="message.fill" color="#8B5CF6" />
              <Text className="text-sm font-extrabold text-purple-900">指導者（コーチ）からのアドバイス</Text>
            </View>
            <View className="bg-white/60 rounded-2xl p-3.5 border border-purple-100">
              <Text className="text-xs text-purple-950 leading-relaxed font-semibold">
                「 {advice} 」
              </Text>
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderManualAnomalyHandler = () => {
    if (!latest) return null;

    const handleApproveRaw = async () => {
      try {
        // Passing empty array to approve raw data as-is without any modification
        await correctAnomalyMutation.mutateAsync({
          recordId: latest.id,
          metricsToCorrect: []
        });
        alert("データを生データのまま正常として承認しました。");
        refetch();
      } catch (e: any) {
        alert(`承認処理に失敗しました: ${e.message}`);
      }
    };

    const handleRollback = async () => {
      try {
        await rollbackAnomalyMutation.mutateAsync({ recordId: latest.id });
        alert("承認を取り消し、元の生データに戻しました。");
        refetch();
      } catch (e: any) {
        alert(`ロールバックに失敗しました: ${e.message}`);
      }
    };

    return (
      <View style={{
        backgroundColor: latest.isCorrected ? "#F8FAFC" : "#FEF2F2",
        borderColor: latest.isCorrected ? "#E2E8F0" : "#FCA5A5",
        borderWidth: 1,
        borderRadius: 20,
        padding: 16,
        gap: 10,
        marginBottom: 4
      }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <IconSymbol size={18} name="exclamationmark.triangle.fill" color={latest.isCorrected ? "#64748B" : "#EF4444"} />
          <Text style={{ fontSize: 13, fontWeight: "bold", color: latest.isCorrected ? "#334155" : "#991B1B" }}>
            {latest.isAnomaly 
              ? (latest.isCorrected ? "測定不良データ (承認済)" : "自動検知された測定不良データ (未承認)")
              : "この日の測定データは自動検知では正常と判定されています"
            }
          </Text>
        </View>

        {latest.isAnomaly && (
          <Text style={{ fontSize: 11, color: latest.isCorrected ? "#64748B" : "#B91C1C", lineHeight: 15, paddingLeft: 26 }}>
            検出詳細: {latest.anomalyDetails}
          </Text>
        )}

        {!latest.isCorrected ? (
          <View style={{ gap: 10, marginTop: 4, paddingLeft: 26 }}>
            <Text style={{ fontSize: 10, color: "#64748B", lineHeight: 14 }}>
              ※測定不良が生じている場合、手動で数値を修正するか、生データのまま正常データとして承認してください。
            </Text>

            <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
              <TouchableOpacity
                onPress={handleApproveRaw}
                style={{
                  flex: 1,
                  backgroundColor: "#0F172A",
                  paddingVertical: 12,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "bold", color: "#FFFFFF" }}>
                  生データのまま正常として承認
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={{ gap: 8, marginTop: 4, paddingLeft: 26 }}>
            {latest.originalRawData ? (
              <>
                <Text style={{ fontSize: 11, color: "#475569", lineHeight: 16 }}>
                  このデータはすでに補正または承認されています。元の生データに戻す場合は、下のボタンからキャンセル（差し戻し）を行ってください。
                </Text>
                <TouchableOpacity
                  onPress={handleRollback}
                  style={{
                    backgroundColor: "#475569",
                    paddingVertical: 10,
                    borderRadius: 10,
                    alignItems: "center",
                    marginTop: 4
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "bold", color: "#FFFFFF" }}>
                    補正をキャンセルして元に戻す
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={{ fontSize: 11, color: "#94A3B8", fontStyle: "italic", lineHeight: 16 }}>
                このデータはすでに補正済みです（機能追加前のデータのため、生データの復元はできません）。
              </Text>
            )}
          </View>
        )}
      </View>
    );
  };

  const renderSignalLightCard = () => {
    const signal = analytics.signalLight;
    if (!signal) return null;

    const enabledMetrics = signal.enabledMetrics || [];

    return (
      <View style={{ gap: 16 }}>
        {/* 1. コンディション自動要約バナー (画像のような薄赤バナー) */}
        <View style={{
          backgroundColor: signal.status === "red" ? "#FDF2F2" : signal.status === "yellow" ? "#FFFDF5" : signal.status === "pending" ? "#F1F5F9" : "#F4FBF7",
          borderColor: signal.status === "red" ? "#F8D7DA" : signal.status === "yellow" ? "#FFF3CD" : signal.status === "pending" ? "#CBD5E1" : "#D1E7DD",
          borderWidth: 1, borderRadius: 16, padding: 16
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Text style={{ fontSize: 18 }}>
              {signal.status === "red" ? "🔴" : signal.status === "yellow" ? "🟡" : signal.status === "pending" ? "⚪" : "🟢"}
            </Text>
            <Text style={{ fontSize: 14, fontWeight: "bold", color: signal.status === "red" ? "#842029" : signal.status === "yellow" ? "#664D03" : signal.status === "pending" ? "#475569" : "#0F5132" }}>
              本日のコンディション判定: {signal.status === "red" ? "要確認" : signal.status === "yellow" ? "注意" : signal.status === "pending" ? "未入力" : "良好"}
            </Text>
          </View>
          <Text style={{
            fontSize: 12, fontWeight: "semibold",
            color: signal.status === "red" ? "#842029" : signal.status === "yellow" ? "#664D03" : signal.status === "pending" ? "#475569" : "#0F5132",
            lineHeight: 18
          }}>
            {signal.statusText}
          </Text>
        </View>

        {/* 2. 2カラムレイアウト (LOAD と STATE) */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
          {/* 左カラム: 負荷を確認 (LOAD) */}
          <View style={{ flex: 1, minWidth: 320, backgroundColor: "#FFFFFF", padding: 16, borderRadius: 20, borderWidth: 1, borderColor: "#E2E8F0", gap: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: "bold", color: "#475569", borderBottomWidth: 1, borderColor: "#F1F5F9", paddingBottom: 6 }}>
              負荷を確認 LOAD — 前日 ({formatDateLabel(getYesterday(rawDate))}) の応答
            </Text>
            
            {METRICS_MAP
              .filter(m => (m.category === "load_ext" || m.category === "load_int") && enabledMetrics.includes(m.key))
              .map(m => {
                const base = signal.baselines?.[m.key];
                if (!base || base.val === null) return null;
                const z = base ? base.zScore : 0;
                const status = base ? base.status : "green";
                const val = base ? base.val : 0;
                const mean = base ? base.mean : 0;
                const history = signal.metricHistory?.[m.key] || [];
                return (
                  <ZScoreBar
                    key={m.key}
                    label={m.label}
                    zScore={z}
                    status={status}
                    val={val}
                    baselineMean={mean}
                    unit={m.unit}
                    history={history}
                    polarity={m.polarity}
                  />
                );
              })}
          </View>

          {/* 右カラム: 状態／レディネス明細 (STATE) */}
          <View style={{ flex: 1, minWidth: 320, backgroundColor: "#FFFFFF", padding: 16, borderRadius: 20, borderWidth: 1, borderColor: "#E2E8F0", gap: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: "bold", color: "#475569", borderBottomWidth: 1, borderColor: "#F1F5F9", paddingBottom: 6 }}>
              状態 / レディネス STATE — 当日 ({formatDateLabel(rawDate)}) の明細
            </Text>
            
            {METRICS_MAP
              .filter(m => (m.category === "state_subj" || m.category === "state_obj") && enabledMetrics.includes(m.key))
              .map(m => {
                const base = signal.baselines?.[m.key];
                if (!base || base.val === null) return null;
                const z = base ? base.zScore : 0;
                const status = base ? base.status : "green";
                const val = base ? base.val : 0;
                const mean = base ? base.mean : 0;
                const history = signal.metricHistory?.[m.key] || [];
                return (
                  <ZScoreBar
                    key={m.key}
                    label={m.label}
                    zScore={z}
                    status={status}
                    val={val}
                    baselineMean={mean}
                    unit={m.unit}
                    history={history}
                    polarity={m.polarity}
                  />
                );
              })}
          </View>
        </View>
      </View>
    );
  };

  const renderWellnessChart = () => {
    const trend = analytics.trend;
    if (trend.length === 0) return null;

    // Filter sessions that have wellness data
    const wellnessTrend = trend.filter(t => t.wellnessFatigue > 0 || t.wellnessSoreness > 0 || t.wellnessStress > 0);
    if (wellnessTrend.length === 0) {
      return (
        <View className="bg-surface rounded-3xl border border-border p-5 shadow-sm gap-2">
          <Text className="text-sm font-bold text-foreground">Wellness コンディション推移</Text>
          <Text className="text-xs text-muted">Wellnessの申告データがありません。</Text>
        </View>
      );
    }

    const chartWidth = windowWidth - 40; // Full width minus container padding
    const chartHeight = 150;
    const paddingLeft = 25;
    const paddingRight = 10;
    const paddingTop = 20;
    const paddingBottom = 20;

    const graphWidth = chartWidth - paddingLeft - paddingRight;
    const graphHeight = chartHeight - paddingTop - paddingBottom;

    // Define color palette
    const colors = {
      sleep: "#10B981", // Green
      fatigue: "#F59E0B", // Amber
      soreness: "#EF4444", // Red
      stress: "#3B82F6", // Blue
    };

    // Determine the max Y value dynamically based on values in trend (default min to 5)
    const allValues = wellnessTrend.flatMap(t => [
      t.wellnessFatigue ? Number(t.wellnessFatigue) : 0,
      t.wellnessSoreness ? Number(t.wellnessSoreness) : 0,
      t.wellnessStress ? Number(t.wellnessStress) : 0
    ]);
    const maxValInTrend = Math.max(...allValues, 5);
    const maxRange = maxValInTrend > 10 ? 100 : (maxValInTrend > 7 ? 10 : 7);

    const mapY = (val: number) => {
      const clampedVal = Math.max(0, Math.min(maxRange, val));
      return paddingTop + graphHeight - (clampedVal / maxRange) * graphHeight;
    };

    const getLinePath = (key: "wellnessFatigue" | "wellnessSoreness" | "wellnessStress") => {
      let path = "";
      wellnessTrend.forEach((t, index) => {
        const x = paddingLeft + (index * (wellnessTrend.length > 1 ? graphWidth / (wellnessTrend.length - 1) : graphWidth));
        const y = mapY((t as any)[key]);
        if (index === 0) {
          path = `M ${x} ${y}`;
        } else {
          path += ` L ${x} ${y}`;
        }
      });
      return path;
    };

    return (
      <View className="bg-surface rounded-3xl border border-border p-5 shadow-sm gap-4">
        <View>
          <Text className="text-sm font-bold text-foreground">Wellness コンディション推移</Text>
          <Text className="text-[10px] text-muted font-medium">主観コンディション (0:不良 〜 {maxRange}:良好)</Text>
        </View>

        {/* Legend */}
        <View className="flex-row justify-around px-1 mt-1">
          <View className="flex-row items-center gap-1">
            <View style={{ backgroundColor: colors.fatigue }} className="w-2 h-2 rounded-full" />
            <Text className="text-[9px] text-muted font-bold">疲労</Text>
          </View>
          <View className="flex-row items-center gap-1">
            <View style={{ backgroundColor: colors.soreness }} className="w-2 h-2 rounded-full" />
            <Text className="text-[9px] text-muted font-bold">食欲</Text>
          </View>
          <View className="flex-row items-center gap-1">
            <View style={{ backgroundColor: colors.stress }} className="w-2 h-2 rounded-full" />
            <Text className="text-[9px] text-muted font-bold">ストレス</Text>
          </View>
        </View>

        <View className="my-1">
          <Svg width={chartWidth} height={chartHeight}>
            {/* ±1.0SD のグレー帯バンド描画 */}
            {(() => {
              const wellnessBaseline = analytics.signalLight?.baselines?.wellness;
              if (!wellnessBaseline) return null;
              const wMean = wellnessBaseline.mean;
              const wSd = wellnessBaseline.sd;
              const yMin = Math.max(0, wMean - wSd);
              const yMax = Math.min(maxRange, wMean + wSd);
              const bandYStart = mapY(yMax);
              const bandYEnd = mapY(yMin);
              const bandHeight = bandYEnd - bandYStart;
              if (isNaN(bandHeight) || bandHeight <= 0) return null;
              return (
                <Rect
                  x={paddingLeft}
                  y={bandYStart}
                  width={graphWidth}
                  height={bandHeight}
                  fill="#E5E7EB"
                  opacity="0.35"
                />
              );
            })()}

            {/* Grid lines */}
            {(maxRange === 100 ? [0, 25, 50, 75, 100] : (maxRange === 10 ? [0, 2, 4, 6, 8, 10] : [0, 1, 2, 3, 4, 5, 6, 7])).map((val) => {
              const y = mapY(val);
              return (
                <Line 
                   key={val}
                   x1={paddingLeft} 
                   y1={y} 
                   x2={chartWidth - paddingRight} 
                   y2={y} 
                   stroke={val === 0 ? "#E5E7EB" : "#F3F4F6"} 
                   strokeWidth={val === 0 ? "1.5" : "1"}
                />
              );
            })}

            {/* Y axis labels */}
            {(maxRange === 100 ? [0, 50, 100] : (maxRange === 10 ? [0, 5, 10] : [1, 4, 7])).map((val) => {
              const y = mapY(val);
              return (
                <SvgText 
                   key={val}
                   x={paddingLeft - 6} 
                   y={y + 3} 
                   fontSize="8" 
                   fill="#9CA3AF" 
                   textAnchor="end"
                >
                  {val}
                </SvgText>
              );
            })}

            {/* Render Lines */}
            <Path d={getLinePath("wellnessFatigue")} fill="none" stroke={colors.fatigue} strokeWidth="1.8" strokeLinecap="round" />
            <Path d={getLinePath("wellnessSoreness")} fill="none" stroke={colors.soreness} strokeWidth="1.8" strokeLinecap="round" />
            <Path d={getLinePath("wellnessStress")} fill="none" stroke={colors.stress} strokeWidth="1.8" strokeLinecap="round" />

            {/* X axis labels */}
            {wellnessTrend.length > 0 && (
              <SvgText x={paddingLeft} y={chartHeight - 4} fontSize="8" fill="#6B7280" textAnchor="middle">{wellnessTrend[0].dateStr}</SvgText>
            )}
            {wellnessTrend.length > 2 && (
              <SvgText x={paddingLeft + graphWidth / 2} y={chartHeight - 4} fontSize="8" fill="#6B7280" textAnchor="middle">{wellnessTrend[Math.floor(wellnessTrend.length / 2)].dateStr}</SvgText>
            )}
            {wellnessTrend.length > 1 && (
              <SvgText x={chartWidth - paddingRight} y={chartHeight - 4} fontSize="8" fill="#6B7280" textAnchor="middle">{wellnessTrend[wellnessTrend.length - 1].dateStr}</SvgText>
            )}
          </Svg>
        </View>
      </View>
    );
  };

  // ----------------------------------------------------
  // Trend line chart rendering helpers (uses react-native-svg)
  // ----------------------------------------------------
  const renderTrendChart = () => {
    // 直近最大7測定分に絞る
    const trend = analytics.trend.slice(-7);
    if (trend.length === 0) return null;

    const leftMetrics = [
      { key: "totalLoad", label: "Player Load" },
      { key: "totalJumps", label: "総ジャンプ数" },
      { key: "maxJumpHeight", label: "最高ジャンプ高" },
      { key: "avgJumpHeight", label: "平均ジャンプ高" },
      { key: "top5JumpHeight", label: "ジャンプ高 (Top5平均)" },
      { key: "totalDistance", label: "総走行距離" },
      { key: "highIntensityDistance", label: "高速走行距離" },
      { key: "accelCount", label: "加速回数" },
      { key: "maxAcceleration", label: "最高加速度" },
    ];

    const rightMetrics = [
      { key: "sRPE", label: "sRPE" },
      { key: "rpeValue", label: "主観強度 (RPE)" },
      { key: "avgHeartRate", label: "平均心拍数" },
      { key: "hrv", label: "HRV (心拍変動)" },
      { key: "wellnessSleep", label: "睡眠スコア" },
      { key: "none", label: "（非表示）" },
    ];

    const leftLabel = leftMetrics.find(m => m.key === chartLeftMetric)?.label || chartLeftMetric;
    const rightLabel = rightMetrics.find(m => m.key === chartRightMetric)?.label || chartRightMetric;

    const getSafeNum = (val: any): number => {
      const num = Number(val);
      return isNaN(num) || !isFinite(num) ? 0 : num;
    };

    // 動的に選択されたキーに基づいて最大値を取得
    const maxLoad = Math.max(...trend.map(t => getSafeNum((t as any)[chartLeftMetric])), 1) * 1.1;
    const maxSRPE = chartRightMetric === "none" ? 1 : Math.max(...trend.map(t => getSafeNum((t as any)[chartRightMetric])), 1) * 1.1;

    const chartWidth = windowWidth - 40; // Full width minus container padding
    const chartHeight = 180;
    const paddingLeft = 35;
    const paddingRight = 35;
    const paddingTop = 25;
    const paddingBottom = 25;

    const graphWidth = chartWidth - paddingLeft - paddingRight;
    const graphHeight = chartHeight - paddingTop - paddingBottom;

    const loadPoints = trend.map((t, index) => {
      const x = paddingLeft + (index * (trend.length > 1 ? graphWidth / (trend.length - 1) : graphWidth));
      const valDiff = maxLoad;
      const rawVal = getSafeNum((t as any)[chartLeftMetric]);
      let y = paddingTop + graphHeight;
      if (valDiff > 0 && !isNaN(valDiff) && isFinite(valDiff)) {
        y -= (rawVal / valDiff) * graphHeight;
      }
      if (isNaN(y) || !isFinite(y)) {
        y = paddingTop + graphHeight;
      }
      return { x, y, value: rawVal, dateStr: t.dateStr };
    });

    const srpePoints = chartRightMetric === "none" ? [] : trend.map((t, index) => {
      const x = paddingLeft + (index * (trend.length > 1 ? graphWidth / (trend.length - 1) : graphWidth));
      const valDiff = maxSRPE;
      const rawVal = getSafeNum((t as any)[chartRightMetric]);
      let y = paddingTop + graphHeight;
      if (valDiff > 0 && !isNaN(valDiff) && isFinite(valDiff)) {
        y -= (rawVal / valDiff) * graphHeight;
      }
      if (isNaN(y) || !isFinite(y)) {
        y = paddingTop + graphHeight;
      }
      return { x, y, value: rawVal };
    });

    let loadLinePath = "";
    if (loadPoints.length > 0) {
      loadLinePath = `M ${loadPoints[0].x} ${loadPoints[0].y}`;
      for (let i = 1; i < loadPoints.length; i++) {
        loadLinePath += ` L ${loadPoints[i].x} ${loadPoints[i].y}`;
      }
    }

    let srpeLinePath = "";
    if (srpePoints.length > 0) {
      srpeLinePath = `M ${srpePoints[0].x} ${srpePoints[0].y}`;
      for (let i = 1; i < srpePoints.length; i++) {
        srpeLinePath += ` L ${srpePoints[i].x} ${srpePoints[i].y}`;
      }
    }

    return (
      <View className="bg-surface rounded-3xl border border-border p-5 shadow-sm gap-4">
        <View className="flex-row justify-between items-center pb-2 border-b border-border/30">
          <View>
            <Text className="text-sm font-bold text-foreground">直近の運動量の推移 (最大7測定分)</Text>
            <Text className="text-[10px] text-muted font-medium">タップして各軸の可視化指標を切り替えられます</Text>
          </View>
        </View>

        {/* Legend & Metric Selector Buttons */}
        <View className="flex-row justify-between items-center gap-3 bg-[#F8FAFC] p-2.5 rounded-2xl border border-slate-100">
          <TouchableOpacity 
            onPress={() => {
              setSelectorTargetAxis("left");
              setMetricSelectorModalOpen(true);
            }}
            className="flex-1 flex-row items-center justify-center gap-1.5 bg-white border border-slate-200/80 py-2 px-3 rounded-xl shadow-xs"
          >
            <View className="w-2 h-2 rounded-full bg-[#FF6B35]" />
            <Text className="text-[10px] text-slate-700 font-bold">左軸: {leftLabel} ▾</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={() => {
              setSelectorTargetAxis("right");
              setMetricSelectorModalOpen(true);
            }}
            className="flex-1 flex-row items-center justify-center gap-1.5 bg-white border border-slate-200/80 py-2 px-3 rounded-xl shadow-xs"
          >
            <View className="w-2 h-2 rounded-full bg-[#8B5CF6]" />
            <Text className="text-[10px] text-slate-700 font-bold">右軸: {rightLabel} ▾</Text>
          </TouchableOpacity>
        </View>

        <View className="my-1">
          <Svg width={chartWidth} height={chartHeight}>
            {/* 選択した右軸指標の ±1.0SD のグレー帯バンド描画 */}
            {(() => {
              if (chartRightMetric === "none") return null;
              const rightBaseline = analytics.signalLight?.baselines?.[chartRightMetric];
              if (!rightBaseline) return null;
              const yMin = Math.max(0, rightBaseline.mean - rightBaseline.sd);
              const yMax = rightBaseline.mean + rightBaseline.sd;
              const valDiff = maxSRPE;
              if (valDiff <= 0) return null;
              const bandYStart = paddingTop + graphHeight - (yMax / valDiff) * graphHeight;
              const bandYEnd = paddingTop + graphHeight - (yMin / valDiff) * graphHeight;
              const bandHeight = bandYEnd - bandYStart;
              if (isNaN(bandHeight) || bandHeight <= 0) return null;
              return (
                <Rect
                  x={paddingLeft}
                  y={Math.max(paddingTop, bandYStart)}
                  width={graphWidth}
                  height={Math.min(graphHeight, bandHeight)}
                  fill="#C4B5FD"
                  opacity="0.2"
                />
              );
            })()}

            {/* Y axis lines */}
            <Line x1={paddingLeft} y1={paddingTop} x2={chartWidth - paddingRight} y2={paddingTop} stroke="#F3F4F6" />
            <Line x1={paddingLeft} y1={paddingTop + graphHeight / 2} x2={chartWidth - paddingRight} y2={paddingTop + graphHeight / 2} stroke="#F3F4F6" />
            <Line x1={paddingLeft} y1={chartHeight - paddingBottom} x2={chartWidth - paddingRight} y2={chartHeight - paddingBottom} stroke="#E5E7EB" strokeWidth="1.5" />

            {/* Left Y axis labels */}
            <SvgText x={paddingLeft - 6} y={paddingTop + 3} fontSize="8" fill="#FF6B35" fontWeight="bold" textAnchor="end">{Math.round(maxLoad)}</SvgText>
            <SvgText x={paddingLeft - 6} y={paddingTop + graphHeight / 2 + 3} fontSize="8" fill="#FF6B35" textAnchor="end">{Math.round(maxLoad / 2)}</SvgText>
            <SvgText x={paddingLeft - 6} y={chartHeight - paddingBottom + 3} fontSize="8" fill="#FF6B35" textAnchor="end">0</SvgText>

            {/* Right Y axis labels */}
            {chartRightMetric !== "none" && (
              <>
                <SvgText x={chartWidth - paddingRight + 6} y={paddingTop + 3} fontSize="8" fill="#8B5CF6" fontWeight="bold" textAnchor="start">{Math.round(maxSRPE)}</SvgText>
                <SvgText x={chartWidth - paddingRight + 6} y={paddingTop + graphHeight / 2 + 3} fontSize="8" fill="#8B5CF6" textAnchor="start">{Math.round(maxSRPE / 2)}</SvgText>
                <SvgText x={chartWidth - paddingRight + 6} y={chartHeight - paddingBottom + 3} fontSize="8" fill="#8B5CF6" textAnchor="start">0</SvgText>
              </>
            )}

            {/* Paths */}
            {loadLinePath ? (
              <Path 
                d={loadLinePath} 
                fill="none" 
                stroke="#FF6B35" 
                strokeWidth="2.5" 
                strokeLinecap="round" 
              />
            ) : null}

            {srpeLinePath ? (
              <Path 
                d={srpeLinePath} 
                fill="none" 
                stroke="#8B5CF6" 
                strokeWidth="2" 
                strokeDasharray="3 3"
                strokeLinecap="round" 
              />
            ) : null}

            {/* Points (Player Load) */}
            {loadPoints.map((p, idx) => (
              <Circle
                key={`load-${idx}`}
                cx={p.x}
                cy={p.y}
                r="3"
                fill="#FFFFFF"
                stroke="#FF6B35"
                strokeWidth="1.5"
              />
            ))}

            {/* Points (sRPE) */}
            {srpePoints.map((p, idx) => (
              <Circle
                key={`srpe-${idx}`}
                cx={p.x}
                cy={p.y}
                r="2"
                fill="#8B5CF6"
              />
            ))}

            {/* X axis labels */}
            {loadPoints.length > 0 && (
              <SvgText x={loadPoints[0].x} y={chartHeight - 6} fontSize="8" fill="#6B7280" textAnchor="middle">{loadPoints[0].dateStr}</SvgText>
            )}
            {loadPoints.length > 2 && (
              <SvgText x={loadPoints[Math.floor(loadPoints.length / 2)].x} y={chartHeight - 6} fontSize="8" fill="#6B7280" textAnchor="middle">{loadPoints[Math.floor(loadPoints.length / 2)].dateStr}</SvgText>
            )}
            {loadPoints.length > 1 && (
              <SvgText x={loadPoints[loadPoints.length - 1].x} y={chartHeight - 6} fontSize="8" fill="#6B7280" textAnchor="middle">{loadPoints[loadPoints.length - 1].dateStr}</SvgText>
            )}
          </Svg>
        </View>

        {/* Day of week average comparison */}
        <View className="gap-3 mt-2">
          <Text className="text-xs font-bold text-foreground pb-1 border-b border-border/50">曜日別の平均負荷 (曜日比較)</Text>
          <View className="flex-row justify-between items-end h-24 mt-2 px-1">
            {analytics.dayOfWeekAverages.map((day, idx) => {
              const maxDowLoad = Math.max(...analytics.dayOfWeekAverages.map(d => d.avgLoad), 1);
              const barHeight = `${(day.avgLoad / maxDowLoad) * 80}%`;
              const isToday = new Date().getDay() === idx;

              return (
                <View key={idx} className="items-center flex-1 gap-1.5 h-full justify-end">
                  <Text className="text-[7px] font-extrabold text-foreground font-mono">
                    {day.avgLoad > 0 ? Math.round(day.avgLoad) : ""}
                  </Text>
                  <View 
                    style={{ height: barHeight as any }} 
                    className={`w-4 rounded-t-md ${isToday ? "bg-primary" : "bg-muted"}`}
                  />
                  <Text className={`text-[10px] font-bold ${isToday ? "text-primary" : "text-muted"}`}>
                    {day.dayName}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>
    );
  };

  const renderMetricSelectorModal = () => {
    const leftMetrics = [
      { key: "totalLoad", label: "Player Load" },
      { key: "totalJumps", label: "総ジャンプ数" },
      { key: "maxJumpHeight", label: "最高ジャンプ高" },
      { key: "avgJumpHeight", label: "平均ジャンプ高" },
      { key: "top5JumpHeight", label: "ジャンプ高 (Top5平均)" },
      { key: "totalDistance", label: "総走行距離" },
      { key: "highIntensityDistance", label: "高速走行距離" },
      { key: "accelCount", label: "加速回数" },
      { key: "maxAcceleration", label: "最高加速度" },
    ];

    const rightMetrics = [
      { key: "sRPE", label: "sRPE" },
      { key: "rpeValue", label: "主観強度 (RPE)" },
      { key: "avgHeartRate", label: "平均心拍数" },
      { key: "hrv", label: "HRV (心拍変動)" },
      { key: "wellnessSleep", label: "睡眠スコア" },
      { key: "none", label: "（非表示）" },
    ];

    const list = selectorTargetAxis === "left" ? leftMetrics : rightMetrics;
    const currentVal = selectorTargetAxis === "left" ? chartLeftMetric : chartRightMetric;
    const setVal = selectorTargetAxis === "left" ? setChartLeftMetric : setChartRightMetric;

    return (
      <Modal
        visible={metricSelectorModalOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMetricSelectorModalOpen(false)}
      >
        <TouchableOpacity 
          activeOpacity={1} 
          onPress={() => setMetricSelectorModalOpen(false)}
          style={{ flex: 1, backgroundColor: "rgba(15, 23, 42, 0.4)", justifyContent: "center", alignItems: "center", padding: 20 }}
        >
          <TouchableOpacity 
            activeOpacity={1}
            style={{ backgroundColor: "#FFFFFF", borderRadius: 24, padding: 20, width: "100%", maxWidth: 340, gap: 16, shadowColor: "#0F172A", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 5 }}
          >
            <Text style={{ fontSize: 14, fontWeight: "bold", color: "#0F172A", textAlign: "center" }}>
              {selectorTargetAxis === "left" ? "左軸の指標選択" : "右軸の指標選択"}
            </Text>
            
            <ScrollView style={{ maxHeight: 300 }}>
              <View style={{ gap: 8 }}>
                {list.map((item) => {
                  const isSelected = currentVal === item.key;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      onPress={() => {
                        setVal(item.key);
                        setMetricSelectorModalOpen(false);
                      }}
                      style={{
                        paddingVertical: 12,
                        paddingHorizontal: 16,
                        borderRadius: 12,
                        backgroundColor: isSelected ? "#F3F4F6" : "transparent",
                        borderWidth: 1,
                        borderColor: isSelected ? "#E5E7EB" : "transparent",
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: isSelected ? "bold" : "normal", color: isSelected ? "#FF6B35" : "#374151" }}>
                        {item.label}
                      </Text>
                      {isSelected && <Text style={{ color: "#FF6B35", fontWeight: "bold" }}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
            
            <TouchableOpacity
              onPress={() => setMetricSelectorModalOpen(false)}
              style={{ backgroundColor: "#F1F5F9", paddingVertical: 12, borderRadius: 12, alignItems: "center" }}
            >
              <Text style={{ fontSize: 13, fontWeight: "bold", color: "#475569" }}>キャンセル</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    );
  };

  return (
    <ScreenContainer className="bg-background">
      {/* Header */}
      <View className="px-6 py-4 border-b border-border bg-surface flex-row items-center gap-3">
        <TouchableOpacity onPress={() => router.back()} className="p-1">
          <IconSymbol size={20} name="chevron.left" color="#4B5563" />
        </TouchableOpacity>
        <View className="flex-1 pr-2">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text className="text-xl font-bold text-foreground">トレンド分析</Text>
            {latest?.isAnomaly && (
              <View style={{ backgroundColor: latest.isCorrected ? "#E2E8F0" : "#FEE2E2", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                <Text style={{ fontSize: 8, fontWeight: "bold", color: latest.isCorrected ? "#475569" : "#EF4444" }}>
                  {latest.isCorrected ? "測定不良(補正済)" : "⚠️測定不良(要補正)"}
                </Text>
              </View>
            )}
          </View>
          <Text className="text-xs text-muted" numberOfLines={1}>
            {(athlete as any).user?.name} | {athlete.position || "ポジション未設定"} #{athlete.jerseyNumber || ""}
          </Text>
        </View>

        {/* 日付切り替えボタン */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <TouchableOpacity
            onPress={() => {
              const d = new Date(rawDate);
              d.setDate(d.getDate() - 1);
              setRawDate(d.toLocaleDateString("sv-SE"));
            }}
            style={{ backgroundColor: "#F1F5F9", padding: 6, borderRadius: 8 }}
          >
            <IconSymbol size={12} name="chevron.left" color="#475569" />
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={() => setCalendarModalOpen(true)}
            style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#F1F5F9", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 }}
          >
            <IconSymbol size={12} name="calendar" color="#64748B" />
            <Text style={{ fontSize: 11, fontWeight: "bold", color: "#475569" }}>
              {new Date(rawDate).toLocaleDateString("ja-JP", { month: "short", day: "numeric", weekday: "short" })}
            </Text>
            <IconSymbol size={10} name="chevron.down" color="#64748B" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              const d = new Date(rawDate);
              d.setDate(d.getDate() + 1);
              setRawDate(d.toLocaleDateString("sv-SE"));
            }}
            style={{ backgroundColor: "#F1F5F9", padding: 6, borderRadius: 8 }}
          >
            <IconSymbol size={12} name="chevron.right" color="#475569" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity 
          onPress={() => refetch()}
          className="p-2 bg-muted/20 rounded-full active:bg-muted/30 justify-center items-center"
          disabled={isFetching}
        >
          {isFetching ? (
            <ActivityIndicator size="small" color="#4B5563" style={{ width: 14, height: 14, transform: [{ scale: 0.7 }] }} />
          ) : (
            <IconSymbol size={14} name="arrow.clockwise" color="#4B5563" />
          )}
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View className="flex-row bg-surface border-b border-border px-3">
        {[
          { id: "summary", name: "総合サマリー", icon: "doc.text.fill" },
          { id: "jumps", name: "ジャンプ詳細", icon: "arrow.up.fill" },
          { id: "menu", name: "メニュー別", icon: "chart.pie.fill" },
          { id: "sleep", name: "睡眠ステージ", icon: "bed.double.fill" },
          { id: "comparison", name: "グループ比較", icon: "person.2.fill" }
        ].map(t => {
          const isActive = activeTab === t.id;
          return (
            <TouchableOpacity
              key={t.id}
              onPress={() => setActiveTab(t.id as any)}
              className={`flex-1 flex-row justify-center items-center gap-1 py-3 border-b-2 ${
                isActive ? "border-primary" : "border-transparent"
              }`}
            >
              <IconSymbol size={11} name={t.icon as any} color={isActive ? "#FF6B35" : "#9CA3AF"} />
              <Text className={`text-[10px] font-bold ${isActive ? "text-primary" : "text-muted"}`} numberOfLines={1}>
                {t.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
        <View className="gap-5">
          {activeTab === "summary" && (
            <>
              {renderManualAnomalyHandler()}
              {renderSignalLightCard()}
              {renderGuidanceAndAdvice()}
              {renderACWRGauge()}
              {renderTrendChart()}
              {renderWellnessChart()}
            </>
          )}
          {activeTab === "jumps" && renderJumpAnalytics()}
          {activeTab === "menu" && (
            <>
              {renderIndividualDashboard()}
              {renderMenuLoadAnalytics()}
            </>
          )}
          {activeTab === "sleep" && renderSleepStageAnalytics()}
          {activeTab === "comparison" && renderComparisonAnalytics()}
        </View>
      </ScrollView>
      {/* 日付選択カレンダーモーダル */}
      <Modal
        visible={calendarModalOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setCalendarModalOpen(false)}
      >
        <TouchableOpacity 
          activeOpacity={1} 
          onPress={() => setCalendarModalOpen(false)}
          style={{ flex: 1, backgroundColor: "rgba(15, 23, 42, 0.4)", justifyContent: "center", alignItems: "center", padding: 20 }}
        >
          <TouchableOpacity 
            activeOpacity={1}
            style={{ backgroundColor: "#FFFFFF", borderRadius: 24, padding: 20, width: "100%", maxWidth: 340, gap: 16, shadowColor: "#0F172A", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 5 }}
          >
            {/* カレンダーヘッダー */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderColor: "#F1F5F9", paddingBottom: 12 }}>
              <TouchableOpacity 
                onPress={() => {
                  if (calMonth === 1) {
                    setCalMonth(12);
                    setCalYear(prev => prev - 1);
                  } else {
                    setCalMonth(prev => prev - 1);
                  }
                }}
                style={{ padding: 8 }}
              >
                <IconSymbol size={16} name="chevron.left" color="#475569" />
              </TouchableOpacity>
              
              <Text style={{ fontSize: 14, fontWeight: "bold", color: "#1E293B" }}>
                {calYear}年 {calMonth}月
              </Text>

              <TouchableOpacity 
                onPress={() => {
                  if (calMonth === 12) {
                    setCalMonth(1);
                    setCalYear(prev => prev - 1);
                  } else {
                    setCalMonth(prev => prev + 1);
                  }
                }}
                style={{ padding: 8 }}
              >
                <IconSymbol size={16} name="chevron.right" color="#475569" />
              </TouchableOpacity>
            </View>

            {/* 曜日ヘッダー */}
            <View style={{ flexDirection: "row", marginBottom: 8 }}>
              {["日", "月", "火", "水", "木", "金", "土"].map((w, idx) => (
                <View key={idx} style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ fontSize: 10, fontWeight: "bold", color: idx === 0 ? "#EF4444" : idx === 6 ? "#3B82F6" : "#64748B" }}>
                    {w}
                  </Text>
                </View>
              ))}
            </View>

            {/* 日付グリッド */}
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {(() => {
                const daysInMonth = new Date(calYear, calMonth, 0).getDate();
                const firstDayIdx = new Date(calYear, calMonth - 1, 1).getDay();
                const cells = [];

                for (let i = 0; i < firstDayIdx; i++) {
                  cells.push(<View key={`empty-${i}`} style={{ width: "14.28%", aspectRatio: 1 }} />);
                }

                for (let d = 1; d <= daysInMonth; d++) {
                  const dateStr = `${calYear}-${String(calMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                  const isSelected = rawDate === dateStr;

                  cells.push(
                    <TouchableOpacity
                      key={`day-${d}`}
                      onPress={() => {
                        setRawDate(dateStr);
                        setCalendarModalOpen(false);
                      }}
                      style={{ 
                        width: "14.28%", 
                        aspectRatio: 1, 
                        justifyContent: "center", 
                        alignItems: "center",
                        padding: 2
                      }}
                    >
                      <View style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        backgroundColor: isSelected ? "#FF6B35" : "transparent",
                        justifyContent: "center",
                        alignItems: "center"
                      }}>
                        <Text style={{ 
                          fontSize: 12, 
                          fontWeight: "bold", 
                          color: isSelected ? "#FFFFFF" : "#1E293B" 
                        }}>
                          {d}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                }

                return cells;
              })()}
            </View>

            {/* 閉じる */}
            <View style={{ borderTopWidth: 1, borderColor: "#F1F5F9", marginTop: 12, paddingTop: 12, alignItems: "center" }}>
              <TouchableOpacity 
                onPress={() => setCalendarModalOpen(false)}
                style={{ paddingVertical: 8, paddingHorizontal: 24 }}
              >
                <Text style={{ fontSize: 13, fontWeight: "bold", color: "#64748B" }}>閉じる</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
      {renderMetricSelectorModal()}
    </ScreenContainer>
  );
}
