import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BRAND } from "@/shared/vila";
import { AppButton } from "@/components/vila/ui";

export function FormSheet({
  visible,
  title,
  subtitle,
  children,
  onClose,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingTop: Math.max(10, insets.top + 10), paddingBottom: Math.max(18, insets.bottom + 14) }]}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <View style={{ flex: 1 }}><Text style={styles.title}>{title}</Text>{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}</View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close}><Text style={styles.closeText}>×</Text></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>{children}</ScrollView>
          <AppButton label="Fechar" variant="quiet" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.68)", justifyContent: "flex-end" },
  sheet: { maxHeight: "94%", backgroundColor: BRAND.background, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderColor: BRAND.border, borderWidth: 1, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 18 },
  grabber: { width: 42, height: 4, borderRadius: 4, backgroundColor: BRAND.border, alignSelf: "center", marginBottom: 16 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 16 },
  title: { color: BRAND.cream, fontSize: 20, lineHeight: 26, fontWeight: "800" },
  subtitle: { color: BRAND.muted, fontSize: 12, marginTop: 4, lineHeight: 17 },
  close: { width: 34, height: 34, borderRadius: 12, backgroundColor: BRAND.surface, alignItems: "center", justifyContent: "center" },
  closeText: { color: BRAND.cream, fontSize: 24, lineHeight: 25 },
  content: { paddingBottom: 12 },
});
