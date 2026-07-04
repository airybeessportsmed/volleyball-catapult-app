import React, { useState } from "react";
import { ScrollView, Text, View, TouchableOpacity, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";

interface EditableAthlete {
  id?: number;
  name: string;
  email: string;
  jerseyNumber: number | null;
  position: string | null;
  birthday: string | null;
  height: number | null;
  csvNames: string | null;
  onetapName: string | null;
  catapultName: string | null;
  soxaiEmail: string | null;
  isDeleted?: boolean;
}

export default function CoachTeamScreen() {
  const { user, isAuthenticated } = useAuth();
  const router = useRouter();

  const teamId = user?.teamId || 1;

  const [isEditMode, setIsEditMode] = useState(false);
  const [editableAthletes, setEditableAthletes] = useState<EditableAthlete[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch team info
  const { data: team, isLoading: teamLoading } = trpc.team.getById.useQuery(
    { teamId },
    { enabled: isAuthenticated && !!user?.teamId }
  );

  // Fetch all athletes in the team
  const { data: athletes, isLoading: athletesLoading, refetch } = trpc.athlete.getByTeam.useQuery(
    { teamId },
    { enabled: isAuthenticated && !!user?.teamId }
  );

  // Fetch all performance data for latest values
  const { data: allPerfData } = trpc.performance.getByTeam.useQuery(
    { teamId },
    { enabled: isAuthenticated && !!user?.teamId }
  );

  const batchSaveMutation = trpc.athlete.batchSave.useMutation({
    onSuccess: () => {
      setIsEditMode(false);
      setErrorMessage(null);
      refetch();
    },
    onError: (err) => {
      setErrorMessage(err.message || "一括保存中にエラーが発生しました。");
    }
  });

  const startEditMode = () => {
    if (athletes) {
      setEditableAthletes(
        athletes.map(a => ({
          id: a.id,
          name: a.user?.name || "",
          email: a.user?.email || "",
          jerseyNumber: a.jerseyNumber,
          position: a.position,
          birthday: a.birthday || "",
          height: a.height ? Number(a.height) : null,
          csvNames: a.csvNames || "",
          onetapName: a.onetapName || "",
          catapultName: a.catapultName || "",
          soxaiEmail: a.soxaiEmail || "",
          isDeleted: false,
        }))
      );
    } else {
      setEditableAthletes([]);
    }
    setErrorMessage(null);
    setIsEditMode(true);
  };

  const handleAddRow = () => {
    setEditableAthletes([
      ...editableAthletes,
      {
        name: "",
        email: "",
        jerseyNumber: null,
        position: "",
        birthday: "",
        height: null,
        csvNames: "",
        onetapName: "",
        catapultName: "",
        soxaiEmail: "",
        isDeleted: false,
      }
    ]);
  };

  const handleToggleDelete = (index: number) => {
    const updated = [...editableAthletes];
    updated[index] = {
      ...updated[index],
      isDeleted: !updated[index].isDeleted
    };
    setEditableAthletes(updated);
  };

  const handleFieldChange = (index: number, field: keyof EditableAthlete, value: any) => {
    const updated = [...editableAthletes];
    updated[index] = {
      ...updated[index],
      [field]: value
    };
    setEditableAthletes(updated);
  };

  const handleSave = () => {
    const activeAthletes = editableAthletes.filter(a => !a.isDeleted);
    for (const a of activeAthletes) {
      if (!a.name.trim()) {
        setErrorMessage("すべての選手の「名前」を入力してください。");
        return;
      }
      if (!a.email.trim() || !a.email.includes("@")) {
        setErrorMessage("有効な「メールアドレス」を入力してください。");
        return;
      }
    }

    setErrorMessage(null);
    batchSaveMutation.mutate({
      teamId,
      athletes: editableAthletes.map(a => ({
        id: a.id,
        name: a.name.trim(),
        email: a.email.trim(),
        jerseyNumber: a.jerseyNumber,
        position: a.position ? a.position.trim() : null,
        birthday: a.birthday ? a.birthday.trim() : null,
        height: a.height,
        csvNames: a.csvNames ? a.csvNames.trim() : null,
        onetapName: a.onetapName ? a.onetapName.trim() : null,
        catapultName: a.catapultName ? a.catapultName.trim() : null,
        soxaiEmail: a.soxaiEmail ? a.soxaiEmail.trim() : null,
        isDeleted: a.isDeleted,
      }))
    });
  };

  const getLatestMetrics = (athleteId: number) => {
    if (!allPerfData) return null;
    const athleteData = allPerfData
      .filter(p => p.athleteId === athleteId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return athleteData.length > 0 ? athleteData[0] : null;
  };

  if (teamLoading || athletesLoading) {
    return (
      <ScreenContainer className="flex items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#FF6B35" />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="bg-background">
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"} 
        style={{ flex: 1 }}
      >
        <View className="flex-row items-center justify-between px-6 py-4 border-b border-border bg-surface">
          <View>
            <Text className="text-xl font-bold text-foreground">
              {team?.name || "チーム管理"}
            </Text>
            <Text className="text-xs text-muted">コーチ: {user?.name}</Text>
          </View>
          {isEditMode ? (
            <View className="flex-row items-center gap-2">
              <TouchableOpacity 
                onPress={() => setIsEditMode(false)}
                className="border border-border px-4 py-2 rounded-full active:bg-muted/10"
              >
                <Text className="text-foreground font-semibold text-sm">キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={handleSave}
                disabled={batchSaveMutation.isPending}
                className="bg-primary px-4 py-2 rounded-full shadow-sm active:opacity-85 disabled:opacity-50"
              >
                {batchSaveMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text className="text-white font-bold text-sm">保存する</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity 
              onPress={startEditMode}
              className="flex-row items-center gap-1.5 bg-primary px-4 py-2.5 rounded-full shadow-sm active:opacity-80"
            >
              <IconSymbol size={16} name="pencil" color="#FFFFFF" />
              <Text className="text-white font-bold text-sm">一括編集</Text>
            </TouchableOpacity>
          )}
        </View>

        {errorMessage && (
          <View className="mx-6 mt-4 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
            <Text className="text-red-500 text-sm font-semibold">{errorMessage}</Text>
          </View>
        )}

        {isEditMode ? (
          <ScrollView contentContainerStyle={{ padding: 24 }} showsVerticalScrollIndicator={true}>
            <View className="gap-6">
              <View className="flex-row justify-between items-center">
                <Text className="text-lg font-bold text-foreground">スプレッドシート型一括編集</Text>
                <TouchableOpacity 
                  onPress={handleAddRow}
                  className="flex-row items-center gap-1.5 bg-secondary px-4 py-2 rounded-full shadow-sm active:opacity-80"
                >
                  <IconSymbol size={14} name="plus" color="#FFFFFF" />
                  <Text className="text-white font-bold text-xs">行を追加</Text>
                </TouchableOpacity>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={true} className="border border-border rounded-2xl bg-surface">
                <View>
                  {/* Table Header */}
                  <View className="flex-row border-b border-border bg-muted/20 py-3">
                    <View style={{ width: 50 }} className="justify-center items-center">
                      <Text className="font-bold text-xs text-muted">削除</Text>
                    </View>
                    <View style={{ width: 80 }} className="justify-center px-2">
                      <Text className="font-bold text-xs text-muted">背番号</Text>
                    </View>
                    <View style={{ width: 150 }} className="justify-center px-2">
                      <Text className="font-bold text-xs text-muted">名前 *</Text>
                    </View>
                    <View style={{ width: 220 }} className="justify-center px-2">
                      <Text className="font-bold text-xs text-muted">メール *</Text>
                    </View>
                    <View style={{ width: 140 }} className="justify-center px-2">
                      <Text className="font-bold text-xs text-muted">Onetap登録名</Text>
                    </View>
                    <View style={{ width: 140 }} className="justify-center px-2">
                      <Text className="font-bold text-xs text-muted">Catapult登録名</Text>
                    </View>
                    <View style={{ width: 180 }} className="justify-center px-2">
                      <Text className="font-bold text-xs text-muted">SOXAIメール</Text>
                    </View>
                    <View style={{ width: 180 }} className="justify-center px-2">
                      <Text className="font-bold text-xs text-muted">CSV用別名 (カンマ区切り)</Text>
                    </View>
                    <View style={{ width: 150 }} className="justify-center px-2">
                      <Text className="font-bold text-xs text-muted">ポジション</Text>
                    </View>
                    <View style={{ width: 140 }} className="justify-center px-2">
                      <Text className="font-bold text-xs text-muted">誕生日</Text>
                    </View>
                    <View style={{ width: 100 }} className="justify-center px-2">
                      <Text className="font-bold text-xs text-muted">身長(cm)</Text>
                    </View>
                  </View>

                  {/* Table Rows */}
                  {editableAthletes.length > 0 ? (
                    editableAthletes.map((athlete, index) => (
                      <View 
                        key={index} 
                        className={`flex-row border-b border-border py-2 items-center ${athlete.isDeleted ? "bg-red-500/5 opacity-50" : ""}`}
                      >
                        {/* 削除トグル */}
                        <View style={{ width: 50 }} className="justify-center items-center">
                          <TouchableOpacity onPress={() => handleToggleDelete(index)} className="p-1">
                            <IconSymbol 
                              size={18} 
                              name={athlete.isDeleted ? "arrow.uturn.backward" : "trash"} 
                              color={athlete.isDeleted ? "#10B981" : "#EF4444"} 
                            />
                          </TouchableOpacity>
                        </View>

                        {/* 背番号 */}
                        <View style={{ width: 80 }} className="px-1">
                          <TextInput
                            value={athlete.jerseyNumber !== null ? String(athlete.jerseyNumber) : ""}
                            onChangeText={(val) => handleFieldChange(index, "jerseyNumber", val ? Number(val) : null)}
                            placeholder="12"
                            placeholderTextColor="#9CA3AF"
                            keyboardType="number-pad"
                            editable={!athlete.isDeleted}
                            className="bg-muted/10 border border-border/50 px-2 py-1.5 rounded-lg text-foreground text-sm text-center"
                          />
                        </View>

                        {/* 名前 */}
                        <View style={{ width: 150 }} className="px-1">
                          <TextInput
                            value={athlete.name}
                            onChangeText={(val) => handleFieldChange(index, "name", val)}
                            placeholder="和田 舞子"
                            placeholderTextColor="#9CA3AF"
                            editable={!athlete.isDeleted}
                            className="bg-muted/10 border border-border/50 px-2 py-1.5 rounded-lg text-foreground text-sm"
                          />
                        </View>

                        {/* メールアドレス */}
                        <View style={{ width: 220 }} className="px-1">
                          <TextInput
                            value={athlete.email}
                            onChangeText={(val) => handleFieldChange(index, "email", val)}
                            placeholder="maiko@example.com"
                            placeholderTextColor="#9CA3AF"
                            keyboardType="email-address"
                            autoCapitalize="none"
                            editable={!athlete.isDeleted}
                            className="bg-muted/10 border border-border/50 px-2 py-1.5 rounded-lg text-foreground text-sm"
                          />
                        </View>

                        {/* Onetap登録名 */}
                        <View style={{ width: 140 }} className="px-1">
                          <TextInput
                            value={athlete.onetapName || ""}
                            onChangeText={(val) => handleFieldChange(index, "onetapName", val)}
                            placeholder="宮下 さくら"
                            placeholderTextColor="#9CA3AF"
                            editable={!athlete.isDeleted}
                            className="bg-muted/10 border border-border/50 px-2 py-1.5 rounded-lg text-foreground text-sm"
                          />
                        </View>

                        {/* Catapult登録名 */}
                        <View style={{ width: 140 }} className="px-1">
                          <TextInput
                            value={athlete.catapultName || ""}
                            onChangeText={(val) => handleFieldChange(index, "catapultName", val)}
                            placeholder="Sakura Miyashita"
                            placeholderTextColor="#9CA3AF"
                            editable={!athlete.isDeleted}
                            className="bg-muted/10 border border-border/50 px-2 py-1.5 rounded-lg text-foreground text-sm"
                          />
                        </View>

                        {/* SOXAIメール */}
                        <View style={{ width: 180 }} className="px-1">
                          <TextInput
                            value={athlete.soxaiEmail || ""}
                            onChangeText={(val) => handleFieldChange(index, "soxaiEmail", val)}
                            placeholder="sakura@example.com"
                            placeholderTextColor="#9CA3AF"
                            keyboardType="email-address"
                            autoCapitalize="none"
                            editable={!athlete.isDeleted}
                            className="bg-muted/10 border border-border/50 px-2 py-1.5 rounded-lg text-foreground text-sm"
                          />
                        </View>

                        {/* CSV用別名 */}
                        <View style={{ width: 180 }} className="px-1">
                          <TextInput
                            value={athlete.csvNames || ""}
                            onChangeText={(val) => handleFieldChange(index, "csvNames", val)}
                            placeholder="Miyashita S., Sakura M."
                            placeholderTextColor="#9CA3AF"
                            editable={!athlete.isDeleted}
                            className="bg-muted/10 border border-border/50 px-2 py-1.5 rounded-lg text-foreground text-sm"
                          />
                        </View>

                        {/* ポジション */}
                        <View style={{ width: 150 }} className="px-1">
                          <TextInput
                            value={athlete.position || ""}
                            onChangeText={(val) => handleFieldChange(index, "position", val)}
                            placeholder="ミドルブロッカー"
                            placeholderTextColor="#9CA3AF"
                            editable={!athlete.isDeleted}
                            className="bg-muted/10 border border-border/50 px-2 py-1.5 rounded-lg text-foreground text-sm"
                          />
                        </View>

                        {/* 誕生日 */}
                        <View style={{ width: 140 }} className="px-1">
                          <TextInput
                            value={athlete.birthday || ""}
                            onChangeText={(val) => handleFieldChange(index, "birthday", val)}
                            placeholder="2008-05-12"
                            placeholderTextColor="#9CA3AF"
                            editable={!athlete.isDeleted}
                            className="bg-muted/10 border border-border/50 px-2 py-1.5 rounded-lg text-foreground text-sm text-center"
                          />
                        </View>

                        {/* 身長 */}
                        <View style={{ width: 100 }} className="px-1">
                          <TextInput
                            value={athlete.height !== null ? String(athlete.height) : ""}
                            onChangeText={(val) => handleFieldChange(index, "height", val ? Number(val) : null)}
                            placeholder="178.5"
                            placeholderTextColor="#9CA3AF"
                            keyboardType="numeric"
                            editable={!athlete.isDeleted}
                            className="bg-muted/10 border border-border/50 px-2 py-1.5 rounded-lg text-foreground text-sm text-center"
                          />
                        </View>
                      </View>
                    ))
                  ) : (
                    <View style={{ width: 1550 }} className="py-8 items-center justify-center">
                      <Text className="text-sm text-muted">「行を追加」ボタンを押して、選手を登録してください。</Text>
                    </View>
                  )}
                </View>
              </ScrollView>
              <Text className="text-xs text-muted mt-2">
                ※ メールアドレスは各選手のアカウント識別キーとなります。重複しない有効なアドレスを指定してください。
              </Text>
            </View>
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 24 }} showsVerticalScrollIndicator={false}>
            <View className="gap-6">
              <View className="flex-row justify-between items-center">
                <Text className="text-lg font-bold text-foreground">選手一覧 ({athletes?.length || 0}名)</Text>
                <TouchableOpacity onPress={() => refetch()} className="p-2 rounded-full bg-muted/10">
                  <IconSymbol size={18} name="arrow.clockwise" color="#6B7280" />
                </TouchableOpacity>
              </View>

              {athletes && athletes.length > 0 ? (
                <View className="gap-4">
                  {athletes.map((athlete) => {
                    const latest = getLatestMetrics(athlete.id);
                    return (
                      <TouchableOpacity
                        key={athlete.id}
                        onPress={() => router.push(`/athlete/${athlete.id}/analytics`)}
                        className="bg-surface rounded-2xl p-5 border border-border flex-row justify-between items-center shadow-sm hover:border-primary/50"
                      >
                        <View className="flex-1 gap-2">
                          <View className="flex-row items-center gap-2">
                            {athlete.jerseyNumber !== null && (
                              <View className="bg-primary/10 px-2 py-0.5 rounded-md">
                                <Text className="text-xs font-bold text-primary">#{athlete.jerseyNumber}</Text>
                              </View>
                            )}
                            <Text className="text-lg font-bold text-foreground">
                              {athlete.user?.name || "名前未設定"}
                            </Text>
                          </View>
                          
                          <View className="flex-row items-center gap-4">
                            {athlete.position && (
                              <Text className="text-sm text-muted bg-muted/40 px-2.5 py-0.5 rounded-full">
                                {athlete.position}
                              </Text>
                            )}
                            {athlete.birthday && (
                              <Text className="text-xs text-muted">
                                誕生日: {athlete.birthday}
                              </Text>
                            )}
                            {athlete.height && (
                              <Text className="text-xs text-muted">
                                身長: {Number(athlete.height).toFixed(1)} cm
                              </Text>
                            )}
                            {athlete.csvNames && (
                              <Text className="text-xs text-muted italic">
                                CSV別名: {athlete.csvNames}
                              </Text>
                            )}
                          </View>

                          {(athlete.onetapName || athlete.catapultName || athlete.soxaiEmail) ? (
                            <View className="flex-row flex-wrap gap-x-3 gap-y-1 bg-muted/20 px-3 py-1.5 rounded-xl border border-border/40 self-start">
                              {athlete.onetapName && (
                                <Text className="text-[10px] text-muted">
                                  Onetap: <Text className="font-bold text-foreground">{athlete.onetapName}</Text>
                                </Text>
                              )}
                              {athlete.catapultName && (
                                <Text className="text-[10px] text-muted">
                                  Catapult: <Text className="font-bold text-foreground">{athlete.catapultName}</Text>
                                </Text>
                              )}
                              {athlete.soxaiEmail && (
                                <Text className="text-[10px] text-muted">
                                  SOXAI: <Text className="font-bold text-foreground">{athlete.soxaiEmail}</Text>
                                </Text>
                              )}
                            </View>
                          ) : null}

                          <View className="flex-row items-center gap-4">
                            <Text className="text-xs text-muted">
                              {latest ? `最終測定: ${new Date(latest.date).toLocaleDateString("ja-JP")}` : "測定データなし"}
                            </Text>
                          </View>

                          {latest && (
                            <View className="flex-row gap-4 mt-2">
                              <View>
                                <Text className="text-[10px] text-muted">最大ジャンプ</Text>
                                <Text className="text-sm font-semibold text-primary">
                                  {latest.maxJumpHeight ? `${Number(latest.maxJumpHeight).toFixed(1)} cm` : "--"}
                                </Text>
                              </View>
                              <View>
                                <Text className="text-[10px] text-muted">総運動量</Text>
                                <Text className="text-sm font-semibold text-secondary">
                                  {latest.totalLoad ? Math.round(Number(latest.totalLoad)) : "--"}
                                </Text>
                              </View>
                              <View>
                                <Text className="text-[10px] text-muted">総距離</Text>
                                <Text className="text-sm font-semibold text-foreground">
                                  {latest.totalDistance ? `${(Number(latest.totalDistance) / 1000).toFixed(2)} km` : "--"}
                                </Text>
                              </View>
                            </View>
                          )}
                        </View>

                        <IconSymbol size={20} name="chevron.right" color="#D1D5DB" />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <View className="bg-surface rounded-2xl p-8 border border-border items-center justify-center">
                  <Text className="text-base text-muted text-center">選手がまだ登録されていません。</Text>
                  <Text className="text-sm text-muted text-center mt-2">右上から選手を一括編集して追加してください。</Text>
                </View>
              )}

              {/* Setup Democodes Guide */}
              <View className="bg-primary/5 rounded-2xl p-5 border border-primary/20 gap-3 mt-4">
                <View className="flex-row items-center gap-2">
                  <IconSymbol size={18} name="info.circle.fill" color="#FF6B35" />
                  <Text className="font-bold text-primary">デモ検証用のアカウント情報</Text>
                </View>
                <Text className="text-xs text-foreground/80 leading-relaxed">
                  選手用アカウントでログインして自分の運動量を確認するには、以下のメールアドレスを使用してください。
                </Text>
                <View className="gap-1 bg-surface p-3 rounded-lg border border-border">
                  <Text className="text-xs text-muted">・宮下 さくら: sakura@example.com (パスワード不要/OAuth自動ログイン)</Text>
                  <Text className="text-xs text-muted">・日向 ひなた: hinata@example.com</Text>
                  <Text className="text-xs text-muted">・長谷川 みお: mio@example.com</Text>
                </View>
              </View>
            </View>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
