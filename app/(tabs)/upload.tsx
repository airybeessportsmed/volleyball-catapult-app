import React, { useState, useMemo } from "react";
import { ScrollView, Text, View, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";

const SAMPLE_CSV = `Category,Tag,start_time,DF Event,Intensity,Duration,Height (m),Basketball Load
宮下 さくら,Basketball Jump,1783339201000,Basketball Jumping,1.04 Left,1.16,0.35,1.04
宮下 さくら,IMA Jump,1783339202000,IMA Jump,,0.35,0.58,
宮下 さくら,IMA Accelerate,1783339203000,IMA Accelerate,4.20 Left,0.22,,
日向 ひなた,Basketball Jump,1783339201000,Basketball Jumping,2.00 Left,1.2,0.715,1.5
和田 舞子,IMA Accelerate,1783339200000,IMA Accelerate,1.77 Left,0.4,,`;

interface UploadFileItem {
  id: string;
  name: string;
  size?: number;
  text: string;
  status: "pending" | "uploading" | "success" | "error";
  detectedFormat: string;
  errorMessage?: string;
}

const detectFormatOnFrontend = (csvText: string, fileName: string): string => {
  const lowercaseText = csvText.toLowerCase();
  const lowercaseName = fileName.toLowerCase();
  if (lowercaseText.includes("睡眠スコア") && lowercaseText.includes("安静時心拍変動")) return "SOXAI (睡眠・自律神経)";
  if (lowercaseText.includes("項目名") && lowercaseText.includes("値") && lowercaseText.includes("内訳")) return "Wellness (Onetap)";
  if (lowercaseText.includes("トレーニング実施日") && lowercaseText.includes("session rpe")) return "sRPE (主観負荷)";
  if (lowercaseText.includes("of event") && lowercaseText.includes("jump attribute")) return "Catapult IMA (ジャンプ分析)";
  if (lowercaseText.includes("player load") && lowercaseText.includes("total jump count")) return "Catapult PL (外的負荷)";
  if (lowercaseText.includes("total player load") && lowercaseName.includes("menu")) return "Catapult Menu別PL";
  if (lowercaseText.includes("total player load")) return "Catapult PL (外的負荷)";
  return "CSV (自動判定)";
};

export default function CoachUploadScreen() {
  const { user, isAuthenticated } = useAuth();
  const router = useRouter();
  const [filesToUpload, setFilesToUpload] = useState<UploadFileItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  
  const teamId = user?.teamId || 1;

  // Calendar states
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);

  // Query to fetch CSV uploads history
  const { data: uploads, isLoading: uploadsLoading, refetch: refetchUploads } = trpc.csvUpload.getByTeam.useQuery(
    { teamId, limit: 10 },
    { enabled: isAuthenticated && !!user?.teamId }
  );

  // Query to fetch import status by month
  const { data: importStatus, refetch: refetchStatus } = trpc.performance.getImportStatusByMonth.useQuery(
    { teamId, year: currentYear, month: currentMonth },
    { enabled: isAuthenticated && !!user?.teamId }
  );

  const importMutation = trpc.performance.importCsv.useMutation();

  const addFiles = (newFiles: { name: string; size?: number; text: string }[]) => {
    const items: UploadFileItem[] = newFiles.map(f => ({
      id: `${f.name}_${Date.now()}_${Math.random()}`,
      name: f.name,
      size: f.size,
      text: f.text,
      status: "pending",
      detectedFormat: detectFormatOnFrontend(f.text, f.name),
    }));
    setFilesToUpload(prev => [...prev, ...items]);
  };

  const handleImport = async () => {
    if (filesToUpload.length === 0) {
      setErrorMsg("インポートするファイルがありません。");
      return;
    }
    setErrorMsg("");
    
    // Set all pending/error files to uploading state
    setFilesToUpload(prev => prev.map(f => f.status === "pending" || f.status === "error" ? { ...f, status: "uploading" } : f));

    let successCount = 0;
    let failCount = 0;

    for (const file of filesToUpload) {
      if (file.status !== "pending" && file.status !== "error" && file.status !== "uploading") continue;

      try {
        await importMutation.mutateAsync({
          teamId,
          csvText: file.text,
          fileName: file.name,
        });
        
        setFilesToUpload(prev => prev.map(f => f.id === file.id ? { ...f, status: "success" } : f));
        successCount++;
      } catch (err: any) {
        setFilesToUpload(prev => prev.map(f => f.id === file.id ? { ...f, status: "error", errorMessage: err.message || "アップロード失敗" } : f));
        failCount++;
      }
    }

    refetchUploads();
    refetchStatus();

    if (failCount > 0) {
      setErrorMsg(`${failCount}件のファイルでエラーが発生しました。`);
    } else {
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        setFilesToUpload([]);
      }, 3000);
    }
  };

  const handleSelectFile = async () => {
    try {
      setErrorMsg("");
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/comma-separated-values", "application/vnd.ms-excel"],
        copyToCacheDirectory: true,
        multiple: true,
      });

      if (result.canceled) {
        return;
      }

      const newFiles = [];
      for (const asset of result.assets) {
        const response = await fetch(asset.uri);
        const text = await response.text();
        newFiles.push({
          name: asset.name,
          size: asset.size,
          text,
        });
      }
      addFiles(newFiles);
    } catch (err: any) {
      setErrorMsg("ファイルの読み込み中にエラーが発生しました。");
      console.error(err);
    }
  };

  const handleDragOver = (e: any) => {
    if (Platform.OS !== "web") return;
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    if (Platform.OS !== "web") return;
    setIsDragging(false);
  };

  const handleDrop = async (e: any) => {
    if (Platform.OS !== "web") return;
    e.preventDefault();
    setIsDragging(false);
    setErrorMsg("");

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const newFiles = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.name.endsWith(".csv")) continue;

        const text = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (evt) => resolve(evt.target?.result as string);
          reader.readAsText(file);
        });

        newFiles.push({
          name: file.name,
          size: file.size,
          text,
        });
      }

      if (newFiles.length > 0) {
        addFiles(newFiles);
      } else {
        setErrorMsg("CSVファイル（.csv）をドロップしてください。");
      }
    }
  };

  const loadSample = () => {
    // Dynamically replace original sample timestamps with today's timestamps
    // to ensure the imported data displays in today's active dashboard summary.
    const todayMs = Date.now();
    let csvText = SAMPLE_CSV;
    
    csvText = csvText.replace(/1783339201000/g, String(todayMs - 10000));
    csvText = csvText.replace(/1783339202000/g, String(todayMs - 5000));
    csvText = csvText.replace(/1783339203000/g, String(todayMs));
    csvText = csvText.replace(/1783339200000/g, String(todayMs - 20000));

    addFiles([{
      name: "sample_catapult_data.csv",
      size: csvText.length,
      text: csvText,
    }]);
    setErrorMsg("");
  };

  const handleRemoveFile = (id: string) => {
    setFilesToUpload(prev => prev.filter(f => f.id !== id));
  };

  const handleClearAll = () => {
    setFilesToUpload([]);
    setErrorMsg("");
  };

  const calendarDays = useMemo(() => {
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const firstDayIndex = new Date(currentYear, currentMonth - 1, 1).getDay();
    
    const days = [];
    
    // Empty prefix cells
    for (let i = 0; i < firstDayIndex; i++) {
      days.push({ day: null, dateString: null });
    }
    
    // Month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateString = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({ day: d, dateString });
    }
    
    return days;
  }, [currentYear, currentMonth]);

  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const isUploading = useMemo(() => filesToUpload.some(f => f.status === "uploading"), [filesToUpload]);

  return (
    <ScreenContainer className="bg-background">
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"} 
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View className="px-6 py-4 border-b border-border bg-surface">
          <Text className="text-xl font-bold text-foreground font-sans">データインポート</Text>
          <Text className="text-xs text-muted">7種類のCSVをまとめてドロップするだけで自動判別＆マージ取り込み</Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: 24 }} showsVerticalScrollIndicator={false}>
          <View className="gap-6">
            {/* Calendar Read Status Check */}
            <View className="bg-surface rounded-3xl border border-border p-5 shadow-sm gap-4">
              <View className="flex-row justify-between items-center pb-2 border-b border-border">
                <View className="flex-1 pr-2">
                  <Text className="text-base font-bold text-foreground">練習データ読込状況</Text>
                  <Text className="text-[10px] text-muted font-sans">練習ごとにIMAデータとPlayer Loadデータが揃っているか確認</Text>
                </View>
                <View className="flex-row items-center gap-3">
                  <TouchableOpacity onPress={handlePrevMonth} className="p-1 bg-muted/20 rounded-full active:bg-muted/40">
                    <IconSymbol size={16} name="chevron.left" color="#4B5563" />
                  </TouchableOpacity>
                  <Text className="text-sm font-bold text-foreground font-mono">{currentYear}年{currentMonth}月</Text>
                  <TouchableOpacity onPress={handleNextMonth} className="p-1 bg-muted/20 rounded-full active:bg-muted/40">
                    <IconSymbol size={16} name="chevron.right" color="#4B5563" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Legend */}
              <View className="flex-row flex-wrap gap-x-4 gap-y-1.5 bg-muted/20 p-2.5 rounded-xl">
                <View className="flex-row items-center gap-1.5">
                  <View className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <Text className="text-[10px] text-muted font-semibold">🟢 読込完了 (IMA + PL)</Text>
                </View>
                <View className="flex-row items-center gap-1.5">
                  <View className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <Text className="text-[10px] text-muted font-semibold">🟡 未完了 (片方のみ)</Text>
                </View>
                <View className="flex-row items-center gap-1.5">
                  <Text className="text-[10px] text-muted font-sans">※ IMA: 加速度・ジャンプ | PL: 運動量</Text>
                </View>
              </View>

              {/* Calendar Grid */}
              <View>
                {/* Week Headers */}
                <View className="flex-row mb-2">
                  {["日", "月", "火", "水", "木", "金", "土"].map((w, idx) => (
                    <View key={idx} className="flex-1 items-center">
                      <Text className={`text-[10px] font-bold ${idx === 0 ? "text-red-500" : idx === 6 ? "text-blue-500" : "text-muted"}`}>{w}</Text>
                    </View>
                  ))}
                </View>

                {/* Days */}
                <View className="flex-row flex-wrap">
                  {calendarDays.map((item, idx) => {
                    if (!item.day) {
                      return (
                        <View key={`empty-${idx}`} className="w-[14.28%] aspect-square p-0.5">
                          <View className="flex-1 bg-transparent border border-transparent" />
                        </View>
                      );
                    }

                    const status = importStatus?.find(s => s.date === item.dateString);
                    const hasIma = status?.hasIma || false;
                    const hasPlayerLoad = status?.hasPlayerLoad || false;
                    const isComplete = hasIma && hasPlayerLoad;
                    const isPartial = (hasIma && !hasPlayerLoad) || (!hasIma && hasPlayerLoad);

                    // Cell Styles
                    let cellBg = "bg-transparent";
                    let borderColor = "border-transparent";
                    if (isComplete) {
                      cellBg = "bg-emerald-500/5";
                      borderColor = "border-emerald-500/30";
                    } else if (isPartial) {
                      cellBg = "bg-amber-500/5";
                      borderColor = "border-amber-500/30";
                    }

                    return (
                      <View 
                        key={item.dateString} 
                        className="w-[14.28%] aspect-square p-0.5"
                      >
                        <View className={`flex-1 justify-between items-center p-1 rounded-xl border ${cellBg} ${borderColor} bg-muted/5`}>
                          <Text className="text-xs font-bold text-foreground font-mono">{item.day}</Text>
                          
                          {/* Indicators */}
                          <View className="flex-row gap-0.5 justify-center items-center h-4">
                            {isComplete ? (
                              <IconSymbol size={12} name="checkmark.circle.fill" color="#10B981" />
                            ) : (
                              <>
                                {hasIma && (
                                  <View className="px-1 py-0.5 bg-blue-500/10 rounded-md">
                                    <Text className="text-[7px] font-extrabold text-blue-600 font-sans">IMA</Text>
                                  </View>
                                )}
                                {hasPlayerLoad && (
                                  <View className="px-1 py-0.5 bg-emerald-500/10 rounded-md">
                                    <Text className="text-[7px] font-extrabold text-emerald-600 font-sans">PL</Text>
                                  </View>
                                )}
                                {!hasIma && !hasPlayerLoad && (
                                  <View className="w-1.5 h-1.5 rounded-full bg-muted/40" />
                                )}
                              </>
                            )}
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>

            {user?.role === "viewer" ? (
              <View className="bg-surface rounded-3xl border border-border p-8 shadow-sm justify-center items-center gap-4">
                <View className="w-16 h-16 bg-muted rounded-2xl items-center justify-center">
                  <IconSymbol size={28} name="lock.fill" color="#64748B" />
                </View>
                <View className="items-center gap-1">
                  <Text className="text-base font-bold text-foreground text-center">閲覧専用アカウント</Text>
                  <Text className="text-xs text-muted text-center font-sans">
                    データのアップロードやインポート機能は管理者のみ利用可能です。
                  </Text>
                </View>
              </View>
            ) : (
              <>
                <View className="gap-2">
                  <Text className="text-base font-bold text-foreground">CSVファイルをインポート</Text>
                  <Text className="text-xs text-muted font-normal font-sans">
                    Onetap Wellness / sRPE / Catapult / SOXAI などのCSVを同時にインポート可能です。
                  </Text>
                </View>

                {/* File Drop / Selection Area */}
                <View 
                  // @ts-ignore
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`bg-surface rounded-3xl border-2 border-dashed p-8 shadow-sm justify-center items-center gap-4 transition-all duration-300 ${
                    isDragging ? "border-primary bg-primary/5 scale-[1.02]" : "border-border hover:border-primary/50"
                  }`}
                >
                  <View className="w-14 h-14 bg-primary/10 rounded-2xl items-center justify-center shadow-inner">
                    <IconSymbol size={28} name="square.and.arrow.up.fill" color="#FF6B35" />
                  </View>
                  
                  <View className="items-center gap-1 px-4">
                    <Text className="text-sm font-bold text-foreground text-center">
                      CSVファイルをここにドラッグ＆ドロップ（複数可）
                    </Text>
                    <Text className="text-xs text-muted text-center font-sans">
                      またはファイルブラウザから選択してください
                    </Text>
                  </View>

                  <View className="flex-row gap-3 mt-2">
                    <TouchableOpacity 
                      onPress={handleSelectFile}
                      className="bg-primary px-6 py-2.5 rounded-xl active:bg-primary-dark shadow-md flex-row items-center gap-1.5"
                    >
                      <IconSymbol size={16} name="doc.fill" color="#FFFFFF" />
                      <Text className="text-white font-bold text-xs">ファイルを選択</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      onPress={loadSample}
                      className="bg-muted/30 border border-border px-4 py-2.5 rounded-xl active:bg-muted/50 flex-row items-center gap-1.5"
                    >
                      <IconSymbol size={16} name="doc.on.doc" color="#4B5563" />
                      <Text className="text-foreground font-semibold text-xs">サンプルを読込</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Files Queue List */}
                {filesToUpload.length > 0 && (
                  <View className="gap-3">
                    <View className="flex-row justify-between items-center">
                      <Text className="text-sm font-bold text-foreground">
                        アップロード対象 ({filesToUpload.length}件)
                      </Text>
                      <TouchableOpacity onPress={handleClearAll} className="active:opacity-75">
                        <Text className="text-xs text-red-500 font-bold">すべてクリア</Text>
                      </TouchableOpacity>
                    </View>

                    <View className="gap-2.5">
                      {filesToUpload.map((file) => (
                        <View 
                          key={file.id} 
                          className="bg-surface rounded-2xl border border-border p-3 flex-row items-center justify-between shadow-sm"
                        >
                          <View className="flex-row items-center gap-3 flex-1 pr-4">
                            <View className={`w-10 h-10 rounded-xl items-center justify-center ${
                              file.status === "success" ? "bg-emerald-500/10" : "bg-muted/20"
                            }`}>
                              <IconSymbol 
                                size={18} 
                                name={file.status === "success" ? "checkmark.circle.fill" : "doc.text.fill"} 
                                color={file.status === "success" ? "#10B981" : "#FF6B35"} 
                              />
                            </View>
                            <View className="flex-1 gap-0.5">
                              <Text className="text-xs font-bold text-foreground" numberOfLines={1}>
                                {file.name}
                              </Text>
                              <View className="flex-row items-center gap-2">
                                <Text className="text-[10px] text-muted font-mono font-medium">
                                  {file.size ? `${(file.size / 1024).toFixed(1)} KB` : ""}
                                </Text>
                                <View className="bg-primary/10 px-2 py-0.5 rounded-full">
                                  <Text className="text-[8px] font-extrabold text-primary font-sans">{file.detectedFormat}</Text>
                                </View>
                              </View>
                              {file.errorMessage && (
                                <Text className="text-[10px] text-red-500" numberOfLines={1}>
                                  エラー: {file.errorMessage}
                                </Text>
                              )}
                            </View>
                          </View>

                          <View className="flex-row items-center gap-2">
                            {file.status === "uploading" && (
                              <ActivityIndicator size="small" color="#FF6B35" />
                            )}
                            {file.status === "success" && (
                              <Text className="text-[10px] text-emerald-600 font-bold">成功</Text>
                            )}
                            {file.status === "error" && (
                              <Text className="text-[10px] text-red-500 font-bold">失敗</Text>
                            )}
                            {file.status === "pending" && (
                              <Text className="text-[10px] text-muted font-semibold">待機中</Text>
                            )}
                            
                            <TouchableOpacity 
                              disabled={file.status === "uploading"}
                              onPress={() => handleRemoveFile(file.id)}
                              className="w-8 h-8 rounded-full bg-muted/10 items-center justify-center active:bg-red-500/10"
                            >
                              <IconSymbol size={14} name="xmark" color="#6B7280" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Messages */}
                {errorMsg ? (
                  <View className="bg-destructive/10 border border-destructive/20 p-4 rounded-xl flex-row items-center gap-3">
                    <IconSymbol size={20} name="exclamationmark.triangle.fill" color="#EF4444" />
                    <Text className="text-destructive text-sm flex-1 font-semibold font-sans">{errorMsg}</Text>
                  </View>
                ) : null}

                {isSuccess ? (
                  <View className="bg-success/15 border border-success/35 p-4 rounded-xl flex-row items-center gap-3">
                    <IconSymbol size={20} name="checkmark.circle.fill" color="#22C55E" />
                    <Text className="text-success text-sm flex-1 font-semibold font-sans">
                      すべてのデータを正常にインポートしました！
                    </Text>
                  </View>
                ) : null}

                {/* Submit Button */}
                <TouchableOpacity
                  onPress={handleImport}
                  disabled={importMutation.isPending || isSuccess}
                  className={`w-full py-4 rounded-2xl flex-row justify-center items-center gap-2 ${
                    importMutation.isPending || isSuccess ? "bg-muted" : "bg-primary shadow-lg"
                  }`}
                >
                  {importMutation.isPending ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <IconSymbol size={18} name="arrow.up.doc.fill" color="#FFFFFF" />
                  )}
                  <Text className="text-white font-bold text-base">データをインポートする</Text>
                </TouchableOpacity>
              </>
            )}

            {/* Info Card */}
            <View className="bg-surface rounded-2xl border border-border p-5 gap-3">
              <Text className="font-bold text-foreground text-sm">対応するCSV形式:</Text>
              <View className="gap-2">
                <View>
                  <Text className="text-xs font-bold text-primary">1. イベントログ形式 (ジャンプ・加速度データなど)</Text>
                  <Text className="text-[11px] text-muted pl-3 leading-relaxed">
                    ・判定: ヘッダーに `Tag`, `DF Event`, `Intensity (強度)` のいずれかを含む場合{"\n"}
                    ・主要カラム: Category (選手名), start_time (時間), Height (ジャンプ高)
                  </Text>
                </View>
                <View>
                  <Text className="text-xs font-bold text-secondary">2. メメニュー別運動量形式 (Player Loadデータ)</Text>
                  <Text className="text-[11px] text-muted pl-3 leading-relaxed">
                    ・判定: ヘッダーに `Player Load (運動量)` を含み、かつイベントログ項目を含まない場合{"\n"}
                    ・主要カラム: Period (選手名), Date (日付), Player Load
                  </Text>
                </View>
              </View>
            </View>

            {/* Import History Section */}
            <View className="gap-4 mt-4">
              <View className="flex-row justify-between items-center">
                <Text className="text-lg font-bold text-foreground">インポート履歴</Text>
                <TouchableOpacity onPress={() => refetchUploads()} className="p-2 rounded-full bg-muted/10">
                  <IconSymbol size={16} name="arrow.clockwise" color="#6B7280" />
                </TouchableOpacity>
              </View>

              {uploadsLoading ? (
                <ActivityIndicator size="small" color="#FF6B35" />
              ) : uploads && uploads.length > 0 ? (
                <View className="gap-3">
                  {uploads.map((upload) => (
                    <View 
                      key={upload.id} 
                      className="bg-surface rounded-2xl p-4 border border-border flex-row items-center justify-between shadow-sm"
                    >
                      <View className="flex-1 gap-1">
                        <Text className="text-sm font-bold text-foreground" numberOfLines={1}>
                          {upload.fileName}
                        </Text>
                        <Text className="text-[10px] text-muted">
                          インポート日時: {new Date(upload.createdAt).toLocaleString("ja-JP")}
                        </Text>
                        {upload.errorMessage && (
                          <Text className="text-xs text-red-500 mt-1" numberOfLines={1}>
                            エラー: {upload.errorMessage}
                          </Text>
                        )}
                      </View>
                      
                      <View className="items-end gap-1.5">
                        <View className={`px-2.5 py-0.5 rounded-full ${
                          upload.status === "completed" 
                            ? "bg-green-500/10" 
                            : upload.status === "failed" 
                            ? "bg-red-500/10" 
                            : "bg-yellow-500/10"
                        }`}>
                          <Text className={`text-[10px] font-bold ${
                            upload.status === "completed" 
                              ? "bg-green-500/10 text-green-600" 
                              : upload.status === "failed" 
                              ? "text-red-500" 
                              : "text-yellow-600"
                          }`}>
                            {upload.status === "completed" 
                              ? "完了" 
                              : upload.status === "failed" 
                              ? "失敗" 
                              : "処理中"}
                          </Text>
                        </View>
                        {upload.status === "completed" && upload.recordsImported !== null && (
                          <Text className="text-xs text-muted font-bold">
                            {upload.recordsImported}件登録
                          </Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <View className="bg-surface rounded-2xl p-6 border border-border items-center justify-center">
                  <Text className="text-sm text-muted">インポート履歴がありません。</Text>
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
