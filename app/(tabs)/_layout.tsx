import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Platform } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 56 + bottomPadding;

  const isCoach = user?.role === "coach";
  const isAthlete = user?.role === "athlete";

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          paddingTop: 8,
          paddingBottom: bottomPadding,
          height: tabBarHeight,
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 0.5,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="team"
        options={{
          title: "選手管理",
          href: isCoach ? "/team" : null,
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="person.3.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="upload"
        options={{
          title: "CSV追加",
          href: isCoach ? "/upload" : null,
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="doc.badge.plus" color={color} />,
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: "トレンド分析",
          href: isAthlete ? "/analytics" : null,
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="chart.xyaxis.line" color={color} />,
        }}
      />
    </Tabs>
  );
}
