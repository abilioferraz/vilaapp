import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import DraggableFlatList from "react-native-draggable-flatlist";
import { AppButton, AppHeader, ChoiceField, EmptyState, ErrorText, Field, Panel, StatusPill, uiStyles } from "@/components/vila/ui";
import { FormSheet } from "@/components/vila/form-sheet";
import { BRAND, centsFromInput, money, SERVICE_CATEGORY_LABELS, SIZE_LABELS, type PetSize, type ServiceCategory } from "@/shared/vila";
import { trpc } from "@/lib/trpc";

type ServiceItem = { id: number; name: string; category: ServiceCategory; size: PetSize | null; priceCents: number; durationMinutes: number; active: number; sortOrder: number };

export default function ServicesScreen() {
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ServiceItem | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ServiceCategory>("bath");
  const [size, setSize] = useState<PetSize | "all">("all");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("60");
  const [error, setError] = useState("");
  const utils = trpc.useUtils();
  const services = trpc.vila.services.list.useQuery({ includeInactive: true });
  const save = trpc.vila.services.save.useMutation({ onSuccess: () => { void utils.vila.services.invalidate(); close(); } });
  const active = trpc.vila.services.setActive.useMutation({ onSuccess: () => void utils.vila.services.invalidate() });
  const reorder = trpc.vila.services.reorder.useMutation({ onSuccess: () => void utils.vila.services.invalidate(), onError: () => void utils.vila.services.invalidate() });

  function close() { setOpen(false); setEditing(null); setError(""); }
  function openNew() { setEditing(null); setName(""); setCategory("bath"); setSize("all"); setPrice(""); setDuration("60"); setError(""); setOpen(true); }
  function openEdit(item: ServiceItem) { setEditing(item); setName(item.name); setCategory(item.category); setSize(item.size || "all"); setPrice((item.priceCents / 100).toFixed(2).replace(".", ",")); setDuration(String(item.durationMinutes)); setError(""); setOpen(true); }
  function submit() {
    try {
      const priceCents = centsFromInput(price);
      const durationMinutes = Number(duration);
      if (!name.trim()) throw new Error("Informe o nome do serviço.");
      if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 720) throw new Error("A duração deve ser de 5 a 720 minutos.");
      save.mutate({ id: editing?.id, name: name.trim(), category, size: size === "all" ? null : size, priceCents, durationMinutes });
    } catch (e) { setError(e instanceof Error ? e.message : "Confira os dados do serviço."); }
  }
  function toggle(item: ServiceItem) {
    const next = item.active !== 1;
    const action = () => active.mutate({ id: item.id, active: next });
    if (typeof window !== "undefined" && typeof window.confirm === "function") {
      if (window.confirm(`${next ? "Ativar" : "Inativar"} o serviço “${item.name}”?`)) action();
    } else Alert.alert(`${next ? "Ativar" : "Inativar"} serviço`, item.name, [{ text: "Voltar", style: "cancel" }, { text: next ? "Ativar" : "Inativar", onPress: action }]);
  }
  function reorderServices(data: ServiceItem[]) {
    const ids = data.map((item) => item.id);
    const positions = new Map(ids.map((id, index) => [id, (index + 1) * 1000]));
    utils.vila.services.list.setData({ includeInactive: true }, (old) => old?.map((item) => ({ ...item, sortOrder: positions.get(item.id) ?? item.sortOrder })).sort((a, b) => b.active - a.active || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)));
    reorder.mutate({ ids });
  }

  const allItems = (services.data || []) as ServiceItem[];
  const filtered = allItems.filter((item) => (showInactive || item.active === 1) && `${item.name} ${SERVICE_CATEGORY_LABELS[item.category]}`.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR")));
  const canReorder = !showInactive && !search.trim() && !reorder.isPending;
  const listHeader = (
    <View>
      <AppHeader eyebrow="Cardápio de cuidado" title="Serviços da Vila" />
      <Panel style={styles.note}><Text style={styles.noteTitle}>Seu catálogo, seus valores.</Text><Text style={uiStyles.bodyText}>Cadastre as modalidades e defina preços e duração. Nenhum preço é preenchido por estimativa.</Text></Panel>
      <View style={styles.actionRow}>
        <View style={styles.headingCopy}><Text style={styles.sectionTitle}>Catálogo</Text><Text style={styles.mutedSmall}>{allItems.length} serviços cadastrados</Text></View>
        <AppButton label="+ Serviço" onPress={openNew} style={styles.addButton} />
      </View>
      <View style={styles.searchWrap}><Field label="Buscar serviço" value={search} onChangeText={setSearch} placeholder="Nome ou modalidade…" autoCapitalize="none" /></View>
      <Pressable onPress={() => setShowInactive((value) => !value)} style={styles.toggle}><View style={[styles.checkbox, showInactive && styles.checked]} /><Text style={styles.toggleText}>Mostrar serviços inativos</Text></Pressable>
      <Text style={styles.reorderHint}>{canReorder ? "Mantenha ≡ pressionado e arraste para reorganizar os serviços ativos." : "Para reorganizar, feche a busca e o filtro de inativos."}</Text>
    </View>
  );

  return (
    <View style={styles.page}>
      {services.isLoading ? <ActivityIndicator color={BRAND.orange} style={{ marginTop: 28 }} /> : services.error ? <Panel style={styles.errorPanel}><Text style={uiStyles.bodyText}>Não foi possível carregar o catálogo.</Text></Panel> : (
        <DraggableFlatList<ServiceItem>
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item, drag, isActive }) => (
            <Panel style={[styles.serviceCard, isActive && styles.dragging]}>
              <View style={styles.serviceTop}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Segure para reorganizar ${item.name}`} disabled={!canReorder} onLongPress={drag} delayLongPress={260} style={styles.dragHandle}><Text style={[styles.dragGlyph, !canReorder && styles.dragDisabled]}>≡</Text></Pressable>
                <View style={styles.serviceCopy}><Text style={styles.serviceName}>{item.name}</Text><Text style={styles.detail}>{SERVICE_CATEGORY_LABELS[item.category]}{item.size ? ` · ${SIZE_LABELS[item.size]}` : " · Todos os portes"} · {item.durationMinutes} min</Text></View>
                <StatusPill label={item.active ? "Ativo" : "Inativo"} tone={item.active ? "green" : "muted"} />
              </View>
              <View style={styles.serviceBottom}><Text style={styles.price}>{money(item.priceCents)}</Text><View style={styles.buttons}><Pressable accessibilityRole="button" onPress={() => openEdit(item)} style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}><Text style={styles.action}>Editar</Text></Pressable><Pressable accessibilityRole="button" onPress={() => toggle(item)} style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}><Text style={[styles.action, item.active ? styles.deactivate : null]}>{item.active ? "Inativar" : "Ativar"}</Text></Pressable></View></View>
            </Panel>
          )}
          onDragEnd={({ data }) => { if (canReorder) reorderServices(data); }}
          activationDistance={18}
          containerStyle={styles.list}
          contentContainerStyle={styles.content}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={<EmptyState title={search ? "Nenhum serviço encontrado" : "Catálogo vazio"} body={search ? "Tente buscar por outro nome ou modalidade." : "Inclua os serviços oferecidos pela Vila Caramelo e configure os valores e tempos de atendimento."} />}
          ListFooterComponent={<View style={{ height: 20 }} />}
        />
      )}
      <FormSheet visible={open} title={editing ? "Editar serviço" : "Novo serviço"} subtitle="Preço sempre configurável em reais" onClose={close}>
        <Field label="Nome do serviço *" value={name} onChangeText={setName} placeholder="Ex.: Banho Premium" autoCapitalize="words" />
        <ChoiceField label="Categoria" value={category} options={Object.entries(SERVICE_CATEGORY_LABELS).map(([value, label]) => ({ value: value as ServiceCategory, label }))} onChange={setCategory} />
        <ChoiceField label="Porte atendido" value={size} options={[{ value: "all", label: "Todos os portes" }, ...Object.entries(SIZE_LABELS).map(([value, label]) => ({ value: value as PetSize, label }))]} onChange={setSize} />
        <Field label="Preço (R$)" value={price} onChangeText={setPrice} placeholder="0,00" keyboardType="decimal-pad" />
        <Field label="Duração estimada (minutos)" value={duration} onChangeText={setDuration} keyboardType="number-pad" />
        <ErrorText message={error || save.error?.message} />
        <AppButton label={editing ? "Salvar alterações" : "Cadastrar serviço"} onPress={submit} loading={save.isPending} />
      </FormSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: BRAND.background }, list: { flex: 1 }, content: { paddingBottom: 30 },
  pressed: { opacity: 0.72 },
  note: { marginHorizontal: 20, marginBottom: 20, backgroundColor: "#25251F", borderColor: "#55452E" }, noteTitle: { color: BRAND.orange, fontWeight: "800", marginBottom: 6, fontSize: 14 },
  actionRow: { paddingLeft: 20, paddingRight: 28, flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }, headingCopy: { flex: 1, minWidth: 0 }, sectionTitle: { color: BRAND.cream, fontSize: 18, fontWeight: "800" }, mutedSmall: { color: BRAND.muted, fontSize: 11, marginTop: 3 }, addButton: { minWidth: 98, paddingHorizontal: 11, flexShrink: 0 },
  searchWrap: { marginHorizontal: 20, marginTop: 1 }, toggle: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 20, marginBottom: 5, minHeight: 28 }, checkbox: { width: 17, height: 17, borderRadius: 5, borderWidth: 1, borderColor: BRAND.muted }, checked: { backgroundColor: BRAND.orange, borderColor: BRAND.orange }, toggleText: { color: BRAND.muted, fontSize: 12 }, reorderHint: { color: BRAND.teal, fontSize: 11, lineHeight: 16, marginHorizontal: 20, marginBottom: 12 },
  serviceCard: { marginHorizontal: 20, marginBottom: 10, padding: 15 }, dragging: { borderColor: BRAND.orange, opacity: 0.92 }, serviceTop: { flexDirection: "row", alignItems: "center", gap: 10 }, dragHandle: { width: 30, height: 38, borderRadius: 9, justifyContent: "center", alignItems: "center", backgroundColor: BRAND.surfaceAlt }, dragGlyph: { color: BRAND.orange, fontSize: 22, fontWeight: "900" }, dragDisabled: { color: BRAND.muted, opacity: 0.55 }, serviceCopy: { flex: 1, minWidth: 0 }, serviceName: { color: BRAND.cream, fontWeight: "800", fontSize: 15 }, detail: { color: BRAND.muted, fontSize: 11, marginTop: 6 }, serviceBottom: { borderTopWidth: 1, borderTopColor: BRAND.border, marginTop: 12, paddingTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between", alignItems: "center" }, price: { color: BRAND.orange, fontSize: 17, fontWeight: "900", minWidth: 90 }, buttons: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, marginLeft: "auto", flexShrink: 1 }, actionButton: { minHeight: 40, minWidth: 68, justifyContent: "center", alignItems: "center", paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10, backgroundColor: "#252A26", borderWidth: 1, borderColor: BRAND.border }, action: { color: BRAND.teal, fontSize: 12, fontWeight: "800" }, deactivate: { color: "#E8897F" }, errorPanel: { margin: 20 },
});
