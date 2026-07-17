import { ScrollView, Text, View, TouchableOpacity, ActivityIndicator, useWindowDimensions, Modal, TextInput } from "react-native";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "expo-router";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import Svg, { Path, Circle, Rect, G, Text as SvgText, Line, Polyline } from "react-native-svg";

const MINI_CHART_HEIGHT = 80;

export const ATHLETE_METRICS_MAP = [
  { key: "totalJumps", label: "ジャンプ量", desc: "外的負荷: ジャンプ回数", unit: "回", polarity: "positive", category: "load_ext" },
  { key: "sRPE", label: "sRPE(全体)", desc: "内の負荷: 練習強度×時間", unit: "AU", polarity: "positive", category: "load_int" },
  { key: "hrv", label: "HRV (心拍変動)", desc: "客観状態: 自律神経回復指標", unit: "ms", polarity: "negative", category: "state_obj" },
  { key: "wellnessFatigue", label: "主観的疲労感", desc: "主観状態: 全身疲労", unit: "1-7", polarity: "negative", category: "state_subj" },
  { key: "wellnessSoreness", label: "食欲", desc: "主観状態: 内臓疲労・食欲", unit: "1-7", polarity: "negative", category: "state_subj" },
  { key: "wellnessStress", label: "気分・モチベーション", desc: "主観状態: 精神的コンディション", unit: "1-7", polarity: "negative", category: "state_subj" },
  { key: "totalDistance", label: "総走行距離", desc: "外的負荷: 移動距離", unit: "m", polarity: "positive", category: "load_ext" },
  { key: "highIntensityDistance", label: "高速走行距離", desc: "外的負荷: 高速移動距離", unit: "m", polarity: "positive", category: "load_ext" },
  { key: "avgHeartRate", label: "平均心拍数", desc: "客観負荷: 循環器系負荷", unit: "bpm", polarity: "positive", category: "load_int" },
  { key: "physiologicalMarker", label: "生理学マーカー(CK)", desc: "客観状態: 血液生化学(筋肉損傷)", unit: "U/L", polarity: "positive", category: "state_obj" },
] as const;

