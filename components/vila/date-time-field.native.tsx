import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { BRAND, dateInput, timeInput } from "@/shared/vila";

type PickerMode = "date" | "time";
type Props = { label: string; mode: PickerMode; value: string; onChange: (value: string) => void; style?: StyleProp<ViewStyle> };

function pickerDate(value: string, mode: PickerMode): Date {
  const now = new Date();
  if (mode === "date") {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }
  const [hour, minute] = value.split(":").map(Number);
  now.setHours(hour, minute, 0, 0);
  return now;
}

function displayValue(value: string, mode: PickerMode): string {
  if (mode === "time") return value;
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(year, month - 1, day, 12));
}

export function DateTimeField({ label, mode, value, onChange, style }: Props) {
  function openPicker() {
    DateTimePickerAndroid.open({
      value: pickerDate(value, mode),
      mode,
      display: mode === "date" ? "calendar" : "clock",
      is24Hour: true,
      onChange: (event, selectedDate) => {
        if (event.type !== "set" || !selectedDate) return;
        onChange(mode === "date" ? dateInput(selectedDate) : timeInput(selectedDate));
      },
    });
  }

  return (
    <View style={[styles.wrapper, style]}>
      <Text style={styles.label}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}, ${displayValue(value, mode)}. Toque para selecionar.`} onPress={openPicker} style={({ pressed }) => [styles.field, pressed && styles.pressed]}>
        <Text style={styles.value}>{displayValue(value, mode)}</Text>
        <Text style={styles.icon}>{mode === "date" ? "▦" : "◷"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 7, marginBottom: 14 },
  label: { color: BRAND.muted, fontSize: 12, fontWeight: "700", letterSpacing: 0.3 },
  field: { minHeight: 48, borderRadius: 13, borderColor: BRAND.border, borderWidth: 1, backgroundColor: BRAND.background, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pressed: { borderColor: BRAND.orange, opacity: 0.82 },
  value: { color: BRAND.cream, fontSize: 15, fontWeight: "600" },
  icon: { color: BRAND.orange, fontSize: 18, fontWeight: "800" },
});
