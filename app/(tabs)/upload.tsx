import React, { useState, useMemo } from "react";
import { ScrollView, Text, View, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, Modal, TextInput } from "react-native";
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
  sessionType?: "practice" | "individual" | "match" | "auto";
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

  const [unmatchedList, setUnmatchedList] = useState<{ csvName: string; fileId: string; fileName: string }[]>([]);
  const { data: athletesData, refetch: refetchAthletes } = trpc.athlete.getByTeam.useQuery(
    { teamId },
    { enabled: isAuthenticated && !!user?.teamId }
  );
  const updateAthleteCsvNamesMutation = trpc.performance.updateAthleteCsvNames.useMutation();
  
  const importMutation = trpc.performance.importCsv.useMutation();
  const deleteUploadMutation = trpc.performance.deleteCsvUpload.useMutation();
  
  const clearAllUploadsMutation = trpc.performance.clearAllCsvUploads.useMutation();
  const deleteUploadsByRangeMutation = trpc.performance.deleteCsvUploadsByRange.useMutation();

  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [bulkDeleteMode, setBulkDeleteMode] = useState<"all" | "range">("all");
  const [bulkStartDate, setBulkStartDate] = useState(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString("sv-SE"));
  const [bulkEndDate, setBulkEndDate] = useState(new Date().toLocaleDateString("sv-SE"));
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const addFiles = (newFiles: { name: string; size?: number; text: string }[]) => {
    const items: UploadFileItem[] = newFiles.map(f => ({
      id: `${f.name}_${Date.now()}_${Math.random()}`,
      name: f.name,
      size: f.size,
      text: f.text,
      status: "pending",
      detectedFormat: detectFormatOnFrontend(f.text, f.name),
      sessionType: "auto",
    }));
    setFilesToUpload(prev => [...prev, ...items]);
  };

  const handleImport = async () => {
    if (filesToUpload.length === 0) {
      setErrorMsg("インポートするファイルがありません。");
      return;
    }
    setErrorMsg("");
    setUnmatchedList([]);
    
    // Set all pending/error files to uploading state
    setFilesToUpload(prev => prev.map(f => f.status === "pending" || f.status === "error" ? { ...f, status: "uploading" } : f));

    let successCount = 0;
    let failCount = 0;
    const tempUnmatched: typeof unmatchedList = [];

    for (const file of filesToUpload) {
      if (file.status !== "pending" && file.status !== "error" && file.status !== "uploading") continue;

      try {
        const res = await importMutation.mutateAsync({
          teamId,
          csvText: file.text,
          fileName: file.name,
          sessionType: file.sessionType || "auto",
        });
        
        if (res && res.unregisteredAthletes && res.unregisteredAthletes.length > 0) {
          res.unregisteredAthletes.forEach(name => {
            tempUnmatched.push({
              csvName: name,
              fileId: file.id,
              fileName: file.name
            });
          });
        }
        
        setFilesToUpload(prev => prev.map(f => f.id === file.id ? { ...f, status: "success" } : f));
        successCount++;
      } catch (err: any) {
        setFilesToUpload(prev => prev.map(f => f.id === file.id ? { ...f, status: "error", errorMessage: err.message || "アップロード失敗" } : f));
        failCount++;
      }
    }

    if (tempUnmatched.length > 0) {
      setUnmatchedList(tempUnmatched);
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

  const handleBulkDelete = async () => {
    setIsBulkDeleting(true);
    try {
      if (bulkDeleteMode === "all") {
        const confirm = typeof window !== "undefined" && window.confirm 
          ? window.confirm("本当にすべてのインポート履歴およびそれに紐づくパフォーマンスデータを一括削除しますか？\n(この操作は取り消せません)") 
          : true;
        if (confirm) {
          const res = await clearAllUploadsMutation.mutateAsync({ teamId });
          alert(`すべてのインポート履歴（${res.count}ファイル分）を削除しました。`);
          setIsBulkDeleteModalOpen(false);
        }
      } else {
        const confirm = typeof window !== "undefined" && window.confirm 
          ? window.confirm(`${bulkStartDate} 〜 ${bulkEndDate} の期間内にアップロードされたインポート履歴とパフォーマンスデータを削除しますか？`) 
          : true;
        if (confirm) {
          const res = await deleteUploadsByRangeMutation.mutateAsync({
            teamId,
            startDateStr: bulkStartDate,
            endDateStr: bulkEndDate
          });
          alert(`${bulkStartDate} 〜 ${bulkEndDate} のインポート履歴（${res.count}ファイル分）を削除しました。`);
          setIsBulkDeleteModalOpen(false);
        }
      }
      refetchUploads();
      refetchStatus();
    } catch (err: any) {
      console.error("Bulk delete failed", err);
      alert(`一括削除に失敗しました: ${err.message || err}`);
    } finally {
      setIsBulkDeleting(false);
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
          reader.onload = (evt) => {
            const arrayBuffer = evt.target?.result as ArrayBuffer;
            try {
              // Try decoding as UTF-8 first (fatal: true will throw on invalid UTF-8 bytes)
              const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
              resolve(utf8Decoder.decode(arrayBuffer));
            } catch (err) {
              // Fallback to Shift-JIS for Excel-generated Japanese CSVs
              const sjisDecoder = new TextDecoder("shift-jis");
              resolve(sjisDecoder.decode(arrayBuffer));
            }
          };
          reader.readAsArrayBuffer(file);
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

  const monthDaysList = useMemo(() => {
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const days = [];
    const weekNames = ["日", "月", "火", "水", "木", "金", "土"];
    
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(currentYear, currentMonth - 1, d);
      const dayOfWeekIdx = dateObj.getDay();
      const dateString = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({ 
        day: d, 
        weekName: weekNames[dayOfWeekIdx],
        dayOfWeekIdx,
        dateString 
      });
    }
    return days;
  }, [currentYear, currentMonth]);

  const weeks = useMemo(() => {
    const list = [];
    let currentWeek = [];
    for (let i = 0; i < monthDaysList.length; i++) {
      const day = monthDaysList[i];
      currentWeek.push(day);
      if (day.dayOfWeekIdx === 6 || i === monthDaysList.length - 1) {
        list.push(currentWeek);
        currentWeek = [];
      }
    }
    return list;
  }, [monthDaysList]);

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
            {/* Sync Check List */}
            <View className="bg-surface rounded-3xl border border-border p-5 shadow-sm gap-4">
              <View className="flex-row justify-between items-center pb-2 border-b border-border">
                <View className="flex-1 pr-2">
                  <Text className="text-base font-bold text-foreground font-sans">同期チェック一覧</Text>
                  <Text className="text-[10px] text-muted font-sans">各曜日ごとに7つのデータが同期完了しているか確認</Text>
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
              <View className="flex-row flex-wrap gap-x-4 gap-y-1.5 bg-muted/20 p-3 rounded-2xl">
                <View className="flex-row items-center gap-1.5">
                  <View className="w-3.5 h-3.5 rounded-full bg-emerald-500 items-center justify-center">
                    <IconSymbol size={8} name="checkmark" color="#FFF" />
                  </View>
                  <Text className="text-[10px] text-muted font-bold font-sans">🟢 同期完了</Text>
                </View>
                <View className="flex-row items-center gap-1.5">
                  <Text className="text-[10px] text-muted font-sans">※ 7つの項目が同期されているか週ごとに確認できます。</Text>
                </View>
              </View>

              {/* Weekly Sync Status Tables */}
              <View className="gap-5">
                {weeks.map((week, weekIdx) => {
                  const firstDay = week[0];
                  const lastDay = week[week.length - 1];
                  const weekTitle = `${currentMonth}月${firstDay.day}日(${firstDay.weekName}) 〜 ${lastDay.day}日(${lastDay.weekName})`;

                  return (
                    <View key={weekIdx} className="bg-muted/10 border border-border/60 rounded-2xl p-3.5 gap-2.5">
                      {/* Week Header */}
                      <View className="flex-row justify-between items-center border-b border-border/40 pb-1.5">
                        <Text className="text-xs font-extrabold text-foreground font-sans">第{weekIdx + 1}週 <Text className="text-[10px] text-muted font-medium">({weekTitle})</Text></Text>
                      </View>

                      {/* Scrollable Horizontal Table Grid */}
                      <ScrollView horizontal={true} showsHorizontalScrollIndicator={false} className="w-full">
                        <View className="gap-2 min-w-full">
                          {/* Table Headers */}
                          <View style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderColor: "#E2E8F0", paddingBottom: 4, height: 26 }}>
                            <View style={{ width: 68 }}><Text style={{ fontSize: 9, fontWeight: "bold", color: "#64748B" }}>日付</Text></View>
                            <View style={{ width: 42, alignItems: "center" }}><Text style={{ fontSize: 9, fontWeight: "bold", color: "#64748B" }}>IMA</Text></View>
                            <View style={{ width: 42, alignItems: "center" }}><Text style={{ fontSize: 9, fontWeight: "bold", color: "#64748B" }}>PL</Text></View>
                            <View style={{ width: 42, alignItems: "center" }}><Text style={{ fontSize: 9, fontWeight: "bold", color: "#64748B" }}>Well</Text></View>
                            <View style={{ width: 42, alignItems: "center" }}><Text style={{ fontSize: 9, fontWeight: "bold", color: "#64748B" }}>sRPE</Text></View>
                            <View style={{ width: 42, alignItems: "center" }}><Text style={{ fontSize: 9, fontWeight: "bold", color: "#64748B" }}>SOXAI</Text></View>
                            <View style={{ width: 42, alignItems: "center" }}><Text style={{ fontSize: 9, fontWeight: "bold", color: "#64748B" }}>Menu</Text></View>
                            <View style={{ width: 42, alignItems: "center" }}><Text style={{ fontSize: 9, fontWeight: "bold", color: "#64748B" }}>RPE</Text></View>
                          </View>

                          {/* Table Rows for each day in this week */}
                          {week.map((item) => {
                            const status = importStatus?.find(s => s.date === item.dateString);
                            const hasIma = (status as any)?.hasIma || false;
                            const hasPL = (status as any)?.hasPlayerLoad || false;
                            const hasWell = (status as any)?.hasWellness || false;
                            const hasSrpe = (status as any)?.hasSrpe || false;
                            const hasSoxai = (status as any)?.hasSoxai || false;
                            const hasMenu = (status as any)?.hasMenu || false;
                            const hasRpeLog = (status as any)?.hasRpeLog || false;

                            const renderStatusDot = (hasData: boolean) => {
                              return hasData ? (
                                <View className="w-5 h-5 rounded-full bg-emerald-500/10 items-center justify-center border border-emerald-500/20">
                                  <IconSymbol size={9} name="checkmark" color="#10B981" />
                                </View>
                              ) : (
                                <View className="w-5 h-5 rounded-full bg-red-500/5 items-center justify-center border border-red-500/10">
                                  <Text style={{ fontSize: 8, fontWeight: "bold", color: "#EF4444" }}>ー</Text>
                                </View>
                              );
                            };

                            return (
                              <View 
                                key={item.dateString} 
                                style={{ flexDirection: "row", alignItems: "center", height: 32, borderBottomWidth: 0.5, borderColor: "#F1F5F9" }}
                              >
                                {/* Date label */}
                                <View style={{ width: 68 }}>
                                  <Text 
                                    style={{ 
                                      fontSize: 10, 
                                      fontWeight: "bold",
                                      color: item.dayOfWeekIdx === 0 ? "#EF4444" : item.dayOfWeekIdx === 6 ? "#3B82F6" : "#1E293B" 
                                    }}
                                  >
                                    {item.day}日 ({item.weekName})
                                  </Text>
                                </View>

                                {/* 7 Sync Indicators */}
                                <View style={{ width: 42, alignItems: "center" }}>{renderStatusDot(hasIma)}</View>
                                <View style={{ width: 42, alignItems: "center" }}>{renderStatusDot(hasPL)}</View>
                                <View style={{ width: 42, alignItems: "center" }}>{renderStatusDot(hasWell)}</View>
                                <View style={{ width: 42, alignItems: "center" }}>{renderStatusDot(hasSrpe)}</View>
                                <View style={{ width: 42, alignItems: "center" }}>{renderStatusDot(hasSoxai)}</View>
                                <View style={{ width: 42, alignItems: "center" }}>{renderStatusDot(hasMenu)}</View>
                                <View style={{ width: 42, alignItems: "center" }}>{renderStatusDot(hasRpeLog)}</View>
                              </View>
                            );
                          })}
                        </View>
                      </ScrollView>
                    </View>
                  );
                })}
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
                              
                              <View className="flex-row items-center gap-1.5 mt-1.5">
                                <Text className="text-[9px] text-muted font-bold">タイプ:</Text>
                                <View className="flex-row bg-muted/20 p-0.5 rounded-lg border border-border/40">
                                  {(["auto", "practice", "individual"] as const).map((type) => {
                                    const labels = { auto: "自動", practice: "全体", individual: "自主" };
                                    const isSelected = (file.sessionType || "auto") === type;
                                    return (
                                      <TouchableOpacity
                                        key={type}
                                        onPress={() => {
                                          setFilesToUpload(prev => prev.map(f => f.id === file.id ? { ...f, sessionType: type } : f));
                                        }}
                                        className={`px-2 py-0.5 rounded-md ${
                                          isSelected ? "bg-primary shadow-xs" : "bg-transparent"
                                        }`}
                                      >
                                        <Text className={`text-[8px] font-bold ${
                                          isSelected ? "text-white" : "text-muted"
                                        }`}>
                                          {labels[type]}
                                        </Text>
                                      </TouchableOpacity>
                                    );
                                  })}
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

                {/* 選手マッピング (CSV名寄せ) 支援ウィジェット */}
                {unmatchedList.length > 0 && (
                  <View className="bg-surface border border-amber-300 rounded-3xl p-5 shadow-sm gap-4">
                    <View className="flex-row items-center gap-2 pb-2 border-b border-border/80">
                      <IconSymbol size={18} name="person.crop.circle.badge.exclamationmark" color="#D97706" />
                      <View className="flex-1">
                        <Text className="text-sm font-bold text-foreground">不一致選手の名寄せ設定</Text>
                        <Text className="text-[10px] text-muted">CSV内の選手名とアプリの登録選手を結びつけます</Text>
                      </View>
                    </View>

                    <View className="gap-3.5">
                      {unmatchedList.map((item, idx) => {
                        return (
                          <View key={idx} className="flex-row items-center justify-between border-b border-border/40 pb-3 gap-3">
                            <View className="flex-1">
                              <Text className="text-xs font-bold text-foreground">CSV上の名前: "{item.csvName}"</Text>
                              <Text className="text-[9px] text-muted" numberOfLines={1}>ファイル: {item.fileName}</Text>
                            </View>

                            <View className="flex-1 max-w-[160px]">
                              {/* 選手選択ドロップダウン */}
                              <ScrollView style={{ maxHeight: 110 }} className="border border-border/80 rounded-xl bg-background p-1.5">
                                {athletesData && athletesData.length > 0 ? (
                                  athletesData.map((ath: any) => (
                                    <TouchableOpacity
                                      key={ath.id}
                                      onPress={async () => {
                                        const currentAliases = ath.csvNames ? ath.csvNames.split(",").map((s: string) => s.trim()) : [];
                                        if (!currentAliases.includes(item.csvName)) {
                                          currentAliases.push(item.csvName);
                                          const updatedCsvNames = currentAliases.join(",");
                                          try {
                                            await updateAthleteCsvNamesMutation.mutateAsync({
                                              athleteId: ath.id,
                                              csvNames: updatedCsvNames
                                            });
                                            refetchAthletes();
                                            setUnmatchedList(prev => prev.filter(u => u.csvName !== item.csvName));
                                            alert(`「${ath.user?.name}」に「${item.csvName}」を紐付けました。次回から自動マッピングされます。`);
                                          } catch (e) {
                                            alert("マッピングの保存に失敗しました。");
                                          }
                                        }
                                      }}
                                      className="py-1.5 px-2 hover:bg-muted/10 active:bg-muted/20 border-b border-border/20"
                                    >
                                      <Text className="text-[10px] font-bold text-foreground">
                                        {ath.user?.name || `選手${ath.jerseyNumber}`} #{ath.jerseyNumber || "-"}
                                      </Text>
                                    </TouchableOpacity>
                                  ))
                                ) : (
                                  <Text className="text-[10px] text-muted italic">選手がいません</Text>
                                )}
                              </ScrollView>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}

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
                <View className="flex-row items-center gap-2">
                  <TouchableOpacity
                    onPress={() => setIsBulkDeleteModalOpen(true)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: "#FEE2E2",
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 8,
                      gap: 4
                    }}
                  >
                    <IconSymbol size={12} name="trash" color="#DC2626" />
                    <Text style={{ fontSize: 11, fontWeight: "bold", color: "#DC2626" }}>一括削除・整理</Text>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={() => refetchUploads()} className="p-2 rounded-full bg-muted/10">
                    <IconSymbol size={16} name="arrow.clockwise" color="#6B7280" />
                  </TouchableOpacity>
                </View>
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
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
                            <Text className="text-xs text-muted font-bold">
                              {upload.recordsImported}件登録
                            </Text>
                            <TouchableOpacity
                              onPress={async () => {
                                const confirm = typeof window !== "undefined" && window.confirm 
                                  ? window.confirm(`${upload.fileName} のインポートを取り消しますか？\n(このファイルから取り込まれた選手データが削除されます)`) 
                                  : true;
                                if (confirm) {
                                  try {
                                    await deleteUploadMutation.mutateAsync({ uploadId: upload.id });
                                    refetchUploads();
                                    refetchStatus();
                                    if (typeof window !== "undefined" && window.alert) {
                                      window.alert("インポートを取り消しました。");
                                    } else {
                                      alert("インポートを取り消しました。");
                                    }
                                  } catch (err) {
                                    console.error("Delete failed", err);
                                    if (typeof window !== "undefined" && window.alert) {
                                      window.alert("削除に失敗しました。");
                                    } else {
                                      alert("削除に失敗しました。");
                                    }
                                  }
                                }
                              }}
                              style={{ padding: 2 }}
                            >
                              <IconSymbol size={13} name="trash" color="#EF4444" />
                            </TouchableOpacity>
                          </View>
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
        <Modal
          visible={isBulkDeleteModalOpen}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setIsBulkDeleteModalOpen(false)}
        >
          <TouchableOpacity 
            activeOpacity={1} 
            onPress={() => setIsBulkDeleteModalOpen(false)}
            style={{ flex: 1, backgroundColor: "rgba(15, 23, 42, 0.4)", justifyContent: "center", alignItems: "center", padding: 20 }}
          >
            <TouchableOpacity 
              activeOpacity={1}
              style={{ backgroundColor: "#FFFFFF", borderRadius: 24, padding: 20, width: "100%", maxWidth: 420, gap: 16, shadowColor: "#0F172A", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <IconSymbol size={22} name="trash.fill" color="#DC2626" />
                <Text style={{ fontSize: 16, fontWeight: "bold", color: "#0F172A" }}>インポート履歴の一括削除・整理</Text>
              </View>

              <Text style={{ fontSize: 12, color: "#64748B", lineHeight: 18 }}>
                アップロードされた履歴を削除し、紐づくパフォーマンスデータをクリアします。
              </Text>

              {/* Toggle bulk delete mode */}
              <View style={{ flexDirection: "row", backgroundColor: "#F1F5F9", padding: 3, borderRadius: 8, gap: 4 }}>
                <TouchableOpacity
                  onPress={() => setBulkDeleteMode("all")}
                  style={{
                    flex: 1, paddingVertical: 8, borderRadius: 6,
                    backgroundColor: bulkDeleteMode === "all" ? "#FFFFFF" : "transparent",
                    alignItems: "center"
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: "bold", color: bulkDeleteMode === "all" ? "#0F172A" : "#64748B" }}>
                    すべて削除（全リセット）
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setBulkDeleteMode("range")}
                  style={{
                    flex: 1, paddingVertical: 8, borderRadius: 6,
                    backgroundColor: bulkDeleteMode === "range" ? "#FFFFFF" : "transparent",
                    alignItems: "center"
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: "bold", color: bulkDeleteMode === "range" ? "#0F172A" : "#64748B" }}>
                    期間を指定して削除
                  </Text>
                </TouchableOpacity>
              </View>

              {bulkDeleteMode === "range" && (
                <View style={{ gap: 10, paddingVertical: 4 }}>
                  <View style={{ gap: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: "bold", color: "#475569" }}>開始日 (YYYY-MM-DD)</Text>
                    <TextInput
                      value={bulkStartDate}
                      onChangeText={setBulkStartDate}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#94A3B8"
                      style={{ fontSize: 12, borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, padding: 8, color: "#1E293B" }}
                    />
                  </View>
                  <View style={{ gap: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: "bold", color: "#475569" }}>終了日 (YYYY-MM-DD)</Text>
                    <TextInput
                      value={bulkEndDate}
                      onChangeText={setBulkEndDate}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#94A3B8"
                      style={{ fontSize: 12, borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, padding: 8, color: "#1E293B" }}
                    />
                  </View>
                </View>
              )}

              <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                <TouchableOpacity
                  onPress={() => setIsBulkDeleteModalOpen(false)}
                  style={{ flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: "#CBD5E1", alignItems: "center" }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "bold", color: "#475569" }}>キャンセル</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleBulkDelete}
                  disabled={isBulkDeleting}
                  style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: "#DC2626", alignItems: "center", opacity: isBulkDeleting ? 0.6 : 1 }}
                >
                  {isBulkDeleting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={{ fontSize: 12, fontWeight: "bold", color: "#FFFFFF" }}>
                      {bulkDeleteMode === "all" ? "すべてクリアする" : "指定期間を削除する"}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
