import { useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { AppButton, AppHeader, ChoiceField, EmptyState, ErrorText, Field, Panel, SectionHeading, uiStyles } from "@/components/vila/ui";
import { BRAND, centsFromInput, displayDate, money } from "@/shared/vila";
import { trpc } from "@/lib/trpc";

type Supplier = { id: number; name: string; address: string | null; phone: string | null; productType: string; active: number };
type PurchaseLine = { id: number; itemName: string; quantity: number; unitPriceCents: number; totalCents: number };
type Purchase = { id: number; supplierId: number; supplierName: string; purchaseDate: string; totalCents: number; createdAt: Date; items: PurchaseLine[] };
type DraftLine = { key: string; itemName: string; quantity: string; unitPrice: string };

function newRequestId() {
  const randomPart = Array.from({ length: 4 }, () => Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, "0")).join("");
  return `purchase-${Date.now().toString(36)}-${randomPart}`;
}

export default function OutgoingScreen() {
  const [supplierId, setSupplierId] = useState("");
  const [requestId, setRequestId] = useState(newRequestId);
  const [lines, setLines] = useState<DraftLine[]>([{ key: "line-1", itemName: "", quantity: "1", unitPrice: "" }]);
  const [error, setError] = useState("");
  const nextLine = useRef(2);
  const utils = trpc.useUtils();
  const suppliersQuery = trpc.vila.suppliers.list.useQuery({ includeInactive: false });
  const purchasesQuery = trpc.vila.purchases.list.useQuery(undefined);
  const create = trpc.vila.purchases.create.useMutation({
    onSuccess: () => {
      void utils.vila.purchases.list.invalidate();
      setSupplierId("");
      setLines([{ key: `line-${nextLine.current++}`, itemName: "", quantity: "1", unitPrice: "" }]);
      setRequestId(newRequestId());
      setError("");
    },
    onError: (e) => setError(e.message),
  });

  const suppliers = ((suppliersQuery.data || []) as Supplier[]).filter((supplier) => supplier.active === 1);
  const purchases = (purchasesQuery.data || []) as Purchase[];
  const supplierOptions = [{ value: "", label: "Selecione um fornecedor" }, ...suppliers.map((supplier) => ({ value: String(supplier.id), label: supplier.name, detail: supplier.productType }))];

  function changeLine(key: string, field: "itemName" | "quantity" | "unitPrice", value: string) {
    setLines((current) => current.map((line) => line.key === key ? { ...line, [field]: value } : line));
    setError("");
  }

  function addLine() {
    setLines((current) => [...current, { key: `line-${nextLine.current++}`, itemName: "", quantity: "1", unitPrice: "" }]);
  }

  function removeLine(key: string) {
    setLines((current) => current.filter((line) => line.key !== key));
    setError("");
  }

  function lineSubtotal(line: DraftLine) {
    const quantity = Number(line.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || !line.unitPrice.trim()) return 0;
    try { return quantity * centsFromInput(line.unitPrice); } catch { return 0; }
  }

  const totalCents = lines.reduce((sum, line) => sum + lineSubtotal(line), 0);

  function confirmPurchase() {
    setError("");
    const parsedSupplierId = Number(supplierId);
    if (!Number.isInteger(parsedSupplierId) || parsedSupplierId < 1 || !suppliers.some((supplier) => supplier.id === parsedSupplierId)) {
      setError("Selecione um fornecedor ativo.");
      return;
    }
    if (lines.length === 0) { setError("Adicione pelo menos um item à saída."); return; }
    let items: { itemName: string; quantity: number; unitPriceCents: number }[];
    try {
      items = lines.map((line, index) => {
        if (!line.itemName.trim()) throw new Error(`Informe a descrição do item ${index + 1}.`);
        const quantity = Number(line.quantity);
        if (!Number.isInteger(quantity) || quantity < 1) throw new Error(`A quantidade do item ${index + 1} deve ser um número inteiro a partir de 1.`);
        if (!line.unitPrice.trim()) throw new Error(`Informe o preço unitário do item ${index + 1}.`);
        const unitPriceCents = centsFromInput(line.unitPrice);
        if (!Number.isSafeInteger(unitPriceCents) || unitPriceCents <= 0) throw new Error(`O valor unitário do item ${index + 1} deve ser maior que zero.`);
        return { itemName: line.itemName.trim(), quantity, unitPriceCents };
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Confira os dados dos itens.");
      return;
    }

    const supplier = suppliers.find((item) => item.id === parsedSupplierId);
    if (!supplier) return;
    const execute = () => create.mutate({ requestId, supplierId: parsedSupplierId, items });
    const message = `Finalizar saída com ${supplier.name}?\n${items.length} ${items.length === 1 ? "item" : "itens"} · Total ${money(totalCents)}. Essa compra ficará no histórico como finalizada.`;
    if (typeof window !== "undefined" && typeof window.confirm === "function") {
      if (window.confirm(message)) execute();
    } else {
      Alert.alert("Finalizar saída", message, [
        { text: "Continuar editando", style: "cancel" },
        { text: "Finalizar compra", onPress: execute },
      ]);
    }
  }

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppHeader eyebrow="Compras da loja" title="Saídas" right={<View style={styles.headerRight}><View style={styles.count}><Text style={styles.countNumber}>{purchases.length}</Text><Text style={styles.countLabel}>FINALIZADAS</Text></View><Pressable accessibilityRole="button" onPress={() => router.push("/fornecedores")}><Text style={styles.supplierLink}>Fornecedores</Text></Pressable></View>} />
        <Panel style={styles.note}>
          <Text style={styles.noteTitle}>Registre uma compra</Text>
          <Text style={uiStyles.bodyText}>Informe os itens e valores. A compra só entra no histórico depois da confirmação e não pode ser editada nesta tela.</Text>
        </Panel>

        <SectionHeading title="Nova saída" detail="Adicione um ou mais itens da mesma compra." />
        <Panel style={styles.draftPanel}>
          {suppliersQuery.isLoading ? <ActivityIndicator color={BRAND.orange} style={{ marginVertical: 12 }} /> : suppliersQuery.error ? (
            <ErrorText message="Não foi possível carregar fornecedores ativos." />
          ) : suppliers.length === 0 ? (
            <><Text style={styles.warning}>Cadastre ou ative um fornecedor antes de registrar uma saída.</Text><AppButton label="Cadastrar fornecedor" variant="secondary" onPress={() => router.push("/fornecedores")} /></>
          ) : (
            <ChoiceField label="Fornecedor ativo *" value={supplierId} options={supplierOptions} onChange={setSupplierId} />
          )}

          <View style={styles.linesHeading}><Text style={styles.linesTitle}>Itens da compra</Text><Text style={styles.muted}>{lines.length} {lines.length === 1 ? "linha" : "linhas"}</Text></View>
          {lines.length === 0 ? <Text style={styles.emptyLines}>Nenhum item adicionado. Inclua uma linha para continuar.</Text> : lines.map((line, index) => (
            <View key={line.key} style={styles.lineCard}>
              <View style={styles.lineTitleRow}><Text style={styles.lineNumber}>ITEM {index + 1}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Remover item ${index + 1}`} onPress={() => removeLine(line.key)} hitSlop={8} style={styles.removeButton}><Text style={styles.removeText}>Remover</Text></Pressable></View>
              <Field label="Descrição *" value={line.itemName} onChangeText={(value) => changeLine(line.key, "itemName", value)} placeholder="Ex.: Shampoo neutro 5 L" accessibilityLabel={`Descrição do item ${index + 1}`} />
              <View style={styles.lineInputs}>
                <View style={styles.quantityField}><Field label="Quantidade *" value={line.quantity} onChangeText={(value) => changeLine(line.key, "quantity", value)} placeholder="1" keyboardType="number-pad" accessibilityLabel={`Quantidade inteira do item ${index + 1}`} /></View>
                <View style={styles.priceField}><Field label="Preço unitário (R$) *" value={line.unitPrice} onChangeText={(value) => changeLine(line.key, "unitPrice", value)} placeholder="0,00" keyboardType="decimal-pad" accessibilityLabel={`Preço unitário em reais do item ${index + 1}`} /></View>
              </View>
              <View style={styles.subtotalRow}><Text style={styles.subtotalLabel}>Subtotal</Text><Text style={styles.subtotalValue}>{money(lineSubtotal(line))}</Text></View>
            </View>
          ))}
          <AppButton label="+ Adicionar item" variant="secondary" onPress={addLine} style={styles.addLineButton} />
          <View style={styles.totalRow}><View><Text style={styles.totalLabel}>TOTAL DA SAÍDA</Text><Text style={styles.totalHint}>Calculado com os valores informados</Text></View><Text style={styles.totalValue}>{money(totalCents)}</Text></View>
          <ErrorText message={error || create.error?.message} />
          <AppButton label="Finalizar compra" onPress={confirmPurchase} loading={create.isPending} disabled={create.isPending || suppliers.length === 0 || suppliersQuery.isLoading} />
        </Panel>

        <View style={styles.historyHeading}><SectionHeading title="Histórico finalizado" detail="Compras registradas recentemente." /></View>
        {purchasesQuery.isLoading ? <ActivityIndicator color={BRAND.orange} style={{ marginTop: 18 }} /> : purchasesQuery.error ? (
          <Panel style={styles.errorPanel}><Text style={uiStyles.bodyText}>Não foi possível carregar o histórico de compras.</Text></Panel>
        ) : purchases.length === 0 ? (
          <EmptyState title="Nenhuma compra finalizada" body="As saídas confirmadas aparecerão aqui com fornecedor, data, itens e total." />
        ) : purchases.map((purchase) => (
          <Panel key={purchase.id} style={styles.purchaseCard}>
            <View style={styles.purchaseHeader}><View style={styles.purchaseCopy}><Text style={styles.supplierName}>{purchase.supplierName}</Text><Text style={styles.purchaseDate}>{displayDate(purchase.purchaseDate)}</Text></View><Text style={styles.purchaseTotal}>{money(purchase.totalCents)}</Text></View>
            <View style={styles.purchaseItems}>
              {purchase.items.map((item) => (
                <View key={item.id} style={styles.purchaseItem}>
                  <View style={styles.itemCopy}><Text style={styles.itemName}>{item.itemName}</Text><Text style={styles.itemDetail}>{item.quantity} × {money(item.unitPriceCents)}</Text></View>
                  <Text style={styles.itemTotal}>{money(item.totalCents)}</Text>
                </View>
              ))}
            </View>
          </Panel>
        ))}
        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: BRAND.background },
  content: { paddingBottom: 32 },
  count: { alignItems: "flex-end" },
  headerRight: { alignItems: "flex-end", gap: 4 },
  supplierLink: { color: BRAND.teal, fontSize: 10, fontWeight: "800" },
  countNumber: { color: BRAND.orange, fontWeight: "900", fontSize: 20 },
  countLabel: { color: BRAND.muted, fontWeight: "800", fontSize: 9, letterSpacing: 1 },
  note: { marginHorizontal: 20, marginBottom: 20, backgroundColor: "#25251F", borderColor: "#55452E" },
  noteTitle: { color: BRAND.orange, fontWeight: "800", marginBottom: 6, fontSize: 14 },
  draftPanel: { marginHorizontal: 20, marginBottom: 24, padding: 15 },
  warning: { color: BRAND.orange, fontSize: 13, lineHeight: 19, marginBottom: 14 },
  linesHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 1, marginBottom: 10 },
  linesTitle: { color: BRAND.cream, fontSize: 15, fontWeight: "800" },
  muted: { color: BRAND.muted, fontSize: 11 },
  lineCard: { backgroundColor: BRAND.background, borderColor: BRAND.border, borderWidth: 1, borderRadius: 15, padding: 12, marginBottom: 10 },
  lineTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 11 },
  lineNumber: { color: BRAND.teal, fontSize: 10, letterSpacing: 1, fontWeight: "900" },
  removeButton: { minHeight: 35, justifyContent: "center", paddingHorizontal: 10, borderRadius: 9, backgroundColor: "#302321" },
  removeText: { color: "#F09489", fontSize: 11, fontWeight: "800" },
  lineInputs: { flexDirection: "row", gap: 10 },
  quantityField: { width: 104, flexShrink: 0 },
  priceField: { flex: 1, minWidth: 0 },
  subtotalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: BRAND.border, paddingTop: 10 },
  subtotalLabel: { color: BRAND.muted, fontSize: 12 },
  subtotalValue: { color: BRAND.cream, fontSize: 14, fontWeight: "800" },
  emptyLines: { color: BRAND.muted, fontSize: 12, lineHeight: 18, paddingVertical: 8 },
  addLineButton: { marginTop: 2, marginBottom: 12 },
  totalRow: { borderTopWidth: 1, borderTopColor: BRAND.border, paddingTop: 13, marginTop: 1, marginBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  totalLabel: { color: BRAND.muted, fontSize: 10, letterSpacing: 1, fontWeight: "900" },
  totalHint: { color: BRAND.muted, fontSize: 10, marginTop: 4 },
  totalValue: { color: BRAND.orange, fontSize: 21, fontWeight: "900", flexShrink: 0 },
  historyHeading: { paddingHorizontal: 20 },
  purchaseCard: { marginHorizontal: 20, marginBottom: 11, padding: 15 },
  purchaseHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10, paddingBottom: 11, borderBottomWidth: 1, borderBottomColor: BRAND.border },
  purchaseCopy: { flex: 1, minWidth: 0 },
  supplierName: { color: BRAND.cream, fontSize: 15, fontWeight: "800" },
  purchaseDate: { color: BRAND.muted, fontSize: 11, marginTop: 4 },
  purchaseTotal: { color: BRAND.orange, fontSize: 16, fontWeight: "900", flexShrink: 0 },
  purchaseItems: { gap: 10, paddingTop: 11 },
  purchaseItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  itemCopy: { flex: 1, minWidth: 0 },
  itemName: { color: BRAND.cream, fontSize: 12, fontWeight: "700" },
  itemDetail: { color: BRAND.muted, fontSize: 11, marginTop: 3 },
  itemTotal: { color: BRAND.teal, fontSize: 12, fontWeight: "800", flexShrink: 0 },
  errorPanel: { marginHorizontal: 20 },
});