function AthleteZScoreBar({ label, zScore, status, val, baselineMean, unit = "", history = [], polarity = "positive" }: {
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

const DoughnutChart = ({ data, colors }: { data: { label: string, value: number }[], colors: string[] }) => {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) {
    return <Text style={{ color: "#64748B", fontStyle: "italic", fontSize: 11, textAlign: "center", marginVertical: 20 }}>対象のメニューデータがありません</Text>;
  }

  let accumulatedPercent = 0;
  const radius = 35;
  const circumference = 2 * Math.PI * radius; // 219.91

  return (
    <View style={{ alignItems: "center", gap: 14, width: "100%" }}>
      <View style={{ width: 120, height: 120, position: "relative", alignItems: "center", justifyContent: "center" }}>
        <Svg width="120" height="120" viewBox="0 0 100 100">
          <G rotation="-90" origin="50, 50">
            {/* Base circle path background */}
            <Circle cx="50" cy="50" r={radius} fill="transparent" stroke="#F1F5F9" strokeWidth="12" />
            
            {data.map((item, idx) => {
              const percent = item.value / total;
              const strokeLength = circumference * percent;
              const rotation = accumulatedPercent * 360;
              accumulatedPercent += percent;

              return (
                <Circle
                  key={idx}
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="transparent"
                  stroke={colors[idx % colors.length]}
                  strokeWidth="12"
                  strokeDasharray={`${strokeLength} ${circumference - strokeLength}`}
                  strokeDashoffset={0}
                  transform={`rotate(${rotation} 50 50)`}
                />
              );
            })}
          </G>
        </Svg>
        <View style={{ position: "absolute", alignItems: "center" }}>
          <Text style={{ fontSize: 9, color: "#64748B", fontWeight: "bold" }}>TOTAL</Text>
          <Text style={{ fontSize: 13, fontWeight: "bold", color: "#0F172A" }}>
            {total >= 1000 ? Math.round(total).toLocaleString() : total.toFixed(1)}
          </Text>
        </View>
      </View>

      <View style={{ width: "100%", gap: 6, paddingHorizontal: 10 }}>
        {data.map((item, idx) => {
          const percent = (item.value / total) * 100;
          return (
            <View key={idx} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                <View style={{ width: 8, height: 8, borderRadius: 2.5, backgroundColor: colors[idx % colors.length] }} />
                <Text style={{ fontSize: 11, color: "#475569" }} numberOfLines={1}>{item.label}</Text>
              </View>
              <Text style={{ fontSize: 11, fontWeight: "bold", color: "#0F172A" }}>
                {percent.toFixed(1)}% ({item.value >= 1000 ? Math.round(item.value).toLocaleString() : item.value.toFixed(1)})
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

interface PerformanceMetrics {
  maxJumpHeight?: number;
  totalLoad?: number;
  avgAcceleration?: number;
  totalDistance?: number;
}

export const METRICS_MAP = [
  { key: "totalJumps", label: "総ジャンプ数", desc: "外的負荷: ジャンプの合計回数", unit: "回", polarity: "positive", category: "load_ext" },
  { key: "maxJumpHeight", label: "最高ジャンプ高", desc: "外的負荷: 最高跳躍高", unit: "cm", polarity: "positive", category: "load_ext" },
  { key: "avgJumpHeight", label: "平均ジャンプ高 (全数平均)", desc: "外的負荷: 全ジャンプの平均値", unit: "cm", polarity: "positive", category: "load_ext" },
  { key: "top5JumpHeight", label: "平均ジャンプ高 (Top5平均)", desc: "神経筋: エラー除外後のTop5平均値", unit: "cm", polarity: "positive", category: "load_ext" },
  { key: "jumpVolume", label: "ジャンプボリューム", desc: "外的負荷: ジャンプの総高さ", unit: "cm", polarity: "positive", category: "load_ext" },
  { key: "totalLoad", label: "Player Load", desc: "外的負荷: 運動による総物理負荷", unit: "PL", polarity: "positive", category: "load_ext" },
  { key: "accelCount", label: "加速回数", desc: "外的負荷: 急加速の発生回数", unit: "回", polarity: "positive", category: "load_ext" },
  { key: "maxAcceleration", label: "最高加速度", desc: "外的負荷: 最大の加速強度", unit: "m/s²", polarity: "positive", category: "load_ext" },
  { key: "sRPE", label: "sRPE (Total)", desc: "内的負荷: 1日の総 sRPE 合計", unit: "AU", polarity: "positive", category: "load_int" },
  { key: "sRpeBall", label: "sRPE (Ball)", desc: "内的負荷: バレーボール練習の sRPE", unit: "AU", polarity: "positive", category: "load_int" },
  { key: "sRpeSandC", label: "sRPE (S&C)", desc: "内的負荷: フィジカル・S&Cの sRPE", unit: "AU", polarity: "positive", category: "load_int" },
  { key: "rpeValue", label: "主観強度 (RPE)", desc: "内の負荷: 練習の主観的きつさ(1-10)", unit: "強度", polarity: "positive", category: "load_int" },
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
  { key: "wellnessFatigue", label: "疲労感", desc: "主観状態: 全身の疲労度(低スコア推奨)", unit: "点", polarity: "negative", category: "state_subj" },
  { key: "wellnessStress", label: "気分・モチベーション", desc: "主観状態: 精神的コンディション", unit: "点", polarity: "positive", category: "state_subj" },
  { key: "wellnessSoreness", label: "食欲", desc: "主観状態: 内臓疲労・食欲", unit: "点", polarity: "positive", category: "state_subj" },
] as const;

interface ZScoreBarProps {
  label: string;
  zScore: number;
  status: "green" | "yellow" | "red";
  val: number;
  baselineMean: number;
  unit?: string;
  history?: number[];
  polarity?: "positive" | "negative";
}

function ZScoreBar({ label, zScore, status, val, baselineMean, unit = "", history = [], polarity = "positive" }: ZScoreBarProps) {
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

export function getCellStyle(zScore: number, polarity: "positive" | "negative") {
  let type: "normal" | "improve2" | "improve1" | "worse1" | "worse2" = "normal";
  
  if (polarity === "positive") {
    if (zScore >= 2.0) type = "worse2";
    else if (zScore >= 1.0) type = "worse1";
    else if (zScore <= -2.0) type = "improve2";
    else if (zScore <= -1.0) type = "improve1";
  } else {
    if (zScore <= -2.0) type = "worse2";
    else if (zScore <= -1.0) type = "worse1";
    else if (zScore >= 2.0) type = "improve2";
    else if (zScore >= 1.0) type = "improve1";
  }

  const styles = {
    normal: { bg: "#FFFFFF", text: "#1E293B" },
    improve2: { bg: "#C9DAF8", text: "#1C4587" },
    improve1: { bg: "#E8F0FE", text: "#1A73E8" },
    worse1: { bg: "#FFF2CC", text: "#7F6000" },
    worse2: { bg: "#FCE4D6", text: "#C00000" },
  };

  return styles[type];
}

const AnomalyItemRow = ({ item, onResolve, correctMutation }: { item: any; onResolve: () => void; correctMutation: any }) => {
  const [correctLoad, setCorrectLoad] = useState(true);
  const [correctJumps, setCorrectJumps] = useState(true);
  const [correctAccel, setCorrectAccel] = useState(true);

  const handleCorrect = async (useAverage: boolean) => {
    try {
      const metrics: string[] = [];
      if (useAverage) {
        if (correctLoad) metrics.push("totalLoad");
        if (correctJumps) {
          metrics.push("totalJumps");
          metrics.push("avgJumpHeight");
          metrics.push("top5JumpHeight");
        }
        if (correctAccel) metrics.push("accelCount");
      }
      // metrics が空配列の場合、生データのまま承認（isCorrected = true, metricsToCorrect = []）となります
      await correctMutation.mutateAsync({
        recordId: item.id,
        metricsToCorrect: metrics
      });
      alert(useAverage 
        ? `${item.athleteName} 選手の指定データをポジション平均値で補正・承認しました。`
        : `${item.athleteName} 選手の測定データを生データのまま正常として承認しました。`
      );
      onResolve();
    } catch (e: any) {
      alert(`承認・補正処理に失敗しました: ${e.message}`);
    }
  };

  return (
    <View style={{ backgroundColor: "#F8FAFC", borderRadius: 16, borderWidth: 1, borderColor: "#E2E8F0", padding: 14, gap: 8, marginBottom: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontSize: 13, fontWeight: "bold", color: "#0F172A" }}>
          {item.athleteName} (No.{item.jerseyNumber})
        </Text>
        <Text style={{ fontSize: 10, fontWeight: "bold", color: "#64748B", backgroundColor: "#E2E8F0", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
          {item.position}
        </Text>
      </View>

      <Text style={{ fontSize: 11, color: "#475569" }}>
        日付: {new Date(item.date).toLocaleDateString("ja-JP", { month: "short", day: "numeric", weekday: "short" })}
      </Text>

      <View style={{ backgroundColor: "#FEF2F2", padding: 8, borderRadius: 8, gap: 2 }}>
        <Text style={{ fontSize: 11, fontWeight: "bold", color: "#991B1B" }}>検出された異常値:</Text>
        <Text style={{ fontSize: 10, color: "#B91C1C", lineHeight: 14 }}>{item.anomalyDetails}</Text>
      </View>

      {/* 項目ごとの補正選択チェックボックス */}
      <View style={{ gap: 8, marginVertical: 6, borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#E2E8F0", paddingVertical: 8 }}>
        <Text style={{ fontSize: 11, fontWeight: "bold", color: "#475569" }}>ポジション平均に補正する項目:</Text>
        
        {/* PlayerLoad */}
        <TouchableOpacity 
          onPress={() => setCorrectLoad(!correctLoad)}
          style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
        >
          <View style={{ width: 16, height: 16, borderRadius: 4, borderWidth: 2, borderColor: "#FF6B35", backgroundColor: correctLoad ? "#FF6B35" : "transparent", alignItems: "center", justifyContent: "center" }}>
            {correctLoad && <Text style={{ color: "#FFFFFF", fontSize: 10, fontWeight: "bold" }}>✓</Text>}
          </View>
          <Text style={{ fontSize: 12, color: "#1E293B" }}>PlayerLoad (全体負荷を平均値で補正)</Text>
        </TouchableOpacity>

        {/* Jumps */}
        <TouchableOpacity 
          onPress={() => setCorrectJumps(!correctJumps)}
          style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
        >
          <View style={{ width: 16, height: 16, borderRadius: 4, borderWidth: 2, borderColor: "#FF6B35", backgroundColor: correctJumps ? "#FF6B35" : "transparent", alignItems: "center", justifyContent: "center" }}>
            {correctJumps && <Text style={{ color: "#FFFFFF", fontSize: 10, fontWeight: "bold" }}>✓</Text>}
          </View>
          <Text style={{ fontSize: 12, color: "#1E293B" }}>Jumps (ジャンプ数・平均高さを平均値で補正)</Text>
        </TouchableOpacity>

        {/* Acceleration */}
        <TouchableOpacity 
          onPress={() => setCorrectAccel(!correctAccel)}
          style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
        >
          <View style={{ width: 16, height: 16, borderRadius: 4, borderWidth: 2, borderColor: "#FF6B35", backgroundColor: correctAccel ? "#FF6B35" : "transparent", alignItems: "center", justifyContent: "center" }}>
            {correctAccel && <Text style={{ color: "#FFFFFF", fontSize: 10, fontWeight: "bold" }}>✓</Text>}
          </View>
          <Text style={{ fontSize: 12, color: "#1E293B" }}>IMA (加速回数を平均値で補正)</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
        <TouchableOpacity
          onPress={() => handleCorrect(true)}
          style={{
            flex: 1.8,
            backgroundColor: "#0F172A",
            paddingVertical: 10,
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: "bold", color: "#FFFFFF" }}>
            選択項目を補正して承認
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => handleCorrect(false)}
          style={{
            flex: 1.2,
            backgroundColor: "#E2E8F0",
            paddingVertical: 10,
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: "bold", color: "#0F172A" }}>
            補正なしで承認
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default function HomeScreen() {
  const { width: windowWidth } = useWindowDimensions();
  const { user, isAuthenticated, loading, logout } = useAuth();
  const isEnglish = user?.email === "viewer_en@example.com" || user?.openId === "demoviewer_en";
  const t = (ja: string, en: string) => {
    return isEnglish ? en : ja;
  };
  const router = useRouter();
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [rawDate, setRawDate] = useState(new Date().toLocaleDateString("sv-SE"));
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [trendMetric, setTrendMetric] = useState<"load" | "jumps">("load");
  const mockTokenMutation = trpc.auth.getMockToken.useMutation();
  const loginMutation = trpc.auth.login.useMutation();
  const changePasswordMutation = trpc.auth.changePassword.useMutation();

  const [selectedUserType, setSelectedUserType] = useState<"coach" | "viewer" | "athlete" | null>(null);
  const [isDemoEnglish, setIsDemoEnglish] = useState(false);
  const [selectedAthleteId, setSelectedAthleteId] = useState<number | null>(null);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);

  // Fetch athlete info
  // Fetch public athletes list for login screen
  const { data: publicAthletes } = trpc.auth.getPublicAthletes.useQuery(
    undefined,
    { enabled: !isAuthenticated }
  );

  const { data: athlete, isLoading: athleteLoading } = trpc.athlete.getByUser.useQuery(
    undefined,
    { enabled: isAuthenticated && user?.role === "athlete" }
  );

  const [athleteActiveTab, setAthleteActiveTab] = useState<"summary" | "dashboard" | "raw" | "catapult" | "settings">("summary");
  const [acwrMetric, setAcwrMetric] = useState<"totalLoad" | "jumpVolume" | "accelVolume">("totalLoad");
  const [menuMetric, setMenuMetric] = useState<"load" | "ima">("load");
  const [dashboardChartMetric, setDashboardChartMetric] = useState<string>("totalLoad");
  const [dashboardMetricModalOpen, setDashboardMetricModalOpen] = useState(false);

  // Fetch athlete info
  // Fetch performance data for selected date
  const { data: latestPerformance, isLoading: perfLoading, refetch: refetchLatest } = trpc.performance.getByAthleteAndDate.useQuery(
    { athleteId: athlete?.id || 0, date: rawDate },
    { enabled: !!athlete?.id }
  );

  // Fetch past performance data for mini trend chart
  const { data: pastPerformance } = trpc.performance.getByAthlete.useQuery(
    { athleteId: athlete?.id || 0, limit: 7 },
    { enabled: !!athlete?.id }
  );

  // Fetch athlete analytics for athlete dashboard (date dependent)
  const { data: analytics, isLoading: analyticsLoading, isFetching: analyticsFetching, refetch: refetchAnalytics } = trpc.performance.getAthleteAnalytics.useQuery(
    { athleteId: athlete?.id || 0, date: rawDate, acwrMetric },
    { 
      enabled: !!athlete?.id,
      placeholderData: (prev) => prev
    }
  );

  // Fetch team analytics for coach/viewer
  const { data: teamAnalytics, isLoading: teamLoading, refetch: refetchTeam } = trpc.performance.getTeamAnalytics.useQuery(
    { teamId: user?.teamId || 1 },
    { enabled: isAuthenticated && (user?.role === "coach" || user?.role === "viewer") }
  );

  const { data: uncorrectedAnomalies, refetch: refetchAnomalies } = trpc.performance.getUncorrectedAnomalies.useQuery(
    { teamId: user?.teamId || 1 },
    { enabled: isAuthenticated && (user?.role === "coach" || user?.role === "viewer") }
  );

  const correctAnomalyMutation = trpc.performance.correctAnomaly.useMutation();
  const bulkApproveAnomaliesMutation = trpc.performance.bulkApproveAnomaliesWithoutCorrection.useMutation();
  const [anomalyModalOpen, setAnomalyModalOpen] = useState(false);

  const saveAdviceMutation = trpc.performance.saveCoachAdvice.useMutation();
  const updateSettingsMutation = trpc.team.updateSettings.useMutation();
  const updateMetricMutation = trpc.performance.updateMetric.useMutation();

  const { data: teamSettings, refetch: refetchSettings } = trpc.team.getSettings.useQuery(
    { teamId: user?.teamId || 1 },
    { enabled: isAuthenticated && (user?.role === "coach" || user?.role === "viewer") }
  );

  const [selectedAthlete, setSelectedAthlete] = useState<any | null>(null);
  const [adviceText, setAdviceText] = useState("");
  const [activeTab, setActiveTab] = useState<"summary" | "dashboard" | "raw" | "catapult" | "settings">("summary");
  const [expandedAthlete, setExpandedAthlete] = useState<number | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPasswordVal, setNewPasswordVal] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const { data: allPerfData, refetch: refetchAllPerf } = trpc.performance.getByTeam.useQuery(
    { teamId: user?.teamId || 1, date: rawDate, limit: 1500 },
    { enabled: isAuthenticated && (user?.role === "coach" || user?.role === "viewer") }
  );

  const SYSTEM_KEYS = useMemo(() => new Set([
    "playerLoads",
    "jumpVolumes",
    "accelVolumes",
    "sRpeBall",
    "sRpeSandC",
    "loads",
    "ima",
    "wellnessFatigue",
    "wellnessStress",
    "wellnessSoreness",
    "hrv",
    "avgHeartRate",
    "highIntensityDistance",
    "totalDistance",
    "totalJumps",
    "maxJumpHeight",
    "avgJumpHeight",
    "top5JumpHeight",
    "jumpVolume",
    "totalLoad",
    "accelCount",
    "maxAcceleration",
    "rpeValue",
    "physiologicalMarker",
    "duration",
    "sessionType",
    "sRPE",
    "note",
    "fileName"
  ]), []);

  const catapultData = useMemo(() => {
    if (!allPerfData || allPerfData.length === 0) {
      return { athletes: [], menus: [], teamAverages: {}, positionAverages: {}, charts: { jump: [], accel: [], load: [] } };
    }

    const allAthletes = teamAnalytics?.athletes || [];
    const menuSet = new Set<string>();
    const parsedRecords = allPerfData.map(p => {
      const matchedAthlete = allAthletes.find((a: any) => a.athleteId === p.athleteId);
      
      let menuObj: any = {};
      if (p.rawMenuData) {
        try {
          menuObj = JSON.parse(p.rawMenuData) || {};
        } catch (e) {}
      }
      
      let playerLoads: Record<string, number> = {};
      let jumpVolumes: Record<string, number> = {};
      let accelVolumes: Record<string, number> = {};

      if (menuObj && menuObj.loads) {
        playerLoads = menuObj.loads;
        accelVolumes = menuObj.ima || {};
        const totalJumpsVol = p.jumpVolume ? Number(p.jumpVolume) : 0;
        const totalLoadVal = p.totalLoad ? Number(p.totalLoad) : 1;
        Object.entries(playerLoads).forEach(([m, val]) => {
          jumpVolumes[m] = (Number(val) / totalLoadVal) * totalJumpsVol;
        });
      } else {
        let rawLoads = (menuObj && menuObj.playerLoads) || {};
        let rawJumps = (menuObj && menuObj.jumpVolumes) || {};
        let rawAccels = (menuObj && menuObj.accelVolumes) || {};

        const hasSystemKey = 
          menuObj && (
            "playerLoads" in menuObj || 
            "jumpVolumes" in menuObj || 
            "accelVolumes" in menuObj || 
            "sRpeBall" in menuObj || 
            "sRpeSandC" in menuObj || 
            "loads" in menuObj || 
            "ima" in menuObj
          );

        if (menuObj && !hasSystemKey && Object.keys(menuObj).length > 0) {
          if (!menuObj.sRpeBall && !menuObj.sRpeSandC) {
            rawLoads = menuObj;
          }
        }
        
        playerLoads = rawLoads;
        jumpVolumes = rawJumps;
        accelVolumes = rawAccels;

        if (Object.keys(accelVolumes).length === 0) {
          const totalIma = p.accelCount || 0;
          const totalLoadVal = p.totalLoad ? Number(p.totalLoad) : 1;
          Object.entries(playerLoads).forEach(([m, val]) => {
            accelVolumes[m] = (Number(val) / totalLoadVal) * totalIma;
          });
        }
        if (Object.keys(jumpVolumes).length === 0) {
          const totalJumpsVol = p.jumpVolume ? Number(p.jumpVolume) : 0;
          const totalLoadVal = p.totalLoad ? Number(p.totalLoad) : 1;
          Object.entries(playerLoads).forEach(([m, val]) => {
            jumpVolumes[m] = (Number(val) / totalLoadVal) * totalJumpsVol;
          });
        }
      }

      Object.keys(playerLoads).forEach(m => {
        if (!SYSTEM_KEYS.has(m)) menuSet.add(m);
      });
      Object.keys(jumpVolumes).forEach(m => {
        if (!SYSTEM_KEYS.has(m)) menuSet.add(m);
      });
      Object.keys(accelVolumes).forEach(m => {
        if (!SYSTEM_KEYS.has(m)) menuSet.add(m);
      });

      return {
        id: p.id,
        athleteId: p.athleteId,
        athleteName: matchedAthlete?.name || "Unknown",
        jerseyNumber: matchedAthlete?.jerseyNumber ?? null,
        position: matchedAthlete?.position || "OH",
        playerLoads,
        jumpVolumes,
        accelVolumes
      };
    });

    const orderScore = (name: string) => {
      const lower = name.toLowerCase();
      if (lower.includes("individual") || lower.includes("自主")) return 0;
      if (lower.includes("w-up") || lower.includes("up")) return 1;
      if (lower.includes("ball") || lower.includes("game")) return 2;
      if (lower.includes("serve")) return 3;
      if (lower.includes("def")) return 4;
      if (lower.includes("recep")) return 5;
      if (lower.includes("attack") || lower.includes("rally")) return 6;
      if (lower.includes("set")) return 7;
      return 100;
    };
    
    const menus = Array.from(menuSet).sort((a, b) => {
      const scoreA = orderScore(a);
      const scoreB = orderScore(b);
      if (scoreA !== scoreB) return scoreA - scoreB;
      return a.localeCompare(b);
    });

    const teamSums: Record<string, { load: number, loadCount: number, jump: number, jumpCount: number, accel: number, accelCount: number }> = {};
    const posSums: Record<string, Record<string, { load: number, loadCount: number, jump: number, jumpCount: number, accel: number, accelCount: number }>> = {};

    const positions = ["S", "OH", "MB", "L"];
    positions.forEach(pos => {
      posSums[pos] = {};
      menus.forEach(m => {
        posSums[pos][m] = { load: 0, loadCount: 0, jump: 0, jumpCount: 0, accel: 0, accelCount: 0 };
      });
    });

    menus.forEach(m => {
      teamSums[m] = { load: 0, loadCount: 0, jump: 0, jumpCount: 0, accel: 0, accelCount: 0 };
    });

    parsedRecords.forEach(rec => {
      menus.forEach(m => {
        const loadVal = rec.playerLoads[m];
        const jumpVal = rec.jumpVolumes[m];
        const accelVal = rec.accelVolumes[m];

        if (loadVal !== undefined && loadVal !== null) {
          teamSums[m].load += loadVal;
          teamSums[m].loadCount++;
        }
        if (jumpVal !== undefined && jumpVal !== null) {
          teamSums[m].jump += jumpVal;
          teamSums[m].jumpCount++;
        }
        if (accelVal !== undefined && accelVal !== null) {
          teamSums[m].accel += accelVal;
          teamSums[m].accelCount++;
        }

        const pos = rec.position ? rec.position.toUpperCase() : "OH";
        if (posSums[pos] && posSums[pos][m]) {
          if (loadVal !== undefined && loadVal !== null) {
            posSums[pos][m].load += loadVal;
            posSums[pos][m].loadCount++;
          }
          if (jumpVal !== undefined && jumpVal !== null) {
            posSums[pos][m].jump += jumpVal;
            posSums[pos][m].jumpCount++;
          }
          if (accelVal !== undefined && accelVal !== null) {
            posSums[pos][m].accel += accelVal;
            posSums[pos][m].accelCount++;
          }
        }
      });
    });

    const teamAverages: Record<string, { load: number | null, jump: number | null, accel: number | null }> = {};
    menus.forEach(m => {
      teamAverages[m] = {
        load: teamSums[m].loadCount > 0 ? parseFloat((teamSums[m].load / teamSums[m].loadCount).toFixed(1)) : null,
        jump: teamSums[m].jumpCount > 0 ? parseFloat((teamSums[m].jump / teamSums[m].jumpCount).toFixed(1)) : null,
        accel: teamSums[m].accelCount > 0 ? parseFloat((teamSums[m].accel / teamSums[m].accelCount).toFixed(1)) : null,
      };
    });

    const positionAverages: Record<string, Record<string, { load: number | null, jump: number | null, accel: number | null }>> = {};
    positions.forEach(pos => {
      positionAverages[pos] = {};
      menus.forEach(m => {
        const s = posSums[pos][m];
        positionAverages[pos][m] = {
          load: s.loadCount > 0 ? parseFloat((s.load / s.loadCount).toFixed(1)) : null,
          jump: s.jumpCount > 0 ? parseFloat((s.jump / s.jumpCount).toFixed(1)) : null,
          accel: s.accelCount > 0 ? parseFloat((s.accel / s.accelCount).toFixed(1)) : null,
        };
      });
    });

    const jumpChartData: { label: string, value: number }[] = [];
    const accelChartData: { label: string, value: number }[] = [];
    const loadChartData: { label: string, value: number }[] = [];

    menus.forEach(m => {
      if (teamSums[m].jump > 0) jumpChartData.push({ label: m, value: parseFloat(teamSums[m].jump.toFixed(1)) });
      if (teamSums[m].accel > 0) accelChartData.push({ label: m, value: parseFloat(teamSums[m].accel.toFixed(1)) });
      if (teamSums[m].load > 0) loadChartData.push({ label: m, value: parseFloat(teamSums[m].load.toFixed(1)) });
    });

    const sortedAthletes = [...parsedRecords].sort((a, b) => {
      const numA = a.jerseyNumber;
      const numB = b.jerseyNumber;
      if (numA === null && numB === null) return 0;
      if (numA === null) return 1;
      if (numB === null) return -1;
      return numA - numB;
    });

    return {
      athletes: sortedAthletes,
      menus,
      teamAverages,
      positionAverages,
      charts: {
        jump: jumpChartData,
        accel: accelChartData,
        load: loadChartData
      }
    };
  }, [allPerfData, teamAnalytics]);

  // Filters for raw data tab
  const [filterTeam, setFilterTeam] = useState<string>("all");
  const [filterGrade, setFilterGrade] = useState<string>("all");
  const [filterPosition, setFilterPosition] = useState<string>("all");
  const [rawPeriod, setRawPeriod] = useState<"1" | "7" | "14" | "28">("1");
  const [displayMode, setDisplayMode] = useState<"all" | "practice" | "individual">("all");

  // Pending updates for raw data batch save
  // Format: { [athleteId_metricKey]: number | null }
  const [pendingUpdates, setPendingUpdates] = useState<Record<string, number | null>>({});

  const updateMetricsBatchMutation = trpc.performance.updateMetricsBatch.useMutation();
  const updateAthleteCsvNamesMutation = trpc.performance.updateAthleteCsvNames.useMutation();
  const updateAthleteReachHeightsMutation = trpc.performance.updateAthleteReachHeights.useMutation();

  useEffect(() => {
    if (latestPerformance) {
      setMetrics({
        maxJumpHeight: latestPerformance.maxJumpHeight ? Number(latestPerformance.maxJumpHeight) : undefined,
        totalLoad: latestPerformance.totalLoad ? Number(latestPerformance.totalLoad) : undefined,
        avgAcceleration: latestPerformance.avgAcceleration ? Number(latestPerformance.avgAcceleration) : undefined,
        totalDistance: latestPerformance.totalDistance ? Number(latestPerformance.totalDistance) : undefined,
      });
    }
  }, [latestPerformance]);

  // Generate mini SVG path for trend chart
  const miniChartPath = useMemo(() => {
    if (!pastPerformance || pastPerformance.length < 2) return null;
    
    // Sort chronological
    const sorted = [...pastPerformance].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    const getVal = (p: any, key: string): number => {
      if (!p) return 0;
      if (key.startsWith("soxai")) {
        try {
          const soxai = p.soxaiData ? (typeof p.soxaiData === "string" ? JSON.parse(p.soxaiData) : p.soxaiData) : {};
          return soxai[key] !== undefined && soxai[key] !== null ? Number(soxai[key]) : 0;
        } catch (e) {
          return 0;
        }
      }
      return p[key] !== undefined && p[key] !== null ? Number(p[key]) : 0;
    };

    const loads = sorted.map(p => getVal(p, dashboardChartMetric));
    
    const maxVal = Math.max(...loads, 1);
    const minVal = Math.min(...loads);
    const valDiff = maxVal - minVal;
    
    const chartWidth = windowWidth - 80; // Container width minus padding
    const stepX = chartWidth / (sorted.length - 1);
    
    const points = sorted.map((p, idx) => {
      const x = idx * stepX;
      const load = getVal(p, dashboardChartMetric);
      // Invert Y for SVG coordinates
      const y = MINI_CHART_HEIGHT - 10 - (valDiff > 0 ? ((load - minVal) / valDiff) * (MINI_CHART_HEIGHT - 20) : (MINI_CHART_HEIGHT - 20) / 2);
      return { x, y };
    });
    
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x} ${points[i].y}`;
    }
    
    return { path, points };
  }, [pastPerformance, dashboardChartMetric]);
  
  const renderDashboardMetricSelectorModal = () => {
    const list = [
      { key: "totalLoad", label: "Player Load" },
      { key: "totalJumps", label: "総ジャンプ数" },
      { key: "maxJumpHeight", label: "最高ジャンプ高" },
      { key: "avgJumpHeight", label: "平均ジャンプ高" },
      { key: "top5JumpHeight", label: "ジャンプ高 (Top5平均)" },
      { key: "totalDistance", label: "総走行距離" },
      { key: "highIntensityDistance", label: "高速走行距離" },
      { key: "accelCount", label: "加速回数" },
      { key: "maxAcceleration", label: "最高加速度" },
      { key: "sRPE", label: "sRPE" },
      { key: "rpeValue", label: "主観強度 (RPE)" },
      { key: "avgHeartRate", label: "平均心拍数" },
      { key: "hrv", label: "HRV (心拍変動)" },
      { key: "wellnessSleep", label: "睡眠スコア" },
    ];

    return (
      <Modal
        visible={dashboardMetricModalOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDashboardMetricModalOpen(false)}
      >
        <TouchableOpacity 
          activeOpacity={1} 
          onPress={() => setDashboardMetricModalOpen(false)}
          style={{ flex: 1, backgroundColor: "rgba(15, 23, 42, 0.4)", justifyContent: "center", alignItems: "center", padding: 20 }}
        >
          <TouchableOpacity 
            activeOpacity={1}
            style={{ backgroundColor: "#FFFFFF", borderRadius: 24, padding: 20, width: "100%", maxWidth: 340, gap: 16, shadowColor: "#0F172A", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 5 }}
          >
            <Text style={{ fontSize: 14, fontWeight: "bold", color: "#0F172A", textAlign: "center" }}>
              運動量グラフの指標選択
            </Text>
            
            <ScrollView style={{ maxHeight: 300 }}>
              <View style={{ gap: 8 }}>
                {list.map((item) => {
                  const isSelected = dashboardChartMetric === item.key;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      onPress={() => {
                        setDashboardChartMetric(item.key);
                        setDashboardMetricModalOpen(false);
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
              onPress={() => setDashboardMetricModalOpen(false)}
              style={{ backgroundColor: "#F1F5F9", paddingVertical: 12, borderRadius: 12, alignItems: "center" }}
            >
              <Text style={{ fontSize: 13, fontWeight: "bold", color: "#475569" }}>キャンセル</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    );
  };

  if (loading || isLoggingIn) {
    return (
      <ScreenContainer className="flex items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#FF6B35" />
      </ScreenContainer>
    );
  }

  // Not authenticated screen (OAuth Trigger)
  if (!isAuthenticated) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const safeBtoa = (input: string) => {
      try {
        if (typeof btoa !== 'undefined') {
          return btoa(unescape(encodeURIComponent(input)));
        }
      } catch (e) {}
      
      const str = unescape(encodeURIComponent(input));
      let output = '';
      for (let block = 0, charCode, i = 0, map = chars;
           str.charAt(i | 0) || (map = '=', i % 1);
           output += map.charAt(63 & block >> 8 - i % 1 * 8)) {
        charCode = str.charCodeAt(i += 3 / 4);
        if (charCode > 0xFF) {
          throw new Error("btoa failed");
        }
        block = block << 8 | charCode;
      }
      return output;
    };

    const handleDemoLogin = async (role: "coach" | "viewer" | "athlete", athleteId?: number) => {
      if (role === "athlete" && !athleteId) {
        setLoginError("選手を選択してください。");
        return;
      }
      if (!password) {
        setLoginError("パスワードを入力してください。");
        return;
      }

      if (isLoggingIn) return;
      setIsLoggingIn(true);
      setLoginError(null);

      try {
        const { token, user: loggedUser } = await loginMutation.mutateAsync({
          role,
          athleteId,
          isEnglish: isDemoEnglish,
          password,
        });

        const userBase64 = safeBtoa(JSON.stringify(loggedUser));
        router.push(`/oauth/callback?sessionToken=${token}&user=${userBase64}`);
      } catch (e: any) {
        console.error("Failed to login:", e);
        setLoginError(e.message || "ログイン中にエラーが発生しました。");
        setIsLoggingIn(false);
      }
    };

    return (
      <ScreenContainer className="bg-background flex-1">
        <ScrollView 
          contentContainerStyle={{ 
            flexGrow: 1, 
            justifyContent: "center", 
            alignItems: "center",
            paddingVertical: 40,
            paddingHorizontal: 24
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-6 items-center w-full max-w-sm">
            <View className="w-16 h-16 bg-primary/10 rounded-3xl items-center justify-center shadow-inner">
              <IconSymbol size={36} name="figure.volleyball" color="#FF6B35" />
            </View>
            <View className="gap-2 items-center">
              <Text className="text-2xl font-extrabold text-foreground tracking-tight text-center">VolleyTrack</Text>
              <Text className="text-xs text-muted text-center leading-relaxed px-4">
                アカウントを選択し、パスワードを入力してください。
              </Text>
            </View>

            <View className="w-full gap-3 mt-2 bg-surface p-5 rounded-3xl border border-border shadow-sm">
              <Text className="text-xs font-bold text-muted px-1">1. アカウントを選択</Text>
              
              {/* スタッフ */}
              <Text className="text-xs font-bold text-muted px-1">スタッフ（指導者・関係者）</Text>
              
              {/* スタッフ (管理者) */}
              <TouchableOpacity 
                onPress={() => {
                  setSelectedUserType("coach");
                  setSelectedAthleteId(null);
                  setLoginError(null);
                  setPassword("");
                }}
                className={`w-full p-4 rounded-2xl flex-row justify-between items-center border active:opacity-90 ${selectedUserType === "coach" ? "bg-primary/5 border-primary" : "bg-background border-border/80"}`}
              >
                <View className="flex-row items-center gap-3">
                  <IconSymbol size={18} name="person.fill" color={selectedUserType === "coach" ? "#FF6B35" : "#6B7280"} />
                  <Text className={`font-bold text-sm ${selectedUserType === "coach" ? "text-primary" : "text-foreground"}`}>スタッフ (管理者)</Text>
                </View>
                {selectedUserType === "coach" && (
                  <IconSymbol size={14} name="checkmark.circle.fill" color="#FF6B35" />
                )}
              </TouchableOpacity>

              {/* スタッフ (閲覧用 - 日本語版) */}
              <TouchableOpacity 
                onPress={() => {
                  setSelectedUserType("viewer");
                  setIsDemoEnglish(false);
                  setSelectedAthleteId(null);
                  setLoginError(null);
                  setPassword("");
                }}
                className={`w-full p-4 rounded-2xl flex-row justify-between items-center border active:opacity-90 ${selectedUserType === "viewer" && !isDemoEnglish ? "bg-primary/5 border-primary" : "bg-background border-border/80"}`}
              >
                <View className="flex-row items-center gap-3">
                  <IconSymbol size={18} name="person.fill" color={selectedUserType === "viewer" && !isDemoEnglish ? "#FF6B35" : "#6B7280"} />
                  <Text className={`font-bold text-sm ${selectedUserType === "viewer" && !isDemoEnglish ? "text-primary" : "text-foreground"}`}>スタッフ (閲覧用 - 日本語)</Text>
                </View>
                {selectedUserType === "viewer" && !isDemoEnglish && (
                  <IconSymbol size={14} name="checkmark.circle.fill" color="#FF6B35" />
                )}
              </TouchableOpacity>

              {/* スタッフ (閲覧用 - 英語版) */}
              <TouchableOpacity 
                onPress={() => {
                  setSelectedUserType("viewer");
                  setIsDemoEnglish(true);
                  setSelectedAthleteId(null);
                  setLoginError(null);
                  setPassword("");
                }}
                className={`w-full p-4 rounded-2xl flex-row justify-between items-center border active:opacity-90 ${selectedUserType === "viewer" && isDemoEnglish ? "bg-primary/5 border-primary" : "bg-background border-border/80"}`}
              >
                <View className="flex-row items-center gap-3">
                  <IconSymbol size={18} name="person.fill" color={selectedUserType === "viewer" && isDemoEnglish ? "#FF6B35" : "#6B7280"} />
                  <Text className={`font-bold text-sm ${selectedUserType === "viewer" && isDemoEnglish ? "text-primary" : "text-foreground"}`}>Staff (Viewer - English)</Text>
                </View>
                {selectedUserType === "viewer" && isDemoEnglish && (
                  <IconSymbol size={14} name="checkmark.circle.fill" color="#FF6B35" />
                )}
              </TouchableOpacity>

              {/* 選手リスト */}
              <Text className="text-xs font-bold text-muted px-1 mt-1">選手（アスリート）</Text>
              <View style={{ maxHeight: 220 }} className="w-full">
                <ScrollView nestedScrollEnabled={true} showsVerticalScrollIndicator={true} className="w-full pr-1">
                  <View className="gap-2">
                    {publicAthletes && publicAthletes.length > 0 ? (
                      publicAthletes.map((a) => (
                        <TouchableOpacity 
                          key={a.id}
                          onPress={() => {
                            setSelectedUserType("athlete");
                            setSelectedAthleteId(a.id);
                            setLoginError(null);
                            setPassword("");
                          }}
                          className={`w-full p-4 rounded-2xl flex-row justify-between items-center border active:opacity-90 ${selectedUserType === "athlete" && selectedAthleteId === a.id ? "bg-primary/5 border-primary" : "bg-background border-border/80"}`}
                        >
                          <View className="flex-row items-center gap-3">
                            <IconSymbol size={18} name="person" color={selectedUserType === "athlete" && selectedAthleteId === a.id ? "#FF6B35" : "#6B7280"} />
                            <Text className={`font-bold text-sm ${selectedUserType === "athlete" && selectedAthleteId === a.id ? "text-primary" : "text-foreground"}`}>
                              {a.user?.name || `選手${a.jerseyNumber}`} {a.jerseyNumber !== null && a.jerseyNumber !== undefined ? `#${a.jerseyNumber}` : ""}
                            </Text>
                          </View>
                          {selectedUserType === "athlete" && selectedAthleteId === a.id && (
                            <IconSymbol size={14} name="checkmark.circle.fill" color="#FF6B35" />
                          )}
                        </TouchableOpacity>
                      ))
                    ) : (
                      <Text className="text-xs text-muted italic px-2 py-1">登録されている選手がいません</Text>
                    )}
                  </View>
                </ScrollView>
              </View>

              {/* パスワード入力 & ログインボタン */}
              {selectedUserType && (
                <View className="mt-3 pt-3 border-t border-border/60 gap-3">
                  <Text className="text-xs font-bold text-muted px-1">2. パスワードを入力</Text>
                  <TextInput
                    value={password}
                    onChangeText={(val) => {
                      setPassword(val);
                      setLoginError(null);
                    }}
                    placeholder={selectedUserType === "coach" ? "管理者用パスワード" : selectedUserType === "viewer" ? "閲覧用パスワード" : "選手用パスワード"}
                    placeholderTextColor="#9CA3AF"
                    secureTextEntry={true}
                    className="bg-background border border-border/80 px-4 py-3 rounded-2xl text-foreground text-sm"
                  />

                  {loginError && (
                    <Text className="text-xs font-semibold text-red-500 px-1">{loginError}</Text>
                  )}

                  <TouchableOpacity 
                    onPress={() => handleDemoLogin(selectedUserType, selectedAthleteId ?? undefined)}
                    className="w-full bg-primary py-3.5 rounded-2xl items-center shadow-sm active:opacity-95"
                  >
                    <Text className="text-white font-bold text-sm">ログインする</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      </ScreenContainer>
    );
  }

  const handleChangePassword = async () => {
    if (!newPasswordVal) {
      setPasswordError("新しいパスワードを入力してください。");
      return;
    }
    if (newPasswordVal.length < 4) {
      setPasswordError("パスワードは4文字以上で設定してください。");
      return;
    }
    if (newPasswordVal !== confirmPassword) {
      setPasswordError("新しいパスワードが一致しません。");
      return;
    }

    setIsChangingPassword(true);
    setPasswordError(null);
    setPasswordSuccess(null);

    try {
      await changePasswordMutation.mutateAsync({
        newPassword: newPasswordVal,
      });
      setPasswordSuccess("パスワードを変更しました！");
      setNewPasswordVal("");
      setConfirmPassword("");
    } catch (e: any) {
      console.error("Failed to change password:", e);
      setPasswordError(e.message || "パスワードの変更に失敗しました。");
    } finally {
      setIsChangingPassword(false);
    }
  };

  // Athlete Dashboard
  if (user?.role === "athlete") {
    if (athleteLoading || (analyticsLoading && !analytics)) {
      return (
        <ScreenContainer className="flex items-center justify-center bg-background">
          <ActivityIndicator size="large" color="#FF6B35" />
        </ScreenContainer>
      );
    }

    const latest = analytics?.latestSession;
    const trendData = analytics?.trend || [];

    // ACWR ゲージ描画ヘルパー
    const renderACWRGauge = () => {
      if (!analytics || !analytics.acwr) return null;
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
              <Text className="text-sm font-extrabold text-foreground font-mono">{analytics.monotony?.monotony || 0}</Text>
            </View>
            
            <View className="flex-1 bg-surface border border-border p-3 rounded-2xl flex-row items-center justify-between">
              <View className="gap-0.5">
                <Text className="text-[9px] text-muted font-bold">負担度 (Strain)</Text>
                <Text className="text-[10px] text-muted font-normal">疲労の蓄積予測値</Text>
              </View>
              <Text className="text-sm font-extrabold text-foreground font-mono">{analytics.monotony?.strain || 0}</Text>
            </View>
          </View>
        </View>
      );
    };

    // ジャンプ分析描画ヘルパー
    const renderJumpAnalytics = () => {
      if (!latest) return null;
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
              <Text className="text-[9px] text-muted font-bold mb-1">Jump Volume</Text>
              <Text className="text-sm font-extrabold text-primary font-mono">
                {latest.jumpVolume ? `${Number(latest.jumpVolume).toFixed(1)} m` : "--"}
              </Text>
            </View>
            <View className="flex-1 bg-secondary/5 border border-secondary/10 p-3.5 rounded-2xl">
              <Text className="text-[9px] text-muted font-bold mb-1">40cm以上の割合</Text>
              <Text className="text-sm font-extrabold text-secondary font-mono">
                {ratio40}%
              </Text>
            </View>
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1 bg-accent/5 border border-accent/10 p-3.5 rounded-2xl">
              <Text className="text-[9px] text-muted font-bold mb-1">平均ジャンプ高 (全数)</Text>
              <Text className="text-sm font-extrabold text-accent font-mono">
                {latest.avgJumpHeight ? `${Number(latest.avgJumpHeight).toFixed(1)} cm` : "--"}
              </Text>
            </View>
            <View className="flex-1 bg-accent/5 border border-accent/10 p-3.5 rounded-2xl">
              <Text className="text-[9px] text-muted font-bold mb-1">平均ジャンプ高 (Top5)</Text>
              <Text className="text-sm font-extrabold text-accent font-mono">
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
        </View>
      );
    };

    // メニュー別負荷・IMA描画ヘルパー
    const renderMenuLoadAnalytics = () => {
      if (!latest) return null;
      let menuLoads: Record<string, number> = {};
      let menuJumps: Record<string, number> = {};
      let menuIma: Record<string, number> = {};
      
      try {
        if (latest.rawMenuData) {
          const menuObj = typeof latest.rawMenuData === "string" ? JSON.parse(latest.rawMenuData) : latest.rawMenuData;
          if (menuObj) {
            if (menuObj.loads) {
              menuLoads = menuObj.loads;
              menuIma = menuObj.ima || {};
              
              const totalJumpsVol = latest.jumpVolume ? Number(latest.jumpVolume) : 0;
              const totalLoadVal = latest.totalLoad ? Number(latest.totalLoad) : 1;
              Object.entries(menuLoads).forEach(([m, val]) => {
                menuJumps[m] = (Number(val) / totalLoadVal) * totalJumpsVol;
              });
            } else {
              const rawLoads = menuObj.playerLoads || menuObj;
              const rawJumps = menuObj.jumpVolumes || {};
              const rawAccels = menuObj.accelVolumes || {};

              Object.entries(rawLoads).forEach(([m, val]) => {
                if (!SYSTEM_KEYS.has(m)) {
                  menuLoads[m] = Number(val);
                }
              });
              Object.entries(rawJumps).forEach(([m, val]) => {
                if (!SYSTEM_KEYS.has(m)) {
                  menuJumps[m] = Number(val);
                }
              });
              Object.entries(rawAccels).forEach(([m, val]) => {
                if (!SYSTEM_KEYS.has(m)) {
                  menuIma[m] = Number(val);
                }
              });

              if (Object.keys(menuIma).length === 0) {
                const totalIma = latest.accelCount || 0;
                const totalLoadVal = latest.totalLoad ? Number(latest.totalLoad) : 1;
                Object.entries(menuLoads).forEach(([m, val]) => {
                  menuIma[m] = (Number(val) / totalLoadVal) * totalIma;
                });
              }
              if (Object.keys(menuJumps).length === 0) {
                const totalJumpsVol = latest.jumpVolume ? Number(latest.jumpVolume) : 0;
                const totalLoadVal = latest.totalLoad ? Number(latest.totalLoad) : 1;
                Object.entries(menuLoads).forEach(([m, val]) => {
                  menuJumps[m] = (Number(val) / totalLoadVal) * totalJumpsVol;
                });
              }
            }
          }
        }
      } catch (e) {
        console.warn("Failed to parse rawMenuData for athlete", e);
      }

      const athleteMenus = Array.from(new Set([
        ...Object.keys(menuLoads),
        ...Object.keys(menuJumps),
        ...Object.keys(menuIma)
      ])).filter(m => !SYSTEM_KEYS.has(m));

      const jumpPalette = ["#0284C7", "#0ea5e9", "#38bdf8", "#7dd3fc", "#bae6fd", "#e0f2fe", "#0369a1", "#075985", "#0c4a6e"];
      const accelPalette = ["#DC2626", "#ef4444", "#f87171", "#fca5a5", "#fecaca", "#fee2e2", "#b91c1c", "#991b1b", "#7f1d1d"];
      const loadPalette = ["#16A34A", "#22c55e", "#4ade80", "#86efac", "#bbf7d0", "#d1fae5", "#15803d", "#166534", "#14532d"];

      const renderDonutChart = (title: string, values: Record<string, number>, themeColor: string, unit: string, colorPalette: string[]) => {
        const chartData = athleteMenus
          .map((m, idx) => ({ name: m, value: values[m] || 0, color: colorPalette[idx % colorPalette.length] }))
          .filter(d => d.value > 0);

        const total = chartData.reduce((a, b) => a + b.value, 0) || 0;
        let cumPercent = 0;

        return (
          <View style={{ flex: 1, alignItems: "center", gap: 6, minWidth: 90 }}>
            <Text style={{ fontSize: 10, fontWeight: "bold", color: "#475569", textAlign: "center" }}>{title}</Text>
            <View style={{ position: "relative", width: 70, height: 70, justifyContent: "center", alignItems: "center" }}>
              <Svg width={70} height={70} viewBox="0 0 32 32">
                {chartData.length > 0 && total > 0 ? (
                  chartData.map((item, idx) => {
                    const percent = item.value / total;
                    const strokeDash = `${percent * 100} ${100 - percent * 100}`;
                    const strokeOffset = 100 - (cumPercent * 100) + 25;
                    cumPercent += percent;

                    return (
                      <Circle
                        key={idx}
                        cx="16"
                        cy="16"
                        r="12"
                        fill="transparent"
                        stroke={item.color}
                        strokeWidth="4"
                        strokeDasharray={strokeDash}
                        strokeDashoffset={strokeOffset}
                      />
                    );
                  })
                ) : (
                  <Circle
                    cx="16"
                    cy="16"
                    r="12"
                    fill="transparent"
                    stroke="#E2E8F0"
                    strokeWidth="4"
                  />
                )}
              </Svg>
              <View style={{ position: "absolute", justifyContent: "center", alignItems: "center" }}>
                <Text style={{ fontSize: 8, fontWeight: "bold", color: themeColor }}>
                  {total > 0 ? total.toFixed(total > 100 ? 0 : 1) : "-"}
                </Text>
                {total > 0 && unit !== "" && (
                  <Text style={{ fontSize: 6, color: "#64748B", fontWeight: "bold" }}>{unit}</Text>
                )}
              </View>
            </View>
          </View>
        );
      };

      return (
        <View className="bg-surface rounded-3xl border border-border p-5 shadow-sm gap-5">
          <View>
            <Text className="text-sm font-bold text-foreground">練習メニュー別運動量・詳細配分</Text>
            <Text className="text-[10px] text-muted font-medium">メニューごとの外的負荷（ジャンプ、加速、運動量）の配分</Text>
          </View>

          {athleteMenus.length > 0 ? (
            <View style={{ gap: 20 }}>
              {/* 3つの円グラフの並列表示 */}
              <View style={{ flexDirection: "row", justifyContent: "space-around", paddingVertical: 8, borderBottomWidth: 1, borderColor: "#F1F5F9" }}>
                {renderDonutChart("ジャンプ(m)", menuJumps, "#0284C7", "m", jumpPalette)}
                {renderDonutChart("加速(回)", menuIma, "#DC2626", "回", accelPalette)}
                {renderDonutChart("運動量(PL)", menuLoads, "#16A34A", "PL", loadPalette)}
              </View>

              {/* カラー凡例 */}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center", paddingBottom: 4 }}>
                {athleteMenus.map((m, idx) => (
                  <View key={m} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 1.5 }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: jumpPalette[idx % jumpPalette.length] }} />
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: accelPalette[idx % accelPalette.length] }} />
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: loadPalette[idx % loadPalette.length] }} />
                    </View>
                    <Text style={{ fontSize: 9, color: "#475569", fontWeight: "bold" }}>{m}</Text>
                  </View>
                ))}
              </View>

              {/* メニュー別スプレッドシートテーブル */}
              <View style={{ borderRadius: 16, borderWidth: 1, borderColor: "#E2E8F0", overflow: "hidden", backgroundColor: "#FFFFFF" }}>
                {/* Header */}
                <View style={{ flexDirection: "row", backgroundColor: "#F8FAFC", borderBottomWidth: 1, borderColor: "#E2E8F0", height: 38, alignItems: "center" }}>
                  <View style={{ flex: 2, paddingHorizontal: 12 }}><Text style={{ fontSize: 10, fontWeight: "bold", color: "#475569" }}>練習メニュー名</Text></View>
                  <View style={{ flex: 1, alignItems: "center" }}><Text style={{ fontSize: 10, fontWeight: "bold", color: "#0284C7" }}>Jump (m)</Text></View>
                  <View style={{ flex: 1, alignItems: "center" }}><Text style={{ fontSize: 10, fontWeight: "bold", color: "#DC2626" }}>IMA (回)</Text></View>
                  <View style={{ flex: 1, alignItems: "center" }}><Text style={{ fontSize: 10, fontWeight: "bold", color: "#16A34A" }}>PL (運動量)</Text></View>
                </View>

                {/* Body */}
                {athleteMenus.map((m, idx) => {
                  const load = menuLoads[m] || 0;
                  const jump = menuJumps[m] || 0;
                  const ima = menuIma[m] || 0;
                  const isIndividual = m.toLowerCase().includes("individual") || m.includes("自主練");

                  return (
                    <View key={m} style={{ flexDirection: "row", borderBottomWidth: 1, borderColor: "#F1F5F9", height: 42, alignItems: "center", backgroundColor: isIndividual ? "#FFF9E6" : "#FFFFFF" }}>
                      <View style={{ flex: 2, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <View style={{ flexDirection: "row", gap: 1 }}>
                          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: jumpPalette[idx % jumpPalette.length] }} />
                          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: accelPalette[idx % accelPalette.length] }} />
                          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: loadPalette[idx % loadPalette.length] }} />
                        </View>
                        <Text style={{ fontSize: 11, fontWeight: "bold", color: "#0F172A", flex: 1 }} numberOfLines={1}>
                          {m} {isIndividual && "🏋️"}
                        </Text>
                      </View>
                      <View style={{ flex: 1, alignItems: "center" }}>
                        <Text style={{ fontSize: 11, fontWeight: "bold", color: "#0284C7" }}>{jump.toFixed(1)}</Text>
                      </View>
                      <View style={{ flex: 1, alignItems: "center" }}>
                        <Text style={{ fontSize: 11, fontWeight: "bold", color: "#DC2626" }}>{ima.toFixed(0)}</Text>
                      </View>
                      <View style={{ flex: 1, alignItems: "center" }}>
                        <Text style={{ fontSize: 11, fontWeight: "bold", color: "#16A34A" }}>{load.toFixed(1)}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : (
            <View className="py-8 items-center justify-center">
              <Text className="text-xs text-muted">練習メニュー別のデータがありません。</Text>
            </View>
          )}
        </View>
      );
    };

    const renderGuidanceAndAdvice = () => {
      if (!analytics || !analytics.guidance) return null;
      const guidance = analytics.guidance;
      const advice = latest?.coachAdvice;

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

    return (
      <ScreenContainer className="bg-background">
        {/* Header */}
        <View className="flex-row items-center justify-between px-6 py-4 border-b border-border bg-surface">
          <View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text className="text-2xl font-bold text-foreground">
                {user?.name || "選手ダッシュボード"}
              </Text>
              {latest?.isAnomaly && (
                <View style={{ backgroundColor: latest.isCorrected ? "#E2E8F0" : "#FEE2E2", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                  <Text style={{ fontSize: 8, fontWeight: "bold", color: latest.isCorrected ? "#475569" : "#EF4444" }}>
                    {latest.isCorrected ? "測定不良(補正済)" : "⚠️測定不良(要補正)"}
                  </Text>
                </View>
              )}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
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
                {analyticsFetching ? (
                  <ActivityIndicator size="small" color="#64748B" style={{ width: 10, height: 10, transform: [{ scale: 0.6 }] }} />
                ) : (
                  <IconSymbol size={10} name="chevron.down" color="#64748B" />
                )}
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
          </View>
          <TouchableOpacity 
            onPress={logout}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#FEF2F2", borderRadius: 8, borderWidth: 1, borderColor: "#FEE2E2" }}
          >
            <IconSymbol size={16} name="power" color="#EF4444" />
            <Text style={{ fontSize: 12, fontWeight: "bold", color: "#EF4444" }}>ログアウト</Text>
          </TouchableOpacity>
        </View>

        {/* タブナビゲーション */}
        <View style={{ paddingHorizontal: 20, paddingTop: 16, backgroundColor: "#FFFFFF" }}>
          <View style={{ flexDirection: "row", backgroundColor: "#F1F5F9", padding: 4, borderRadius: 12 }}>
            {[
              { id: "summary", label: "🚥 サマリー" },
              { id: "dashboard", label: "📊 分析" },
              { id: "raw", label: "📝 生データ" },
              { id: "catapult", label: "🛰️ Catapult" },
              { id: "settings", label: "⚙️ 設定" }
            ].map(tab => {
              const isSelected = athleteActiveTab === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  onPress={() => setAthleteActiveTab(tab.id as any)}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    backgroundColor: isSelected ? "#FFFFFF" : "transparent",
                    borderRadius: 8,
                    alignItems: "center"
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "bold", color: isSelected ? "#0F172A" : "#64748B" }}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: 24 }} showsVerticalScrollIndicator={false}>
          <View style={{ gap: 20 }}>
            {/* 🚥 サマリー */}
            {athleteActiveTab === "summary" && (
              <View style={{ gap: 16 }}>
                {analytics && analytics.signalLight && (
                  <View style={{ gap: 16 }}>
                    {/* コンディション自動要約バナー */}
                    <View style={{
                      backgroundColor: analytics.signalLight.status === "red" ? "#FDF2F2" : analytics.signalLight.status === "yellow" ? "#FFFDF5" : "#F4FBF7",
                      borderColor: analytics.signalLight.status === "red" ? "#F8D7DA" : analytics.signalLight.status === "yellow" ? "#FFF3CD" : "#D1E7DD",
                      borderWidth: 1, borderRadius: 16, padding: 16
                    }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <Text style={{ fontSize: 18 }}>
                          {analytics.signalLight.status === "red" ? "🔴" : analytics.signalLight.status === "yellow" ? "🟡" : "🟢"}
                        </Text>
                        <Text style={{ fontSize: 14, fontWeight: "bold", color: analytics.signalLight.status === "red" ? "#842029" : analytics.signalLight.status === "yellow" ? "#664D03" : "#0F5132" }}>
                          本日のコンディション判定: {analytics.signalLight.status === "red" ? "要確認" : analytics.signalLight.status === "yellow" ? "注意" : "良好"}
                        </Text>
                      </View>
                      <Text style={{
                        fontSize: 12, fontWeight: "semibold",
                        color: analytics.signalLight.status === "red" ? "#842029" : analytics.signalLight.status === "yellow" ? "#664D03" : "#0F5132",
                        lineHeight: 18
                      }}>
                        {analytics.signalLight.statusText}
                      </Text>
                    </View>

                    {/* LOAD と STATE の二カラム並列表示 */}
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
                      {/* LOAD カラム */}
                      <View style={{ flex: 1, minWidth: 320, backgroundColor: "#FFFFFF", padding: 16, borderRadius: 20, borderWidth: 1, borderColor: "#E2E8F0", gap: 8 }}>
                        <Text style={{ fontSize: 13, fontWeight: "bold", color: "#475569", borderBottomWidth: 1, borderColor: "#F1F5F9", paddingBottom: 6 }}>
                          負荷を確認 LOAD — 外的 / 内的応答
                        </Text>
                        
                        {METRICS_MAP
                          .filter(m => (m.category === "load_ext" || m.category === "load_int") && (analytics.signalLight.enabledMetrics || []).includes(m.key))
                          .map(m => {
                            const base = analytics.signalLight.baselines?.[m.key];
                            if (!base || base.val === null) return null;
                            const z = base ? base.zScore : 0;
                            const status = base ? base.status : "green";
                            const val = base ? base.val : 0;
                            const mean = base ? base.mean : 0;
                            const history = analytics.signalLight.metricHistory?.[m.key] || [];
                            return (
                              <AthleteZScoreBar
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

                      {/* STATE カラム */}
                      <View style={{ flex: 1, minWidth: 320, backgroundColor: "#FFFFFF", padding: 16, borderRadius: 20, borderWidth: 1, borderColor: "#E2E8F0", gap: 8 }}>
                        <Text style={{ fontSize: 13, fontWeight: "bold", color: "#475569", borderBottomWidth: 1, borderColor: "#F1F5F9", paddingBottom: 6 }}>
                          状態 / レディネス STATE — 個人基準±SD
                        </Text>
                        
                        {METRICS_MAP
                          .filter(m => (m.category === "state_subj" || m.category === "state_obj") && (analytics.signalLight.enabledMetrics || []).includes(m.key))
                          .map(m => {
                            const base = analytics.signalLight.baselines?.[m.key];
                            if (!base || base.val === null) return null;
                            const z = base ? base.zScore : 0;
                            const status = base ? base.status : "green";
                            const val = base ? base.val : 0;
                            const mean = base ? base.mean : 0;
                            const history = analytics.signalLight.metricHistory?.[m.key] || [];
                            return (
                              <AthleteZScoreBar
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
                )}

                {/* 指導者からのアドバイス & 自主練ガイダンス */}
                {analytics && renderGuidanceAndAdvice()}
              </View>
            )}

            {/* 📊 分析 */}
            {athleteActiveTab === "dashboard" && (
              <View style={{ gap: 16 }}>
                {analytics && analytics.acwr && renderACWRGauge()}
                {latest ? renderJumpAnalytics() : (
                  <View className="bg-surface rounded-2xl p-8 border border-border items-center justify-center">
                    <Text className="text-sm text-muted text-center font-bold">ジャンプデータが存在しません</Text>
                  </View>
                )}
                {latest ? renderMenuLoadAnalytics() : (
                  <View className="bg-surface rounded-2xl p-8 border border-border items-center justify-center">
                    <Text className="text-sm text-muted text-center font-bold">メニュー別負荷データが存在しません</Text>
                  </View>
                )}

                {/* トレンドグラフ */}
                {pastPerformance && pastPerformance.length > 0 && (
                  <View className="bg-surface rounded-3xl p-5 border border-border shadow-sm gap-3">
                    <View className="flex-row justify-between items-center pb-2 border-b border-border/30">
                      <Text className="text-sm font-bold text-foreground">直近の運動量の推移 (最大7測定分)</Text>
                      <TouchableOpacity
                        onPress={() => setDashboardMetricModalOpen(true)}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          backgroundColor: "#F8FAFC",
                          borderWidth: 1,
                          borderColor: "#E2E8F0",
                          paddingVertical: 4,
                          paddingHorizontal: 8,
                          borderRadius: 8,
                          gap: 4
                        }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: "bold", color: "#475569" }}>
                          {METRICS_MAP.find(m => m.key === dashboardChartMetric)?.label || dashboardChartMetric} ▾
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <View className="py-2 items-center">
                      <Svg width={windowWidth - 72} height={MINI_CHART_HEIGHT}>
                        <Path 
                          d={miniChartPath ? miniChartPath.path : ""} 
                          fill="none" 
                          stroke="#FF6B35" 
                          strokeWidth="3" 
                          strokeLinecap="round"
                        />
                        {miniChartPath && miniChartPath.points.map((p, idx) => (
                          <Circle 
                            key={idx} 
                            cx={p.x} 
                            cy={p.y} 
                            r="3.5" 
                            fill="#FFFFFF" 
                            stroke="#FF6B35" 
                            strokeWidth="2" 
                          />
                        ))}
                      </Svg>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* 📝 生データ (自分だけの履歴スプレッドシートテーブル) */}
            {athleteActiveTab === "raw" && (
              <View style={{ gap: 16 }}>
                {/* 1. 操作説明 ＆ カラー凡例 */}
                <View style={{ backgroundColor: "#FFFFFF", borderRadius: 24, padding: 20, borderWidth: 1, borderColor: "#E2E8F0", shadowColor: "#0F172A", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4, gap: 12 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                    <View>
                      <Text style={{ fontSize: 14, fontWeight: "bold", color: "#0F172A" }}>生データ直接入力・編集 (直近1週間)</Text>
                      <Text style={{ fontSize: 10, color: "#64748B", marginTop: 2 }}>
                        選択日（{rawDate}）から遡る過去7日間のデータを直接入力して一括保存できます。
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}><View style={{ width: 10, height: 10, backgroundColor: "#C9DAF8" }} /><Text style={{ fontSize: 8, color: "#64748B" }}>改善 2SD超</Text></View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}><View style={{ width: 10, height: 10, backgroundColor: "#E8F0FE" }} /><Text style={{ fontSize: 8, color: "#64748B" }}>改善 1-2SD</Text></View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}><View style={{ width: 10, height: 10, backgroundColor: "#FFF" }} /><Text style={{ fontSize: 8, color: "#64748B" }}>基準域</Text></View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}><View style={{ width: 10, height: 10, backgroundColor: "#FFF2CC" }} /><Text style={{ fontSize: 8, color: "#64748B" }}>悪化 1-2SD</Text></View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}><View style={{ width: 10, height: 10, backgroundColor: "#FCE4D6" }} /><Text style={{ fontSize: 8, color: "#64748B" }}>悪化 2SD超</Text></View>
                    </View>
                  </View>
                </View>

                {/* 2. 生データ スプレッドシートテーブル */}
                <View style={{ backgroundColor: "#FFFFFF", borderRadius: 24, padding: 20, borderWidth: 1, borderColor: "#E2E8F0", shadowColor: "#0F172A", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4 }}>
                  <ScrollView horizontal={true} showsHorizontalScrollIndicator={true} style={{ borderRadius: 12, borderWidth: 1, borderColor: "#F1F5F9" }}>
                    <View style={{ minWidth: 800 }}>
                      {/* Header */}
                      <View style={{ flexDirection: "row", backgroundColor: "#F8FAFC", borderBottomWidth: 1, borderColor: "#E2E8F0", height: 40, alignItems: "center" }}>
                        <View style={{ width: 120, paddingHorizontal: 12, borderRightWidth: 1, borderColor: "#E2E8F0", justifyContent: "center" }}>
                          <Text style={{ fontSize: 11, fontWeight: "bold", color: "#475569" }}>日付</Text>
                        </View>
                        {METRICS_MAP
                          .filter(m => (analytics?.signalLight?.enabledMetrics || []).includes(m.key) || m.key === "top5JumpHeight")
                          .map(m => (
                            <View key={m.key} style={{ width: 90, paddingHorizontal: 4, borderRightWidth: 1, borderColor: "#E2E8F0", alignItems: "center", justifyContent: "center" }}>
                              <Text style={{ fontSize: 10, fontWeight: "bold", color: "#475569", textAlign: "center" }}>{m.label}</Text>
                            </View>
                          ))}
                      </View>

                      {/* Body (datesToShow) */}
                      {(() => {
                        const datesToShow = Array.from({ length: 7 }).map((_, i) => {
                          const d = new Date(rawDate);
                          d.setDate(d.getDate() - i);
                          return d.toLocaleDateString("sv-SE");
                        });

                        return datesToShow.map(dateStr => {
                          const dateObj = new Date(dateStr);
                          const dateLabel = dateObj.toLocaleDateString("ja-JP", { month: "short", day: "numeric", weekday: "short" });

                          // Find DB record from trendData
                          const dbRecord = trendData.find(t => {
                            try {
                              return new Date(t.date).toLocaleDateString("sv-SE") === dateStr;
                            } catch (e) {
                              return false;
                            }
                          });

                          return (
                            <View key={dateStr} style={{ flexDirection: "row", borderBottomWidth: 1, borderColor: "#E2E8F0", height: 46, alignItems: "center" }}>
                              <View style={{ width: 120, paddingHorizontal: 12, borderRightWidth: 1, borderColor: "#E2E8F0", justifyContent: "center" }}>
                                <Text style={{ fontSize: 12, fontWeight: "bold", color: "#0F172A" }}>{dateLabel}</Text>
                              </View>

                              {METRICS_MAP
                                .filter(m => (analytics?.signalLight?.enabledMetrics || []).includes(m.key) || m.key === "top5JumpHeight")
                                .map(m => {
                                  const pendingKey = `${dateStr}_${m.key}`;

                                  let dbVal = null;
                                  if (dbRecord) {
                                    if (m.key === "sRpeBall" || m.key === "sRpeSandC") {
                                      try {
                                        const menuData = dbRecord.rawMenuData ? (typeof dbRecord.rawMenuData === "string" ? JSON.parse(dbRecord.rawMenuData) : dbRecord.rawMenuData) : {};
                                        dbVal = menuData[m.key] !== undefined ? menuData[m.key] : null;
                                      } catch (e) {
                                        dbVal = null;
                                      }
                                    } else {
                                      dbVal = (dbRecord as any)[m.key];
                                    }
                                  }

                                  const base = analytics?.signalLight?.baselines?.[m.key];
                                  const liveVal = pendingUpdates[pendingKey] !== undefined ? pendingUpdates[pendingKey] : dbVal;

                                  let liveZ = 0;
                                  if (liveVal !== null && base && base.sd > 0) {
                                    liveZ = (liveVal - base.mean) / base.sd;
                                  }

                                  const cellStyle = liveVal === null ? { bg: "#FFFFFF", text: "#1E293B" } : getCellStyle(liveZ, m.polarity);

                                  return (
                                    <View key={m.key} style={{ width: 90, height: "100%", borderRightWidth: 1, borderColor: "#E2E8F0", padding: 4, backgroundColor: cellStyle.bg, justifyContent: "center" }}>
                                      <TextInput
                                        defaultValue={dbVal !== null ? String(dbVal) : ""}
                                        value={liveVal !== null ? String(liveVal) : ""}
                                        onChangeText={(text) => {
                                          const parsed = text === "" ? null : Number(text);
                                          setPendingUpdates(prev => ({
                                            ...prev,
                                            [pendingKey]: isNaN(parsed as any) ? null : parsed
                                          }));
                                        }}
                                        keyboardType="numeric"
                                        style={{
                                          fontSize: 12,
                                          fontWeight: "bold",
                                          color: cellStyle.text,
                                          textAlign: "center",
                                          width: "100%",
                                          height: "100%"
                                        }}
                                      />
                                    </View>
                                  );
                                })}
                            </View>
                          );
                        });
                      })()}
                    </View>
                  </ScrollView>
                </View>

                {/* 3. 保存 ＆ 破棄アクションボタン */}
                <View style={{ flexDirection: "row", justifyContent: "flex-start", gap: 12, marginTop: 4 }}>
                  <TouchableOpacity
                    onPress={async () => {
                      const updatesByDate: Record<string, { athleteId: number; metricKey: string; value: number | null }[]> = {};

                      Object.entries(pendingUpdates).forEach(([key, val]) => {
                        const [dateStr, metricKey] = key.split("_");
                        if (!updatesByDate[dateStr]) {
                          updatesByDate[dateStr] = [];
                        }
                        updatesByDate[dateStr].push({
                          athleteId: athlete?.id || 0,
                          metricKey,
                          value: val
                        });
                      });

                      const datesToSave = Object.keys(updatesByDate);
                      if (datesToSave.length === 0) return;

                      try {
                        await Promise.all(
                          datesToSave.map(dStr =>
                            updateMetricsBatchMutation.mutateAsync({
                              teamId: user?.teamId || 1,
                              dateStr: dStr,
                              updates: updatesByDate[dStr]
                            })
                          )
                        );
                        setPendingUpdates({});
                        refetchLatest();
                        refetchAnalytics();
                        alert("変更を保存しました。");
                      } catch (err) {
                        console.error("Batch save failed for athlete across dates", err);
                        alert("保存に失敗しました。");
                      }
                    }}
                    style={{ backgroundColor: "#2F80ED", paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, shadowColor: "#0F172A", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}
                  >
                    <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "bold" }}>変更を保存</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setPendingUpdates({})}
                    style={{ backgroundColor: "#FFFFFF", paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0" }}
                  >
                    <Text style={{ color: "#64748B", fontSize: 13, fontWeight: "bold" }}>キャンセル</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* 🛰️ Catapult */}
            {athleteActiveTab === "catapult" && (
              <View style={{ gap: 16 }}>
                <View style={{ backgroundColor: "#FFFFFF", borderRadius: 24, padding: 20, borderWidth: 1, borderColor: "#E2E8F0", shadowColor: "#0F172A", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4 }}>
                  <Text style={{ fontSize: 14, fontWeight: "bold", color: "#0F172A", marginBottom: 12 }}>Catapult 運動量・ジャンプ履歴 (直近30測定分)</Text>
                  <ScrollView horizontal={true} showsHorizontalScrollIndicator={true} style={{ borderRadius: 12, borderWidth: 1, borderColor: "#F1F5F9" }}>
                    <View style={{ minWidth: 900 }}>
                      {/* Header */}
                      <View style={{ flexDirection: "row", backgroundColor: "#F8FAFC", borderBottomWidth: 1, borderColor: "#E2E8F0", height: 40, alignItems: "center" }}>
                        <View style={{ width: 120, paddingHorizontal: 12, borderRightWidth: 1, borderColor: "#E2E8F0", justifyContent: "center" }}>
                          <Text style={{ fontSize: 11, fontWeight: "bold", color: "#475569" }}>日付</Text>
                        </View>
                        {[
                          { key: "totalJumps", label: "ジャンプ回数", unit: "回" },
                          { key: "jumpVolume", label: "Jump Volume", unit: "m" },
                          { key: "avgJumpHeight", label: "平均ジャンプ高(全数)", unit: "cm" },
                          { key: "top5JumpHeight", label: "平均ジャンプ高(Top5)", unit: "cm" },
                          { key: "totalLoad", label: "PlayerLoad", unit: "" },
                          { key: "accelCount", label: "加速回数(IMA)", unit: "回" }
                        ].map(m => (
                          <View key={m.key} style={{ width: 120, paddingHorizontal: 4, borderRightWidth: 1, borderColor: "#E2E8F0", alignItems: "center", justifyContent: "center" }}>
                            <Text style={{ fontSize: 10, fontWeight: "bold", color: "#475569", textAlign: "center" }}>{m.label}</Text>
                          </View>
                        ))}
                      </View>

                      {/* Body */}
                      {trendData.map((record, idx) => {
                        const dateString = new Date(record.date).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" });
                        
                        return (
                          <View key={idx} style={{ flexDirection: "row", borderBottomWidth: 1, borderColor: "#E2E8F0", height: 46, alignItems: "center" }}>
                            <View style={{ width: 120, paddingHorizontal: 12, borderRightWidth: 1, borderColor: "#E2E8F0", justifyContent: "center" }}>
                              <Text style={{ fontSize: 12, fontWeight: "bold", color: "#0F172A" }}>{dateString}</Text>
                            </View>

                            {[
                              { key: "totalJumps", unit: "回", scale: 0 },
                              { key: "jumpVolume", unit: "m", scale: 2 },
                              { key: "avgJumpHeight", unit: "cm", scale: 1 },
                              { key: "top5JumpHeight", unit: "cm", scale: 1 },
                              { key: "totalLoad", unit: "", scale: 1 },
                              { key: "accelCount", unit: "回", scale: 0 }
                            ].map(m => {
                              const val = (record as any)[m.key];
                              const displayVal = val !== undefined && val !== null ? Number(val).toFixed(m.scale) : "--";
                              return (
                                <View key={m.key} style={{ width: 120, borderRightWidth: 1, borderColor: "#E2E8F0", alignItems: "center", justifyContent: "center" }}>
                                  <Text style={{ fontSize: 12, fontWeight: "bold", color: "#334155" }}>
                                    {displayVal}
                                    <Text style={{ fontSize: 9, fontWeight: "normal", color: "#94A3B8", marginLeft: 1 }}>{displayVal !== "--" ? m.unit : ""}</Text>
                                  </Text>
                                </View>
                              );
                            })}
                          </View>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
              </View>
            )}

            {/* ⚙️ 設定 */}
            {athleteActiveTab === "settings" && (
              <View style={{ gap: 16 }}>
                <View style={{ backgroundColor: "#FFFFFF", borderRadius: 24, padding: 20, borderWidth: 1, borderColor: "#E2E8F0", shadowColor: "#0F172A", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4 }}>
                  <Text style={{ fontSize: 14, fontWeight: "bold", color: "#0F172A", marginBottom: 16 }}>パスワード変更</Text>
                  
                  <View style={{ gap: 12 }}>
                    <View style={{ gap: 4 }}>
                      <Text style={{ fontSize: 11, fontWeight: "bold", color: "#475569" }}>新しいパスワード</Text>
                      <TextInput
                        value={newPasswordVal}
                        onChangeText={setNewPasswordVal}
                        secureTextEntry={true}
                        placeholder="新しいパスワードを入力"
                        placeholderTextColor="#94A3B8"
                        style={{ borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, padding: 10, fontSize: 12, color: "#1E293B" }}
                      />
                    </View>

                    <View style={{ gap: 4 }}>
                      <Text style={{ fontSize: 11, fontWeight: "bold", color: "#475569" }}>新しいパスワード (確認)</Text>
                      <TextInput
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        secureTextEntry={true}
                        placeholder="もう一度入力"
                        placeholderTextColor="#94A3B8"
                        style={{ borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, padding: 10, fontSize: 12, color: "#1E293B" }}
                      />
                    </View>

                    {passwordError && (
                      <Text style={{ fontSize: 11, color: "#EF4444", fontWeight: "bold" }}>⚠️ {passwordError}</Text>
                    )}
                    {passwordSuccess && (
                      <Text style={{ fontSize: 11, color: "#10B981", fontWeight: "bold" }}>✅ {passwordSuccess}</Text>
                    )}

                    <TouchableOpacity
                      onPress={handleChangePassword}
                      disabled={isChangingPassword}
                      style={{ backgroundColor: "#0F172A", paddingVertical: 12, borderRadius: 8, alignItems: "center", marginTop: 8 }}
                    >
                      {isChangingPassword ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={{ color: "#FFFFFF", fontWeight: "bold", fontSize: 12 }}>パスワードを更新</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}


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
            style={{ flex: 1, backgroundColor: "rgba(0, 0, 0, 0.4)", justifyContent: "center", alignItems: "center" }}
            activeOpacity={1}
            onPress={() => setCalendarModalOpen(false)}
          >
            <TouchableOpacity 
              activeOpacity={1}
              style={{ 
                width: 320, 
                backgroundColor: "#FFFFFF", 
                borderRadius: 24, 
                padding: 20, 
                borderWidth: 1, 
                borderColor: "#E2E8F0",
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15,
                shadowRadius: 12,
                elevation: 5
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
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
                
                <Text style={{ fontSize: 15, fontWeight: "bold", color: "#1E293B" }}>
                  {calYear}年 {calMonth}月
                </Text>
                
                <TouchableOpacity 
                  onPress={() => {
                    if (calMonth === 12) {
                      setCalMonth(1);
                      setCalYear(prev => prev + 1);
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

                  // 空白セル
                  for (let i = 0; i < firstDayIdx; i++) {
                    cells.push(<View key={`empty-${i}`} style={{ width: "14.28%", aspectRatio: 1 }} />);
                  }

                  // 日付セル
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
        {renderDashboardMetricSelectorModal()}
      </ScreenContainer>
    );
  }

  // Coach Dashboard (accessible by coach and viewer roles)
  if (user?.role === "coach" || user?.role === "viewer") {
    if (teamLoading) {
      return (
        <ScreenContainer className="flex items-center justify-center bg-background">
          <ActivityIndicator size="large" color="#0F172A" />
        </ScreenContainer>
      );
    }

    const allAthletes = teamAnalytics?.athletes || [];
    const redAthletes = allAthletes.filter(a => a.overallStatus === "red");
    const yellowAthletes = allAthletes.filter(a => a.overallStatus === "yellow");
    const greenAthletes = allAthletes.filter(a => a.overallStatus === "green");

    const trendData = teamAnalytics?.trend || [];
    const posComparison = teamAnalytics?.positionComparison || [];
    const individualPractice = teamAnalytics?.individualPractice || [];
    const menuAverages = teamAnalytics?.menuAverages || [];
    
    // settings metrics parsing
    const enabledMetricsKeys = teamSettings ? (JSON.parse(teamSettings.enabledMetrics) as string[]) : [];

    // SVG Line Chart Calculation for Trend
    const maxTrendVal = trendData.length > 0 ? Math.max(...trendData.map(d => trendMetric === "load" ? d.avgLoad : d.avgJumps), 1) : 1;
    const minTrendVal = trendData.length > 0 ? Math.min(...trendData.map(d => trendMetric === "load" ? d.avgLoad : d.avgJumps)) : 0;
    const trendValDiff = maxTrendVal - minTrendVal;
    
    const svgWidth = windowWidth - 80;
    const svgHeight = 120;
    const padX = 10;
    const padY = 15;
    const stepX = trendData.length > 1 ? (svgWidth - padX * 2) / (trendData.length - 1) : svgWidth;
    
    const trendPoints = trendData.map((d, idx) => {
      const x = padX + idx * stepX;
      const val = trendMetric === "load" ? d.avgLoad : d.avgJumps;
      const y = svgHeight - padY - (trendValDiff > 0 ? ((val - minTrendVal) / trendValDiff) * (svgHeight - padY * 2) : (svgHeight - padY * 2) / 2);
      return { x, y, val };
    });

    let trendPath = trendPoints.length > 0 ? `M ${trendPoints[0].x} ${trendPoints[0].y}` : "";
    for (let i = 1; i < trendPoints.length; i++) {
      trendPath += ` L ${trendPoints[i].x} ${trendPoints[i].y}`;
    }

    // SVG Scatter Plot Calculation for Menu characteristics
    const scatterWidth = windowWidth - 60;
    const scatterHeight = 160;
    const sPadX = 35;
    const sPadY = 25;
    const maxScatterLoad = menuAverages.length > 0 ? Math.max(...menuAverages.map(m => m.avgLoad), 300) : 300;
    const maxScatterJumps = menuAverages.length > 0 ? Math.max(...menuAverages.map(m => m.avgJumps), 50) : 50;

    const scatterPoints = menuAverages.map(m => {
      const x = sPadX + ((m.avgLoad / maxScatterLoad) * (scatterWidth - sPadX - 25));
      const y = scatterHeight - sPadY - ((m.avgJumps / maxScatterJumps) * (scatterHeight - sPadY - 25));
      return { ...m, x, y };
    });

    // Handle CSV Export
    const handleExportCsv = () => {
      if (!teamAnalytics) return;
      let csvContent = "\ufeff";
      csvContent += "名前,背番号,ポジション,総合アラート,自動要約,最新指導アドバイス\n";
      
      teamAnalytics.athletes.forEach(ath => {
        const jersey = ath.jerseyNumber !== null ? ath.jerseyNumber : "";
        const pos = ath.position || "";
        const advice = ath.coachAdvice ? ath.coachAdvice.replace(/"/g, '""') : "";
        const summary = ath.statusText ? ath.statusText.replace(/"/g, '""') : "";
        csvContent += `"${ath.name}",${jersey},"${pos}","${ath.overallStatus === "red" ? "要確認" : ath.overallStatus === "yellow" ? "注意" : "良好"}","${summary}","${advice}"\n`;
      });

      try {
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `team_conditioning_report_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (e) {
        console.error("CSV export failed", e);
        alert("レポートの出力に失敗しました。Webブラウザ環境で実行してください。");
      }
    };

    // Helper to render summary athlete card (accordion style)
    const renderSummaryAthleteCard = (ath: any) => {
      const isExpanded = expandedAthlete === ath.athleteId;
      
      return (
        <View key={ath.athleteId} style={{ backgroundColor: "#FFFFFF", borderRadius: 16, borderWidth: 1, borderColor: "#E2E8F0", marginBottom: 8, overflow: "hidden", shadowColor: "#0F172A", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 }}>
          <TouchableOpacity
            onPress={() => setExpandedAthlete(isExpanded ? null : ath.athleteId)}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: isExpanded ? 1 : 0, borderColor: "#F1F5F9" }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#0F172A", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "bold" }}>#{ath.jerseyNumber}</Text>
              </View>
              <View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ fontSize: 15, fontWeight: "bold", color: "#0F172A" }}>{ath.name}</Text>
                  {ath.isAnomaly && (
                    <View style={{ backgroundColor: ath.isCorrected ? "#E2E8F0" : "#FEE2E2", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                      <Text style={{ fontSize: 8, fontWeight: "bold", color: ath.isCorrected ? "#475569" : "#EF4444" }}>
                        {ath.isCorrected ? "測定不良(補正済)" : "⚠️測定不良"}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontSize: 11, color: "#64748B" }}>{ath.position}</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{
                backgroundColor: ath.overallStatus === "red" ? "#FCE4D6" : ath.overallStatus === "yellow" ? "#FFF2CC" : "#E2F0D9",
                paddingHorizontal: 12, paddingVertical: 4, borderRadius: 99
              }}>
                <Text style={{
                  fontSize: 11, fontWeight: "bold",
                  color: ath.overallStatus === "red" ? "#C00000" : ath.overallStatus === "yellow" ? "#7F6000" : "#385723"
                }}>
                  {ath.overallStatus === "red" ? "要確認" : ath.overallStatus === "yellow" ? "注意" : "良好"}
                </Text>
              </View>
              <IconSymbol size={16} name={isExpanded ? "chevron.up" : "chevron.down"} color="#64748B" />
            </View>
          </TouchableOpacity>

          {isExpanded && (
            <View style={{ padding: 16, backgroundColor: "#F8FAFC", gap: 16 }}>
              {/* 1. コンディション自動要約バナー (画像のような薄赤バナー) */}
              <View style={{
                backgroundColor: ath.overallStatus === "red" ? "#FDF2F2" : ath.overallStatus === "yellow" ? "#FFFDF5" : "#F4FBF7",
                borderColor: ath.overallStatus === "red" ? "#F8D7DA" : ath.overallStatus === "yellow" ? "#FFF3CD" : "#D1E7DD",
                borderWidth: 1, borderRadius: 12, padding: 14
              }}>
                <Text style={{
                  fontSize: 12, fontWeight: "bold",
                  color: ath.overallStatus === "red" ? "#842029" : ath.overallStatus === "yellow" ? "#664D03" : "#0F5132",
                  lineHeight: 18
                }}>
                  📢 {ath.statusText}
                </Text>
              </View>

              {/* 2. 2カラムレイアウト (LOAD と STATE) */}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
                {/* 左カラム: 負荷を確認 (LOAD) */}
                <View style={{ flex: 1, minWidth: 320, backgroundColor: "#FFFFFF", padding: 16, borderRadius: 16, borderWidth: 1, borderColor: "#E2E8F0", gap: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: "bold", color: "#475569", borderBottomWidth: 1, borderColor: "#F1F5F9", paddingBottom: 6 }}>
                    負荷を確認 LOAD — 外的 / 内的応答
                  </Text>
                  
                  {METRICS_MAP
                    .filter(m => (m.category === "load_ext" || m.category === "load_int") && enabledMetricsKeys.includes(m.key))
                    .map(m => {
                      const base = ath.baselines?.[m.key];
                      const z = base ? base.zScore : 0;
                      const status = base ? base.status : "green";
                      const val = base ? base.val : 0;
                      const mean = base ? base.mean : 0;
                      const history = ath.metricHistory?.[m.key] || [];
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
                <View style={{ flex: 1, minWidth: 320, backgroundColor: "#FFFFFF", padding: 16, borderRadius: 16, borderWidth: 1, borderColor: "#E2E8F0", gap: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: "bold", color: "#475569", borderBottomWidth: 1, borderColor: "#F1F5F9", paddingBottom: 6 }}>
                    状態 / レディネス 明細 STATE — 個人基準±SD
                  </Text>
                  
                  {METRICS_MAP
                    .filter(m => (m.category === "state_subj" || m.category === "state_obj") && enabledMetricsKeys.includes(m.key))
                    .map(m => {
                      const base = ath.baselines?.[m.key];
                      const z = base ? base.zScore : 0;
                      const status = base ? base.status : "green";
                      const val = base ? base.val : 0;
                      const mean = base ? base.mean : 0;
                      const history = ath.metricHistory?.[m.key] || [];
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

              {/* 3. 指導アドバイス */}
              <View style={{ backgroundColor: "#FFFFFF", padding: 16, borderRadius: 16, borderWidth: 1, borderColor: "#E2E8F0", gap: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: "bold", color: "#475569" }}>✍️ 指導アドバイス</Text>
                <TextInput
                  defaultValue={ath.coachAdvice || ""}
                  editable={user?.role !== "viewer"}
                  onBlur={async (e) => {
                    if (user?.role === "viewer") return;
                    const text = (e as any).nativeEvent.text;
                    try {
                      await saveAdviceMutation.mutateAsync({ athleteId: ath.athleteId, advice: text });
                      refetchTeam();
                    } catch (err) {
                      console.error("Advice save failed", err);
                    }
                  }}
                  placeholder={user?.role === "viewer" ? "閲覧専用アカウント（アドバイスの入力はできません）" : "練習制限や調整指示を入力 (フォーカスアウトで自動保存)..."}
                  placeholderTextColor="#94A3B8"
                  style={{ fontSize: 12, borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, padding: 10, color: "#1E293B", backgroundColor: user?.role === "viewer" ? "#F1F5F9" : "#FFFFFF" }}
                />
              </View>

              {/* 4. 詳細・分析ページへの遷移 */}
              <TouchableOpacity
                onPress={() => router.push(`/athlete/${ath.athleteId}/analytics`)}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#0F172A", padding: 12, borderRadius: 8, marginTop: 4 }}
              >
                <IconSymbol size={16} name="chart.xyaxis.line" color="#FFFFFF" />
                <Text style={{ color: "#FFFFFF", fontWeight: "bold", fontSize: 12 }}>個人詳細・トレンド分析を表示</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      );
    };

    return (
      <ScreenContainer className="bg-background">
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFFFFF" }}>
          <View>
            <Text style={{ fontSize: 20, fontWeight: "bold", color: "#0F172A" }}>
              {t("チームコンディショニング", "Team Conditioning")}
            </Text>
            <Text style={{ fontSize: 12, color: "#64748B" }}>{t("指導者: ", "Staff: ")}{user?.name}</Text>
          </View>
          <TouchableOpacity 
            onPress={logout}
            style={{ padding: 8, backgroundColor: "#FEE2E2", borderRadius: 99 }}
          >
            <IconSymbol size={20} name="power" color="#EF4444" />
          </TouchableOpacity>
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 16, backgroundColor: "#FFFFFF" }}>
          <View style={{ flexDirection: "row", backgroundColor: "#F1F5F9", padding: 4, borderRadius: 12 }}>
            {(["summary", "dashboard", "raw", "catapult", "settings"] as const).filter(tab => {
              if (user?.role === "viewer") {
                return tab === "summary" || tab === "dashboard" || tab === "catapult";
              }
              return true;
            }).map(tab => {
              const tabLabels = { 
                summary: t("🚥 サマリー", "🚥 Summary"), 
                dashboard: t("📊 分析", "📊 Analytics"), 
                raw: t("📝 生データ", "📝 Raw Data"), 
                catapult: t("🛰️ Catapult", "🛰️ Catapult"), 
                settings: t("⚙️ 設定", "⚙️ Settings") 
              };
              const isActive = activeTab === tab;
              return (
                <TouchableOpacity
                  key={tab}
                  onPress={() => setActiveTab(tab)}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    backgroundColor: isActive ? "#FFFFFF" : "transparent",
                    borderRadius: 8,
                    alignItems: "center"
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "bold", color: isActive ? "#0F172A" : "#64748B" }}>
                    {tabLabels[tab]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: 24 }} showsVerticalScrollIndicator={false}>
          <View style={{ gap: 20 }}>
            {activeTab === "summary" && (
              <View style={{ gap: 16 }}>
                {/* 測定不良（アノマリー）アラートバナー */}
                {uncorrectedAnomalies && uncorrectedAnomalies.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setAnomalyModalOpen(true)}
                    style={{
                      backgroundColor: "#FEF2F2",
                      borderColor: "#FCA5A5",
                      borderWidth: 1,
                      borderRadius: 16,
                      padding: 16,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      shadowColor: "#EF4444",
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.1,
                      shadowRadius: 2,
                      elevation: 1
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                      <IconSymbol size={24} name="exclamationmark.triangle.fill" color="#EF4444" />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: "bold", color: "#991B1B" }}>
                          測定不良の疑いがあるデータが {uncorrectedAnomalies.length} 件あります
                        </Text>
                        <Text style={{ fontSize: 11, color: "#B91C1C", marginTop: 2 }}>
                          タップして内容を確認し、ポジション平均値での補正・承認を行ってください。
                        </Text>
                      </View>
                    </View>
                    <IconSymbol size={16} name="chevron.right" color="#EF4444" />
                  </TouchableOpacity>
                )}

                <TouchableOpacity 
                  onPress={handleExportCsv}
                  style={{ backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2E8F0", paddingVertical: 12, borderRadius: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6, shadowColor: "#0F172A", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}
                >
                  <IconSymbol size={16} name="square.and.arrow.up" color="#0F172A" />
                  <Text style={{ color: "#0F172A", fontWeight: "bold", fontSize: 13 }}>{t("コンディションレポート出力 (CSV)", "Export Condition Report (CSV)")}</Text>
                </TouchableOpacity>

                <View>
                  <Text style={{ fontSize: 15, fontWeight: "bold", color: "#EF4444", marginBottom: 10 }}>{t("🔴 要確認 (", "🔴 Check (")}{redAthletes.length}{t("名)", " athletes)")}</Text>
                  {redAthletes.length > 0 ? (
                    redAthletes.map(ath => renderSummaryAthleteCard(ath))
                  ) : (
                    <Text style={{ fontSize: 12, color: "#64748B", fontStyle: "italic", paddingLeft: 8, marginBottom: 8 }}>{t("該当選手はいません。", "No athletes in this status.")}</Text>
                  )}
                </View>

                <View>
                  <Text style={{ fontSize: 15, fontWeight: "bold", color: "#F59E0B", marginBottom: 10 }}>{t("🟡 注意 (", "🟡 Caution (")}{yellowAthletes.length}{t("名)", " athletes)")}</Text>
                  {yellowAthletes.length > 0 ? (
                    yellowAthletes.map(ath => renderSummaryAthleteCard(ath))
                  ) : (
                    <Text style={{ fontSize: 12, color: "#64748B", fontStyle: "italic", paddingLeft: 8, marginBottom: 8 }}>{t("該当選手はいません。", "No athletes in this status.")}</Text>
                  )}
                </View>

                <View>
                  <Text style={{ fontSize: 15, fontWeight: "bold", color: "#10B981", marginBottom: 10 }}>{t("🟢 良好 (", "🟢 Good (")}{greenAthletes.length}{t("名)", " athletes)")}</Text>
                  {greenAthletes.length > 0 ? (
                    greenAthletes.map(ath => renderSummaryAthleteCard(ath))
                  ) : (
                    <Text style={{ fontSize: 12, color: "#64748B", fontStyle: "italic", paddingLeft: 8, marginBottom: 8 }}>{t("該当選手はいません。", "No athletes in this status.")}</Text>
                  )}
                </View>
              </View>
            )}

            {/* DASHBOARD (HEATMAP / ANALYTICS) TAB */}
            {activeTab === "dashboard" && (
              <View style={{ gap: 20 }}>
                {/* チーム状態の内訳 (ドーナツグラフ) & カテゴリ別チーム平均z */}
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
                  {/* ドーナツグラフ */}
                  <View style={{ flex: 1, minWidth: 320, backgroundColor: "#FFFFFF", padding: 20, borderRadius: 20, borderWidth: 1, borderColor: "#E2E8F0", alignItems: "center", gap: 12, shadowColor: "#0F172A", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2 }}>
                    <Text style={{ fontSize: 13, fontWeight: "bold", color: "#475569", alignSelf: "flex-start" }}>チーム状態の内訳 (当日の状態構成)</Text>
                    <View style={{ position: "relative", width: 120, height: 120, alignItems: "center", justifyContent: "center" }}>
                      <Svg width="120" height="120" viewBox="0 0 100 100">
                        {/* Circular ring doughnut path */}
                        {(() => {
                          const total = allAthletes.length || 1;
                          const rCount = redAthletes.length;
                          const yCount = yellowAthletes.length;
                          const gCount = greenAthletes.length;
                          
                          const rPerc = rCount / total;
                          const yPerc = yCount / total;
                          const gPerc = gCount / total;

                          // Circumference = 2 * PI * r = 2 * PI * 35 = 219.9
                          const c = 219.9;
                          const redStroke = rPerc * c;
                          const yellowStroke = yPerc * c;
                          const greenStroke = gPerc * c;
                          
                          let offset = 0;
                          const paths = [];

                          if (rCount > 0) {
                            paths.push(<Circle key="red" cx="50" cy="50" r="35" fill="transparent" stroke="#EF4444" strokeWidth="10" strokeDasharray={`${redStroke} ${c}`} strokeDashoffset={offset} transform="rotate(-90 50 50)" />);
                            offset -= redStroke;
                          }
                          if (yCount > 0) {
                            paths.push(<Circle key="yellow" cx="50" cy="50" r="35" fill="transparent" stroke="#F59E0B" strokeWidth="10" strokeDasharray={`${yellowStroke} ${c}`} strokeDashoffset={offset} transform="rotate(-90 50 50)" />);
                            offset -= yellowStroke;
                          }
                          if (gCount > 0) {
                            paths.push(<Circle key="green" cx="50" cy="50" r="35" fill="transparent" stroke="#10B981" strokeWidth="10" strokeDasharray={`${greenStroke} ${c}`} strokeDashoffset={offset} transform="rotate(-90 50 50)" />);
                          }
                          return paths;
                        })()}
                      </Svg>
                      <View style={{ position: "absolute", alignItems: "center" }}>
                        <Text style={{ fontSize: 24, fontWeight: "800", color: "#0F172A" }}>{allAthletes.length}</Text>
                        <Text style={{ fontSize: 10, color: "#64748B" }}>名</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-around", width: "100%", borderTopWidth: 1, borderColor: "#F1F5F9", paddingTop: 10 }}>
                      <View style={{ alignItems: "center" }}><Text style={{ fontSize: 11, fontWeight: "bold", color: "#EF4444" }}>🔴 要確認</Text><Text style={{ fontSize: 13, fontWeight: "bold", color: "#1E293B" }}>{redAthletes.length}名</Text></View>
                      <View style={{ alignItems: "center" }}><Text style={{ fontSize: 11, fontWeight: "bold", color: "#F59E0B" }}>🟡 注意</Text><Text style={{ fontSize: 13, fontWeight: "bold", color: "#1E293B" }}>{yellowAthletes.length}名</Text></View>
                      <View style={{ alignItems: "center" }}><Text style={{ fontSize: 11, fontWeight: "bold", color: "#10B981" }}>🟢 良好</Text><Text style={{ fontSize: 13, fontWeight: "bold", color: "#1E293B" }}>{greenAthletes.length}名</Text></View>
                    </View>
                  </View>

                  {/* カテゴリ別チーム平均z */}
                  <View style={{ flex: 1, minWidth: 320, backgroundColor: "#FFFFFF", padding: 20, borderRadius: 20, borderWidth: 1, borderColor: "#E2E8F0", gap: 10, shadowColor: "#0F172A", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2 }}>
                    <Text style={{ fontSize: 13, fontWeight: "bold", color: "#475569" }}>カテゴリ別 チーム平均z (悪い方向が正)</Text>
                    {(() => {
                      const categories = [
                        { label: "主観", keys: ["wellnessFatigue", "wellnessSoreness", "wellnessStress"] },
                        { label: "神経筋", keys: ["top5JumpHeight"] },
                        { label: "生理学マーカー", keys: ["physiologicalMarker"] },
                        { label: "体組成", keys: [] }
                      ];

                      return (
                        <View style={{ gap: 8, marginTop: 4 }}>
                          {categories.map((cat, idx) => {
                            // Calculate average Z-score for this category across all athletes (taking absolute values of deviances)
                            let sumZ = 0;
                            let count = 0;
                            let alertsText = "";
                            let redCount = 0;
                            let yellowCount = 0;

                            allAthletes.forEach(ath => {
                              cat.keys.forEach(k => {
                                const base = ath.baselines?.[k];
                                if (base) {
                                  sumZ += Math.abs(base.zScore);
                                  count++;
                                  if (base.status === "red") redCount++;
                                  if (base.status === "yellow") yellowCount++;
                                }
                              });
                            });

                            const avgZ = count > 0 ? sumZ / count : 0.0;
                            const barWidthPercent = Math.min(100, (avgZ / 2.0) * 100);
                            const displayZ = avgZ > 0 ? `+${avgZ.toFixed(1)}` : `0.0`;

                            if (redCount > 0 || yellowCount > 0) {
                              alertsText = `${redCount > 0 ? `要${redCount} ` : ""}${yellowCount > 0 ? `注${yellowCount}` : ""}`;
                            }

                            return (
                              <View key={idx} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                <Text style={{ width: 85, fontSize: 11, fontWeight: "bold", color: "#475569" }}>{cat.label}</Text>
                                <View style={{ flex: 1, height: 12, backgroundColor: "#F1F5F9", borderRadius: 6, overflow: "hidden", position: "relative" }}>
                                  <View style={{ width: `${barWidthPercent}%`, height: "100%", backgroundColor: avgZ >= 1.5 ? "#C00000" : avgZ >= 1.0 ? "#E08B00" : "#2F80ED", borderRadius: 6 }} />
                                </View>
                                <Text style={{ width: 65, fontSize: 11, fontWeight: "bold", color: avgZ >= 1.0 ? "#C00000" : "#475569", textAlign: "right" }}>
                                  {displayZ} <Text style={{ fontSize: 8, fontWeight: "normal", color: "#94A3B8" }}>n={allAthletes.length}</Text>
                                </Text>
                                <Text style={{ width: 45, fontSize: 10, fontWeight: "bold", color: "#C00000", textAlign: "right" }}>{alertsText}</Text>
                              </View>
                            );
                          })}
                        </View>
                      );
                    })()}
                  </View>
                </View>

                {/* 選手×カテゴリヒートマップ */}
                <View style={{ backgroundColor: "#FFFFFF", borderRadius: 24, padding: 20, borderWidth: 1, borderColor: "#E2E8F0", shadowColor: "#0F172A", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4 }}>
                  <Text style={{ fontSize: 14, fontWeight: "bold", color: "#0F172A", marginBottom: 12 }}>🗺️ 選手 × カテゴリ ヒートマップ (Zスコア)</Text>
                  
                  <ScrollView horizontal={true} showsHorizontalScrollIndicator={true} style={{ borderRadius: 12, borderWidth: 1, borderColor: "#F1F5F9" }}>
                    <View style={{ minWidth: 650 }}>
                      {/* Header */}
                      <View style={{ flexDirection: "row", backgroundColor: "#F8FAFC", borderBottomWidth: 1, borderColor: "#E2E8F0", height: 40, alignItems: "center" }}>
                        <View style={{ width: 120, paddingHorizontal: 12, borderRightWidth: 1, borderColor: "#E2E8F0", justifyContent: "center" }}>
                          <Text style={{ fontSize: 11, fontWeight: "bold", color: "#475569" }}>選手名</Text>
                        </View>
                        {["主観 (当日)", "神経筋 (前日)", "生理学・客観 (当日)", "体組成", "最大"].map((catName) => (
                          <View key={catName} style={{ width: 100, paddingHorizontal: 4, borderRightWidth: 1, borderColor: "#E2E8F0", alignItems: "center", justifyContent: "center" }}>
                            <Text style={{ fontSize: 10, fontWeight: "bold", color: "#475569" }}>{catName}</Text>
                          </View>
                        ))}
                      </View>
                      
                      {/* Body */}
                      {allAthletes.map((ath, idx) => {
                        const categories = [
                          { label: "主観", keys: ["wellnessFatigue", "wellnessSoreness", "wellnessStress"], polarity: "negative" as const },
                          { label: "神経筋", keys: ["top5JumpHeight"], polarity: "positive" as const },
                          { 
                            label: "生理学・客観", 
                            keys: [
                              "physiologicalMarker", 
                              "hrv", 
                              "wellnessSleep", 
                              "soxaiSleepDuration", 
                              "soxaiBedTime", 
                              "soxaiAwakeTime", 
                              "soxaiRemSleep", 
                              "soxaiLightSleep", 
                              "soxaiDeepSleep", 
                              "soxaiSleepEfficiency"
                            ], 
                            polarity: "positive" as const 
                          },
                          { label: "体組成", keys: [], polarity: "positive" as const }
                        ];

                        let maxCatZ = 0;
                        let maxCatStatus: "green" | "yellow" | "red" = "green";
                        let anyCatHasValue = false;
                        
                        const statusOrder = { green: 0, yellow: 1, red: 2 };

                        const catVals = categories.map(cat => {
                          let worstZ = 0;
                          let worstStatus: "green" | "yellow" | "red" = "green";
                          let hasValue = false;

                          cat.keys.forEach(k => {
                            const base = ath.baselines?.[k];
                            if (base && base.val !== null && base.val !== undefined) {
                              hasValue = true;
                              anyCatHasValue = true;
                              // If absolute Z is larger or status is worse, consider it worst deviance
                              if (statusOrder[base.status] > statusOrder[worstStatus] || (statusOrder[base.status] === statusOrder[worstStatus] && Math.abs(base.zScore) > Math.abs(worstZ))) {
                                worstZ = base.zScore;
                                worstStatus = base.status;
                              }
                            }
                          });

                          if (hasValue && (statusOrder[worstStatus] > statusOrder[maxCatStatus] || (statusOrder[worstStatus] === statusOrder[maxCatStatus] && Math.abs(worstZ) > Math.abs(maxCatZ)))) {
                            maxCatZ = worstZ;
                            maxCatStatus = worstStatus;
                          }

                          return { label: cat.label, z: worstZ, status: worstStatus, polarity: cat.polarity, hasValue };
                        });

                        return (
                          <View key={idx} style={{ flexDirection: "row", borderBottomWidth: 1, borderColor: "#E2E8F0", height: 42, alignItems: "center" }}>
                            <TouchableOpacity 
                              onPress={() => router.push(`/athlete/${ath.athleteId}/analytics`)}
                              style={{ width: 120, paddingHorizontal: 12, borderRightWidth: 1, borderColor: "#E2E8F0", justifyContent: "center" }}
                            >
                              <Text style={{ fontSize: 12, fontWeight: "bold", color: "#0F172A" }}>#{ath.jerseyNumber} {ath.name}</Text>
                            </TouchableOpacity>

                            {catVals.map((cv, cIdx) => {
                              const getStatusStyle = (status: "green" | "yellow" | "red") => {
                                if (status === "red") return { bg: "#FCE4D6", text: "#C00000" }; // worse2 相当
                                if (status === "yellow") return { bg: "#FFF2CC", text: "#7F6000" }; // worse1 相当
                                return { bg: "#FFFFFF", text: "#1E293B" }; // green はシンプルに白
                              };
                              const cellStyle = getStatusStyle(cv.status);
                              const displayText = cv.z === 0 ? "0.0" : (cv.z > 0 ? `+${cv.z.toFixed(1)}` : `${cv.z.toFixed(1)}`);
                              const isBodyComposition = cv.label === "体組成";
                              const showHyphen = isBodyComposition || !cv.hasValue;
                              return (
                                <View key={cIdx} style={{
                                  width: 100, height: "100%", borderRightWidth: 1, borderColor: "#E2E8F0", alignItems: "center", justifyContent: "center",
                                  backgroundColor: showHyphen ? "#FFF" : cellStyle.bg
                                }}>
                                  <Text style={{
                                    fontSize: 11, fontWeight: "bold",
                                    color: showHyphen ? "#94A3B8" : cellStyle.text
                                  }}>
                                    {showHyphen ? "-" : displayText}
                                  </Text>
                                </View>
                              );
                            })}

                            {/* Max column */}
                            <View style={{
                              width: 100, height: "100%", alignItems: "center", justifyContent: "center",
                              backgroundColor: !anyCatHasValue ? "#FFF" : ((maxCatStatus as string) === "red" ? "#FCE4D6" : (maxCatStatus as string) === "yellow" ? "#FFF2CC" : "#E2F0D9")
                            }}>
                              <Text style={{
                                fontSize: 11, fontWeight: "800",
                                color: !anyCatHasValue ? "#94A3B8" : ((maxCatStatus as string) === "red" ? "#C00000" : (maxCatStatus as string) === "yellow" ? "#7F6000" : "#385723")
                              }}>
                                {!anyCatHasValue ? "-" : (maxCatZ > 0 ? `+${maxCatZ.toFixed(1)}` : maxCatZ.toFixed(1))}
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </ScrollView>
                  <View style={{ flexDirection: "row", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><View style={{ width: 12, height: 12, backgroundColor: "#FCE4D6", borderWidth: 1, borderColor: "#E2E8F0" }} /><Text style={{ fontSize: 9, color: "#64748B" }}>🔴 要確認</Text></View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><View style={{ width: 12, height: 12, backgroundColor: "#FFF2CC", borderWidth: 1, borderColor: "#E2E8F0" }} /><Text style={{ fontSize: 9, color: "#64748B" }}>🟡 注意</Text></View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><View style={{ width: 12, height: 12, backgroundColor: "#E2F0D9", borderWidth: 1, borderColor: "#E2E8F0" }} /><Text style={{ fontSize: 9, color: "#64748B" }}>🟢 良好</Text></View>
                  </View>
                </View>
              </View>
            )}

            {/* RAW DATA EDIT TAB */}
            {activeTab === "raw" && (
              <View style={{ gap: 20 }}>
                {/* 1. 絞り込み ＆ 期間選択フィルター */}
                <View style={{ backgroundColor: "#FFFFFF", padding: 16, borderRadius: 20, borderWidth: 1, borderColor: "#E2E8F0", gap: 14 }}>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    {/* 絞り込み */}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={{ fontSize: 11, fontWeight: "bold", color: "#475569" }}>絞り込み</Text>
                      {/* Position Filter custom buttons */}
                      <View style={{ flexDirection: "row", backgroundColor: "#F1F5F9", padding: 3, borderRadius: 8, gap: 4 }}>
                        {["all", "Setter", "MB", "OH"].map(pos => (
                          <TouchableOpacity
                            key={pos}
                            onPress={() => setFilterPosition(pos)}
                            style={{
                              paddingHorizontal: 8, paddingVertical: 4,
                              backgroundColor: filterPosition === pos ? "#FFFFFF" : "transparent",
                              borderRadius: 6
                            }}
                          >
                            <Text style={{ fontSize: 10, fontWeight: "bold", color: filterPosition === pos ? "#0F172A" : "#64748B" }}>
                              {pos === "all" ? "ポジション: 全て" : pos}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    {/* 人数カウンター */}
                    <Text style={{ fontSize: 11, fontWeight: "bold", color: "#64748B" }}>
                      {allAthletes.filter(a => filterPosition === "all" || a.position === filterPosition).length}/{allAthletes.length}名
                    </Text>
                  </View>

                  {/* 期間 / 日付ナビゲーション */}
                  <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderColor: "#F1F5F9", paddingTop: 12, gap: 12 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={{ fontSize: 11, fontWeight: "bold", color: "#475569" }}>対象日付</Text>
                      <TouchableOpacity
                        onPress={() => {
                          const prev = new Date(new Date(rawDate).getTime() - 24 * 60 * 60 * 1000).toLocaleDateString("sv-SE");
                          setRawDate(prev);
                        }}
                        style={{ padding: 6, backgroundColor: "#F1F5F9", borderRadius: 6 }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: "bold", color: "#475569" }}>◀ 前日</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          setCalendarModalOpen(true);
                          const d = new Date(rawDate);
                          if (!isNaN(d.getTime())) {
                            setCalYear(d.getFullYear());
                            setCalMonth(d.getMonth() + 1);
                          }
                        }}
                        style={{ borderWidth: 1, borderColor: "#CBD5E1", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, backgroundColor: "#FFFFFF" }}
                        activeOpacity={0.7}
                      >
                        <Text style={{ fontSize: 11, fontWeight: "bold", color: "#1E293B" }}>{rawDate}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          const next = new Date(new Date(rawDate).getTime() + 24 * 60 * 60 * 1000).toLocaleDateString("sv-SE");
                          setRawDate(next);
                        }}
                        style={{ padding: 6, backgroundColor: "#F1F5F9", borderRadius: 6 }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: "bold", color: "#475569" }}>翌日 ▶</Text>
                      </TouchableOpacity>
                    </View>

                    {/* ショートカットトグル期間 */}
                    <View style={{ flexDirection: "row", backgroundColor: "#F1F5F9", padding: 3, borderRadius: 8, gap: 4 }}>
                      {(["1", "7", "14", "28"] as const).map(p => (
                        <TouchableOpacity
                          key={p}
                          onPress={() => setRawPeriod(p)}
                          style={{
                            paddingHorizontal: 8, paddingVertical: 4,
                            backgroundColor: rawPeriod === p ? "#FFFFFF" : "transparent",
                            borderRadius: 6
                          }}
                        >
                          <Text style={{ fontSize: 10, fontWeight: "bold", color: rawPeriod === p ? "#0F172A" : "#64748B" }}>
                            {p === "1" ? "直近1日" : `直近${p}日`}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* 表示モード（全体練習 / 自主練習 / 合算）切り替えトグル */}
                  <View style={{ flexDirection: "row", backgroundColor: "#F1F5F9", padding: 3, borderRadius: 8, gap: 4, marginTop: 10, alignSelf: "flex-start" }}>
                    {(["all", "practice", "individual"] as const).map(mode => {
                      const labels = { all: "全体＋自主（合算）", practice: "全体練習のみ", individual: "自主練習のみ" };
                      return (
                        <TouchableOpacity
                          key={mode}
                          onPress={() => setDisplayMode(mode)}
                          style={{
                            paddingHorizontal: 12, paddingVertical: 5,
                            backgroundColor: displayMode === mode ? "#FFFFFF" : "transparent",
                            borderRadius: 6,
                            shadowColor: displayMode === mode ? "#0F172A" : "transparent",
                            shadowOffset: { width: 0, height: 1 },
                            shadowOpacity: displayMode === mode ? 0.05 : 0,
                            shadowRadius: 1
                          }}
                        >
                          <Text style={{ fontSize: 10, fontWeight: "bold", color: displayMode === mode ? "#FF6B35" : "#64748B" }}>
                            {labels[mode]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* 2. 生データ スプレッドシートテーブル */}
                <View style={{ backgroundColor: "#FFFFFF", borderRadius: 24, padding: 20, borderWidth: 1, borderColor: "#E2E8F0", shadowColor: "#0F172A", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4 }}>
                  <ScrollView horizontal={true} showsHorizontalScrollIndicator={true} style={{ borderRadius: 12, borderWidth: 1, borderColor: "#F1F5F9" }}>
                    <View style={{ minWidth: 1050 }}>
                      {/* Header */}
                      <View style={{ flexDirection: "row", backgroundColor: "#F8FAFC", borderBottomWidth: 1, borderColor: "#E2E8F0", height: 40, alignItems: "center" }}>
                        <View style={{ width: 120, paddingHorizontal: 12, borderRightWidth: 1, borderColor: "#E2E8F0", justifyContent: "center" }}>
                          <Text style={{ fontSize: 11, fontWeight: "bold", color: "#475569" }}>選手</Text>
                        </View>
                        {METRICS_MAP.filter(m => enabledMetricsKeys.includes(m.key)).map(m => (
                          <View key={m.key} style={{ width: 90, paddingHorizontal: 4, borderRightWidth: 1, borderColor: "#E2E8F0", alignItems: "center", justifyContent: "center" }}>
                            <Text style={{ fontSize: 10, fontWeight: "bold", color: "#475569", textAlign: "center" }}>{m.label}</Text>
                          </View>
                        ))}
                      </View>

                      {/* Body */}
                      {allAthletes
                        .filter(ath => filterPosition === "all" || ath.position === filterPosition)
                        .map((ath, idx) => (
                          <View key={idx} style={{ flexDirection: "row", borderBottomWidth: 1, borderColor: "#E2E8F0", height: 46, alignItems: "center" }}>
                            <View style={{ width: 120, paddingHorizontal: 12, borderRightWidth: 1, borderColor: "#E2E8F0", justifyContent: "center" }}>
                              <Text style={{ fontSize: 11, color: "#64748B" }}>{ath.position}</Text>
                              <Text style={{ fontSize: 12, fontWeight: "bold", color: "#0F172A" }}>{ath.name}</Text>
                            </View>

                            {METRICS_MAP.filter(m => enabledMetricsKeys.includes(m.key)).map(m => {
                              const pendingKey = `${ath.athleteId}_${m.key}`;
                              const rawRecord = allPerfData?.find(p => 
                                p.athleteId === ath.athleteId && 
                                new Date(p.date).toLocaleDateString("sv-SE") === rawDate
                              );
                              let dbVal = null;
                              if (rawRecord) {
                                const additiveFields = [
                                  "totalLoad", "totalJumps", "jumpVolume", "jumpsOver40cm",
                                  "jumpZone1Count", "jumpZone2Count", "jumpZone3Count", "jumpZone4Count", "jumpZone5Count", "accelCount"
                                ];
                                
                                if (displayMode !== "all" && additiveFields.includes(m.key)) {
                                  try {
                                    const csvObj = rawRecord.rawCsvData ? JSON.parse(rawRecord.rawCsvData) : {};
                                    const fileData = csvObj.fileData || {};
                                    let modeSum = 0;
                                    let hasModeValue = false;
                                    
                                    for (const key of Object.keys(fileData)) {
                                      const keyType = key.split("_").pop() || "auto";
                                      if (keyType === displayMode) {
                                        const val = fileData[key][m.key];
                                        if (val !== undefined && val !== null) {
                                          modeSum += val;
                                          hasModeValue = true;
                                        }
                                      }
                                    }
                                    dbVal = hasModeValue ? modeSum : null;
                                  } catch (e) {
                                    dbVal = null;
                                  }
                                } else {
                                  if (m.key === "sRpeBall" || m.key === "sRpeSandC") {
                                    try {
                                      const menuData = rawRecord.rawMenuData ? JSON.parse(rawRecord.rawMenuData) : {};
                                      dbVal = menuData[m.key] !== undefined ? menuData[m.key] : null;
                                    } catch (e) {
                                      dbVal = null;
                                    }
                                  } else {
                                    dbVal = (rawRecord as any)[m.key];
                                  }
                                }
                              }
                              const base = ath.baselines?.[m.key];
                              
                              // Use pending update if exists, otherwise dbVal
                              const liveVal = pendingUpdates[pendingKey] !== undefined ? pendingUpdates[pendingKey] : dbVal;
                              
                              // Calculate dynamic simulated Z-score for live feedback coloring
                              let liveZ = 0;
                              if (liveVal !== null && base && base.sd > 0) {
                                liveZ = (liveVal - base.mean) / base.sd;
                              }
                              
                              const cellStyle = liveVal === null ? { bg: "#FFFFFF", text: "#1E293B" } : getCellStyle(liveZ, m.polarity);

                              return (
                                <View key={m.key} style={{ width: 90, height: "100%", borderRightWidth: 1, borderColor: "#E2E8F0", padding: 4, backgroundColor: cellStyle.bg, justifyContent: "center" }}>
                                  <TextInput
                                    defaultValue={dbVal !== null ? String(dbVal) : ""}
                                    value={liveVal !== null ? String(liveVal) : ""}
                                    onChangeText={(text) => {
                                      const parsed = text === "" ? null : Number(text);
                                      setPendingUpdates(prev => ({
                                        ...prev,
                                        [pendingKey]: isNaN(parsed as any) ? null : parsed
                                      }));
                                    }}
                                    keyboardType="numeric"
                                    style={{
                                      fontSize: 12,
                                      fontWeight: "bold",
                                      color: cellStyle.text,
                                      textAlign: "center",
                                      width: "100%",
                                      height: "100%"
                                    }}
                                  />
                                </View>
                              );
                            })}
                          </View>
                        ))}
                    </View>
                  </ScrollView>
                  <View style={{ flexDirection: "row", gap: 12, marginTop: 10, flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
                    {/* Color legend */}
                    <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}><View style={{ width: 10, height: 10, backgroundColor: "#C9DAF8" }} /><Text style={{ fontSize: 8, color: "#64748B" }}>改善 2SD超</Text></View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}><View style={{ width: 10, height: 10, backgroundColor: "#E8F0FE" }} /><Text style={{ fontSize: 8, color: "#64748B" }}>改善 1-2SD</Text></View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}><View style={{ width: 10, height: 10, backgroundColor: "#FFF" }} /><Text style={{ fontSize: 8, color: "#64748B" }}>基準域</Text></View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}><View style={{ width: 10, height: 10, backgroundColor: "#FFF2CC" }} /><Text style={{ fontSize: 8, color: "#64748B" }}>悪化 1-2SD</Text></View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}><View style={{ width: 10, height: 10, backgroundColor: "#FCE4D6" }} /><Text style={{ fontSize: 8, color: "#64748B" }}>悪化 2SD超</Text></View>
                    </View>
                  </View>
                </View>

                {/* 3. 保存 ＆ 破棄アクションボタン */}
                <View style={{ flexDirection: "row", justifyContent: "flex-start", gap: 12, marginTop: 4 }}>
                  <TouchableOpacity
                    onPress={async () => {
                      const updatesArray = Object.entries(pendingUpdates).map(([key, val]) => {
                        const [athIdStr, metricKey] = key.split("_");
                        return {
                          athleteId: Number(athIdStr),
                          metricKey,
                          value: val
                        };
                      });

                      if (updatesArray.length === 0) return;

                      try {
                        await updateMetricsBatchMutation.mutateAsync({
                          teamId: user?.teamId || 1,
                          dateStr: rawDate,
                          updates: updatesArray
                        });
                        setPendingUpdates({});
                        refetchTeam();
                        refetchAllPerf();
                        alert("変更を保存しました。");
                      } catch (err) {
                        console.error("Batch save failed", err);
                        alert("保存に失敗しました。");
                      }
                    }}
                    style={{ backgroundColor: "#2F80ED", paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, shadowColor: "#0F172A", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 }}
                  >
                    <Text style={{ color: "#FFFFFF", fontWeight: "bold", fontSize: 13 }}>変更を保存</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      setPendingUpdates({});
                    }}
                    style={{ backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#CBD5E1", paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 }}
                  >
                    <Text style={{ color: "#475569", fontWeight: "bold", fontSize: 13 }}>編集を破棄</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* CATAPULT ANALYSIS TAB */}
            {activeTab === "catapult" && (
              <View style={{ gap: 20 }}>
                {/* ヘッダーエリア */}
                <View style={{ backgroundColor: "#FFFFFF", padding: 20, borderRadius: 20, borderWidth: 1, borderColor: "#E2E8F0", gap: 14, shadowColor: "#0F172A", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      {/* 前日ボタン */}
                      <TouchableOpacity 
                        onPress={() => {
                          const current = new Date(rawDate);
                          current.setDate(current.getDate() - 1);
                          setRawDate(current.toLocaleDateString("sv-SE"));
                        }}
                        style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#F8FAFC", borderRadius: 8, borderWidth: 1, borderColor: "#E2E8F0" }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: "bold", color: "#475569" }}>◀ 前日</Text>
                      </TouchableOpacity>

                      {/* カレンダー選択ボタン */}
                      <TouchableOpacity 
                        onPress={() => setCalendarModalOpen(true)}
                        style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#F8FAFC", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: "#E2E8F0" }}
                      >
                        <IconSymbol size={16} name="calendar" color="#0F172A" />
                        <Text style={{ fontSize: 15, fontWeight: "bold", color: "#0F172A" }}>
                          {rawDate.replace(/-/g, "/")}
                        </Text>
                      </TouchableOpacity>

                      {/* 翌日ボタン */}
                      <TouchableOpacity 
                        onPress={() => {
                          const current = new Date(rawDate);
                          current.setDate(current.getDate() + 1);
                          setRawDate(current.toLocaleDateString("sv-SE"));
                        }}
                        style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#F8FAFC", borderRadius: 8, borderWidth: 1, borderColor: "#E2E8F0" }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: "bold", color: "#475569" }}>翌日 ▶</Text>
                      </TouchableOpacity>
                    </View>

                    <Text style={{ fontSize: 13, fontWeight: "bold", color: "#475569" }}>
                      Menu別 運動量の比較 (Jump Vol / Accel Vol / Player Load)
                    </Text>
                  </View>
                </View>

                {/* スプレッドシートテーブル */}
                {catapultData.athletes.length > 0 ? (
                  <View style={{ backgroundColor: "#FFFFFF", borderRadius: 20, borderWidth: 1, borderColor: "#E2E8F0", overflow: "hidden", shadowColor: "#0F172A", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2 }}>
                    <ScrollView 
                      horizontal={true} 
                      showsHorizontalScrollIndicator={true}
                      contentContainerStyle={{ minWidth: 240 + (catapultData.menus.length * 225) }}
                    >
                      <View style={{ flexDirection: "column", width: "100%", minWidth: 240 + (catapultData.menus.length * 225) }}>
                        {/* ヘッダー行1 (大グループ) */}
                        <View style={{ flexDirection: "row", borderBottomWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#F8FAFC" }}>
                          {/* 左端固定エリアプレースホルダー */}
                          <View style={{ width: 240, height: 32, justifyContent: "center", paddingLeft: 12, position: "sticky" as any, left: 0, zIndex: 10, backgroundColor: "#F8FAFC" }}>
                            <Text style={{ fontSize: 11, fontWeight: "bold", color: "#64748B" }}>選手属性</Text>
                          </View>
                          {/* Jump Volume 大ヘッダー */}
                          {catapultData.menus.length > 0 && (
                            <View style={{ width: catapultData.menus.length * 75, height: 32, backgroundColor: "#E0F2FE", justifyContent: "center", alignItems: "center", borderLeftWidth: 1, borderColor: "#BAE6FD" }}>
                              <Text style={{ fontSize: 11, fontWeight: "bold", color: "#0369A1" }} numberOfLines={1}>Jump Volume (総ジャンプ高 cm)</Text>
                            </View>
                          )}
                          {/* Accel Volume 大ヘッダー */}
                          {catapultData.menus.length > 0 && (
                            <View style={{ width: catapultData.menus.length * 75, height: 32, backgroundColor: "#FEE2E2", justifyContent: "center", alignItems: "center", borderLeftWidth: 1, borderColor: "#FCA5A5" }}>
                              <Text style={{ fontSize: 11, fontWeight: "bold", color: "#B91C1C" }} numberOfLines={1}>Acc Vol (加速の総量)</Text>
                            </View>
                          )}
                          {/* Player Load 大ヘッダー */}
                          {catapultData.menus.length > 0 && (
                            <View style={{ width: catapultData.menus.length * 75, height: 32, backgroundColor: "#D1FAE5", justifyContent: "center", alignItems: "center", borderLeftWidth: 1, borderColor: "#86EFAC" }}>
                              <Text style={{ fontSize: 11, fontWeight: "bold", color: "#15803D" }} numberOfLines={1}>Player Load (総合的運動量)</Text>
                            </View>
                          )}
                        </View>

                        {/* ヘッダー行2 (メニュー名リスト) */}
                        <View style={{ flexDirection: "row", borderBottomWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#F1F5F9" }}>
                          {/* 左側属性列のヘッダー */}
                          <View style={{ flexDirection: "row", width: 240, position: "sticky" as any, left: 0, zIndex: 10, backgroundColor: "#F1F5F9" }}>
                            <View style={{ width: 40, height: 36, justifyContent: "center", alignItems: "center" }}>
                              <Text style={{ fontSize: 9, fontWeight: "bold", color: "#475569" }}>部分</Text>
                            </View>
                            <View style={{ width: 40, height: 36, justifyContent: "center", alignItems: "center" }}>
                              <Text style={{ fontSize: 9, fontWeight: "bold", color: "#475569" }}>No.</Text>
                            </View>
                            <View style={{ width: 120, height: 36, justifyContent: "center", paddingLeft: 8 }}>
                              <Text style={{ fontSize: 10, fontWeight: "bold", color: "#475569" }}>選手名</Text>
                            </View>
                            <View style={{ width: 40, height: 36, justifyContent: "center", alignItems: "center" }}>
                              <Text style={{ fontSize: 9, fontWeight: "bold", color: "#475569" }}>Pos</Text>
                            </View>
                          </View>

                          {/* Jump Volume のメニュー名ヘッダー */}
                          {catapultData.menus.map((m, idx) => (
                            <View key={`j_h_${idx}`} style={{ width: 75, height: 36, justifyContent: "center", alignItems: "center", borderLeftWidth: 1, borderColor: "#E2E8F0" }}>
                              <Text style={{ fontSize: 9, color: "#0369A1", fontWeight: "bold", textAlign: "center" }} numberOfLines={2}>
                                {idx + 1} {m}
                              </Text>
                            </View>
                          ))}
                          {/* Accel Volume のメニュー名ヘッダー */}
                          {catapultData.menus.map((m, idx) => (
                            <View key={`a_h_${idx}`} style={{ width: 75, height: 36, justifyContent: "center", alignItems: "center", borderLeftWidth: 1, borderColor: "#E2E8F0" }}>
                              <Text style={{ fontSize: 9, color: "#B91C1C", fontWeight: "bold", textAlign: "center" }} numberOfLines={2}>
                                {idx + 1} {m}
                              </Text>
                            </View>
                          ))}
                          {/* Player Load のメニュー名ヘッダー */}
                          {catapultData.menus.map((m, idx) => (
                            <View key={`p_h_${idx}`} style={{ width: 75, height: 36, justifyContent: "center", alignItems: "center", borderLeftWidth: 1, borderColor: "#E2E8F0" }}>
                              <Text style={{ fontSize: 9, color: "#15803D", fontWeight: "bold", textAlign: "center" }} numberOfLines={2}>
                                {idx + 1} {m}
                              </Text>
                            </View>
                          ))}
                        </View>

                        {/* 選手データ行 */}
                        {catapultData.athletes.map((ath, idx) => {
                          const rowBgColor = idx % 2 === 0 ? "#FFFFFF" : "#F8FAFC";
                          return (
                            <View key={ath.athleteId} style={{ flexDirection: "row", borderBottomWidth: 1, borderColor: "#E2E8F0", backgroundColor: rowBgColor }}>
                              {/* 属性セル */}
                              <View style={{ flexDirection: "row", width: 240, position: "sticky" as any, left: 0, zIndex: 2, backgroundColor: rowBgColor }}>
                                <View style={{ width: 40, height: 32, justifyContent: "center", alignItems: "center" }}>
                                  {/* 部分参加チェックマーク (スクリーンショット準拠の□) */}
                                  <View style={{ width: 12, height: 12, borderWidth: 1, borderColor: "#94A3B8", borderRadius: 2 }} />
                                </View>
                                <View style={{ width: 40, height: 32, justifyContent: "center", alignItems: "center" }}>
                                  <Text style={{ fontSize: 11, color: "#475569" }}>{ath.jerseyNumber ?? "-"}</Text>
                                </View>
                                <View style={{ width: 120, height: 32, justifyContent: "center", paddingLeft: 8 }}>
                                  <Text style={{ fontSize: 11, fontWeight: "bold", color: "#0F172A" }}>{ath.athleteName}</Text>
                                </View>
                                <View style={{ width: 40, height: 32, justifyContent: "center", alignItems: "center" }}>
                                  <Text style={{ fontSize: 10, color: "#64748B", fontWeight: "bold" }}>{ath.position}</Text>
                                </View>
                              </View>

                              {/* Jump Volume 値 */}
                              {catapultData.menus.map(m => {
                                const val = ath.jumpVolumes[m];
                                return (
                                  <View key={`j_v_${ath.athleteId}_${m}`} style={{ width: 75, height: 32, justifyContent: "center", alignItems: "center", borderLeftWidth: 1, borderColor: "#F1F5F9" }}>
                                    <Text style={{ fontSize: 11, color: val ? "#0284C7" : "#CBD5E1", fontWeight: val ? "bold" : "normal" }}>
                                      {val !== undefined && val !== null ? Math.round(Number(val)) : "-"}
                                    </Text>
                                  </View>
                                );
                              })}
                              {/* Accel Volume 値 */}
                              {catapultData.menus.map(m => {
                                const val = ath.accelVolumes[m];
                                return (
                                  <View key={`a_v_${ath.athleteId}_${m}`} style={{ width: 75, height: 32, justifyContent: "center", alignItems: "center", borderLeftWidth: 1, borderColor: "#F1F5F9" }}>
                                    <Text style={{ fontSize: 11, color: val ? "#DC2626" : "#CBD5E1", fontWeight: val ? "bold" : "normal" }}>
                                      {val !== undefined && val !== null ? Number(val).toFixed(1) : "-"}
                                    </Text>
                                  </View>
                                );
                              })}
                              {/* Player Load 値 */}
                              {catapultData.menus.map(m => {
                                const val = ath.playerLoads[m];
                                return (
                                  <View key={`p_v_${ath.athleteId}_${m}`} style={{ width: 75, height: 32, justifyContent: "center", alignItems: "center", borderLeftWidth: 1, borderColor: "#F1F5F9" }}>
                                    <Text style={{ fontSize: 11, color: val ? "#16A34A" : "#CBD5E1", fontWeight: val ? "bold" : "normal" }}>
                                      {val !== undefined && val !== null ? Number(val).toFixed(1) : "-"}
                                    </Text>
                                  </View>
                                );
                              })}
                            </View>
                          );
                        })}

                        {/* Team 平均行 */}
                        <View style={{ flexDirection: "row", borderBottomWidth: 1, borderColor: "#CBD5E1", backgroundColor: "#F8FAFC" }}>
                          <View style={{ flexDirection: "row", width: 240, position: "sticky" as any, left: 0, zIndex: 2, backgroundColor: "#F8FAFC" }}>
                            <View style={{ width: 200, height: 32, justifyContent: "center", alignItems: "flex-end", paddingRight: 12 }}>
                              <Text style={{ fontSize: 10, fontWeight: "bold", color: "#475569" }}>Team平均</Text>
                            </View>
                            <View style={{ width: 40, height: 32, justifyContent: "center", alignItems: "center" }}>
                              <Text style={{ fontSize: 9, color: "#64748B", fontWeight: "bold" }}>Team</Text>
                            </View>
                          </View>

                          {/* Jump Volume 平均 */}
                          {catapultData.menus.map(m => {
                            const val = catapultData.teamAverages[m]?.jump;
                            return (
                              <View key={`j_team_${m}`} style={{ width: 75, height: 32, justifyContent: "center", alignItems: "center", borderLeftWidth: 1, borderColor: "#E2E8F0" }}>
                                <Text style={{ fontSize: 11, fontWeight: "bold", color: "#0369A1" }}>
                                  {val !== null && val !== undefined ? Math.round(Number(val)) : "-"}
                                </Text>
                              </View>
                            );
                          })}
                          {/* Accel Volume 平均 */}
                          {catapultData.menus.map(m => {
                            const val = catapultData.teamAverages[m]?.accel;
                            return (
                              <View key={`a_team_${m}`} style={{ width: 75, height: 32, justifyContent: "center", alignItems: "center", borderLeftWidth: 1, borderColor: "#E2E8F0" }}>
                                <Text style={{ fontSize: 11, fontWeight: "bold", color: "#B91C1C" }}>
                                  {val !== null && val !== undefined ? Number(val).toFixed(1) : "-"}
                                </Text>
                              </View>
                            );
                          })}
                          {/* Player Load 平均 */}
                          {catapultData.menus.map(m => {
                            const val = catapultData.teamAverages[m]?.load;
                            return (
                              <View key={`p_team_${m}`} style={{ width: 75, height: 32, justifyContent: "center", alignItems: "center", borderLeftWidth: 1, borderColor: "#E2E8F0" }}>
                                <Text style={{ fontSize: 11, fontWeight: "bold", color: "#15803D" }}>
                                  {val !== null && val !== undefined ? Number(val).toFixed(1) : "-"}
                                </Text>
                              </View>
                            );
                          })}
                        </View>

                        {/* ポジション別平均行 */}
                        {["S", "OH", "MB", "L"].map(pos => (
                          <View key={`pos_row_${pos}`} style={{ flexDirection: "row", borderBottomWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFEDD5" }}>
                            <View style={{ flexDirection: "row", width: 240, position: "sticky" as any, left: 0, zIndex: 2, backgroundColor: "#FFEDD5" }}>
                              <View style={{ width: 200, height: 32, justifyContent: "center", alignItems: "flex-end", paddingRight: 12 }}>
                                <Text style={{ fontSize: 10, fontWeight: "bold", color: "#9A3412" }}>{pos}平均</Text>
                              </View>
                              <View style={{ width: 40, height: 32, justifyContent: "center", alignItems: "center" }}>
                                <Text style={{ fontSize: 10, color: "#9A3412", fontWeight: "bold" }}>{pos}</Text>
                              </View>
                            </View>

                            {/* Jump Volume */}
                            {catapultData.menus.map(m => {
                              const val = catapultData.positionAverages[pos]?.[m]?.jump;
                              return (
                                <View key={`j_${pos}_${m}`} style={{ width: 75, height: 32, justifyContent: "center", alignItems: "center", borderLeftWidth: 1, borderColor: "#FED7AA" }}>
                                  <Text style={{ fontSize: 11, fontWeight: "bold", color: "#C2410C" }}>
                                    {val !== null && val !== undefined ? Math.round(Number(val)) : "-"}
                                  </Text>
                                </View>
                              );
                            })}
                            {/* Accel Volume */}
                            {catapultData.menus.map(m => {
                              const val = catapultData.positionAverages[pos]?.[m]?.accel;
                              return (
                                <View key={`a_${pos}_${m}`} style={{ width: 75, height: 32, justifyContent: "center", alignItems: "center", borderLeftWidth: 1, borderColor: "#FED7AA" }}>
                                  <Text style={{ fontSize: 11, fontWeight: "bold", color: "#C2410C" }}>
                                    {val !== null && val !== undefined ? Number(val).toFixed(1) : "-"}
                                  </Text>
                                </View>
                              );
                            })}
                            {/* Player Load */}
                            {catapultData.menus.map(m => {
                              const val = catapultData.positionAverages[pos]?.[m]?.load;
                              return (
                                <View key={`p_${pos}_${m}`} style={{ width: 75, height: 32, justifyContent: "center", alignItems: "center", borderLeftWidth: 1, borderColor: "#FED7AA" }}>
                                  <Text style={{ fontSize: 11, fontWeight: "bold", color: "#C2410C" }}>
                                    {val !== null && val !== undefined ? Number(val).toFixed(1) : "-"}
                                  </Text>
                                </View>
                              );
                            })}
                          </View>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                ) : (
                  <View style={{ backgroundColor: "#FFFFFF", padding: 40, borderRadius: 20, borderWidth: 1, borderColor: "#E2E8F0", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: "#64748B", fontSize: 13, fontWeight: "bold", textAlign: "center", marginBottom: 6 }}>
                      本日分のCatapultデータ（IMA/メニュー別）がありません。
                    </Text>
                    <Text style={{ color: "#94A3B8", fontSize: 11, textAlign: "center" }}>
                      アップロード画面からCSVファイルを読み込ませてください。
                    </Text>
                  </View>
                )}

                {/* チーム平均のメニュー別円グラフ（ドーナツ）エリア */}
                {catapultData.athletes.length > 0 && (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
                    {/* Jump Volume */}
                    <View style={{ flex: 1, minWidth: 260, backgroundColor: "#FFFFFF", padding: 20, borderRadius: 20, borderWidth: 1, borderColor: "#E2E8F0", alignItems: "center", shadowColor: "#0F172A", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2 }}>
                      <Text style={{ fontSize: 13, fontWeight: "bold", color: "#0F172A", marginBottom: 16, alignSelf: "flex-start" }}>Jump Volume (総ジャンプ高比率)</Text>
                      <DoughnutChart 
                        data={catapultData.charts.jump} 
                        colors={["#0284C7", "#0ea5e9", "#38bdf8", "#7dd3fc", "#bae6fd", "#e0f2fe", "#0369a1", "#075985", "#0c4a6e"]} 
                      />
                    </View>

                    {/* Accel Volume */}
                    <View style={{ flex: 1, minWidth: 260, backgroundColor: "#FFFFFF", padding: 20, borderRadius: 20, borderWidth: 1, borderColor: "#E2E8F0", alignItems: "center", shadowColor: "#0F172A", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2 }}>
                      <Text style={{ fontSize: 13, fontWeight: "bold", color: "#0F172A", marginBottom: 16, alignSelf: "flex-start" }}>Accel Volume (加速の総量比率)</Text>
                      <DoughnutChart 
                        data={catapultData.charts.accel} 
                        colors={["#DC2626", "#ef4444", "#f87171", "#fca5a5", "#fecaca", "#fee2e2", "#b91c1c", "#991b1b", "#7f1d1d"]} 
                      />
                    </View>

                    {/* Player Load */}
                    <View style={{ flex: 1, minWidth: 260, backgroundColor: "#FFFFFF", padding: 20, borderRadius: 20, borderWidth: 1, borderColor: "#E2E8F0", alignItems: "center", shadowColor: "#0F172A", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2 }}>
                      <Text style={{ fontSize: 13, fontWeight: "bold", color: "#0F172A", marginBottom: 16, alignSelf: "flex-start" }}>Player Load (総合的運動量比率)</Text>
                      <DoughnutChart 
                        data={catapultData.charts.load} 
                        colors={["#16A34A", "#22c55e", "#4ade80", "#86efac", "#bbf7d0", "#d1fae5", "#15803d", "#166534", "#14532d"]} 
                      />
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* SETTINGS TAB */}
            {activeTab === "settings" && (
              <View style={{ gap: 20 }}>
                {/* 🔒 ログインパスワードの変更 */}
                <View style={{ backgroundColor: "#FFFFFF", padding: 20, borderRadius: 20, borderWidth: 1, borderColor: "#E2E8F0", gap: 14, shadowColor: "#0F172A", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2 }}>
                  <Text style={{ fontSize: 13, fontWeight: "bold", color: "#1E293B" }}>🔒 ログインパスワードの変更</Text>
                  <Text style={{ fontSize: 11, color: "#64748B", lineHeight: 16 }}>ログインに使用するパスワードを変更します。4文字以上で設定してください。</Text>
                  
                  <View style={{ gap: 10, marginTop: 4 }}>
                    <View style={{ gap: 4 }}>
                      <Text style={{ fontSize: 11, fontWeight: "bold", color: "#475569" }}>新しいパスワード</Text>
                      <TextInput
                        value={newPasswordVal}
                        onChangeText={setNewPasswordVal}
                        secureTextEntry
                        placeholder="新しいパスワード"
                        placeholderTextColor="#94A3B8"
                        style={{ fontSize: 12, borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, padding: 10, color: "#1E293B", backgroundColor: "#FFFFFF" }}
                      />
                    </View>

                    <View style={{ gap: 4 }}>
                      <Text style={{ fontSize: 11, fontWeight: "bold", color: "#475569" }}>新しいパスワード（確認用）</Text>
                      <TextInput
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        secureTextEntry
                        placeholder="もう一度入力してください"
                        placeholderTextColor="#94A3B8"
                        style={{ fontSize: 12, borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, padding: 10, color: "#1E293B", backgroundColor: "#FFFFFF" }}
                      />
                    </View>

                    {passwordError && (
                      <Text style={{ fontSize: 11, fontWeight: "bold", color: "#EF4444" }}>{passwordError}</Text>
                    )}
                    {passwordSuccess && (
                      <Text style={{ fontSize: 11, fontWeight: "bold", color: "#22C55E" }}>{passwordSuccess}</Text>
                    )}

                    <TouchableOpacity
                      onPress={handleChangePassword}
                      disabled={isChangingPassword}
                      style={{
                        backgroundColor: "#2F80ED",
                        paddingVertical: 10,
                        borderRadius: 8,
                        alignItems: "center",
                        marginTop: 6,
                        opacity: isChangingPassword ? 0.6 : 1
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: "bold", color: "#FFFFFF" }}>
                        {isChangingPassword ? "変更中..." : "パスワードを変更する"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* チーム全体の設定（スタッフのみ） */}
                {(user?.role === "coach" || (user?.role as string) === "admin") && teamSettings && (
                  <>
                    {/* 状態インジケータ */}
                    <View style={{ backgroundColor: "#E8F0FE", borderColor: "#B5D1F6", borderWidth: 1, borderRadius: 12, padding: 14 }}>
                      <Text style={{ fontSize: 12, fontWeight: "bold", color: "#1C4587" }}>
                        ✓ 客観 {METRICS_MAP.filter(m => ["totalJumps", "maxJumpHeight", "jumpVolume", "totalLoad", "accelCount", "hrv"].includes(m.key) && JSON.parse(teamSettings.enabledMetrics).includes(m.key)).length} / 主観 {METRICS_MAP.filter(m => ["wellnessFatigue", "wellnessStress", "wellnessSoreness"].includes(m.key) && JSON.parse(teamSettings.enabledMetrics).includes(m.key)).length} カテゴリ有効。バランス良好。
                      </Text>
                    </View>

                    {/* 1. 基準窓 (スライダー ＆ 日数) */}
                    <View style={{ backgroundColor: "#FFFFFF", padding: 20, borderRadius: 20, borderWidth: 1, borderColor: "#E2E8F0", gap: 14, shadowColor: "#0F172A", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2 }}>
                      <Text style={{ fontSize: 13, fontWeight: "bold", color: "#1E293B" }}>基準窓 (個人ベースラインの比較範囲)</Text>
                      <Text style={{ fontSize: 11, color: "#64748B", lineHeight: 16 }}>当日を含まない過去の移動平均±SDを基準にします。ピリオダイゼーションの文脈に応じて変更してください。</Text>
                  
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 16, marginTop: 4 }}>
                    {/* Custom Slider Bar */}
                    <View style={{ flex: 1, height: 8, backgroundColor: "#E2E8F0", borderRadius: 4, position: "relative" }}>
                      <View style={{ width: `${((teamSettings.baselineDays - 3) / 25) * 100}%`, height: "100%", backgroundColor: "#2F80ED", borderRadius: 4 }} />
                      <View style={{ position: "absolute", left: `${((teamSettings.baselineDays - 3) / 25) * 100}%`, marginLeft: -8, top: -4, width: 16, height: 16, borderRadius: 8, backgroundColor: "#FFFFFF", borderWidth: 4, borderColor: "#2F80ED", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 1 }} />
                    </View>
                    
                    <View style={{ borderWidth: 1, borderColor: "#CBD5E1", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, minWidth: 44, alignItems: "center" }}>
                      <Text style={{ fontSize: 13, fontWeight: "bold", color: "#1E293B" }}>{teamSettings.baselineDays}</Text>
                    </View>
                    <Text style={{ fontSize: 12, color: "#475569" }}>日</Text>
                  </View>

                  {/* Days shortcuts */}
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                    {[3, 7, 14, 21, 28].map(days => {
                      const isSelected = teamSettings.baselineDays === days;
                      return (
                        <TouchableOpacity
                           key={days}
                           onPress={async () => {
                             try {
                               const enabledArr = JSON.parse(teamSettings.enabledMetrics) as string[];
                               const alertingArr = teamSettings.alertingMetrics ? (JSON.parse(teamSettings.alertingMetrics) as string[]) : [];
                               await updateSettingsMutation.mutateAsync({
                                 teamId: user?.teamId || 1,
                                 baselineDays: days,
                                 enabledMetrics: enabledArr,
                                 alertingMetrics: alertingArr,
                                 baseDateMode: teamSettings.baseDateMode || "rolling",
                                 baseFixedDate: teamSettings.baseFixedDate || null
                               });
                               refetchSettings();
                               refetchTeam();
                             } catch (err) {
                               console.error("Settings update failed", err);
                             }
                           }}
                          style={{
                            flex: 1,
                            paddingVertical: 10,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: isSelected ? "#2F80ED" : "#CBD5E1",
                            backgroundColor: isSelected ? "#E8F0FE" : "#FFFFFF",
                            alignItems: "center"
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: "bold", color: isSelected ? "#2F80ED" : "#475569" }}>
                            {days}日
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* 2. カテゴリ別指標トグルリスト */}
                <View style={{ gap: 14 }}>
                  <Text style={{ fontSize: 13, fontWeight: "bold", color: "#1E293B" }}>計測する指標だけ有効にしてください (有効 {JSON.parse(teamSettings.enabledMetrics).length}/10)</Text>
                  
                  {(() => {
                    const cardGroups = [
                      {
                        title: "負荷 Load — 与えた刺激",
                        categories: [
                          {
                            subTitle: "外的負荷 (客観)",
                            items: METRICS_MAP.filter(m => m.category === "load_ext")
                          },
                          {
                            subTitle: "内的負荷(応答) (客観)",
                            items: METRICS_MAP.filter(m => m.category === "load_int")
                          }
                        ]
                      },
                      {
                        title: "状態 / レディネス State/Readiness — 運動後・翌日の準備状態",
                        categories: [
                          {
                            subTitle: "主観 (主観)",
                            items: METRICS_MAP.filter(m => m.category === "state_subj")
                          },
                          {
                            subTitle: "客観・生理学 (客観)",
                            items: METRICS_MAP.filter(m => m.category === "state_obj")
                          }
                        ]
                      }
                    ];

                    const enabledArr = JSON.parse(teamSettings.enabledMetrics) as string[];
                    const alertingArr = teamSettings.alertingMetrics ? (JSON.parse(teamSettings.alertingMetrics) as string[]) : [];

                    return (
                      <View style={{ gap: 16 }}>
                        {cardGroups.map((group, gIdx) => (
                          <View key={gIdx} style={{ backgroundColor: "#FFFFFF", padding: 20, borderRadius: 20, borderWidth: 1, borderColor: "#E2E8F0", gap: 12 }}>
                            <Text style={{ fontSize: 13, fontWeight: "800", color: "#2F80ED" }}>{group.title}</Text>
                            
                            {group.categories.map((sub, sIdx) => (
                              <View key={sIdx} style={{ gap: 8, marginTop: 4 }}>
                                <Text style={{ fontSize: 11, fontWeight: "bold", color: "#64748B" }}>{sub.subTitle}</Text>
                                
                                {sub.items.map(m => {
                                  const isEnabled = enabledArr.includes(m.key);
                                  const isAlerting = alertingArr.includes(m.key);
                                  
                                  return (
                                    <View
                                      key={m.key}
                                      style={{
                                        flexDirection: "row",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        paddingVertical: 10,
                                        borderBottomWidth: 1,
                                        borderColor: "#F1F5F9"
                                      }}
                                    >
                                      <View style={{ flex: 1, marginRight: 8 }}>
                                        <Text style={{ fontSize: 12, fontWeight: "bold", color: "#1E293B" }}>{m.label}</Text>
                                      </View>
                                      
                                      <View style={{ flexDirection: "row", gap: 8, alignItems: "center", zIndex: 20 }}>
                                        {/* 表示トグル */}
                                        <TouchableOpacity
                                          activeOpacity={0.6}
                                          onPress={async () => {
                                            alert("表示トグルがクリックされました: " + m.label);
                                            try {
                                              let nextEnabled = isEnabled
                                                ? enabledArr.filter(k => k !== m.key)
                                                : [...enabledArr, m.key];
                                              
                                              let nextAlerting = alertingArr;
                                              if (isEnabled && isAlerting) {
                                                nextAlerting = alertingArr.filter(k => k !== m.key);
                                              }

                                              await updateSettingsMutation.mutateAsync({
                                                teamId: user?.teamId || 1,
                                                baselineDays: teamSettings.baselineDays,
                                                enabledMetrics: nextEnabled,
                                                alertingMetrics: nextAlerting,
                                                baseDateMode: teamSettings.baseDateMode || "rolling",
                                                baseFixedDate: teamSettings.baseFixedDate || null
                                              });
                                              refetchSettings();
                                              refetchTeam();
                                            } catch (err: any) {
                                              console.error("Settings update failed", err);
                                              alert("表示設定の更新に失敗しました: " + (err.message || String(err)));
                                            }
                                          }}
                                          style={{
                                            flexDirection: "row",
                                            alignItems: "center",
                                            gap: 4,
                                            paddingVertical: 8,
                                            paddingHorizontal: 10,
                                            borderRadius: 6,
                                            backgroundColor: isEnabled ? "#E8F0FE" : "#F1F5F9",
                                            zIndex: 30
                                          }}
                                        >
                                          <View style={{
                                            width: 14, height: 14, borderRadius: 3, borderWidth: 1.5,
                                            borderColor: isEnabled ? "#2F80ED" : "#CBD5E1",
                                            backgroundColor: isEnabled ? "#2F80ED" : "transparent",
                                            alignItems: "center", justifyContent: "center"
                                          }}>
                                            {isEnabled && <Text style={{ color: "#FFFFFF", fontSize: 8, fontWeight: "bold" }}>✓</Text>}
                                          </View>
                                          <Text style={{ fontSize: 10, fontWeight: "bold", color: isEnabled ? "#2F80ED" : "#64748B" }}>表示</Text>
                                        </TouchableOpacity>

                                        {/* 判定トグル */}
                                        <TouchableOpacity
                                          activeOpacity={0.6}
                                          onPress={async () => {
                                            alert("判定トグルがクリックされました: " + m.label);
                                            try {
                                              let nextAlerting = isAlerting
                                                ? alertingArr.filter(k => k !== m.key)
                                                : [...alertingArr, m.key];
                                              
                                              let nextEnabled = enabledArr;
                                              if (!isAlerting && !isEnabled) {
                                                nextEnabled = [...enabledArr, m.key];
                                              }

                                              await updateSettingsMutation.mutateAsync({
                                                teamId: user?.teamId || 1,
                                                baselineDays: teamSettings.baselineDays,
                                                enabledMetrics: nextEnabled,
                                                alertingMetrics: nextAlerting,
                                                baseDateMode: teamSettings.baseDateMode || "rolling",
                                                baseFixedDate: teamSettings.baseFixedDate || null
                                              });
                                              refetchSettings();
                                              refetchTeam();
                                            } catch (err: any) {
                                              console.error("Settings update failed", err);
                                              alert("判定設定の更新に失敗しました: " + (err.message || String(err)));
                                            }
                                          }}
                                          style={{
                                            flexDirection: "row",
                                            alignItems: "center",
                                            gap: 4,
                                            paddingVertical: 8,
                                            paddingHorizontal: 10,
                                            borderRadius: 6,
                                            backgroundColor: isAlerting ? "#FEE2E2" : "#F1F5F9",
                                            zIndex: 30
                                          }}
                                        >
                                          <View style={{
                                            width: 14, height: 14, borderRadius: 3, borderWidth: 1.5,
                                            borderColor: isAlerting ? "#EF4444" : "#CBD5E1",
                                            backgroundColor: isAlerting ? "#EF4444" : "transparent",
                                            alignItems: "center", justifyContent: "center"
                                          }}>
                                            {isAlerting && <Text style={{ color: "#FFFFFF", fontSize: 8, fontWeight: "bold" }}>✓</Text>}
                                          </View>
                                          <Text style={{ fontSize: 10, fontWeight: "bold", color: isAlerting ? "#EF4444" : "#64748B" }}>判定（重要）</Text>
                                        </TouchableOpacity>
                                      </View>
                                    </View>
                                  );
                                })}
                              </View>
                            ))}
                          </View>
                        ))}
                      </View>
                    );
                  })()}
                </View>

                {/* 3. 変動の起点設定 */}
                <View style={{ backgroundColor: "#FFFFFF", padding: 20, borderRadius: 20, borderWidth: 1, borderColor: "#E2E8F0", gap: 14, shadowColor: "#0F172A", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2 }}>
                  <Text style={{ fontSize: 13, fontWeight: "bold", color: "#1E293B" }}>ベースライン設定 (変動の起点)</Text>
                  
                  <View style={{ flexDirection: "row", backgroundColor: "#F1F5F9", padding: 3, borderRadius: 10, gap: 4 }}>
                    <TouchableOpacity
                      onPress={async () => {
                        try {
                          const enabledArr = JSON.parse(teamSettings.enabledMetrics) as string[];
                          const alertingArr = teamSettings.alertingMetrics ? (JSON.parse(teamSettings.alertingMetrics) as string[]) : [];
                          await updateSettingsMutation.mutateAsync({
                            teamId: user?.teamId || 1,
                            baselineDays: teamSettings.baselineDays,
                            enabledMetrics: enabledArr,
                            alertingMetrics: alertingArr,
                            baseDateMode: "rolling",
                            baseFixedDate: teamSettings.baseFixedDate || null
                          });
                          refetchSettings();
                          refetchTeam();
                        } catch (err) {
                          console.error("Mode update failed", err);
                        }
                      }}
                      style={{
                        flex: 1, paddingVertical: 10, borderRadius: 8,
                        backgroundColor: teamSettings.baseDateMode === "rolling" ? "#FFFFFF" : "transparent",
                        alignItems: "center"
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: "bold", color: teamSettings.baseDateMode === "rolling" ? "#2F80ED" : "#64748B" }}>
                        直近{teamSettings.baselineDays}日を起点 (基準窓に追従)
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={async () => {
                        try {
                          const enabledArr = JSON.parse(teamSettings.enabledMetrics) as string[];
                          const alertingArr = teamSettings.alertingMetrics ? (JSON.parse(teamSettings.alertingMetrics) as string[]) : [];
                          await updateSettingsMutation.mutateAsync({
                            teamId: user?.teamId || 1,
                            baselineDays: teamSettings.baselineDays,
                            enabledMetrics: enabledArr,
                            alertingMetrics: alertingArr,
                            baseDateMode: "fixed",
                            baseFixedDate: teamSettings.baseFixedDate || new Date().toLocaleDateString("sv-SE")
                          });
                          refetchSettings();
                          refetchTeam();
                        } catch (err) {
                          console.error("Mode update failed", err);
                        }
                      }}
                      style={{
                        flex: 1, paddingVertical: 10, borderRadius: 8,
                        backgroundColor: teamSettings.baseDateMode === "fixed" ? "#FFFFFF" : "transparent",
                        alignItems: "center"
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: "bold", color: teamSettings.baseDateMode === "fixed" ? "#2F80ED" : "#64748B" }}>
                        起点を指定 (日付で固定)
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Fixed Date Input Form */}
                  {teamSettings.baseDateMode === "fixed" && (
                    <View style={{ gap: 6, borderTopWidth: 1, borderColor: "#F1F5F9", paddingTop: 12 }}>
                      <Text style={{ fontSize: 11, fontWeight: "bold", color: "#475569" }}>起点の日の指定 (ここから今日まで)</Text>
                      <TextInput
                        defaultValue={teamSettings.baseFixedDate || new Date().toLocaleDateString("sv-SE")}
                        onBlur={async (e) => {
                          const text = (e as any).nativeEvent.text;
                          try {
                            const enabledArr = JSON.parse(teamSettings.enabledMetrics) as string[];
                            const alertingArr = teamSettings.alertingMetrics ? (JSON.parse(teamSettings.alertingMetrics) as string[]) : [];
                            await updateSettingsMutation.mutateAsync({
                              teamId: user?.teamId || 1,
                              baselineDays: teamSettings.baselineDays,
                              enabledMetrics: enabledArr,
                              alertingMetrics: alertingArr,
                              baseDateMode: "fixed",
                              baseFixedDate: text || new Date().toLocaleDateString("sv-SE")
                            });
                            refetchSettings();
                            refetchTeam();
                          } catch (err) {
                            console.error("Date update failed", err);
                          }
                        }}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor="#94A3B8"
                        style={{ fontSize: 12, borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, padding: 10, color: "#1E293B", backgroundColor: "#FFFFFF", width: 150 }}
                      />
                    </View>
                  )}
                </View>

                {/* 3. 選手マッピング (名寄せ) 設定 */}
                <View style={{ backgroundColor: "#FFFFFF", padding: 20, borderRadius: 20, borderWidth: 1, borderColor: "#E2E8F0", gap: 14, shadowColor: "#0F172A", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2 }}>
                  <Text style={{ fontSize: 13, fontWeight: "bold", color: "#1E293B" }}>選手マッピング (CSV名寄せ) 設定</Text>
                  <Text style={{ fontSize: 11, color: "#64748B", lineHeight: 16 }}>
                    CSVファイルに書かれている選手名（Catapult名、Onetap名など）と、アプリ上の選手を紐付けます。複数ある場合は半角カンマ「,」で区切って登録してください。
                  </Text>

                  <View style={{ gap: 10, marginTop: 8 }}>
                    {allAthletes.map((ath) => {
                      return (
                        <View key={ath.athleteId} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderColor: "#F1F5F9", paddingBottom: 10, gap: 12 }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 12, fontWeight: "bold", color: "#0F172A" }}>{ath.name}</Text>
                            <Text style={{ fontSize: 10, color: "#64748B" }}>No.{ath.jerseyNumber || "-"} / {ath.position || "-"}</Text>
                          </View>
                          
                          <View style={{ flex: 2 }}>
                            <TextInput
                              defaultValue={(ath as any).csvNames || ""}
                              placeholder="例: Haruna, Yamashita, 1 Yamashita"
                              placeholderTextColor="#94A3B8"
                              onBlur={async (e) => {
                                const text = (e as any).nativeEvent.text;
                                try {
                                  await updateAthleteCsvNamesMutation.mutateAsync({
                                    athleteId: ath.athleteId,
                                    csvNames: text
                                  });
                                  refetchTeam();
                                  alert("マッピングを更新しました。");
                                } catch (err) {
                                  console.error("Failed to update mapping", err);
                                  alert("マッピングの保存に失敗しました。");
                                }
                              }}
                              style={{
                                fontSize: 12,
                                borderWidth: 1,
                                borderColor: "#CBD5E1",
                                borderRadius: 8,
                                paddingVertical: 6,
                                paddingHorizontal: 10,
                                color: "#1E293B",
                                backgroundColor: "#FFFFFF",
                              }}
                            />
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
                  </>
                )}
              </View>
            )}
          </View>
        </ScrollView>

        {/* アノマリー（測定不良データ）の補正・承認用モーダル */}
        <Modal
          visible={anomalyModalOpen}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setAnomalyModalOpen(false)}
        >
          <TouchableOpacity 
            activeOpacity={1} 
            onPress={() => setAnomalyModalOpen(false)}
            style={{ flex: 1, backgroundColor: "rgba(15, 23, 42, 0.4)", justifyContent: "center", alignItems: "center", padding: 20 }}
          >
            <TouchableOpacity 
              activeOpacity={1}
              style={{ backgroundColor: "#FFFFFF", borderRadius: 24, padding: 20, width: "100%", maxWidth: 440, gap: 16, shadowColor: "#0F172A", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 5 }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <IconSymbol size={22} name="exclamationmark.triangle.fill" color="#EF4444" />
                <Text style={{ fontSize: 16, fontWeight: "bold", color: "#0F172A" }}>測定不良（異常値）の確認と承認</Text>
              </View>

              <Text style={{ fontSize: 12, color: "#64748B", lineHeight: 18 }}>
                Catapultデバイスの測定不良等により、通常の範囲を明らかに逸脱した異常値が検出されました。ポジション別のチーム平均値に補正して記録を承認できます。
              </Text>

              <ScrollView style={{ maxHeight: 250, marginVertical: 4 }}>
                <View style={{ gap: 10 }}>
                  {uncorrectedAnomalies && uncorrectedAnomalies.length > 0 ? (
                    uncorrectedAnomalies.map((item: any) => (
                      <AnomalyItemRow 
                        key={item.id} 
                        item={item} 
                        correctMutation={correctAnomalyMutation} 
                        onResolve={() => {
                          refetchAnomalies();
                          refetchTeam();
                        }}
                      />
                    ))
                  ) : (
                    <Text style={{ fontSize: 12, color: "#64748B", fontStyle: "italic", textAlign: "center", paddingVertical: 16 }}>
                      未処理の測定不良データはありません。
                    </Text>
                  )}
                </View>
              </ScrollView>

              {uncorrectedAnomalies && uncorrectedAnomalies.length > 0 && (
                <TouchableOpacity 
                  onPress={async () => {
                    const confirm = typeof window !== "undefined" && window.confirm 
                      ? window.confirm("残りのすべての警告を、ポジション平均値に補正せず「元の生データのまま」で一括承認しますか？") 
                      : true;
                    if (confirm) {
                      try {
                        const ids = uncorrectedAnomalies.map((item: any) => item.id);
                        await bulkApproveAnomaliesMutation.mutateAsync({ recordIds: ids });
                        alert("残りのすべての異常値を補正なしで一括承認しました。");
                        refetchAnomalies();
                        refetchTeam();
                        setAnomalyModalOpen(false);
                      } catch (err: any) {
                        alert(`一括承認に失敗しました: ${err.message || err}`);
                      }
                    }
                  }}
                  style={{ backgroundColor: "#EFF6FF", borderWidth: 1, borderColor: "#BFDBFE", paddingVertical: 10, borderRadius: 12, alignItems: "center" }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "bold", color: "#1D4ED8" }}>✓ 残りのすべてを補正なしで一括承認</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity 
                onPress={() => setAnomalyModalOpen(false)}
                style={{ borderWidth: 1, borderColor: "#CBD5E1", paddingVertical: 12, borderRadius: 12, alignItems: "center", marginTop: 4 }}
              >
                <Text style={{ fontSize: 12, fontWeight: "bold", color: "#475569" }}>閉じる</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {/* 日付選択カレンダーモーダル */}
        <Modal
          visible={calendarModalOpen}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setCalendarModalOpen(false)}
        >
          <TouchableOpacity 
            style={{ flex: 1, backgroundColor: "rgba(0, 0, 0, 0.4)", justifyContent: "center", alignItems: "center" }}
            activeOpacity={1}
            onPress={() => setCalendarModalOpen(false)}
          >
            <TouchableOpacity 
              activeOpacity={1}
              style={{ 
                width: 320, 
                backgroundColor: "#FFFFFF", 
                borderRadius: 24, 
                padding: 20, 
                borderWidth: 1, 
                borderColor: "#E2E8F0",
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15,
                shadowRadius: 12,
                elevation: 5
              }}
            >
              {/* カレンダーヘッダー */}
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
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
                
                <Text style={{ fontSize: 15, fontWeight: "bold", color: "#1E293B" }}>
                  {calYear}年 {calMonth}月
                </Text>
                
                <TouchableOpacity 
                  onPress={() => {
                    if (calMonth === 12) {
                      setCalMonth(1);
                      setCalYear(prev => prev + 1);
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

                  // 空白セル
                  for (let i = 0; i < firstDayIdx; i++) {
                    cells.push(<View key={`empty-${i}`} style={{ width: "14.28%", aspectRatio: 1 }} />);
                  }

                  // 日付セル
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
      </ScreenContainer>
    );
  }

  // Default view / fallback
  return (
    <ScreenContainer className="p-6 bg-background">
      <View className="flex-1 gap-8 items-center justify-center">
        <Text className="text-2xl font-bold text-foreground">VolleyTrack Catapult</Text>
        <TouchableOpacity onPress={logout} className="bg-primary px-8 py-3 rounded-full mt-4">
          <Text className="text-background font-semibold">ログアウト</Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}

