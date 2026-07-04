import React, { useState, useMemo } from "react";
import { ScrollView, Text, View, TouchableOpacity, ActivityIndicator, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import Svg, { Circle, Rect, Line, Text as SvgText, Path, Polyline } from "react-native-svg";

export const METRICS_MAP = [
  { key: "totalJumps", label: "ジャンプ量", desc: "外的負荷: ジャンプ回数", unit: "回", polarity: "positive", category: "load_ext" },
  { key: "sRPE", label: "sRPE(全体)", desc: "内の負荷: 練習強度×時間", unit: "AU", polarity: "positive", category: "load_int" },
  { key: "hrv", label: "HRV (心拍変動)", desc: "客観状態: 自律神経回復指標", unit: "ms", polarity: "negative", category: "state_obj" },
  { key: "wellnessSoreness", label: "筋肉痛 (DOMS)", desc: "主観状態: 筋肉の張りや痛み", unit: "1-7", polarity: "negative", category: "state_subj" },
  { key: "wellnessSleep", label: "睡眠の質", desc: "主観状態: 睡眠休養度", unit: "1-5", polarity: "negative", category: "state_subj" },
  { key: "wellnessFatigue", label: "主観的疲労感", desc: "主観状態: 全身疲労", unit: "1-7", polarity: "negative", category: "state_subj" },
  { key: "totalDistance", label: "総走行距離", desc: "外的負荷: 移動距離", unit: "m", polarity: "positive", category: "load_ext" },
  { key: "highIntensityDistance", label: "高速走行距離", desc: "外的負荷: 高速移動距離", unit: "m", polarity: "positive", category: "load_ext" },
  { key: "avgHeartRate", label: "平均心拍数", desc: "客観負荷: 循環器系負荷", unit: "bpm", polarity: "positive", category: "load_int" },
  { key: "physiologicalMarker", label: "生理学マーカー(CK)", desc: "客観状態: 血液生化学(筋肉損傷)", unit: "U/L", polarity: "positive", category: "state_obj" },
] as const;

function ZScoreBar({ label, zScore, status, val, baselineMean, unit = "", history = [], polarity = "positive" }: {
  label: string;
  zScore: number;
  status: "green" | "yellow" | "red";
  val: number;
  baselineMean: number;
  unit?: string;
  history?: number[];
  polarity?: "positive" | "negative";
}) {
  const sparklineWidth = 55;
  const sparklineHeight = 22;
  let sparklinePoints = "";
  
  if (history.length > 1) {
    const minVal = Math.min(...history);
    const maxVal = Math.max(...history);
    const valDiff = maxVal - minVal;
    const stepX = sparklineWidth / (history.length - 1);
    
    const pts = history.map((v, idx) => {
      const x = idx * stepX;
      const y = sparklineHeight - 3 - (valDiff > 0 ? ((v - minVal) / valDiff) * (sparklineHeight - 6) : (sparklineHeight - 6) / 2);
      return `${x},${y}`;
    });
    sparklinePoints = pts.join(" ");
  }

  const pinPercent = Math.min(100, Math.max(0, ((zScore + 3) / 6) * 100));
  
  let reliabilityText = "データ不足";
  let reliabilityBg = "#E2E8F0";
  let reliabilityColor = "#64748B";
  
  if (history.length >= 14) {
    reliabilityText = "信頼性 高";
    reliabilityBg = "#DBEAFE";
    reliabilityColor = "#1D4ED8";
  } else if (history.length >= 7) {
    reliabilityText = "信頼性 中";
    reliabilityBg = "#FEF3C7";
    reliabilityColor = "#D97706";
  } else if (history.length >= 3) {
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

  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginVertical: 6, paddingVertical: 4, borderBottomWidth: 1, borderColor: "#F1F5F9" }}>
      <View style={{ width: 105, gap: 2 }}>
        <Text style={{ fontSize: 12, color: "#1E293B", fontWeight: "bold" }}>{label}</Text>
        {history.length > 1 ? (
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
                cy={sparklineHeight - 3 - (Math.max(...history) - Math.min(...history) > 0 ? ((history[history.length - 1] - Math.min(...history)) / (Math.max(...history) - Math.min(...history))) * (sparklineHeight - 6) : (sparklineHeight - 6) / 2)}
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
          {val % 1 === 0 ? val : val.toFixed(1)} <Text style={{ fontSize: 8, fontWeight: "normal", color: "#64748B" }}>{unit}</Text>
        </Text>
        <Text style={{ fontSize: 8, color: "#94A3B8" }}>
          基準: {baselineMean.toFixed(1)}
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
          {zScore > 0 ? `+${zScore.toFixed(1)}` : zScore.toFixed(1)} SD
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

export default function AthleteAnalyticsScreen() {
  const { width: windowWidth } = useWindowDimensions();
  const { id } = useLocalSearchParams();
  const athleteId = Number(id);
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<"summary" | "jumps" | "menu" | "comparison">("summary");

  // Fetch specific athlete profile
  const { data: athlete, isLoading: athleteLoading } = trpc.athlete.getById.useQuery(
    { id: athleteId },
    { enabled: !!athleteId }
  );

  // Fetch full analytics dashboard data for this athlete
  const { data: analytics, isLoading: analyticsLoading, refetch } = trpc.performance.getAthleteAnalytics.useQuery(
    { athleteId: athleteId || 0 },
    { enabled: !!athleteId }
  );

  if (athleteLoading || analyticsLoading) {
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

    const clampedVal = Math.max(0.0, Math.min(2.0, acwrVal));
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
            <Text className="text-xl font-extrabold text-foreground font-mono">{acwrVal.toFixed(2)}</Text>
          </View>
          <View className="w-[1px] h-8 bg-border" />
          <View className="items-center flex-1">
            <Text className="text-[9px] text-muted font-bold mb-0.5">急性的負荷 (7日間平均)</Text>
            <Text className="text-base font-extrabold text-foreground font-mono">{acute}</Text>
          </View>
          <View className="w-[1px] h-8 bg-border" />
          <View className="items-center flex-1">
            <Text className="text-[9px] text-muted font-bold mb-0.5">慢性的負荷 (28日間平均)</Text>
            <Text className="text-base font-extrabold text-foreground font-mono">{chronic}</Text>
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
      { name: "Zone 1 (~20)", count: z1, color: "bg-blue-500/20 text-blue-700" },
      { name: "Zone 2 (20~30)", count: z2, color: "bg-cyan-500/20 text-cyan-700" },
      { name: "Zone 3 (30~40)", count: z3, color: "bg-amber-500/20 text-amber-700" },
      { name: "Zone 4 (40~50)", count: z4, color: "bg-orange-500/30 text-orange-700" },
      { name: "Zone 5 (50+)", count: z5, color: "bg-red-500/30 text-red-700" },
    ];
    
    const totalJumps = latest.totalJumps || 0;
    const jumpsOver40 = latest.jumpsOver40cm || 0;
    const ratio40 = totalJumps > 0 ? ((jumpsOver40 / totalJumps) * 100).toFixed(1) : "0.0";
    
    const maxCount = Math.max(...zones.map(z => z.count), 1);

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
          <View className="flex-1 bg-accent/5 border border-accent/10 p-3.5 rounded-2xl">
            <Text className="text-[9px] text-muted font-bold mb-1">平均ジャンプ高</Text>
            <Text className="text-base font-extrabold text-accent font-mono">
              {latest.avgJumpHeight ? `${Number(latest.avgJumpHeight).toFixed(1)} cm` : "--"}
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

        {latest.duration && (
          <View className="bg-muted/10 p-4 rounded-2xl border border-border/40 flex-row justify-between items-center">
            <View className="gap-0.5">
              <Text className="text-xs font-bold text-foreground">ジャンプ頻度</Text>
              <Text className="text-[10px] text-muted font-normal">練習時間1分間あたりのジャンプ数</Text>
            </View>
            <Text className="text-base font-extrabold text-foreground font-mono">
              {(totalJumps / (latest.duration / 60)).toFixed(2)} 回/分
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
    try {
      if (latest.rawMenuData) {
        menuLoads = typeof latest.rawMenuData === "string" ? JSON.parse(latest.rawMenuData) : latest.rawMenuData;
      }
    } catch (e) {
      console.warn("Failed to parse rawMenuData", e);
    }

    const menuItems = Object.entries(menuLoads).map(([name, val]) => ({
      name,
      load: Number(val)
    })).sort((a, b) => b.load - a.load);

    const totalLoadSum = menuItems.reduce((a, b) => a + b.load, 0) || 1;

    return (
      <View className="bg-surface rounded-3xl border border-border p-5 shadow-sm gap-5">
        <View>
          <Text className="text-sm font-bold text-foreground">練習メニュー別運動量</Text>
          <Text className="text-[10px] text-muted font-medium">メニューごとの負荷配分と自主練の数値</Text>
        </View>

        {menuItems.length > 0 ? (
          <View className="gap-5">
            <View className="h-6 w-full rounded-full overflow-hidden flex-row border border-border/30 bg-muted/20">
              {menuItems.map((item, idx) => {
                const itemPercent = `${(item.load / totalLoadSum) * 100}%`;
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
                const percentVal = ((item.load / totalLoadSum) * 100).toFixed(1);
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
                      {item.load.toFixed(1)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : (
          <View className="py-8 items-center justify-center">
            <Text className="text-xs text-muted">メニュー別負荷データが登録されていません。</Text>
          </View>
        )}
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
      { key: "avgJumpHeight", title: "平均ジャンプ高", unit: "cm", isInt: true },
    ];

    return (
      <View className="bg-surface rounded-3xl border border-border p-5 shadow-sm gap-6">
        <View>
          <Text className="text-sm font-bold text-foreground">チーム・ポジション比較</Text>
          <Text className="text-[10px] text-muted font-medium">過去28日間の練習平均値の比較</Text>
        </View>

        <View className="gap-5">
          {metrics.map((m, idx) => {
            const ownVal = (own as any)[m.key];
            const teamVal = (team as any)[m.key];
            const posVal = (pos as any)[m.key];
            
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

  const renderSignalLightCard = () => {
    const signal = analytics.signalLight;
    if (!signal) return null;

    const enabledMetrics = signal.enabledMetrics || [];

    return (
      <View style={{ gap: 16 }}>
        {/* 1. コンディション自動要約バナー (画像のような薄赤バナー) */}
        <View style={{
          backgroundColor: signal.status === "red" ? "#FDF2F2" : signal.status === "yellow" ? "#FFFDF5" : "#F4FBF7",
          borderColor: signal.status === "red" ? "#F8D7DA" : signal.status === "yellow" ? "#FFF3CD" : "#D1E7DD",
          borderWidth: 1, borderRadius: 16, padding: 16
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Text style={{ fontSize: 18 }}>
              {signal.status === "red" ? "🔴" : signal.status === "yellow" ? "🟡" : "🟢"}
            </Text>
            <Text style={{ fontSize: 14, fontWeight: "bold", color: signal.status === "red" ? "#842029" : signal.status === "yellow" ? "#664D03" : "#0F5132" }}>
              本日のコンディション判定: {signal.status === "red" ? "要確認" : signal.status === "yellow" ? "注意" : "良好"}
            </Text>
          </View>
          <Text style={{
            fontSize: 12, fontWeight: "semibold",
            color: signal.status === "red" ? "#842029" : signal.status === "yellow" ? "#664D03" : "#0F5132",
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
              負荷を確認 LOAD — 外的 / 内的応答
            </Text>
            
            {METRICS_MAP
              .filter(m => (m.category === "load_ext" || m.category === "load_int") && enabledMetrics.includes(m.key))
              .map(m => {
                const base = signal.baselines?.[m.key];
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
              状態 / レディネス 明細 STATE — 個人基準±SD
            </Text>
            
            {METRICS_MAP
              .filter(m => (m.category === "state_subj" || m.category === "state_obj") && enabledMetrics.includes(m.key))
              .map(m => {
                const base = signal.baselines?.[m.key];
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
    const wellnessTrend = trend.filter(t => t.wellnessSleep > 0);
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

    // Y values: 1 to 5. So diff is 4.
    const mapY = (val: number) => {
      const clampedVal = Math.max(1, Math.min(5, val));
      return paddingTop + graphHeight - ((clampedVal - 1) / 4) * graphHeight;
    };

    const getLinePath = (key: "wellnessSleep" | "wellnessFatigue" | "wellnessSoreness" | "wellnessStress") => {
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
          <Text className="text-[10px] text-muted font-medium">主観コンディション (1:不良 〜 5:良好)</Text>
        </View>

        {/* Legend */}
        <View className="flex-row justify-between px-1 mt-1">
          <View className="flex-row items-center gap-1">
            <View style={{ backgroundColor: colors.sleep }} className="w-2 h-2 rounded-full" />
            <Text className="text-[9px] text-muted font-bold">睡眠</Text>
          </View>
          <View className="flex-row items-center gap-1">
            <View style={{ backgroundColor: colors.fatigue }} className="w-2 h-2 rounded-full" />
            <Text className="text-[9px] text-muted font-bold">疲労</Text>
          </View>
          <View className="flex-row items-center gap-1">
            <View style={{ backgroundColor: colors.soreness }} className="w-2 h-2 rounded-full" />
            <Text className="text-[9px] text-muted font-bold">筋肉の張り</Text>
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
              const wMean = wellnessBaseline.mean / 4;
              const wSd = wellnessBaseline.sd / 4;
              const yMin = Math.max(1, wMean - wSd);
              const yMax = Math.min(5, wMean + wSd);
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

            {/* Grid lines (1 to 5) */}
            {[1, 2, 3, 4, 5].map((val) => {
              const y = mapY(val);
              return (
                <Line 
                  key={val}
                  x1={paddingLeft} 
                  y1={y} 
                  x2={chartWidth - paddingRight} 
                  y2={y} 
                  stroke={val === 1 ? "#E5E7EB" : "#F3F4F6"} 
                  strokeWidth={val === 1 ? "1.5" : "1"}
                />
              );
            })}

            {/* Y axis labels */}
            {[1, 3, 5].map((val) => {
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
            <Path d={getLinePath("wellnessSleep")} fill="none" stroke={colors.sleep} strokeWidth="1.8" strokeLinecap="round" />
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
    const trend = analytics.trend;
    if (trend.length === 0) return null;

    const maxLoad = Math.max(...trend.map(t => t.totalLoad), 1) * 1.1;
    const maxSRPE = Math.max(...trend.map(t => t.sRPE), 1) * 1.1;

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
      const y = paddingTop + graphHeight - (valDiff > 0 ? (t.totalLoad / valDiff) * graphHeight : 0);
      return { x, y, value: t.totalLoad, dateStr: t.dateStr };
    });

    const srpePoints = trend.map((t, index) => {
      const x = paddingLeft + (index * (trend.length > 1 ? graphWidth / (trend.length - 1) : graphWidth));
      const valDiff = maxSRPE;
      const y = paddingTop + graphHeight - (valDiff > 0 ? (t.sRPE / valDiff) * graphHeight : 0);
      return { x, y, value: t.sRPE };
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
        <View className="flex-row justify-between items-center">
          <View>
            <Text className="text-sm font-bold text-foreground">負荷バランス推移</Text>
            <Text className="text-[10px] text-muted font-medium">客観負荷 (Player Load) と主観負荷 (sRPE) の比較</Text>
          </View>
        </View>

        {/* Legend */}
        <View className="flex-row justify-center gap-6 mt-1">
          <View className="flex-row items-center gap-1.5">
            <View className="w-2.5 h-2.5 rounded-full bg-[#FF6B35]" />
            <Text className="text-[10px] text-muted font-bold">Player Load (左軸)</Text>
          </View>
          <View className="flex-row items-center gap-1.5">
            <View className="w-2.5 h-2.5 rounded-full bg-[#8B5CF6]" />
            <Text className="text-[10px] text-muted font-bold">sRPE (右軸)</Text>
          </View>
        </View>

        <View className="my-1">
          <Svg width={chartWidth} height={chartHeight}>
            {/* sRPE ±1.0SD のグレー帯バンド描画 */}
            {(() => {
              const sRpeBaseline = analytics.signalLight?.baselines?.sRPE;
              if (!sRpeBaseline) return null;
              const yMin = Math.max(0, sRpeBaseline.mean - sRpeBaseline.sd);
              const yMax = sRpeBaseline.mean + sRpeBaseline.sd;
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

            {/* Y axis labels */}
            <Line x1={paddingLeft} y1={paddingTop} x2={chartWidth - paddingRight} y2={paddingTop} stroke="#F3F4F6" />
            <Line x1={paddingLeft} y1={paddingTop + graphHeight / 2} x2={chartWidth - paddingRight} y2={paddingTop + graphHeight / 2} stroke="#F3F4F6" />
            <Line x1={paddingLeft} y1={chartHeight - paddingBottom} x2={chartWidth - paddingRight} y2={chartHeight - paddingBottom} stroke="#E5E7EB" strokeWidth="1.5" />

            {/* Left Y axis labels (Player Load) */}
            <SvgText x={paddingLeft - 6} y={paddingTop + 3} fontSize="8" fill="#FF6B35" fontWeight="bold" textAnchor="end">{Math.round(maxLoad)}</SvgText>
            <SvgText x={paddingLeft - 6} y={paddingTop + graphHeight / 2 + 3} fontSize="8" fill="#FF6B35" textAnchor="end">{Math.round(maxLoad / 2)}</SvgText>
            <SvgText x={paddingLeft - 6} y={chartHeight - paddingBottom + 3} fontSize="8" fill="#FF6B35" textAnchor="end">0</SvgText>

            {/* Right Y axis labels (sRPE) */}
            <SvgText x={chartWidth - paddingRight + 6} y={paddingTop + 3} fontSize="8" fill="#8B5CF6" fontWeight="bold" textAnchor="start">{Math.round(maxSRPE)}</SvgText>
            <SvgText x={chartWidth - paddingRight + 6} y={paddingTop + graphHeight / 2 + 3} fontSize="8" fill="#8B5CF6" textAnchor="start">{Math.round(maxSRPE / 2)}</SvgText>
            <SvgText x={chartWidth - paddingRight + 6} y={chartHeight - paddingBottom + 3} fontSize="8" fill="#8B5CF6" textAnchor="start">0</SvgText>

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

  return (
    <ScreenContainer className="bg-background">
      {/* Header */}
      <View className="px-6 py-4 border-b border-border bg-surface flex-row items-center gap-3">
        <TouchableOpacity onPress={() => router.back()} className="p-1">
          <IconSymbol size={20} name="chevron.left" color="#4B5563" />
        </TouchableOpacity>
        <View className="flex-1 pr-2">
          <Text className="text-xl font-bold text-foreground">トレンド分析</Text>
          <Text className="text-xs text-muted" numberOfLines={1}>
            {(athlete as any).user?.name} | {athlete.position || "ポジション未設定"} #{athlete.jerseyNumber || ""}
          </Text>
        </View>
        <TouchableOpacity 
          onPress={() => refetch()}
          className="p-2.5 bg-muted/20 rounded-full active:bg-muted/30"
        >
          <IconSymbol size={14} name="arrow.clockwise" color="#4B5563" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View className="flex-row bg-surface border-b border-border px-3">
        {[
          { id: "summary", name: "総合サマリー", icon: "doc.text.fill" },
          { id: "jumps", name: "ジャンプ詳細", icon: "arrow.up.fill" },
          { id: "menu", name: "メニュー別", icon: "chart.pie.fill" },
          { id: "comparison", name: "グループ比較", icon: "person.2.fill" }
        ].map(t => {
          const isActive = activeTab === t.id;
          return (
            <TouchableOpacity
              key={t.id}
              onPress={() => setActiveTab(t.id as any)}
              className={`flex-1 flex-row justify-center items-center gap-1.5 py-3.5 border-b-2 ${
                isActive ? "border-primary" : "border-transparent"
              }`}
            >
              <IconSymbol size={12} name={t.icon as any} color={isActive ? "#FF6B35" : "#9CA3AF"} />
              <Text className={`text-[11px] font-bold ${isActive ? "text-primary" : "text-muted"}`}>
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
              {renderSignalLightCard()}
              {renderGuidanceAndAdvice()}
              {renderACWRGauge()}
              {renderTrendChart()}
              {renderWellnessChart()}
            </>
          )}
          {activeTab === "jumps" && renderJumpAnalytics()}
          {activeTab === "menu" && renderMenuLoadAnalytics()}
          {activeTab === "comparison" && renderComparisonAnalytics()}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
