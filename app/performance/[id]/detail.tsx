import { ScrollView, Text, View, TouchableOpacity, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { trpc } from "@/lib/trpc";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";

export default function PerformanceDetailScreen() {
  const { id } = useLocalSearchParams();
  const perfId = Number(id);
  const router = useRouter();

  // Fetch performance data
  const { data: perf, isLoading } = trpc.performance.getById.useQuery(
    { id: perfId },
    { enabled: !!perfId }
  );

  // Fetch athlete info to get name
  const { data: athlete } = trpc.athlete.getById.useQuery(
    { id: perf?.athleteId || 0 },
    { enabled: !!perf?.athleteId }
  );

  // Fetch athlete list for name matching
  const { data: athletes } = trpc.athlete.getByTeam.useQuery(
    { teamId: perf?.teamId || 1 },
    { enabled: !!perf?.teamId }
  );
  
  const athleteDetail = athletes?.find(a => a.id === perf?.athleteId);

  if (isLoading) {
    return (
      <ScreenContainer className="flex items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#FF6B35" />
      </ScreenContainer>
    );
  }

  if (!perf) {
    return (
      <ScreenContainer className="flex items-center justify-center bg-background p-6">
        <Text className="text-base text-muted text-center">データが見つかりませんでした。</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-4 bg-primary px-6 py-2.5 rounded-full">
          <Text className="text-white font-bold">戻る</Text>
        </TouchableOpacity>
      </ScreenContainer>
    );
  }

  const durationMin = perf.duration ? Math.floor(perf.duration / 60) : 0;
  const rawCsvValues = perf.rawCsvData ? JSON.parse(perf.rawCsvData) : null;

  return (
    <ScreenContainer className="bg-background">
      {/* Header */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-border bg-surface">
        <View className="flex-row items-center gap-3">
          <TouchableOpacity onPress={() => router.back()} className="p-1 rounded-full bg-muted/20">
            <IconSymbol size={22} name="chevron.left" color="#1F2937" />
          </TouchableOpacity>
          <View>
            <Text className="text-xl font-bold text-foreground">セッション詳細</Text>
            <Text className="text-xs text-muted">
              {new Date(perf.date).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" })}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 24 }} showsVerticalScrollIndicator={false}>
        <View className="gap-6">
          {/* Athlete info & Session summary card */}
          <View className="bg-surface rounded-3xl p-5 border border-border flex-row justify-between items-center shadow-sm">
            <View className="gap-1 flex-1">
              <Text className="text-xs text-muted">選手</Text>
              <Text className="text-xl font-bold text-foreground">{athleteDetail?.user?.name || "アスリート"}</Text>
              <Text className="text-xs text-muted mt-1">
                {athleteDetail?.position || "ポジション未設定"} #{athleteDetail?.jerseyNumber || ""}
              </Text>
            </View>
            <View className="items-end gap-1.5">
              <View className={`px-3 py-1 rounded-full font-bold ${
                perf.sessionType === "match" ? "bg-accent/15" : "bg-secondary/15"
              }`}>
                <Text className={`text-xs font-bold ${perf.sessionType === "match" ? "text-accent" : "text-secondary"}`}>
                  {perf.sessionType === "match" ? "試合" : "練習"}
                </Text>
              </View>
              {durationMin > 0 && (
                <Text className="text-xs text-muted font-medium">{durationMin}分間稼働</Text>
              )}
            </View>
          </View>

          {/* Section: Jumps */}
          <View className="gap-3">
            <Text className="text-sm font-bold text-foreground">ジャンプ分析</Text>
            <View className="flex-row gap-3">
              <View className="flex-1 bg-surface border border-border rounded-2xl p-4 shadow-sm">
                <Text className="text-[10px] text-muted mb-1">最大ジャンプ高</Text>
                <Text className="text-xl font-extrabold text-primary">
                  {perf.maxJumpHeight ? `${Number(perf.maxJumpHeight).toFixed(1)} cm` : "--"}
                </Text>
              </View>
              <View className="flex-1 bg-surface border border-border rounded-2xl p-4 shadow-sm">
                <Text className="text-[10px] text-muted mb-1">総ジャンプ回数</Text>
                <Text className="text-xl font-extrabold text-accent">
                  {perf.totalJumps ? `${perf.totalJumps} 回` : "--"}
                </Text>
              </View>
            </View>

            <View className="flex-row gap-3">
              <View className="flex-1 bg-surface border border-border rounded-2xl p-4 shadow-sm">
                <Text className="text-[10px] text-muted mb-1">平均ジャンプ高 (全数)</Text>
                <Text className="text-xl font-extrabold text-foreground">
                  {perf.avgJumpHeight ? `${Number(perf.avgJumpHeight).toFixed(1)} cm` : "--"}
                </Text>
              </View>
              <View className="flex-1 bg-surface border border-border rounded-2xl p-4 shadow-sm">
                <Text className="text-[10px] text-muted mb-1">平均ジャンプ高 (Top5)</Text>
                <Text className="text-xl font-extrabold text-foreground">
                  {(perf as any).top5JumpHeight ? `${Number((perf as any).top5JumpHeight).toFixed(1)} cm` : "--"}
                </Text>
              </View>
            </View>
          </View>

          {/* Section: Movement & Load */}
          <View className="gap-3">
            <Text className="text-sm font-bold text-foreground">運動量・移動</Text>
            <View className="flex-row gap-3">
              <View className="flex-1 bg-surface border border-border rounded-2xl p-4 shadow-sm">
                <Text className="text-[10px] text-muted mb-1">総運動量 (Load)</Text>
                <Text className="text-xl font-extrabold text-secondary">
                  {perf.totalLoad ? Math.round(Number(perf.totalLoad)) : "--"}
                </Text>
              </View>
              <View className="flex-1 bg-surface border border-border rounded-2xl p-4 shadow-sm">
                <Text className="text-[10px] text-muted mb-1">平均運動量/分</Text>
                <Text className="text-xl font-extrabold text-foreground">
                  {perf.avgLoad ? Number(perf.avgLoad).toFixed(2) : "--"}
                </Text>
              </View>
              <View className="flex-1 bg-surface border border-border rounded-2xl p-4 shadow-sm">
                <Text className="text-[10px] text-muted mb-1">総移動距離</Text>
                <Text className="text-xl font-extrabold text-foreground">
                  {perf.totalDistance ? `${(Number(perf.totalDistance) / 1000).toFixed(2)} km` : "--"}
                </Text>
              </View>
            </View>
          </View>

          {/* Section: Speed & Acceleration */}
          <View className="gap-3">
            <Text className="text-sm font-bold text-foreground">スピード・加速度</Text>
            <View className="flex-row gap-3">
              <View className="flex-1 bg-surface border border-border rounded-2xl p-4 shadow-sm">
                <Text className="text-[10px] text-muted mb-1">最大速度</Text>
                <Text className="text-xl font-extrabold text-foreground">
                  {perf.maxSpeed ? `${Number(perf.maxSpeed).toFixed(1)} m/s` : "--"}
                </Text>
              </View>
              <View className="flex-1 bg-surface border border-border rounded-2xl p-4 shadow-sm">
                <Text className="text-[10px] text-muted mb-1">平均速度</Text>
                <Text className="text-xl font-extrabold text-foreground">
                  {perf.avgSpeed ? `${Number(perf.avgSpeed).toFixed(1)} m/s` : "--"}
                </Text>
              </View>
            </View>
            <View className="flex-row gap-3">
              <View className="flex-1 bg-surface border border-border rounded-2xl p-4 shadow-sm">
                <Text className="text-[10px] text-muted mb-1">最大加速度</Text>
                <Text className="text-xl font-extrabold text-foreground">
                  {perf.maxAcceleration ? `${Number(perf.maxAcceleration).toFixed(2)} m/s²` : "--"}
                </Text>
              </View>
              <View className="flex-1 bg-surface border border-border rounded-2xl p-4 shadow-sm">
                <Text className="text-[10px] text-muted mb-1">平均加速度</Text>
                <Text className="text-xl font-extrabold text-foreground">
                  {perf.avgAcceleration ? `${Number(perf.avgAcceleration).toFixed(2)} m/s²` : "--"}
                </Text>
              </View>
            </View>
          </View>

          {/* Section: Raw CSV values */}
          {rawCsvValues && (
            <View className="gap-3">
              <Text className="text-sm font-bold text-foreground">Catapult インポート生データ</Text>
              <View className="bg-surface rounded-2xl border border-border p-4 shadow-sm">
                <ScrollView horizontal showsHorizontalScrollIndicator={true} className="pb-2">
                  <View className="gap-1 font-mono text-xs">
                    {rawCsvValues.map((val: string, index: number) => (
                      <View key={index} className="flex-row py-1 border-b border-muted/20">
                        <Text className="w-8 text-muted font-bold">{index + 1}:</Text>
                        <Text className="text-foreground font-mono">{val}</Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
