import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardTypeOptions,
  Modal,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";
import { router } from "expo-router";
import { BRAND } from "@/shared/vila";

export function AppHeader({ eyebrow, title, right, showBack = true }: { eyebrow?: string; title: string; right?: React.ReactNode; showBack?: boolean }) {
  const goBack = () => { if (router.canGoBack()) router.back(); else router.replace("/"); };
  return (
    <View style={styles.header}>
      <View style={styles.brandRow}>
        <Image source={require("@/assets/images/vila-logo.jpg")} resizeMode="contain" style={styles.logo} />
        <View style={{ flex: 1 }}>
          <Text style={styles.brandName}>VILA CARAMELO</Text>
          <Text style={styles.brandSub}>BANHO & TOSA  ·  GESTÃO</Text>
        </View>
        {right}
      </View>
      <View style={styles.titleArea}>
        {showBack ? <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={goBack} style={({ pressed }) => [styles.backButton, pressed && styles.backPressed]}>
          <Text style={styles.backArrow}>‹</Text><Text style={styles.backText}>Voltar</Text>
        </Pressable> : null}
        <View style={styles.titleCopy}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text> : null}
          <Text style={styles.title}>{title}</Text>
        </View>
      </View>
    </View>
  );
}

export function Panel({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) return <Pressable onPress={onPress} style={[styles.panel, style]}>{children}</Pressable>;
  return <View style={[styles.panel, style]}>{children}</View>;
}

export function AppButton({
  label,
  onPress,
  variant = "primary",
  disabled,
  icon,
  style,
  loading,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "quiet" | "danger";
  disabled?: boolean;
  icon?: string;
  style?: StyleProp<ViewStyle>;
  loading?: boolean;
}) {
  const backgroundColor = variant === "primary" ? BRAND.orange : variant === "secondary" ? BRAND.green : variant === "danger" ? "#482824" : "transparent";
  const color = variant === "primary" ? "#201409" : variant === "danger" ? "#F2A096" : BRAND.cream;
  return (
    <Pressable disabled={disabled || loading} onPress={onPress} style={({ pressed }) => [styles.button, { backgroundColor, opacity: disabled ? 0.45 : pressed ? 0.78 : 1 }, style]}>
      {loading ? <ActivityIndicator size="small" color={color} /> : null}
      {icon ? <Text style={{ color, fontSize: 15, fontWeight: "900" }}>{icon}</Text> : null}
      <Text style={[styles.buttonText, { color }]}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({ label, onPress, color = BRAND.cream }: { label: string; onPress: () => void; color?: string }) {
  return <Pressable onPress={onPress} hitSlop={8} style={styles.iconButton}><Text style={{ color, fontWeight: "700", fontSize: 13 }}>{label}</Text></Pressable>;
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  secureTextEntry,
  maxLength,
  autoCapitalize = "sentences",
  editable = true,
  style: inputStyle,
  ...props
}: TextInputProps & { label: string; value: string; onChangeText: (value: string) => void; keyboardType?: KeyboardTypeOptions }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder || ""}
        placeholderTextColor={BRAND.muted}
        keyboardType={keyboardType}
        multiline={multiline}
        secureTextEntry={secureTextEntry}
        maxLength={maxLength}
        autoCapitalize={autoCapitalize}
        editable={editable}
        style={[styles.input, multiline ? styles.multiline : null, !editable ? { opacity: 0.65 } : null, inputStyle]}
        selectionColor={BRAND.orange}
        {...props}
      />
    </View>
  );
}

