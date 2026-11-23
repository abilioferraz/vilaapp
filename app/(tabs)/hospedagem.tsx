import { useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { AppButton, AppHeader, ChoiceField, EmptyState, ErrorText, Field, Panel, SectionHeading, StatusPill, uiStyles } from "@/components/vila/ui";
import { FormSheet } from "@/components/vila/form-sheet";
import { ReceivedPaymentSheet } from "@/components/vila/received-payment-sheet";
import { DateTimeField } from "@/components/vila/date-time-field";
import { trpc } from "@/lib/trpc";
import { deleteCalendarEvent, findOrCreateHotelCalendarEvent, requestWritableCalendars, updateHotelCalendarEvent } from "@/lib/vila-integrations";
import type * as Calendar from "expo-calendar/legacy";
import { BRAND, centsFromInput, calculateHotelStayNights, calculateHotelStayTotalCents, dateInput, money, PAYMENT_METHOD_LABELS, SIZE_LABELS, type PaymentMethod, type PetSize } from "@/shared/vila";

type PaidMethod = Exclude<PaymentMethod, "package">;
type Stay = { id: number; clientId: number; petId: number; petSize: PetSize; checkInDate: string; checkOutDate: string; dailyRateCents: number; totalCents: number; status: "reserved" | "checked_in" | "completed"; clientName: string; petName: string; receivedAmountCents: number | null; paymentMethod: PaidMethod | null; calendarId: string | null; calendarEventId: string | null };

const sizeOptions = (Object.entries(SIZE_LABELS) as [PetSize, string][]).map(([value, label]) => ({ value, label }));

function tomorrowDate() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return dateInput(tomorrow);
}

function formatStayDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(year, month - 1, day));
}

function parseRate(value: string) {
  try { return centsFromInput(value); } catch { return 0; }
}

