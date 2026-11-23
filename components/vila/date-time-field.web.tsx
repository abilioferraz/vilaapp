import { useMemo, useState } from "react";
import { Modal, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { BRAND, dateInput, timeInput } from "@/shared/vila";

type PickerMode = "date" | "time";
type Props = { label: string; mode: PickerMode; value: string; onChange: (value: string) => void; style?: StyleProp<ViewStyle> };

function dateParts(value: string) { return value.split("-").map(Number); }
function displayValue(value: string, mode: PickerMode) {
  if (mode === "time") return value;
  const [year, month, day] = dateParts(value);
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(year, month - 1, day, 12));
}

export function DateTimeField({ label, mode, value, onChange, style }: Props) {
  const [open, setOpen] = useState(false);
  const [draftDate, setDraftDate] = useState(value);
  const [draftHour, setDraftHour] = useState(9);
  const [draftMinute, setDraftMinute] = useState(0);
  const [month, setMonth] = useState(() => { const [year, monthNumber] = dateParts(value); return new Date(year, monthNumber - 1, 1); });
  const days = useMemo(() => {
    const offset = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index - offset + 1));
  }, [month]);

  function show() {
    setDraftDate(value);
    const [hour, minute] = value.includes(":") ? value.split(":").map(Number) : [9, 0];
    setDraftHour(hour);
    setDraftMinute(minute);
    if (mode === "date") { const [year, monthNumber] = dateParts(value); setMonth(new Date(year, monthNumber - 1, 1)); }
    setOpen(true);
  }
  function confirm() { onChange(mode === "date" ? draftDate : timeInput(new Date(2020, 0, 1, draftHour, draftMinute))); setOpen(false); }
  function shiftMonth(delta: number) { setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1)); }
  function adjustHour(delta: number) { setDraftHour((current) => (current + delta + 24) % 24); }
  function adjustMinute(delta: number) { setDraftMinute((current) => (current + delta + 60) % 60); }

  return (
    <View style={[styles.wrapper, style]}>
      <Text style={styles.label}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}, ${displayValue(value, mode)}. Toque para selecionar.`} onPress={show} style={({ pressed }) => [styles.field, pressed && styles.pressed]}>
        <Text style={styles.value}>{displayValue(value, mode)}</Text>
        <Text style={styles.icon}>{mode === "date" ? "▦" : "◷"}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <Text style={styles.title}>{mode === "date" ? "Selecionar data" : "Selecionar horário"}</Text>
            {mode === "date" ? <>
              <View style={styles.monthHeader}><Pressable onPress={() => shiftMonth(-1)} style={styles.arrow}><Text style={styles.arrowText}>‹</Text></Pressable><Text style={styles.monthTitle}>{new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(month)}</Text><Pressable onPress={() => shiftMonth(1)} style={styles.arrow}><Text style={styles.arrowText}>›</Text></Pressable></View>
              <View style={styles.grid}>{["S", "T", "Q", "Q", "S", "S", "D"].map((day, index) => <Text key={`${day}-${index}`} style={styles.weekday}>{day}</Text>)}{days.map((day, index) => { const iso = dateInput(day); const currentMonth = day.getMonth() === month.getMonth(); const selected = iso === draftDate; return <Pressable key={`${iso}-${index}`} onPress={() => setDraftDate(iso)} style={[styles.day, !currentMonth && styles.otherDay, selected && styles.selectedDay]}><Text style={[styles.dayText, selected && styles.selectedDayText]}>{day.getDate()}</Text></Pressable>; })}</View>
            </> : <View style={styles.timeControls}>{[["Hora", draftHour, adjustHour], ["Minuto", draftMinute, adjustMinute]].map(([name, numericValue, adjust]) => <View key={String(name)} style={styles.timePart}><Text style={styles.timePartLabel}>{String(name)}</Text><View style={styles.stepper}><Pressable accessibilityRole="button" onPress={() => (adjust as (delta: number) => void)(-1)} style={styles.stepButton}><Text style={styles.stepText}>−</Text></Pressable><Text style={styles.timeNumber}>{String(numericValue).padStart(2, "0")}</Text><Pressable accessibilityRole="button" onPress={() => (adjust as (delta: number) => void)(1)} style={styles.stepButton}><Text style={styles.stepText}>+</Text></Pressable></View></View>)}</View>}
            <View style={styles.actions}><Pressable onPress={() => setOpen(false)} style={styles.cancelButton}><Text style={styles.cancelText}>Cancelar</Text></Pressable><Pressable onPress={confirm} style={styles.confirmButton}><Text style={styles.confirmText}>Selecionar</Text></Pressable></View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 7, marginBottom: 14 }, label: { color: BRAND.muted, fontSize: 12, fontWeight: "700", letterSpacing: 0.3 },
  field: { minHeight: 48, borderRadius: 13, borderColor: BRAND.border, borderWidth: 1, backgroundColor: BRAND.background, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, pressed: { borderColor: BRAND.orange, opacity: 0.82 }, value: { color: BRAND.cream, fontSize: 15, fontWeight: "600" }, icon: { color: BRAND.orange, fontSize: 18, fontWeight: "800" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "center", alignItems: "center", padding: 18 }, sheet: { width: "100%", maxWidth: 420, borderRadius: 22, padding: 20, backgroundColor: BRAND.surface, borderColor: BRAND.border, borderWidth: 1 }, title: { color: BRAND.cream, fontWeight: "800", fontSize: 18, marginBottom: 16 }, monthHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }, monthTitle: { color: BRAND.cream, fontSize: 15, fontWeight: "700", textTransform: "capitalize" }, arrow: { width: 38, height: 38, borderRadius: 12, backgroundColor: BRAND.surfaceAlt, alignItems: "center", justifyContent: "center" }, arrowText: { color: BRAND.orange, fontSize: 23, lineHeight: 26 },
  grid: { flexDirection: "row", flexWrap: "wrap" }, weekday: { width: "14.2857%", paddingVertical: 7, textAlign: "center", color: BRAND.muted, fontSize: 11, fontWeight: "800" }, day: { width: "14.2857%", height: 40, alignItems: "center", justifyContent: "center", borderRadius: 12 }, otherDay: { opacity: 0.35 }, selectedDay: { backgroundColor: BRAND.green }, dayText: { color: BRAND.cream, fontSize: 13, fontWeight: "700" }, selectedDayText: { color: BRAND.cream },
  timeControls: { flexDirection: "row", gap: 14, justifyContent: "center", paddingVertical: 22 }, timePart: { alignItems: "center", gap: 10, minWidth: 115 }, timePartLabel: { color: BRAND.muted, fontSize: 12, fontWeight: "700" }, stepper: { flexDirection: "row", alignItems: "center", gap: 13 }, stepButton: { width: 38, height: 42, borderRadius: 12, backgroundColor: BRAND.surfaceAlt, justifyContent: "center", alignItems: "center" }, stepText: { color: BRAND.orange, fontSize: 22, fontWeight: "800" }, timeNumber: { color: BRAND.cream, fontSize: 28, fontWeight: "900", minWidth: 38, textAlign: "center" },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 16 }, cancelButton: { minHeight: 42, minWidth: 90, justifyContent: "center", alignItems: "center", borderRadius: 12, paddingHorizontal: 14 }, cancelText: { color: BRAND.muted, fontWeight: "700" }, confirmButton: { minHeight: 42, minWidth: 104, justifyContent: "center", alignItems: "center", borderRadius: 12, paddingHorizontal: 14, backgroundColor: BRAND.orange }, confirmText: { color: BRAND.brown, fontWeight: "900" },
});