export function ChoiceField<T extends string>({
  label,
  value,
  options,
  onChange,
  searchable = false,
  searchPlaceholder,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; detail?: string }[];
  onChange: (value: T) => void;
  searchable?: boolean;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = options.find((item) => item.value === value);
  const normalizedSearch = search.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const filteredOptions = searchable && normalizedSearch ? options.filter((item) => `${item.label} ${item.detail || ""}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(normalizedSearch)) : options;
  return (
    <>
      <View style={styles.fieldWrap}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Pressable onPress={() => { setSearch(""); setOpen(true); }} style={({ pressed }) => [styles.choice, { opacity: pressed ? 0.7 : 1 }]}>
          <Text style={styles.inputText}>{selected?.label || "Selecione"}</Text>
          <Text style={styles.chevron}>⌄</Text>
        </Pressable>
      </View>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={styles.modalBackdrop}>
          <Pressable onPress={() => undefined} style={styles.choiceSheet}>
            <Text style={styles.sheetTitle}>{label}</Text>
            {searchable ? <TextInput autoFocus value={search} onChangeText={setSearch} placeholder={searchPlaceholder || "Buscar opção…"} placeholderTextColor={BRAND.muted} autoCapitalize="none" returnKeyType="search" selectionColor={BRAND.orange} style={[styles.input, { marginBottom: 12 }]} /> : null}
            <ScrollView style={{ maxHeight: 440 }} keyboardShouldPersistTaps="handled">
              {filteredOptions.map((item) => (
                <Pressable key={item.value} onPress={() => { onChange(item.value); setOpen(false); setSearch(""); }} style={styles.choiceOption}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.inputText, item.value === value ? { color: BRAND.orange } : null]}>{item.label}</Text>
                    {item.detail ? <Text style={styles.mutedSmall}>{item.detail}</Text> : null}
                  </View>
                  {item.value === value ? <Text style={{ color: BRAND.orange }}>✓</Text> : null}
                </Pressable>
              ))}
              {searchable && filteredOptions.length === 0 ? <Text style={styles.mutedSmall}>Nenhuma opção encontrada.</Text> : null}
            </ScrollView>
            <AppButton label="Fechar" variant="quiet" onPress={() => setOpen(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export function StatusPill({ label, tone = "teal" }: { label: string; tone?: "teal" | "orange" | "green" | "red" | "muted" }) {
  const color = tone === "orange" ? BRAND.orange : tone === "green" ? "#82C88D" : tone === "red" ? "#E8897F" : tone === "muted" ? BRAND.muted : BRAND.teal;
  return <View style={[styles.pill, { borderColor: `${color}55`, backgroundColor: `${color}18` }]}><Text style={[styles.pillText, { color }]}>{label}</Text></View>;
}

export function SectionHeading({ title, detail, action }: { title: string; detail?: string; action?: React.ReactNode }) {
  return <View style={styles.sectionHeading}><View style={{ flex: 1 }}><Text style={styles.sectionTitle}>{title}</Text>{detail ? <Text style={styles.mutedSmall}>{detail}</Text> : null}</View>{action}</View>;
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return <Panel style={{ alignItems: "center", paddingVertical: 28 }}><Text style={{ fontSize: 30, marginBottom: 10 }}>♡</Text><Text style={styles.cardTitle}>{title}</Text><Text style={[styles.bodyText, { textAlign: "center", marginTop: 6 }]}>{body}</Text></Panel>;
}

export function ErrorText({ message }: { message?: string | null }) {
  return message ? <Text style={styles.errorText}>{message}</Text> : null;
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 48, height: 48, borderRadius: 14, backgroundColor: BRAND.cream },
  brandName: { color: BRAND.cream, fontWeight: "900", letterSpacing: 1.4, fontSize: 14 },
  brandSub: { color: BRAND.orange, fontSize: 10, fontWeight: "800", letterSpacing: 1.1, marginTop: 3 },
  titleArea: { marginTop: 22, flexDirection: "row", alignItems: "center", gap: 10 },
  titleCopy: { flex: 1, minWidth: 0 },
  backButton: { minHeight: 38, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 2, borderRadius: 12, backgroundColor: BRAND.surfaceAlt, borderWidth: 1, borderColor: BRAND.border },
  backArrow: { color: BRAND.orange, fontSize: 23, lineHeight: 26, marginTop: -2 },
  backText: { color: BRAND.cream, fontSize: 11, fontWeight: "800" },
  backPressed: { opacity: 0.72 },
  eyebrow: { color: BRAND.teal, fontSize: 11, fontWeight: "800", letterSpacing: 1.6, marginBottom: 5 },
  title: { color: BRAND.cream, fontSize: 28, lineHeight: 34, fontWeight: "800", letterSpacing: -0.6 },
  panel: { backgroundColor: BRAND.surface, borderRadius: 20, borderWidth: 1, borderColor: BRAND.border, padding: 16 },
  button: { minHeight: 48, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 15, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  buttonText: { fontSize: 14, fontWeight: "800", textAlign: "center" },
  iconButton: { backgroundColor: BRAND.surfaceAlt, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  fieldWrap: { gap: 7, marginBottom: 14 },
  fieldLabel: { color: BRAND.muted, fontSize: 12, fontWeight: "700", letterSpacing: 0.3 },
  input: { minHeight: 48, borderRadius: 13, borderColor: BRAND.border, borderWidth: 1, backgroundColor: BRAND.background, color: BRAND.cream, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  multiline: { minHeight: 86, textAlignVertical: "top" },
  inputText: { color: BRAND.cream, fontSize: 15, fontWeight: "600" },
  choice: { minHeight: 48, backgroundColor: BRAND.background, borderColor: BRAND.border, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  chevron: { color: BRAND.orange, fontSize: 22, marginTop: -7 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.68)", justifyContent: "flex-end", padding: 12 },
  choiceSheet: { backgroundColor: BRAND.surface, borderRadius: 24, borderColor: BRAND.border, borderWidth: 1, padding: 18, paddingBottom: 24 },
  sheetTitle: { color: BRAND.cream, fontSize: 18, fontWeight: "800", marginBottom: 14 },
  choiceOption: { minHeight: 52, borderBottomWidth: 1, borderBottomColor: BRAND.border, flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 8 },
  mutedSmall: { color: BRAND.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  pill: { alignSelf: "flex-start", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  pillText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  sectionTitle: { color: BRAND.cream, fontSize: 17, fontWeight: "800" },
  cardTitle: { color: BRAND.cream, fontSize: 16, fontWeight: "800" },
  bodyText: { color: BRAND.muted, fontSize: 13, lineHeight: 19 },
  errorText: { color: "#F09489", fontSize: 13, lineHeight: 18, marginBottom: 12 },
});

export const uiStyles = styles;
