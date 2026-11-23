import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActivityIndicator, AppState, Image, Platform, Pressable, ScrollView, StyleSheet, Text, type ColorValue } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { HapticTab } from "@/components/haptic-tab";
import { BRAND } from "@/shared/vila";
import { useAuth } from "@/hooks/use-auth";
import { startOAuthLogin } from "@/constants/oauth";
import { useEffect, useState, type ComponentProps } from "react";

function LoginGate() {
  const { refresh } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const enter = async () => {
    try {
      setError("");
      setBusy(true);
      await startOAuthLogin();
      if (Platform.OS === "web") await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível abrir a autenticação.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <ScrollView contentContainerStyle={gateStyles.page}>
      <Image source={require("@/assets/images/vila-logo.jpg")} style={gateStyles.logo} resizeMode="contain" />
      <Text style={gateStyles.brand}>VILA CARAMELO</Text>
      <Text style={gateStyles.subbrand}>BANHO & TOSA · GESTÃO</Text>
      <Text style={gateStyles.title}>A rotina dos AUmigos, em boas mãos.</Text>
      <Text style={gateStyles.body}>Entre com sua conta autorizada para acessar clientes, pets, agenda e informações financeiras da loja.</Text>
      {error ? <Text style={gateStyles.error}>{error}</Text> : null}
      <Pressable onPress={enter} disabled={busy} style={({ pressed }) => [gateStyles.button, { opacity: pressed || busy ? 0.72 : 1 }]}>
        {busy ? <ActivityIndicator color={BRAND.brown} /> : <Text style={gateStyles.buttonText}>Entrar com Manus</Text>}
      </Pressable>
      <Text style={gateStyles.privacy}>Acesso protegido. Nenhum dado de clientes é exibido antes da autenticação.</Text>
    </ScrollView>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, loading, refresh } = useAuth();
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);
  if (loading || !isAuthenticated) return <LoginGate />;
  const bottomPadding = Platform.OS === "web" ? 10 : Math.max(insets.bottom, 8);
  return (
    <Tabs screenOptions={({ route }) => ({
      headerShown: false,
      tabBarButton: HapticTab,
      tabBarActiveTintColor: BRAND.orange,
      tabBarInactiveTintColor: BRAND.muted,
      sceneStyle: { paddingTop: Math.max(insets.top, 24), backgroundColor: BRAND.background },
      tabBarLabelStyle: { fontSize: 10, fontWeight: "700", marginTop: -1 },
      tabBarStyle: { backgroundColor: BRAND.surface, borderTopColor: BRAND.border, borderTopWidth: 1, height: 58 + bottomPadding, paddingTop: 7, paddingBottom: bottomPadding },
      tabBarAccessibilityLabel: route.name,
      lazy: true,
    })}>
      <Tabs.Screen name="index" options={{ title: "Início", tabBarIcon: ({ color }) => <TabIcon name="home" color={color} /> }} />
      <Tabs.Screen name="agenda" options={{ title: "Agenda", tabBarIcon: ({ color }) => <TabIcon name="calendar-month" color={color} /> }} />
      <Tabs.Screen name="clientes" options={{ title: "Clientes", tabBarIcon: ({ color }) => <TabIcon name="pets" color={color} /> }} />
      <Tabs.Screen name="pacotes" options={{ title: "Pacotes", tabBarIcon: ({ color }) => <TabIcon name="loyalty" color={color} /> }} />
      <Tabs.Screen name="financeiro" options={{ title: "Financeiro", tabBarIcon: ({ color }) => <TabIcon name="payments" color={color} /> }} />
      <Tabs.Screen name="servicos" options={{ title: "Serviços", href: null, tabBarIcon: ({ color }) => <TabIcon name="content-cut" color={color} /> }} />
      <Tabs.Screen name="fornecedores" options={{ title: "Fornecedores", href: null }} />
      <Tabs.Screen name="saidas" options={{ title: "Saídas", href: null }} />
      <Tabs.Screen name="hospedagem" options={{ title: "Hospedagem", href: null }} />
    </Tabs>
  );
}

function TabIcon({ name, color }: { name: ComponentProps<typeof MaterialIcons>["name"]; color: ColorValue }) {
  return <MaterialIcons name={name} size={21} color={color} />;
}

const gateStyles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: BRAND.background, gap: 12 },
  page: { flexGrow: 1, alignItems: "center", justifyContent: "center", backgroundColor: BRAND.background, paddingHorizontal: 30, paddingVertical: 38 },
  logo: { height: 156, width: 156, borderRadius: 30, backgroundColor: BRAND.cream },
  brand: { marginTop: 20, color: BRAND.cream, fontSize: 20, fontWeight: "900", letterSpacing: 2 },
  subbrand: { marginTop: 5, color: BRAND.orange, fontSize: 11, fontWeight: "800", letterSpacing: 1.8 },
  title: { marginTop: 36, color: BRAND.cream, fontSize: 28, lineHeight: 34, fontWeight: "800", textAlign: "center" },
  body: { marginTop: 14, maxWidth: 360, color: BRAND.muted, fontSize: 15, lineHeight: 23, textAlign: "center" },
  button: { marginTop: 28, borderRadius: 16, width: "100%", maxWidth: 360, minHeight: 54, alignItems: "center", justifyContent: "center", backgroundColor: BRAND.orange },
  buttonText: { color: BRAND.brown, fontSize: 15, fontWeight: "900" },
  privacy: { marginTop: 18, color: BRAND.muted, fontSize: 11, lineHeight: 17, textAlign: "center", maxWidth: 310 },
  error: { color: "#F09489", fontSize: 13, marginTop: 12, textAlign: "center" },
  muted: { color: BRAND.muted, fontSize: 14 },
});