function formatRateInput(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function confirmHotelDiscount(expectedCents: number, receivedCents: number): Promise<boolean> {
  const differenceCents = expectedCents - receivedCents;
  const message = `Total da hospedagem: ${money(expectedCents)}. Valor recebido: ${money(receivedCents)}. Desconto: ${money(differenceCents)}. O Financeiro registrará exatamente o valor recebido. Deseja confirmar?`;
  if (typeof window !== "undefined" && typeof window.confirm === "function") return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => {
    Alert.alert("Confirmar desconto", message, [
      { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
      { text: "OK", onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

function confirmStayRemoval(stay: Stay): Promise<boolean> {
  const message = `Excluir a hospedagem de ${stay.petName}? A reserva será removida da lista, o recebimento será invalidado no Financeiro caso o checkout já tenha ocorrido e o evento Google vinculado será removido.`;
  if (typeof window !== "undefined" && typeof window.confirm === "function") return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => {
    Alert.alert("Excluir hospedagem", message, [
      { text: "Manter", style: "cancel", onPress: () => resolve(false) },
      { text: "Excluir", style: "destructive", onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

export default function HospedagemScreen() {
  const [formOpen, setFormOpen] = useState(false);
  const [editingStay, setEditingStay] = useState<Stay | null>(null);
  const [clientId, setClientId] = useState("");
  const [petId, setPetId] = useState("");
  const [petSize, setPetSize] = useState<PetSize>("medium");
  const [checkInDate, setCheckInDate] = useState(dateInput());
  const [checkOutDate, setCheckOutDate] = useState(tomorrowDate());
  const [dailyRate, setDailyRate] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [checkoutTarget, setCheckoutTarget] = useState<Stay | null>(null);
  const [receivedAmount, setReceivedAmount] = useState("");
  const [receivedMethod, setReceivedMethod] = useState<PaidMethod>("pix");
  const [checkoutError, setCheckoutError] = useState("");
  const [calendars, setCalendars] = useState<Calendar.Calendar[]>([]);
  const [calendarId, setCalendarId] = useState("");
  const [calendarSetupError, setCalendarSetupError] = useState("");
  const [calendarSetupLoading, setCalendarSetupLoading] = useState(false);
  const [calendarSyncingId, setCalendarSyncingId] = useState<number | null>(null);
  const calendarSyncLock = useRef(false);
  const utils = trpc.useUtils();
  const clients = trpc.vila.clients.list.useQuery({});
  const stays = trpc.vila.hotel.list.useQuery();
  const createStay = trpc.vila.hotel.create.useMutation({ onSuccess: () => { void utils.vila.hotel.list.invalidate(); } });
  const updateStay = trpc.vila.hotel.update.useMutation({ onSuccess: () => { void utils.vila.hotel.list.invalidate(); void utils.vila.finance.overview.invalidate(); void utils.vila.finance.pending.invalidate(); } });
  const deleteStay = trpc.vila.hotel.delete.useMutation({ onSuccess: () => { void utils.vila.hotel.list.invalidate(); void utils.vila.finance.overview.invalidate(); void utils.vila.finance.pending.invalidate(); void utils.vila.dashboard.summary.invalidate(); } });
  const linkCalendar = trpc.vila.hotel.setCalendarEvent.useMutation({ onSuccess: () => { void utils.vila.hotel.list.invalidate(); } });
  const checkIn = trpc.vila.hotel.checkIn.useMutation({
    onSuccess: () => { void utils.vila.hotel.list.invalidate(); void utils.vila.finance.pending.invalidate(); setNotice("Check-in registrado."); },
    onError: (error) => Alert.alert("Não foi possível registrar o check-in", error.message),
  });
  const checkOut = trpc.vila.hotel.checkOut.useMutation({
    onSuccess: () => { void utils.vila.hotel.list.invalidate(); void utils.vila.finance.overview.invalidate(); void utils.vila.finance.pending.invalidate(); void utils.vila.dashboard.summary.invalidate(); },
  });
  const clientRows = clients.data || [];
  const clientOptions = clientRows.map((client) => ({ value: String(client.id), label: client.name, detail: client.phone || "Tutor" }));
  const selectedClient = clientRows.find((client) => client.id === Number(clientId));
  const selectedPet = selectedClient?.pets.find((pet) => pet.id === Number(petId));
  const petOptions = (selectedClient?.pets || []).filter((pet) => pet.active === 1).map((pet) => ({ value: String(pet.id), label: pet.name, detail: SIZE_LABELS[pet.size] }));
  const calendarOptions = calendars.map((calendar) => ({ value: calendar.id, label: calendar.title || "Google Agenda", detail: calendar.ownerAccount || calendar.source?.name || "Conta Google" }));
  const rateCents = parseRate(dailyRate);
  const nights = calculateHotelStayNights(checkInDate, checkOutDate);
  const totalCents = useMemo(() => {
    if (nights < 1 || rateCents < 1) return 0;
    try { return calculateHotelStayTotalCents(rateCents, nights); } catch { return 0; }
  }, [nights, rateCents]);
  const dateError = nights < 1 ? "O checkout precisa ser posterior ao check-in e incluir pelo menos uma diária." : "";

  async function openNewStay() {
    if (calendarSetupLoading) return;
    setEditingStay(null);
    setClientId(""); setPetId(""); setPetSize("medium"); setCheckInDate(dateInput()); setCheckOutDate(tomorrowDate()); setDailyRate(""); setFormError(""); setNotice(""); setCalendars([]); setCalendarId(""); setCalendarSetupError(""); setCalendarSetupLoading(true);
    try {
      const available = await requestWritableCalendars();
      setCalendars(available);
      setCalendarId((available.find((item) => item.isPrimary) || available[0]).id);
    } catch (error) {
      setCalendarSetupError(error instanceof Error ? error.message : "Não foi possível localizar uma agenda Google. A hospedagem ainda poderá ser salva e sincronizada depois.");
    } finally {
      setCalendarSetupLoading(false);
      setFormOpen(true);
    }
  }

  function openEditStay(stay: Stay) {
    setEditingStay(stay);
    setClientId(String(stay.clientId));
    setPetId(String(stay.petId));
    setPetSize(stay.petSize);
    setCheckInDate(stay.checkInDate);
    setCheckOutDate(stay.checkOutDate);
    setDailyRate(formatRateInput(stay.dailyRateCents));
    setFormError("");
    setCalendars([]);
    setCalendarId(stay.calendarId || "");
    setCalendarSetupError("");
    updateStay.reset();
    setFormOpen(true);
  }

  async function syncStayToCalendar(stay: Stay, availableCalendars?: Calendar.Calendar[], preferredCalendarId?: string) {
    if (calendarSyncLock.current) return;
    calendarSyncLock.current = true;
    setCalendarSyncingId(stay.id);
    const details = {
      stayId: stay.id,
      title: `${stay.clientName} - ${stay.petName} · Hospedagem`,
      notes: `Hospedagem Vila Caramelo\nTutor: ${stay.clientName}\nPet: ${stay.petName}\nPorte: ${SIZE_LABELS[stay.petSize]}\nCheck-in: ${formatStayDate(stay.checkInDate)}\nCheckout: ${formatStayDate(stay.checkOutDate)}`,
      checkInDate: stay.checkInDate,
      checkOutDate: stay.checkOutDate,
    };
    try {
      if (stay.calendarEventId && stay.calendarId) {
        try {
          await updateHotelCalendarEvent(stay.calendarId, stay.calendarEventId, details);
          setNotice(`Hospedagem de ${stay.petName} atualizada no Google Agenda.`);
          return;
        } catch {
          // O evento pode ter sido removido fora do app; localize-o pelo marcador persistente ou recrie-o.
        }
      }
      const writableCalendars = availableCalendars?.length ? availableCalendars : await requestWritableCalendars();
      const preferred = preferredCalendarId || stay.calendarId || calendarId || (writableCalendars.find((item) => item.isPrimary) || writableCalendars[0]).id;
      const event = await findOrCreateHotelCalendarEvent(writableCalendars, preferred, details);
      await updateHotelCalendarEvent(event.calendarId, event.eventId, details);
      await linkCalendar.mutateAsync({ id: stay.id, calendarId: event.calendarId, eventId: event.eventId, ...(stay.calendarEventId ? { expectedEventId: stay.calendarEventId } : {}) });
      setNotice(`Hospedagem de ${stay.petName} sincronizada no Google Agenda.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível sincronizar com o Google Agenda.";
      setNotice(`A hospedagem de ${stay.petName} continua salva; sincronização pendente. ${message} Tente novamente pelo botão do cartão.`);
    } finally {
      calendarSyncLock.current = false;
      setCalendarSyncingId(null);
    }
  }

  async function saveStay() {
    setFormError("");
    try {
      const cents = centsFromInput(dailyRate);
      if (!clientId || !petId) throw new Error("Selecione o tutor e o pet.");
      if (!Number.isSafeInteger(cents) || cents < 1 || cents > 100_000_000) throw new Error("Informe um valor diário válido.");
      if (nights < 1) throw new Error(dateError);
      const values = { clientId: Number(clientId), petId: Number(petId), petSize, checkInDate, checkOutDate, dailyRateCents: cents };
      if (editingStay) {
        const result = await updateStay.mutateAsync({ id: editingStay.id, ...values });
        const updatedStay: Stay = { ...editingStay, ...values, totalCents: result.totalCents, clientName: selectedClient?.name || editingStay.clientName, petName: selectedPet?.name || editingStay.petName };
        setFormOpen(false);
        setEditingStay(null);
        await syncStayToCalendar(updatedStay, calendars, calendarId);
        return;
      }
      const result = await createStay.mutateAsync(values);
      setFormOpen(false);
      const savedStay: Stay = { id: result.id, ...values, totalCents: result.totalCents, status: "reserved", clientName: selectedClient?.name || "Tutor", petName: selectedPet?.name || "Pet", receivedAmountCents: null, paymentMethod: null, calendarId: null, calendarEventId: null };
      if (calendars.length) await syncStayToCalendar(savedStay, calendars, calendarId);
      else setNotice(`Hospedagem registrada. A sincronização Google ficou pendente: ${calendarSetupError || "nenhuma agenda Google foi selecionada"}. Use “Tentar sincronizar” no cartão.`);
    } catch (error) { setFormError(error instanceof Error ? error.message : "Não foi possível salvar a hospedagem."); }
  }

  async function removeStay(stay: Stay) {
    if (!await confirmStayRemoval(stay)) return;
    let calendarEventRemoved = false;
    try {
      if (stay.calendarEventId) {
        await deleteCalendarEvent(stay.calendarEventId);
        calendarEventRemoved = true;
      }
      await deleteStay.mutateAsync({ id: stay.id, expectedEventId: stay.calendarEventId });
      setNotice(`Hospedagem de ${stay.petName} excluída${stay.receivedAmountCents !== null ? "; o recebimento foi invalidado no Financeiro" : ""}.`);
    } catch (error) {
      setNotice(`Não foi possível concluir a exclusão. A hospedagem permanece salva. ${error instanceof Error ? error.message : "Tente novamente."}`);
      if (calendarEventRemoved) void syncStayToCalendar(stay);
    }
  }

  function openCheckout(stay: Stay) {
    setCheckoutTarget(stay);
    setReceivedAmount((stay.totalCents / 100).toFixed(2).replace(".", ","));
    setReceivedMethod(stay.paymentMethod || "pix");
    setCheckoutError("");
    checkOut.reset();
  }

  async function submitCheckout() {
    const stay = checkoutTarget;
    if (!stay) return;
    setCheckoutError("");
    try {
      const amountCents = centsFromInput(receivedAmount);
      if (!Number.isSafeInteger(amountCents) || amountCents < 1) throw new Error("Informe um valor recebido maior que zero.");
      if (amountCents < stay.totalCents && !await confirmHotelDiscount(stay.totalCents, amountCents)) return;
      await checkOut.mutateAsync({ id: stay.id, amountCents, method: receivedMethod });
      setCheckoutTarget(null);
      setNotice(`Checkout de ${stay.petName} concluído. Recebido: ${money(amountCents)}.`);
    } catch (error) { setCheckoutError(error instanceof Error ? error.message : "Não foi possível finalizar o checkout."); }
  }

  const statusInfo = (stay: Stay) => stay.status === "reserved"
    ? { label: "Reservada", tone: "teal" as const }
    : stay.status === "checked_in"
      ? { label: "Hospedada", tone: "orange" as const }
      : { label: "Checkout concluído", tone: "green" as const };

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppHeader eyebrow="Hotel Vila Caramelo" title="Hospedagem" right={<Text style={styles.headerMark}>HOTEL</Text>} />
        <Panel style={styles.intro}>
          <Text style={styles.introTitle}>Uma estadia tranquila, bem cuidada.</Text>
          <Text style={uiStyles.bodyText}>Reserve por pet, acompanhe check-in e registre o valor recebido no checkout.</Text>
        </Panel>
        {notice ? <Panel style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></Panel> : null}
        <View style={styles.newStayButton}><AppButton label="+ Nova hospedagem" onPress={() => void openNewStay()} loading={calendarSetupLoading} /></View>
        <View style={styles.listSection}>
          <SectionHeading title="Estadias" detail={`${stays.data?.length ?? 0} ${stays.data?.length === 1 ? "registro" : "registros"}`} />
          {stays.isLoading || clients.isLoading ? <ActivityIndicator color={BRAND.orange} style={{ marginVertical: 24 }} /> : stays.error ? <Panel><Text style={uiStyles.bodyText}>Não foi possível carregar as hospedagens. Tente novamente.</Text></Panel> : stays.data?.length ? stays.data.map((raw) => {
            const stay = raw as Stay;
            const status = statusInfo(stay);
            const stayNights = calculateHotelStayNights(stay.checkInDate, stay.checkOutDate);
            return <Panel key={stay.id} style={styles.stayCard}>
              <View style={styles.stayHeader}><View style={{ flex: 1 }}><Text style={styles.petName}>{stay.petName}</Text><Text style={styles.tutorName}>Tutor: {stay.clientName}</Text></View><StatusPill label={status.label} tone={status.tone} /></View>
              <View style={styles.dateRow}><Text style={styles.dateLabel}>Check-in</Text><Text style={styles.dateValue}>{formatStayDate(stay.checkInDate)}</Text><Text style={styles.dateLabel}>Checkout</Text><Text style={styles.dateValue}>{formatStayDate(stay.checkOutDate)}</Text></View>
              <Text style={styles.meta}>{SIZE_LABELS[stay.petSize]} · {stayNights} {stayNights === 1 ? "diária" : "diárias"} · diária {money(stay.dailyRateCents)}</Text>
              <View style={styles.totalRow}><Text style={styles.totalLabel}>Total cobrado</Text><Text style={styles.totalValue}>{money(stay.totalCents)}</Text></View>
              {stay.status === "completed" ? <Text style={styles.received}>Valor recebido: {money(stay.receivedAmountCents)} · {stay.paymentMethod ? PAYMENT_METHOD_LABELS[stay.paymentMethod] : "forma não informada"}</Text> : null}
              {stay.calendarEventId ? <Text style={styles.calendarLinked}>Sincronizada com Google Agenda</Text> : <Text style={styles.calendarWarning}>Evento Google pendente</Text>}
              <AppButton label={stay.calendarEventId ? "Atualizar evento no Google Agenda" : "Tentar sincronizar no Google Agenda"} variant="secondary" onPress={() => void syncStayToCalendar(stay)} loading={calendarSyncingId === stay.id} disabled={calendarSyncingId !== null && calendarSyncingId !== stay.id} style={{ marginTop: 10 }} />
              {stay.status === "reserved" ? <AppButton label="Registrar check-in" variant="secondary" onPress={() => checkIn.mutate({ id: stay.id })} loading={checkIn.isPending} style={{ marginTop: 12 }} /> : null}
              {stay.status === "checked_in" ? <AppButton label="Finalizar checkout" onPress={() => openCheckout(stay)} style={{ marginTop: 12 }} /> : null}
              <View style={styles.cardActions}>
                <AppButton label="Editar" variant="secondary" onPress={() => openEditStay(stay)} disabled={deleteStay.isPending} style={styles.cardAction} />
                <AppButton label="Excluir" variant="secondary" onPress={() => void removeStay(stay)} loading={deleteStay.isPending} style={styles.cardAction} />
              </View>
            </Panel>;
          }) : <EmptyState title="Nenhuma hospedagem cadastrada" body="Crie a estadia, confira as datas e diária, e registre o check-in quando o pet chegar." />}
        </View>
      </ScrollView>

      <FormSheet visible={formOpen} title={editingStay ? "Editar hospedagem" : "Nova hospedagem"} subtitle="O total é calculado pelas noites entre o check-in e o checkout." onClose={() => { setFormOpen(false); setFormError(""); setEditingStay(null); }}>
        <ChoiceField label="Tutor *" value={clientId} options={clientOptions} onChange={(value) => { setClientId(value); setPetId(""); }} searchable searchPlaceholder="Buscar tutor…" />
        <ChoiceField label="Pet *" value={petId} options={petOptions} onChange={(value) => { setPetId(value); const pet = selectedClient?.pets.find((item) => item.id === Number(value)); if (pet) setPetSize(pet.size); }} searchable searchPlaceholder="Buscar pet…" />
        <ChoiceField label="Porte do pet nesta hospedagem *" value={petSize} options={sizeOptions} onChange={(value) => setPetSize(value as PetSize)} />
        <View style={styles.dateFields}>
          <DateTimeField label="Check-in *" mode="date" value={checkInDate} onChange={setCheckInDate} style={styles.dateField} />
          <DateTimeField label="Checkout *" mode="date" value={checkOutDate} onChange={setCheckOutDate} style={styles.dateField} />
        </View>
        {dateError ? <Text style={styles.dateError}>{dateError}</Text> : null}
        <Panel style={styles.calendarPanel}><Text style={styles.calendarPanelTitle}>Google Agenda</Text><Text style={styles.calendarHint}>A estadia será sincronizada como evento de dia inteiro do check-in ao checkout.</Text></Panel>
        {calendars.length > 1 ? <ChoiceField label="Agenda Google" value={calendarId} options={calendarOptions} onChange={setCalendarId} searchable searchPlaceholder="Buscar agenda…" /> : calendars.length === 1 ? <Text style={styles.calendarHint}>Agenda selecionada: {calendars[0].title || "Google Agenda"}</Text> : editingStay?.calendarId ? <Text style={styles.calendarHint}>O evento existente será atualizado na agenda vinculada.</Text> : null}
        {calendarSetupError ? <Text style={styles.calendarWarning}>{calendarSetupError} A hospedagem será salva e você poderá tentar a sincronização pelo cartão.</Text> : null}
        <Field label="Valor da diária (R$) *" value={dailyRate} onChangeText={setDailyRate} placeholder="0,00" keyboardType="decimal-pad" autoCapitalize="none" />
        <Panel style={styles.calculation}>
          <View style={styles.calcRow}><Text style={styles.calcLabel}>Diárias (noites)</Text><Text style={styles.calcValue}>{nights > 0 ? String(nights) : "—"}</Text></View>
          <View style={styles.calcRow}><Text style={styles.calcLabel}>Valor da diária</Text><Text style={styles.calcValue}>{rateCents > 0 ? money(rateCents) : "—"}</Text></View>
          <View style={styles.calcDivider} />
          <View style={styles.calcRow}><Text style={styles.calcTotalLabel}>Total calculado</Text><Text style={styles.calcTotal}>{totalCents > 0 ? money(totalCents) : "—"}</Text></View>
        </Panel>
        <ErrorText message={formError || createStay.error?.message || updateStay.error?.message} />
        <AppButton label={editingStay ? "Salvar alterações" : "Salvar hospedagem"} onPress={() => void saveStay()} loading={createStay.isPending || updateStay.isPending} disabled={!clientId || !petId || nights < 1 || rateCents < 1} />
      </FormSheet>

      <ReceivedPaymentSheet
        visible={checkoutTarget !== null}
        title="Confirmar checkout"
        subtitle={checkoutTarget ? `${checkoutTarget.petName} · total cobrado ${money(checkoutTarget.totalCents)}. O valor informado será registrado no Financeiro.` : "Informe o valor efetivamente recebido."}
        amount={receivedAmount}
        onAmountChange={setReceivedAmount}
        method={receivedMethod}
        onMethodChange={setReceivedMethod}
        error={checkoutError || checkOut.error?.message}
        loading={checkOut.isPending}
        buttonLabel="Confirmar checkout e recebimento"
        onSubmit={() => void submitCheckout()}
        onClose={() => { setCheckoutTarget(null); setCheckoutError(""); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: BRAND.background },
  content: { paddingBottom: 34 },
  headerMark: { color: BRAND.orange, fontSize: 10, fontWeight: "900", letterSpacing: 1.2, paddingHorizontal: 9, paddingVertical: 7, borderWidth: 1, borderColor: BRAND.border, borderRadius: 99 },
  intro: { marginHorizontal: 20, marginBottom: 18, padding: 18, backgroundColor: "#25251F", borderColor: "#55452E" },
  introTitle: { color: BRAND.cream, fontSize: 17, fontWeight: "800", marginBottom: 7 },
  notice: { marginHorizontal: 20, marginBottom: 12, padding: 12, borderColor: `${BRAND.teal}66` },
  noticeText: { color: BRAND.teal, fontSize: 12, fontWeight: "700" },
  newStayButton: { marginHorizontal: 20, marginBottom: 24 },
  listSection: { paddingHorizontal: 20 },
  stayCard: { marginBottom: 12, padding: 15 },
  stayHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  petName: { color: BRAND.cream, fontSize: 16, fontWeight: "800" },
  tutorName: { color: BRAND.muted, fontSize: 12, marginTop: 4 },
  dateRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 7, marginTop: 14 },
  dateLabel: { color: BRAND.muted, fontSize: 10, fontWeight: "700" },
  dateValue: { color: BRAND.cream, fontSize: 11, fontWeight: "700", marginRight: 7 },
  meta: { color: BRAND.muted, fontSize: 11, marginTop: 10 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12, paddingTop: 11, borderTopWidth: 1, borderColor: BRAND.border },
  totalLabel: { color: BRAND.muted, fontSize: 12, fontWeight: "700" },
  totalValue: { color: BRAND.orange, fontSize: 15, fontWeight: "900" },
  received: { color: BRAND.teal, fontSize: 12, fontWeight: "700", marginTop: 9 },
  cardActions: { flexDirection: "row", gap: 10, marginTop: 12 },
  cardAction: { flex: 1 },
  calendarPanel: { padding: 13, marginTop: 10, marginBottom: 10, backgroundColor: BRAND.surfaceAlt },
  calendarPanelTitle: { color: BRAND.cream, fontSize: 12, fontWeight: "800", marginBottom: 4 },
  calendarHint: { color: BRAND.muted, fontSize: 11, lineHeight: 16, marginBottom: 8 },
  calendarWarning: { color: BRAND.orange, fontSize: 11, lineHeight: 16, marginBottom: 12 },
  calendarLinked: { color: BRAND.teal, fontSize: 11, fontWeight: "700", marginTop: 10 },
  dateFields: { flexDirection: "row", gap: 10 },
  dateField: { flex: 1 },
  dateError: { color: BRAND.danger, fontSize: 11, lineHeight: 16, marginTop: -7, marginBottom: 12 },
  calculation: { padding: 14, marginTop: 2, marginBottom: 16, backgroundColor: BRAND.surfaceAlt },
  calcRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginVertical: 4 },
  calcLabel: { color: BRAND.muted, fontSize: 12 },
  calcValue: { color: BRAND.cream, fontSize: 12, fontWeight: "700" },
  calcDivider: { height: 1, backgroundColor: BRAND.border, marginVertical: 8 },
  calcTotalLabel: { color: BRAND.cream, fontSize: 13, fontWeight: "800" },
  calcTotal: { color: BRAND.orange, fontSize: 17, fontWeight: "900" },
});
