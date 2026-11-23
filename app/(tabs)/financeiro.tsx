import { useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { ReceivedPaymentSheet } from "@/components/vila/received-payment-sheet";
import { AppButton, AppHeader, EmptyState, Panel, SectionHeading, StatusPill, uiStyles } from "@/components/vila/ui";
import { BRAND, centsFromInput, displayDate, money, paymentAdjustment, periodEnd, periodStart, replacePackageReceiptState, type PaymentMethod, PAYMENT_METHOD_LABELS } from "@/shared/vila";
import { trpc } from "@/lib/trpc";
import { exportStoreData } from "@/lib/vila-integrations";

type PaidMethod = Exclude<PaymentMethod, "package">;
type PaymentEditTarget = {
  id: number;
  sourceType: "service" | "package" | "hotel";
  amountCents: number;
  method: PaidMethod;
  description: string;
  expectedAmountCents: number | null;
  packageId: number | null;
  packagePriceCents: number | null;
  packageReceivedCents: number | null;
};
type PendingReceivable = {
  sourceType: "service" | "package" | "hotel";
  id: number;
  description: string;
  clientName: string;
  petName: string;
  dueAmountCents: number;
  expectedAmountCents: number;
  method: PaidMethod | null;
  reference: string;
  sortAt: string;
};

const paymentMethods: PaidMethod[] = ["pix", "cash", "card"];

function toAmountInput(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function newFinanceRequestId() {
  return `fin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 16)}`;
}

function paymentDateLabel(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Data não disponível";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function confirmFinanceEdit(title: string, message: string, confirmLabel: string): Promise<boolean> {
  if (typeof window !== "undefined" && typeof window.confirm === "function") {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
      { text: confirmLabel, onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

export default function FinanceScreen() {
  const [month, setMonth] = useState(periodStart());
  const [activeSection, setActiveSection] = useState<"overview" | "pending">("overview");
  const [pendingView, setPendingView] = useState<"open" | "excluded">("open");
  const [editingPayment, setEditingPayment] = useState<PaymentEditTarget | null>(null);
  const [pendingTarget, setPendingTarget] = useState<PendingReceivable | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [pendingAmount, setPendingAmount] = useState("");
  const [editMethod, setEditMethod] = useState<PaidMethod>("pix");
  const [pendingMethod, setPendingMethod] = useState<PaidMethod>("pix");
  const [editError, setEditError] = useState("");
  const [pendingError, setPendingError] = useState("");
  const [pendingActionError, setPendingActionError] = useState("");
  const [editNotice, setEditNotice] = useState("");
  const [pendingNotice, setPendingNotice] = useState("");
  const [pendingRequestId, setPendingRequestId] = useState("");
  const pendingReceiptLock = useRef(false);
  const current = useMemo(() => { const [y, m] = month.split("-").map(Number); return new Date(y, m - 1, 1); }, [month]);
  const from = periodStart(current);
  const to = periodEnd(current);
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(current);
  const report = trpc.vila.finance.overview.useQuery({ from, to });
  const pending = trpc.vila.finance.pending.useQuery();
  const pendingItems = pending.data?.items ?? [];
  const excludedPendingItems = pending.data?.excludedItems ?? [];
  const visiblePendingItems = pendingView === "open" ? pendingItems : excludedPendingItems;
  const storeExport = trpc.vila.export.all.useQuery(undefined, { enabled: false });
  const utils = trpc.useUtils();
  const invalidateFinanceViews = () => {
    void utils.vila.finance.overview.invalidate();
    void utils.vila.finance.pending.invalidate();
    void utils.vila.appointments.invalidate();
    void utils.vila.packages.invalidate();
    void utils.vila.hotel.list.invalidate();
    void utils.vila.dashboard.summary.invalidate();
  };
  const updatePayment = trpc.vila.finance.updatePayment.useMutation({
    onSuccess: invalidateFinanceViews,
  });
  const receiveAppointment = trpc.vila.appointments.setPayment.useMutation({ onSuccess: invalidateFinanceViews });
  const receivePackage = trpc.vila.packages.markPaid.useMutation({ onSuccess: invalidateFinanceViews });
  const checkOutHotel = trpc.vila.hotel.checkOut.useMutation({ onSuccess: invalidateFinanceViews });
  const excludePendingMutation = trpc.vila.finance.excludePending.useMutation({ onSuccess: () => { void utils.vila.finance.pending.invalidate(); } });
  const restorePendingMutation = trpc.vila.finance.restorePending.useMutation({ onSuccess: () => { void utils.vila.finance.pending.invalidate(); } });
  const go = (delta: number) => { const next = new Date(current.getFullYear(), current.getMonth() + delta, 1); setMonth(periodStart(next)); };
  const exportCsv = async () => {
    try { const result = await storeExport.refetch(); if (!result.data) throw new Error("Não foi possível preparar o arquivo."); await exportStoreData(result.data); }
    catch (error) { Alert.alert("Não foi possível exportar", error instanceof Error ? error.message : "Tente novamente."); }
  };
  const total = report.data?.totalCents ?? 0;
  const service = report.data?.serviceRevenueCents ?? 0;
  const packages = report.data?.packageRevenueCents ?? 0;
  const expenses = report.data?.expensesCents ?? 0;
  const net = report.data?.netCents ?? total - expenses;
  const methods = report.data?.methods;
  const maxMethod = Math.max(...paymentMethods.map((method) => methods?.[method] ?? 0), 1);
  const maxService = Math.max(...Object.values(report.data?.perService || {}), 1);

  const openPaymentEdit = (item: PaymentEditTarget) => {
    setEditingPayment(item);
    setEditAmount(toAmountInput(item.amountCents));
    setEditMethod(item.method);
    setEditError("");
    setEditNotice("");
    updatePayment.reset();
  };

  const openPendingPayment = (item: PendingReceivable) => {
    setPendingTarget(item);
    setPendingAmount(toAmountInput(item.dueAmountCents));
    setPendingMethod(item.method || "pix");
    setPendingRequestId(item.sourceType === "package" ? newFinanceRequestId() : "");
    setPendingError("");
    setPendingNotice("");
    receiveAppointment.reset();
    receivePackage.reset();
    checkOutHotel.reset();
  };

  const excludePendingItem = async (item: PendingReceivable) => {
    setPendingActionError("");
    const confirmed = await confirmFinanceEdit("Excluir pendência?", `“${item.description}” de ${item.clientName} será removido apenas desta lista. O agendamento, pacote/hospedagem e o histórico financeiro não serão apagados. Você pode restaurar em Excluídos.`, "Excluir pendência");
    if (!confirmed) return;
    try {
      await excludePendingMutation.mutateAsync({ sourceType: item.sourceType, sourceId: item.id });
      setPendingView("open");
      setPendingNotice("Pendência excluída desta lista. O cadastro e o histórico financeiro foram preservados.");
    } catch (error) {
      setPendingActionError(error instanceof Error ? error.message : "Não foi possível excluir esta pendência.");
    }
  };

  const restorePendingItem = async (item: PendingReceivable) => {
    setPendingActionError("");
    try {
      await restorePendingMutation.mutateAsync({ sourceType: item.sourceType, sourceId: item.id });
      setPendingView("open");
      setPendingNotice(`Pendência de ${item.petName} restaurada à lista de pagamentos em aberto.`);
    } catch (error) {
      setPendingActionError(error instanceof Error ? error.message : "Não foi possível restaurar esta pendência.");
    }
  };

  const savePendingPayment = async () => {
    const target = pendingTarget;
    if (!target || pendingReceiptLock.current) return;
    pendingReceiptLock.current = true;
    setPendingError("");
    try {
      const amountCents = centsFromInput(pendingAmount);
      if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error("Informe um valor recebido maior que zero.");
      if (target.sourceType === "package" && amountCents > target.dueAmountCents) {
        throw new Error(`O valor não pode ultrapassar o saldo em aberto de ${money(target.dueAmountCents)}.`);
      }
      if (target.sourceType !== "package" && amountCents < target.expectedAmountCents) {
        const differenceCents = target.expectedAmountCents - amountCents;
        const title = target.sourceType === "hotel" ? "Confirmar desconto e checkout" : "Confirmar desconto";
        const action = target.sourceType === "hotel" ? "O checkout será finalizado" : "O atendimento será considerado pago";
        const message = `Valor previsto: ${money(target.expectedAmountCents)}. Valor recebido: ${money(amountCents)}. Diferença: ${money(differenceCents)}. ${action} e o Financeiro registrará exatamente o valor recebido. Deseja confirmar?`;
        if (!await confirmFinanceEdit(title, message, "Confirmar")) return;
      }

      if (target.sourceType === "service") {
        await receiveAppointment.mutateAsync({ id: target.id, paymentStatus: "paid", paymentMethod: pendingMethod, amountCents });
        setPendingNotice(`Recebimento de ${target.petName} registrado. Agenda e Financeiro atualizados.`);
      } else if (target.sourceType === "package") {
        await receivePackage.mutateAsync({ id: target.id, amountCents, method: pendingMethod, requestId: pendingRequestId });
        const remainingCents = Math.max(0, target.dueAmountCents - amountCents);
        setPendingNotice(remainingCents ? `Recebimento registrado. Saldo restante do pacote: ${money(remainingCents)}.` : `Pacote de ${target.petName} quitado. Pacotes e Financeiro atualizados.`);
      } else {
        await checkOutHotel.mutateAsync({ id: target.id, amountCents, method: pendingMethod });
        setPendingNotice(`Recebimento registrado e checkout de ${target.petName} concluído. Hospedagem e Financeiro atualizados.`);
      }
      setPendingTarget(null);
      setPendingRequestId("");
    } catch (error) {
      setPendingError(error instanceof Error ? error.message : "Não foi possível registrar este recebimento.");
    } finally {
      pendingReceiptLock.current = false;
    }
  };

  const savePaymentEdit = async () => {
    const target = editingPayment;
    if (!target) return;
    try {
      const amountCents = centsFromInput(editAmount);
      if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error("Informe um valor recebido maior que zero.");
      if (amountCents === target.amountCents && editMethod === target.method) throw new Error("Nenhuma alteração foi informada.");

      let title: string;
      let message: string;
      let confirmLabel: string;
      if (target.sourceType === "package") {
        if (target.packagePriceCents === null || target.packageReceivedCents === null || target.packageId === null) {
          throw new Error("Não foi possível calcular o saldo atual deste pacote. Atualize o Financeiro e tente novamente.");
        }
        const nextState = replacePackageReceiptState(target.packagePriceCents, target.packageReceivedCents, target.amountCents, amountCents);
        title = "Confirmar ajuste do pacote";
        confirmLabel = "Confirmar edição";
        message = `O recebimento existente será atualizado, sem criar outra receita. Total recebido após o ajuste: ${money(nextState.receivedCents)}. ${nextState.openBalanceCents > 0 ? `Saldo em aberto: ${money(nextState.openBalanceCents)}.` : "O pacote ficará quitado."} A data original do pagamento será mantida.`;
      } else {
        const expectedAmountCents = target.expectedAmountCents;
        if (expectedAmountCents === null) throw new Error("O valor previsto deste atendimento não está disponível para confirmar a edição.");
        const isDiscount = amountCents < expectedAmountCents;
        title = isDiscount ? "Confirmar desconto" : "Confirmar edição do pagamento";
        confirmLabel = isDiscount ? "Confirmar desconto" : "Confirmar edição";
        message = isDiscount
          ? `O novo valor recebido ficará ${money(expectedAmountCents - amountCents)} abaixo do valor previsto de ${money(expectedAmountCents)}. O Financeiro passará a contabilizar ${money(amountCents)} nesta mesma transação. A data original será mantida.`
          : `O lançamento existente será corrigido de ${money(target.amountCents)} para ${money(amountCents)} nesta mesma transação, sem duplicar receita. A data original será mantida.`;
      }

      if (!await confirmFinanceEdit(title, message, confirmLabel)) return;
      await updatePayment.mutateAsync({ paymentId: target.id, amountCents, method: editMethod });
      setEditingPayment(null);
      setEditError("");
      setEditNotice("Pagamento atualizado. O Financeiro e o saldo do pacote foram recalculados.");
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Não foi possível atualizar este pagamento.");
    }
  };

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <AppHeader eyebrow="Visão de caixa" title="Financeiro" right={<Pressable onPress={exportCsv} disabled={storeExport.isPending}><Text style={styles.export}>{storeExport.isPending ? "Preparando…" : "Exportar CSV ↓"}</Text></Pressable>} />
        <View style={styles.managementActions}>
          <Pressable accessibilityRole="button" onPress={() => router.push("/saidas")} style={styles.managementButton}><Text style={styles.managementButtonText}>+ Registrar saída</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push("/fornecedores")} style={styles.managementButton}><Text style={styles.managementSecondaryText}>Fornecedores</Text></Pressable>
        </View>
        <View style={styles.financeTabs}>
          <Pressable accessibilityRole="button" onPress={() => setActiveSection("overview")} style={[styles.financeTab, activeSection === "overview" && styles.financeTabActive]}><Text style={[styles.financeTabText, activeSection === "overview" && styles.financeTabTextActive]}>Visão geral</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => setActiveSection("pending")} style={[styles.financeTab, activeSection === "pending" && styles.financeTabActive]}><View style={styles.pendingTabLabel}><Text style={[styles.financeTabText, activeSection === "pending" && styles.financeTabTextActive]}>Pagamentos pendentes</Text><View style={styles.pendingCountBadge}><Text style={styles.pendingCountText}>{pending.isLoading ? "…" : pendingItems.length}</Text></View></View></Pressable>
        </View>
        {activeSection === "pending" ? <View style={styles.section}>
          {pendingNotice ? <Panel style={styles.editNotice}><Text style={styles.editNoticeText}>{pendingNotice}</Text></Panel> : null}
          <SectionHeading title={pendingView === "open" ? "Recebimentos em aberto" : "Pendências excluídas"} detail={pendingView === "open" ? "Atendimentos concluídos, saldos de pacotes e hospedagens aguardando checkout." : "Itens removidos apenas da lista; restaure se precisar recebê-los."} />
          <View style={styles.pendingViewTabs}>
            <Pressable accessibilityRole="button" onPress={() => setPendingView("open")} style={[styles.pendingViewTab, pendingView === "open" && styles.pendingViewTabActive]}><Text style={[styles.pendingViewTabText, pendingView === "open" && styles.pendingViewTabTextActive]}>Em aberto ({pendingItems.length})</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => setPendingView("excluded")} style={[styles.pendingViewTab, pendingView === "excluded" && styles.pendingViewTabActive]}><Text style={[styles.pendingViewTabText, pendingView === "excluded" && styles.pendingViewTabTextActive]}>Excluídos ({excludedPendingItems.length})</Text></Pressable>
          </View>
          {pendingActionError ? <Panel style={styles.pendingActionError}><Text style={styles.pendingActionErrorText}>{pendingActionError}</Text></Panel> : null}
          {pending.isLoading ? <ActivityIndicator color={BRAND.orange} style={{ marginTop: 24 }} /> : pending.error ? <Panel><Text style={uiStyles.bodyText}>Não foi possível carregar os pagamentos pendentes.</Text><AppButton label="Tentar novamente" variant="secondary" onPress={() => void pending.refetch()} style={{ marginTop: 12 }} /></Panel> : visiblePendingItems.length ? visiblePendingItems.map((item) => {
            const sourceLabel = item.sourceType === "service" ? "Atendimento" : item.sourceType === "package" ? "Pacote" : "Hospedagem";
            const sourceTone = item.sourceType === "package" || item.sourceType === "hotel" ? "teal" as const : "orange" as const;
            return <Panel key={`${item.sourceType}-${item.id}`} style={styles.paymentRow}>
              <View style={styles.paymentHeader}><View style={styles.paymentInfo}><Text style={styles.paymentName}>{item.description}</Text><Text style={styles.paymentDate}>{item.reference}</Text></View><StatusPill label={sourceLabel} tone={sourceTone} /></View>
              <Text style={styles.paymentParty}>Tutor: {item.clientName} · Pet: {item.petName}</Text>
              <View style={styles.pendingAmountRow}><Text style={styles.pendingAmountLabel}>Saldo em aberto</Text><Text style={styles.pendingAmountValue}>{money(item.dueAmountCents)}</Text></View>
              {item.sourceType === "package" ? <Text style={styles.paymentDetail}>Valor total do pacote: {money(item.expectedAmountCents)} · Aceita recebimento parcial.</Text> : null}
              {pendingView === "open" ? <>
                <AppButton label={item.sourceType === "hotel" ? "Receber e concluir checkout" : "Registrar recebimento"} onPress={() => openPendingPayment(item)} loading={receiveAppointment.isPending || receivePackage.isPending || checkOutHotel.isPending} style={{ marginTop: 12 }} />
                <Pressable accessibilityRole="button" accessibilityLabel={`Excluir pendência ${item.description}`} disabled={excludePendingMutation.isPending} onPress={() => void excludePendingItem(item)} style={styles.excludePendingButton}><Text style={styles.excludePendingText}>{excludePendingMutation.isPending ? "Excluindo…" : "Excluir pendência"}</Text></Pressable>
              </> : <AppButton label="Restaurar pendência" variant="secondary" onPress={() => void restorePendingItem(item)} loading={restorePendingMutation.isPending} style={{ marginTop: 12 }} />}
            </Panel>;
          }) : <EmptyState title={pendingView === "open" ? "Tudo em dia" : "Nenhuma pendência excluída"} body={pendingView === "open" ? "Não há recebimentos pendentes de atendimentos concluídos, pacotes ou hospedagens." : "Pendências excluídas aparecerão aqui e poderão ser restauradas."} />}
        </View> : null}
        {activeSection === "overview" ? <>
        <View style={styles.monthSwitch}>
          <Pressable onPress={() => go(-1)} style={styles.arrow}><Text style={styles.arrowText}>‹</Text></Pressable>
          <View style={{ alignItems: "center" }}><Text style={styles.monthLabel}>{label}</Text><Text style={styles.monthRange}>{displayDate(from)} — {displayDate(to)}</Text></View>
          <Pressable onPress={() => go(1)} style={styles.arrow}><Text style={styles.arrowText}>›</Text></Pressable>
        </View>
        {report.isLoading ? <ActivityIndicator color={BRAND.orange} style={{ marginTop: 32 }} /> : report.error ? <Panel><Text style={uiStyles.bodyText}>Não foi possível carregar os pagamentos. Tente novamente quando houver conexão.</Text></Panel> : (
          <>
            <Panel style={styles.totalCard}><Text style={styles.kicker}>RECEITAS RECEBIDAS NO PERÍODO</Text><Text style={styles.total}>{money(total)}</Text><Text style={styles.totalNote}>Somente pagamentos registrados/concluídos</Text></Panel>
            <View style={styles.metrics}>
              <Panel style={[styles.metric, { borderColor: "#E67E2240" }]}><Text style={styles.metricMark}>●</Text><Text style={styles.metricLabel}>Serviços avulsos</Text><Text style={styles.metricValue}>{money(service)}</Text></Panel>
              <Panel style={[styles.metric, { borderColor: "#80C8BE40" }]}><Text style={[styles.metricMark, { color: BRAND.teal }]}>●</Text><Text style={styles.metricLabel}>Venda de pacotes</Text><Text style={styles.metricValue}>{money(packages)}</Text></Panel>
            </View>
            <Panel style={styles.cashflowPanel}>
              <View style={styles.cashflowRow}><View><Text style={styles.cashflowLabel}>Hospedagem recebida</Text><Text style={styles.cashflowHint}>Check-outs concluídos no mês</Text></View><Text style={styles.hotelRevenueValue}>{money(report.data?.hotelRevenueCents ?? 0)}</Text></View>
              <View style={styles.cashflowDivider} />
              <View style={styles.cashflowRow}><View><Text style={styles.cashflowLabel}>Saídas registradas</Text><Text style={styles.cashflowHint}>Compras finalizadas no mês</Text></View><Text style={styles.expenseValue}>− {money(expenses)}</Text></View>
              <View style={styles.cashflowDivider} />
              <View style={styles.cashflowRow}><View><Text style={styles.cashflowLabel}>Resultado líquido</Text><Text style={styles.cashflowHint}>Receitas recebidas menos saídas</Text></View><Text style={[styles.netValue, net < 0 && styles.negativeValue]}>{money(net)}</Text></View>
            </Panel>
            <Panel style={styles.ticket}><View><Text style={styles.ticketLabel}>Ticket médio por pagamento</Text><Text style={styles.ticketSub}>Serviços, pacotes e hospedagens pagos</Text></View><Text style={styles.ticketValue}>{money(report.data?.ticketAverageCents || 0)}</Text></Panel>
            <View style={styles.section}>
              <SectionHeading title="Por forma de pagamento" detail="Total líquido de pagamentos concluídos" />
              {paymentMethods.map((method) => { const value = methods?.[method] || 0; return <View key={method} style={styles.barBlock}><View style={styles.barLabelRow}><Text style={styles.barLabel}>{PAYMENT_METHOD_LABELS[method]}</Text><Text style={styles.barValue}>{money(value)}</Text></View><View style={styles.track}><View style={[styles.fill, { width: `${Math.max(value / maxMethod * 100, value ? 4 : 0)}%`, backgroundColor: method === "pix" ? BRAND.teal : method === "cash" ? "#D4B078" : BRAND.orange }]} /></View></View>; })}
            </View>
            <View style={styles.section}>
              <SectionHeading title="Receita por serviço" />
              {Object.entries(report.data?.perService || {}).length ? Object.entries(report.data?.perService || {}).sort((a, b) => b[1] - a[1]).map(([name, value]) => <View key={name} style={styles.serviceRow}><View style={{ flex: 1 }}><Text style={styles.barLabel}>{name}</Text><View style={styles.track}><View style={[styles.fill, { width: `${Math.max(value / maxService * 100, 5)}%` }]} /></View></View><Text style={styles.barValue}>{money(value)}</Text></View>) : <Text style={styles.muted}>Sem receitas avulsas neste mês.</Text>}
            </View>
            <View style={styles.section}>
              <SectionHeading title="Histórico de pagamentos" detail={`${report.data?.lines.length ?? 0} lançamentos no mês`} />
              {editNotice ? <Panel style={styles.editNotice}><Text style={styles.editNoticeText}>{editNotice}</Text></Panel> : null}
              {report.data?.lines.length ? report.data.lines.map((item) => {
                const adjustment = item.expectedAmountCents === null ? null : paymentAdjustment(item.expectedAmountCents, item.amountCents);
                return <Panel key={item.id} style={styles.paymentRow}>
                  <View style={styles.paymentHeader}>
                    <View style={styles.paymentInfo}><Text style={styles.paymentName}>{item.description}</Text><Text style={styles.paymentDate}>{paymentDateLabel(item.paidAt)} · {PAYMENT_METHOD_LABELS[item.method]}</Text></View>
                    <View style={styles.receivedValue}><Text style={styles.receivedLabel}>RECEBIDO</Text><Text style={styles.paymentAmount}>{money(item.amountCents)}</Text></View>
                  </View>
                  <Text style={styles.paymentParty}>Tutor: {item.clientName} · Pet: {item.petName}</Text>
                  {item.sourceType !== "package" && item.expectedAmountCents !== null ? <>
                    <Text style={styles.paymentDetail}>Valor cobrado: {money(item.expectedAmountCents)}</Text>
                    <Text style={[styles.paymentDetail, adjustment?.type === "discount" ? styles.discountText : adjustment?.type === "surcharge" ? styles.surchargeText : styles.noAdjustmentText]}>{adjustment?.type === "discount" ? `Desconto: ${money(adjustment.amountCents)}` : adjustment?.type === "surcharge" ? `Acréscimo: ${money(adjustment.amountCents)}` : "Sem desconto ou acréscimo"}</Text>
                  </> : item.sourceType === "package" ? <>
                    <Text style={styles.paymentDetail}>Parcela recebida · Total do pacote: {money(item.packagePriceCents)}</Text>
                    <Text style={styles.paymentDetail}>Recebido no pacote: {money(item.packageReceivedCents)}{item.packagePriceCents !== null && item.packageReceivedCents !== null ? ` · Saldo: ${money(Math.max(0, item.packagePriceCents - item.packageReceivedCents))}` : ""}</Text>
                  </> : <Text style={styles.paymentDetail}>Valor efetivamente recebido: {money(item.amountCents)}</Text>}
                  <View style={styles.paymentActions}>
                    <StatusPill label={item.sourceType === "package" ? "Pacote" : item.sourceType === "hotel" ? "Hospedagem" : "Serviço"} tone={item.sourceType === "package" || item.sourceType === "hotel" ? "teal" : "orange"} />
                    <Pressable accessibilityRole="button" accessibilityLabel={`Editar pagamento ${item.description}`} style={styles.editButton} onPress={() => openPaymentEdit(item)}><Text style={styles.editButtonText}>Editar</Text></Pressable>
                  </View>
                </Panel>;
              }) : <EmptyState title="Sem pagamentos neste mês" body="O extrato será atualizado quando os pagamentos forem registrados no app." />}
            </View>
            <View style={styles.section}>
              <SectionHeading title="Histórico de saídas" detail={`${report.data?.expenses.length ?? 0} compras finalizadas no mês`} />
              {report.data?.expenses.length ? report.data.expenses.map((purchase) => <Panel key={`purchase-${purchase.id}`} style={styles.expenseCard}>
                <View style={styles.expenseHeader}><View style={styles.paymentInfo}><Text style={styles.paymentName}>{purchase.supplierName}</Text><Text style={styles.paymentDate}>{displayDate(purchase.purchaseDate)} · {purchase.items.length} {purchase.items.length === 1 ? "item" : "itens"}</Text></View><Text style={styles.expenseCardTotal}>− {money(purchase.totalCents)}</Text></View>
                {purchase.items.map((item) => <View key={item.id} style={styles.expenseItem}><Text style={styles.expenseItemName}>{item.itemName} · {item.quantity} × {money(item.unitPriceCents)}</Text><Text style={styles.expenseItemValue}>{money(item.totalCents)}</Text></View>)}
              </Panel>) : <EmptyState title="Sem saídas neste mês" body="As compras finalizadas em Saídas aparecerão aqui, separadas das receitas." />}
            </View>
          </>
        )}
        <Panel style={styles.exportNote}><Text style={styles.noteTitle}>Google Drive / Sheets</Text><Text style={uiStyles.bodyText}>A exportação gera um CSV no aparelho para você compartilhar e abrir no Drive ou Sheets. Sincronização automática ainda depende de uma planilha e conta Google indicadas.</Text><AppButton label="Exportar todos os dados" variant="secondary" onPress={exportCsv} loading={storeExport.isPending} style={{ marginTop: 14 }} /></Panel>
        </> : null}
      </ScrollView>
      <ReceivedPaymentSheet
        visible={editingPayment !== null}
        title="Editar pagamento do histórico"
        subtitle={editingPayment?.sourceType === "package"
          ? `${editingPayment.description} · total do pacote ${money(editingPayment.packagePriceCents)} · recebido ${money(editingPayment.packageReceivedCents)}. A data original será preservada.`
          : editingPayment ? `${editingPayment.description} · previsto ${money(editingPayment.expectedAmountCents)} · lançado ${money(editingPayment.amountCents)}. A data original será preservada.` : "Edite o valor recebido e a forma de pagamento."}
        amount={editAmount}
        onAmountChange={setEditAmount}
        method={editMethod}
        onMethodChange={setEditMethod}
        error={editError || updatePayment.error?.message}
        loading={updatePayment.isPending}
        buttonLabel="Salvar alteração"
        onSubmit={() => void savePaymentEdit()}
        onClose={() => { setEditingPayment(null); setEditError(""); }}
      />
      <ReceivedPaymentSheet
        visible={pendingTarget !== null}
        title={pendingTarget?.sourceType === "hotel" ? "Receber hospedagem" : "Registrar recebimento pendente"}
        subtitle={pendingTarget ? `${pendingTarget.description} · ${pendingTarget.clientName} · ${pendingTarget.petName} · em aberto ${money(pendingTarget.dueAmountCents)}${pendingTarget.sourceType === "package" ? ". Você pode registrar uma parte do saldo." : ". Informe o valor efetivamente recebido."}` : "Informe o valor recebido."}
        amount={pendingAmount}
        onAmountChange={setPendingAmount}
        method={pendingMethod}
        onMethodChange={setPendingMethod}
        error={pendingError || receiveAppointment.error?.message || receivePackage.error?.message || checkOutHotel.error?.message}
        loading={receiveAppointment.isPending || receivePackage.isPending || checkOutHotel.isPending}
        buttonLabel={pendingTarget?.sourceType === "hotel" ? "Confirmar recebimento e checkout" : "Confirmar recebimento"}
        onSubmit={() => void savePendingPayment()}
        onClose={() => { setPendingTarget(null); setPendingError(""); setPendingRequestId(""); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: BRAND.background },
  content: { paddingBottom: 32 },
  export: { color: BRAND.teal, fontSize: 12, fontWeight: "800", marginTop: 12 },
  managementActions: { flexDirection: "row", gap: 8, marginHorizontal: 20, marginBottom: 14 },
  financeTabs: { flexDirection: "row", gap: 6, padding: 4, marginHorizontal: 20, marginBottom: 12, borderRadius: 14, backgroundColor: BRAND.surface },
  pendingViewTabs: { flexDirection: "row", gap: 6, marginBottom: 14, padding: 3, borderRadius: 12, backgroundColor: BRAND.surface },
  pendingViewTab: { flex: 1, minHeight: 36, justifyContent: "center", alignItems: "center", paddingHorizontal: 5, borderRadius: 9 },
  pendingViewTabActive: { backgroundColor: BRAND.surfaceAlt },
  pendingViewTabText: { color: BRAND.muted, fontSize: 11, fontWeight: "700", textAlign: "center" },
  pendingViewTabTextActive: { color: BRAND.cream },
  financeTab: { flex: 1, minHeight: 42, justifyContent: "center", alignItems: "center", paddingHorizontal: 6, borderRadius: 11 },
  financeTabActive: { backgroundColor: BRAND.green },
  financeTabText: { color: BRAND.muted, fontSize: 11, fontWeight: "700", textAlign: "center" },
  financeTabTextActive: { color: BRAND.cream },
  pendingTabLabel: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  pendingCountBadge: { minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: BRAND.orange, alignItems: "center", justifyContent: "center" },
  pendingCountText: { color: BRAND.background, fontSize: 10, fontWeight: "900" },
  managementButton: { flex: 1, minHeight: 42, justifyContent: "center", alignItems: "center", paddingHorizontal: 9, borderRadius: 12, backgroundColor: BRAND.surfaceAlt, borderWidth: 1, borderColor: BRAND.border },
  managementButtonText: { color: BRAND.orange, fontSize: 12, fontWeight: "800" },
  managementSecondaryText: { color: BRAND.teal, fontSize: 12, fontWeight: "800" },
  monthSwitch: { marginHorizontal: 20, padding: 10, borderRadius: 17, backgroundColor: BRAND.surface, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  arrow: { width: 38, height: 38, borderRadius: 12, backgroundColor: BRAND.surfaceAlt, alignItems: "center", justifyContent: "center" },
  arrowText: { color: BRAND.orange, fontSize: 24, lineHeight: 27 },
  monthLabel: { color: BRAND.cream, fontWeight: "800", fontSize: 16, textTransform: "capitalize" },
  monthRange: { color: BRAND.muted, fontSize: 10, marginTop: 4 },
  totalCard: { marginHorizontal: 20, padding: 20, backgroundColor: "#25251F", borderColor: "#55452E" },
  kicker: { color: BRAND.orange, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  total: { color: BRAND.cream, fontSize: 32, fontWeight: "900", marginTop: 10 },
  totalNote: { color: BRAND.muted, fontSize: 11, marginTop: 7 },
  metrics: { flexDirection: "row", gap: 10, marginHorizontal: 20, marginTop: 10 },
  metric: { flex: 1, padding: 13 },
  metricMark: { color: BRAND.orange, fontSize: 13 },
  metricLabel: { color: BRAND.muted, fontSize: 11, marginTop: 8 },
  metricValue: { color: BRAND.cream, fontSize: 15, fontWeight: "800", marginTop: 5 },
  cashflowPanel: { marginHorizontal: 20, marginTop: 10, padding: 15 },
  cashflowRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  cashflowLabel: { color: BRAND.cream, fontSize: 13, fontWeight: "800" },
  cashflowHint: { color: BRAND.muted, fontSize: 10, marginTop: 4 },
  expenseValue: { color: "#F09489", fontWeight: "900", fontSize: 15 },
  hotelRevenueValue: { color: BRAND.teal, fontWeight: "900", fontSize: 15 },
  netValue: { color: BRAND.teal, fontWeight: "900", fontSize: 16 },
  negativeValue: { color: "#F09489" },
  cashflowDivider: { height: 1, backgroundColor: BRAND.border, marginVertical: 12 },
  ticket: { marginHorizontal: 20, marginTop: 10, padding: 15, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  ticketLabel: { color: BRAND.cream, fontWeight: "800", fontSize: 13 },
  ticketSub: { color: BRAND.muted, fontSize: 10, marginTop: 4 },
  ticketValue: { color: BRAND.orange, fontWeight: "900", fontSize: 18 },
  section: { paddingHorizontal: 20, marginTop: 24 },
  barBlock: { marginBottom: 12 },
  barLabelRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  barLabel: { color: BRAND.cream, fontSize: 12, fontWeight: "700" },
  barValue: { color: BRAND.teal, fontSize: 12, fontWeight: "800" },
  track: { height: 6, backgroundColor: BRAND.surfaceAlt, borderRadius: 10, overflow: "hidden", marginTop: 6 },
  fill: { height: "100%", borderRadius: 10, backgroundColor: BRAND.orange },
  serviceRow: { flexDirection: "row", gap: 12, alignItems: "center", marginBottom: 12 },
  muted: { color: BRAND.muted, fontSize: 12 },
  paymentRow: { padding: 13, marginBottom: 8 },
  paymentHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  paymentInfo: { flex: 1, minWidth: 0 },
  paymentName: { color: BRAND.cream, fontWeight: "800", fontSize: 13 },
  paymentDate: { color: BRAND.muted, fontSize: 10, marginTop: 5 },
  receivedValue: { alignItems: "flex-end", flexShrink: 0 },
  receivedLabel: { color: BRAND.teal, fontSize: 9, fontWeight: "900", letterSpacing: 0.7 },
  paymentAmount: { color: BRAND.cream, fontWeight: "800", fontSize: 13 },
  paymentParty: { color: BRAND.cream, fontSize: 11, fontWeight: "700", marginTop: 12 },
  paymentDetail: { color: BRAND.muted, fontSize: 11, lineHeight: 16, marginTop: 5 },
  discountText: { color: "#F09489", fontWeight: "800" },
  surchargeText: { color: BRAND.teal, fontWeight: "800" },
  noAdjustmentText: { color: BRAND.muted },
  paymentActions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8, marginTop: 11 },
  pendingAmountRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: BRAND.border },
  pendingAmountLabel: { color: BRAND.muted, fontSize: 12, fontWeight: "700" },
  pendingAmountValue: { color: BRAND.orange, fontSize: 15, fontWeight: "900" },
  excludePendingButton: { alignSelf: "center", marginTop: 8, paddingVertical: 9, paddingHorizontal: 12 },
  excludePendingText: { color: "#F09489", fontSize: 11, fontWeight: "800" },
  pendingActionError: { marginBottom: 10, borderColor: "#F09489" },
  pendingActionErrorText: { color: "#F09489", fontSize: 12, fontWeight: "700" },
  expenseCard: { padding: 13, marginBottom: 8 },
  expenseHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: BRAND.border },
  expenseCardTotal: { color: "#F09489", fontWeight: "900", fontSize: 14, flexShrink: 0 },
  expenseItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingTop: 9 },
  expenseItemName: { color: BRAND.muted, fontSize: 11, flex: 1 },
  expenseItemValue: { color: BRAND.cream, fontSize: 11, fontWeight: "700" },
  editButton: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 10, backgroundColor: BRAND.surfaceAlt, borderWidth: 1, borderColor: BRAND.border },
  editButtonText: { color: BRAND.teal, fontWeight: "800", fontSize: 11 },
  editNotice: { marginBottom: 10, borderColor: BRAND.teal, backgroundColor: BRAND.surfaceAlt },
  editNoticeText: { color: BRAND.teal, fontSize: 12, fontWeight: "700" },
  exportNote: { marginHorizontal: 20, marginTop: 24, backgroundColor: "#25251F", borderColor: "#55452E" },
  noteTitle: { color: BRAND.orange, fontWeight: "800", fontSize: 14, marginBottom: 7 },
});
