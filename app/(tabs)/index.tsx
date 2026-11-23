import { router as navigation } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AppButton, AppHeader, Panel, SectionHeading, StatusPill, uiStyles } from "@/components/vila/ui";
import { BRAND, APPOINTMENT_STATUS_LABELS, money } from "@/shared/vila";
import { trpc } from "@/lib/trpc";
import { reconcileAppointmentCalendar, requestWritableCalendars } from "@/lib/vila-integrations";

function showCalendarSyncNotice(title: string, message: string) {
  if (typeof window !== "undefined" && typeof window.alert === "function") window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

const shortcuts = [
  { title: "Agendar serviço", subtitle: "Escolha pet, serviço e horário", icon: "+", route: "/(tabs)/agenda", tone: BRAND.orange },
  { title: "Conferir agenda", subtitle: "Dia, semana ou mês", icon: "◷", route: "/(tabs)/agenda", tone: BRAND.teal },
  { title: "Incluir clientes", subtitle: "Tutores e seus pets", icon: "♡", route: "/(tabs)/clientes", tone: "#D4B078" },
  { title: "Hospedagem", subtitle: "Reservas, check-in e checkout", icon: "⌂", route: "/(tabs)/hospedagem", tone: "#90BA91" },
];

export default function HomeScreen() {
  const [calendarSyncing, setCalendarSyncing] = useState(false);
  const [calendarSyncProgress, setCalendarSyncProgress] = useState("");
  const [calendarSyncError, setCalendarSyncError] = useState("");
  const calendarSyncLock = useRef(false);
  const utils = trpc.useUtils();
  const linkCalendarEvent = trpc.vila.appointments.setCalendarEvent.useMutation();
  const summary = trpc.vila.dashboard.summary.useQuery(undefined, { staleTime: 30000 });
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const appointments = trpc.vila.appointments.list.useQuery({ from: date, to: date }, { staleTime: 20000 });
  const todayItems = useMemo(() => appointments.data?.filter((item) => !["cancelled", "no_show"].includes(item.status)) || [], [appointments.data]);
  const hello = today.getHours() < 12 ? "Bom dia" : today.getHours() < 18 ? "Boa tarde" : "Boa noite";
  const dateLabel = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(today);

  async function forceCalendarSync() {
    if (calendarSyncLock.current) return;
    calendarSyncLock.current = true;
    setCalendarSyncing(true);
    setCalendarSyncError("");
    setCalendarSyncProgress("Conferindo os agendamentos salvos…");
    try {
      const rows = await utils.vila.calendarSync.snapshot.fetch();
      if (!rows.length) setCalendarSyncProgress("Verificando eventos marcados do Vila Caramelo...");
      const calendars = await requestWritableCalendars();
      const result = await reconcileAppointmentCalendar(
        rows,
        calendars,
        (input) => linkCalendarEvent.mutateAsync(input),
        (current, total, itemName) => setCalendarSyncProgress(itemName.startsWith("Buscando eventos marcados") ? itemName : `Verificando ${current} de ${total} · ${itemName}`),
      );
      await utils.vila.appointments.invalidate();
      const message = [
        `Atualizados: ${result.updated}`,
        `Criados ou recriados: ${result.created}`,
        `Removidos do Google: ${result.removed}`,
        `Eventos marcados da Vila sem atendimento no app removidos: ${result.orphanRemoved}`,
        `Vínculos recuperados: ${result.linked}`,
        `Já estavam corretos: ${result.unchanged}`,
        `Ignorados (somente na Vila): ${result.skipped}`,
        result.failures.length ? `Falhas: ${result.failures.length}\n${result.failures.slice(0, 4).join("\n")}${result.failures.length > 4 ? "\n…" : ""}` : "Sem falhas.",
      ].join("\n");
      setCalendarSyncProgress(result.failures.length ? "Sincronização concluída com itens para revisar." : "Sincronização concluída.");
      showCalendarSyncNotice(result.failures.length ? "Sincronização parcial" : "Sincronização concluída", message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível atualizar o Google Agenda.";
      setCalendarSyncError(message);
      setCalendarSyncProgress("");
      showCalendarSyncNotice("Não foi possível sincronizar", message);
    } finally {
      calendarSyncLock.current = false;
      setCalendarSyncing(false);
    }
  }

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppHeader eyebrow="Gestão da boutique" title="A segunda casa dos AUmigos." showBack={false} right={<View style={styles.openTag}><View style={styles.dot} /><Text style={styles.openText}>OPERAÇÃO</Text></View>} />
        <Panel style={styles.greeting}>
          <Text style={styles.greetingEyebrow}>{hello.toUpperCase()}  ·  {dateLabel}</Text>
          <Text style={styles.greetingTitle}>A rotina de hoje, bem cuidada.</Text>
          <Text style={uiStyles.bodyText}>Tudo pronto para receber os AUmigos com carinho e organização.</Text>
        </Panel>

        <Panel style={styles.calendarSyncPanel}>
          <View style={styles.calendarSyncHead}><Text style={styles.calendarSyncTitle}>Google Agenda</Text><StatusPill label={calendarSyncing ? "SINCRONIZANDO" : "AUTOMÁTICA + MANUAL"} tone={calendarSyncing ? "teal" : "green"} /></View>
          <Text style={styles.calendarSyncDescription}>Confere também atendimentos concluídos e antigos: recria eventos ausentes, corrige data e horário, e remove somente eventos marcados do Vila Caramelo sem atendimento válido. Eventos manuais ou da parceira são preservados. A leitura depende da sincronização da conta Google no Android.</Text>
          <AppButton label="Atualizar agendamentos" onPress={() => void forceCalendarSync()} loading={calendarSyncing} disabled={calendarSyncing} style={{ marginTop: 12 }} />
          {calendarSyncProgress ? <Text style={styles.calendarSyncProgress}>{calendarSyncProgress}</Text> : null}
          {calendarSyncError ? <Text style={styles.calendarSyncError}>{calendarSyncError}</Text> : null}
        </Panel>

        <SectionHeading title="Atalhos da Vila" detail="As tarefas mais usadas, a um toque." />
        <View style={styles.shortcutGrid}>
          {shortcuts.map((item) => (
            <Pressable key={item.title} onPress={() => navigation.push(item.route as never)} style={({ pressed }) => [styles.shortcut, { borderColor: `${item.tone}45`, opacity: pressed ? 0.75 : 1 }]}>
              <View style={[styles.shortcutIcon, { backgroundColor: `${item.tone}20` }]}><Text style={[styles.shortcutGlyph, { color: item.tone }]}>{item.icon}</Text></View>
              <Text style={styles.shortcutTitle}>{item.title}</Text>
              <Text style={styles.shortcutSubtitle}>{item.subtitle}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={() => navigation.push("/(tabs)/financeiro" as never)} style={({ pressed }) => [styles.serviceShortcut, { opacity: pressed ? 0.76 : 1 }]}>
          <View style={styles.serviceIcon}><Text style={styles.serviceIconText}>R$</Text></View>
          <View style={{ flex: 1 }}><Text style={styles.serviceShortcutTitle}>Extrato financeiro</Text><Text style={styles.serviceShortcutSub}>Receitas e pagamentos</Text></View>
          <Text style={styles.serviceArrow}>›</Text>
        </Pressable>
        <Pressable onPress={() => navigation.push("/(tabs)/servicos" as never)} style={({ pressed }) => [styles.serviceShortcut, { opacity: pressed ? 0.76 : 1 }]}>
          <View style={styles.serviceIcon}><Text style={styles.serviceIconText}>✂</Text></View>
          <View style={{ flex: 1 }}><Text style={styles.serviceShortcutTitle}>Gerenciar serviços</Text><Text style={styles.serviceShortcutSub}>Catálogo, preços e duração dos atendimentos</Text></View>
          <Text style={styles.serviceArrow}>›</Text>
        </Pressable>

        <View style={styles.sectionGap}>
          <SectionHeading title="Hoje na agenda" detail={appointments.isLoading ? "Carregando horários…" : `${todayItems.length} ${todayItems.length === 1 ? "atendimento" : "atendimentos"}`} action={<Pressable onPress={() => navigation.push("/(tabs)/agenda" as never)}><Text style={styles.link}>Ver agenda ›</Text></Pressable>} />
          {appointments.isLoading ? <ActivityIndicator color={BRAND.orange} /> : todayItems.length === 0 ? <Panel style={styles.empty}><Text style={styles.emptyIcon}>♡</Text><Text style={styles.emptyText}>Ainda sem horários para hoje.</Text><Text style={styles.emptySub}>Seus novos agendamentos aparecerão aqui.</Text><AppButton label="Agendar AUmigo" onPress={() => navigation.push("/(tabs)/agenda" as never)} style={{ marginTop: 14 }} /></Panel> : todayItems.slice(0, 4).map((item) => (
            <Pressable key={item.id} onPress={() => navigation.push("/(tabs)/agenda" as never)} style={({ pressed }) => [styles.appointment, { opacity: pressed ? 0.75 : 1 }]}>
              <View style={styles.timeColumn}><Text style={styles.time}>{item.startAt.slice(11, 16)}</Text><View style={styles.timeLine} /></View>
              <Panel style={styles.appointmentCard}>
                <View style={styles.appointmentHead}><Text style={styles.petName}>{item.petName}</Text><StatusPill label={APPOINTMENT_STATUS_LABELS[item.status]} tone={item.status === "completed" ? "green" : item.status === "cancelled" ? "red" : "teal"} /></View>
                <Text style={styles.service}>{item.serviceName}  ·  {item.clientName}</Text>
                <Text style={styles.price}>{money(item.priceCents)}</Text>
              </Panel>
            </Pressable>
          ))}
        </View>

        <View style={styles.sectionGap}>
          <SectionHeading title="Resumo do mês" detail="Indicadores atualizados pelo banco da loja." />
          {summary.isLoading ? <ActivityIndicator color={BRAND.orange} /> : summary.error ? <Panel><Text style={uiStyles.bodyText}>Não foi possível carregar os indicadores. Verifique a conexão e tente novamente.</Text></Panel> : (
            <View style={styles.metricRow}>
              <Metric value={`${summary.data?.todayAppointments ?? 0}`} label="Agenda de hoje" tone={BRAND.teal} />
              <Metric value={`${summary.data?.activeClients ?? 0}`} label="Tutores ativos" tone="#D4B078" />
              <Metric value={money(summary.data?.monthRevenueCents ?? 0)} label="Entradas do mês" tone={BRAND.orange} />
            </View>
          )}
        </View>

        <View style={styles.footerCard}><Text style={styles.footerLine}>CUIDADO  ·  AMOR  ·  SEGURANÇA</Text><Text style={styles.footerBrand}>Experiência gourmet de cuidado. ♡</Text></View>
      </ScrollView>
    </View>
  );
}

function Metric({ value, label, tone }: { value: string; label: string; tone: string }) {
  return <Panel style={styles.metric}><View style={[styles.metricAccent, { backgroundColor: tone }]} /><Text numberOfLines={1} adjustsFontSizeToFit style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></Panel>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: BRAND.background },
  content: { paddingBottom: 32 },
  openTag: { flexDirection: "row", alignItems: "center", gap: 7, borderColor: BRAND.border, borderWidth: 1, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 7 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#88C88E" },
  openText: { fontSize: 9, fontWeight: "900", letterSpacing: 1, color: BRAND.muted },
  greeting: { marginHorizontal: 20, marginBottom: 24, padding: 20, backgroundColor: "#25251F", borderColor: "#55452E" },
  greetingEyebrow: { color: BRAND.orange, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  greetingTitle: { color: BRAND.cream, fontSize: 21, lineHeight: 27, fontWeight: "800", marginTop: 10, marginBottom: 6 },
  calendarSyncPanel: { marginHorizontal: 20, marginTop: -10, marginBottom: 24, padding: 15, borderColor: "#55452E" },
  calendarSyncHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  calendarSyncTitle: { color: BRAND.cream, fontWeight: "800", fontSize: 14 },
  calendarSyncDescription: { color: BRAND.muted, fontSize: 11, lineHeight: 16, marginTop: 8 },
  calendarSyncProgress: { color: BRAND.teal, fontSize: 11, marginTop: 9 },
  calendarSyncError: { color: "#F09586", fontSize: 11, lineHeight: 15, marginTop: 8 },
  shortcutGrid: { marginHorizontal: 20, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  serviceShortcut: { marginTop: 10, marginHorizontal: 20, padding: 13, minHeight: 62, flexDirection: "row", alignItems: "center", gap: 11, borderRadius: 16, backgroundColor: BRAND.surface, borderWidth: 1, borderColor: BRAND.border },
  serviceIcon: { width: 35, height: 35, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: `${BRAND.orange}22` },
  serviceIconText: { color: BRAND.orange, fontSize: 17, fontWeight: "900" },
  serviceShortcutTitle: { color: BRAND.cream, fontSize: 13, fontWeight: "800" },
  serviceShortcutSub: { color: BRAND.muted, fontSize: 10, lineHeight: 14, marginTop: 3 },
  serviceArrow: { color: BRAND.orange, fontSize: 23, fontWeight: "800" },
  shortcut: { width: "48%", flexGrow: 1, minHeight: 144, backgroundColor: BRAND.surface, borderWidth: 1, borderRadius: 18, padding: 14 },
  shortcutIcon: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  shortcutGlyph: { fontWeight: "900", fontSize: 17 },
  shortcutTitle: { color: BRAND.cream, fontSize: 14, lineHeight: 19, fontWeight: "800" },
  shortcutSubtitle: { color: BRAND.muted, fontSize: 11, lineHeight: 15, marginTop: 5 },
  sectionGap: { marginTop: 24, paddingHorizontal: 20 },
  link: { color: BRAND.orange, fontWeight: "800", fontSize: 12 },
  empty: { alignItems: "center", padding: 20 },
  emptyIcon: { color: BRAND.orange, fontSize: 28, marginBottom: 5 },
  emptyText: { color: BRAND.cream, fontWeight: "800", fontSize: 14 },
  emptySub: { color: BRAND.muted, fontSize: 12, marginTop: 5, textAlign: "center" },
  appointment: { flexDirection: "row", gap: 10, marginBottom: 10 },
  timeColumn: { width: 48, alignItems: "center" },
  time: { color: BRAND.teal, fontSize: 12, fontWeight: "800", marginTop: 14 },
  timeLine: { flex: 1, width: 1, backgroundColor: BRAND.border, marginTop: 7 },
  appointmentCard: { flex: 1, padding: 13 },
  appointmentHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  petName: { color: BRAND.cream, fontWeight: "800", fontSize: 15 },
  service: { color: BRAND.muted, fontSize: 12, marginTop: 7 },
  price: { color: BRAND.orange, fontWeight: "800", fontSize: 13, marginTop: 7 },
  metricRow: { flexDirection: "row", gap: 9 },
  metric: { flex: 1, paddingHorizontal: 11, paddingVertical: 14, minHeight: 98 },
  metricAccent: { width: 20, height: 3, borderRadius: 2, marginBottom: 12 },
  metricValue: { color: BRAND.cream, fontSize: 18, fontWeight: "900" },
  metricLabel: { color: BRAND.muted, fontSize: 10, lineHeight: 14, marginTop: 5 },
  footerCard: { alignItems: "center", paddingHorizontal: 20, marginTop: 28, gap: 5 },
  footerLine: { color: BRAND.muted, letterSpacing: 1.2, fontSize: 9, fontWeight: "800" },
  footerBrand: { color: BRAND.orange, fontSize: 11, fontWeight: "700" },
});
