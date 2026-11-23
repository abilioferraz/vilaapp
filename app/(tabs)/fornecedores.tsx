import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AppButton, AppHeader, EmptyState, ErrorText, Field, Panel, StatusPill, uiStyles } from "@/components/vila/ui";
import { FormSheet } from "@/components/vila/form-sheet";
import { BRAND } from "@/shared/vila";
import { trpc } from "@/lib/trpc";

type Supplier = { id: number; name: string; address: string | null; phone: string | null; productType: string; active: number };

export default function SuppliersScreen() {
  const [includeInactive, setIncludeInactive] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [productType, setProductType] = useState("");
  const [error, setError] = useState("");
  const utils = trpc.useUtils();
  const suppliersQuery = trpc.vila.suppliers.list.useQuery({ includeInactive: true });
  const refresh = () => void utils.vila.suppliers.list.invalidate();
  const create = trpc.vila.suppliers.create.useMutation({ onSuccess: () => { refresh(); closeForm(); }, onError: (e) => setError(e.message) });
  const update = trpc.vila.suppliers.update.useMutation({ onSuccess: () => { refresh(); closeForm(); }, onError: (e) => setError(e.message) });

  const suppliers = (suppliersQuery.data || []) as Supplier[];
  const visibleSuppliers = suppliers.filter((supplier) => includeInactive || supplier.active === 1);

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
    setError("");
  }

  function openNew() {
    setEditing(null);
    setName("");
    setAddress("");
    setPhone("");
    setProductType("");
    setError("");
    setFormOpen(true);
  }

  function openEdit(supplier: Supplier) {
    setEditing(supplier);
    setName(supplier.name);
    setAddress(supplier.address || "");
    setPhone(supplier.phone || "");
    setProductType(supplier.productType);
    setError("");
    setFormOpen(true);
  }

  function saveSupplier() {
    setError("");
    if (!name.trim()) { setError("Informe o nome do fornecedor."); return; }
    if (!productType.trim()) { setError("Informe o tipo de produto."); return; }
    const details = { name: name.trim(), address: address.trim() || null, phone: phone.trim() || null, productType: productType.trim() };
    if (editing) update.mutate({ id: editing.id, ...details, active: editing.active === 1 ? 1 : 0 });
    else create.mutate(details);
  }

  function toggleActive(supplier: Supplier) {
    const nextActive = supplier.active === 1 ? 0 : 1;
    const action = () => update.mutate({ id: supplier.id, name: supplier.name, address: supplier.address, phone: supplier.phone, productType: supplier.productType, active: nextActive });
    const verb = nextActive ? "Ativar" : "Inativar";
    if (typeof window !== "undefined" && typeof window.confirm === "function") {
      if (window.confirm(`${verb} ${supplier.name}? As compras antigas serão preservadas.`)) action();
    } else {
      Alert.alert(`${verb} fornecedor`, `${supplier.name}. As compras antigas serão preservadas.`, [
        { text: "Voltar", style: "cancel" },
        { text: verb, onPress: action },
      ]);
    }
  }

  const saving = create.isPending || update.isPending;

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppHeader eyebrow="Compras e parceiros" title="Fornecedores" right={<View style={styles.count}><Text style={styles.countNumber}>{suppliers.length}</Text><Text style={styles.countLabel}>CADASTRADOS</Text></View>} />
        <Panel style={styles.note}>
          <Text style={styles.noteTitle}>Parceiros da Vila</Text>
          <Text style={uiStyles.bodyText}>Cadastre quem fornece os produtos usados no dia a dia. Inativar um fornecedor não apaga as compras já registradas.</Text>
        </Panel>
        <View style={styles.actionRow}>
          <View style={styles.headingCopy}><Text style={styles.sectionTitle}>Sua lista</Text><Text style={styles.mutedSmall}>{visibleSuppliers.length} {visibleSuppliers.length === 1 ? "fornecedor exibido" : "fornecedores exibidos"}</Text></View>
          <AppButton label="+ Fornecedor" onPress={openNew} style={styles.addButton} />
        </View>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: includeInactive }} onPress={() => setIncludeInactive((value) => !value)} style={styles.toggle}>
          <View style={[styles.checkbox, includeInactive && styles.checked]}><Text style={styles.checkmark}>{includeInactive ? "✓" : ""}</Text></View>
          <Text style={styles.toggleText}>Mostrar fornecedores inativos</Text>
        </Pressable>

        {suppliersQuery.isLoading ? <ActivityIndicator color={BRAND.orange} style={{ marginTop: 24 }} /> : suppliersQuery.error ? (
          <Panel style={styles.errorPanel}><Text style={uiStyles.bodyText}>Não foi possível carregar os fornecedores. Verifique a conexão e tente novamente.</Text></Panel>
        ) : visibleSuppliers.length === 0 ? (
          <EmptyState title={includeInactive ? "Nenhum fornecedor cadastrado" : "Sua lista começa aqui"} body={includeInactive ? "Cadastre um fornecedor para organizar suas compras." : "Cadastre seus fornecedores para registrar as saídas da loja."} />
        ) : visibleSuppliers.map((supplier) => (
          <Panel key={supplier.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{supplier.name.trim().slice(0, 1).toLocaleUpperCase("pt-BR")}</Text></View>
              <View style={styles.supplierCopy}><Text style={styles.name}>{supplier.name}</Text><Text style={styles.productType}>{supplier.productType}</Text></View>
              <StatusPill label={supplier.active === 1 ? "Ativo" : "Inativo"} tone={supplier.active === 1 ? "green" : "muted"} />
            </View>
            {supplier.phone ? <Text style={styles.contact}>{supplier.phone}</Text> : null}
            {supplier.address ? <Text style={styles.contact}>{supplier.address}</Text> : null}
            <View style={styles.cardActions}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Editar fornecedor ${supplier.name}`} onPress={() => openEdit(supplier)} style={styles.actionButton}><Text style={styles.editText}>Editar dados</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`${supplier.active === 1 ? "Inativar" : "Ativar"} fornecedor ${supplier.name}`} onPress={() => toggleActive(supplier)} style={styles.actionButton}><Text style={[styles.actionText, supplier.active === 1 && styles.deactivate]}>{supplier.active === 1 ? "Inativar" : "Ativar"}</Text></Pressable>
            </View>
          </Panel>
        ))}
      </ScrollView>

      <FormSheet visible={formOpen} title={editing ? "Editar fornecedor" : "Novo fornecedor"} subtitle="Os dados podem ser atualizados sem alterar compras antigas." onClose={closeForm}>
        <Field label="Nome do fornecedor *" value={name} onChangeText={setName} placeholder="Ex.: Distribuidora Central" autoCapitalize="words" accessibilityLabel="Nome do fornecedor, obrigatório" />
        <Field label="Tipo de produto *" value={productType} onChangeText={setProductType} placeholder="Ex.: shampoo e cosméticos" autoCapitalize="sentences" accessibilityLabel="Tipo de produto, obrigatório" />
        <Field label="Telefone / WhatsApp" value={phone} onChangeText={setPhone} placeholder="(19) 99999-9999" keyboardType="phone-pad" accessibilityLabel="Telefone ou WhatsApp do fornecedor" />
        <Field label="Endereço" value={address} onChangeText={setAddress} placeholder="Rua, número, bairro" autoCapitalize="words" accessibilityLabel="Endereço do fornecedor" />
        <ErrorText message={error || create.error?.message || update.error?.message} />
        <AppButton label={editing ? "Salvar alterações" : "Cadastrar fornecedor"} onPress={saveSupplier} loading={saving} />
      </FormSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: BRAND.background },
  content: { paddingBottom: 32 },
  count: { alignItems: "flex-end" },
  countNumber: { color: BRAND.orange, fontWeight: "900", fontSize: 20 },
  countLabel: { color: BRAND.muted, fontWeight: "800", fontSize: 9, letterSpacing: 1 },
  note: { marginHorizontal: 20, marginBottom: 18, backgroundColor: "#25251F", borderColor: "#55452E" },
  noteTitle: { color: BRAND.orange, fontWeight: "800", marginBottom: 6, fontSize: 14 },
  actionRow: { paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  headingCopy: { flex: 1, minWidth: 0 },
  sectionTitle: { color: BRAND.cream, fontSize: 18, fontWeight: "800" },
  mutedSmall: { color: BRAND.muted, fontSize: 11, marginTop: 3 },
  addButton: { minWidth: 112, maxWidth: 150, paddingHorizontal: 10, flexShrink: 1 },
  toggle: { flexDirection: "row", alignItems: "center", gap: 9, minHeight: 42, paddingHorizontal: 20, marginBottom: 8 },
  checkbox: { width: 19, height: 19, borderRadius: 5, borderWidth: 1, borderColor: BRAND.muted, alignItems: "center", justifyContent: "center" },
  checked: { backgroundColor: BRAND.orange, borderColor: BRAND.orange },
  checkmark: { color: BRAND.background, fontSize: 13, fontWeight: "900", lineHeight: 16 },
  toggleText: { color: BRAND.muted, fontSize: 12 },
  card: { marginHorizontal: 20, marginBottom: 11, padding: 15 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 42, height: 42, borderRadius: 15, backgroundColor: "#533B25", alignItems: "center", justifyContent: "center" },
  avatarText: { color: BRAND.orange, fontWeight: "900", fontSize: 17 },
  supplierCopy: { flex: 1, minWidth: 0 },
  name: { color: BRAND.cream, fontWeight: "800", fontSize: 15 },
  productType: { color: BRAND.teal, fontSize: 12, marginTop: 4 },
  contact: { color: BRAND.muted, fontSize: 12, lineHeight: 17, marginTop: 7, marginLeft: 52 },
  cardActions: { flexDirection: "row", justifyContent: "flex-end", flexWrap: "wrap", gap: 8, marginTop: 12, borderTopWidth: 1, borderTopColor: BRAND.border, paddingTop: 10 },
  actionButton: { minHeight: 40, minWidth: 90, justifyContent: "center", alignItems: "center", paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10, backgroundColor: BRAND.surfaceAlt, borderWidth: 1, borderColor: BRAND.border },
  editText: { color: BRAND.teal, fontSize: 12, fontWeight: "800" },
  actionText: { color: BRAND.teal, fontSize: 12, fontWeight: "800" },
  deactivate: { color: "#E8897F" },
  errorPanel: { marginHorizontal: 20 },
});
