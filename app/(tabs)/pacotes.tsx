import { useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AppButton, AppHeader, ChoiceField, EmptyState, ErrorText, Field, Panel, SectionHeading, StatusPill, uiStyles } from "@/components/vila/ui";
import { FormSheet } from "@/components/vila/form-sheet";
import { ReceivedPaymentSheet } from "@/components/vila/received-payment-sheet";
import { DateTimeField } from "../../components/vila/date-time-field";
import { appointmentCalendarMarker, createCalendarEvent, deleteCalendarEvent, openCalendarEvent, requestWritableCalendars } from "@/lib/vila-integrations";
import { BRAND, CADENCE_LABELS, appointmentIntervalsOverlap, calculatePackageEndDate, centsFromInput, dateInput, displayDate, displayDateTime, isValidCustomPackageDates, isValidLocalDateTime, money, packageOccurrenceDates, packagePreConsumedUses, parseLocalDateTime, type Cadence, type PaymentMethod } from "@/shared/vila";
import { trpc } from "@/lib/trpc";

type PackageItem = { id: number; clientId: number; petId: number; name: string; cadence: Cadence; startDate: string; endDate: string; priceCents: number; receivedCents: number; openBalanceCents: number; status: "active" | "closed"; paid: number; paymentMethod: PaymentMethod | null; deletedAt: Date | null; clientName: string; petName: string; benefits: { id: number; serviceId: number; allowance: number; used: number; preConsumed: number; reserved: number }[] };
type PaidMethod = Exclude<PaymentMethod, "package">;
type PackageSaleTarget = { id: number; name: string; priceCents: number; openBalanceCents: number };
type GoogleCalendarChoice = { id: string; title: string; ownerAccount: string };
type RecurringAppointment = { id: number; startAt: string; durationMinutes: number; serviceName: string; petName: string; clientName: string; packageName: string; occurrenceIndex: number; occurrenceTotal: number };
type OrphanedCalendarEvent = RecurringAppointment & { calendarId: string; eventId: string };
const PACKAGE_CALENDAR_RECOVERY_KEY = "vila-caramelo:package-calendar-recovery:v1";

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isRecurringAppointment(value: unknown): value is RecurringAppointment {
  if (!isRecord(value)) return false;
  return typeof value.id === "number" && Number.isInteger(value.id) && value.id > 0 && typeof value.startAt === "string" && isValidLocalDateTime(value.startAt.slice(0, 10), value.startAt.slice(11, 16)) && typeof value.durationMinutes === "number" && Number.isInteger(value.durationMinutes) && typeof value.serviceName === "string" && typeof value.petName === "string" && typeof value.clientName === "string" && typeof value.packageName === "string" && typeof value.occurrenceIndex === "number" && Number.isInteger(value.occurrenceIndex) && typeof value.occurrenceTotal === "number" && Number.isInteger(value.occurrenceTotal);
}
function isOrphanedCalendarEvent(value: unknown): value is OrphanedCalendarEvent {
  if (!isRecurringAppointment(value) || !isRecord(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.calendarId === "string" && record.calendarId.length > 0 && typeof record.eventId === "string" && record.eventId.length > 0;
}
function newPaymentRequestId() { return `pkg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 16)}`; }

function confirmPackageOverlap(message: string): Promise<boolean> {
  if (typeof window !== "undefined" && typeof window.confirm === "function") return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => {
    Alert.alert("Atenção: horário sobreposto", message, [
      { text: "Voltar", style: "cancel", onPress: () => resolve(false) },
      { text: "Criar série mesmo assim", onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

export default function PackagesScreen() {
  const [showClosed, setShowClosed] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [editing, setEditing] = useState<PackageItem | null>(null);
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [petId, setPetId] = useState("");
  const [name, setName] = useState("");
  const [cadence, setCadence] = useState<Cadence>("monthly");
  const [startDate, setStartDate] = useState(dateInput());
  const [scheduleMode, setScheduleMode] = useState<"standard" | "custom">("standard");
  const [customDates, setCustomDates] = useState<string[]>([]);
  const [price, setPrice] = useState("");
  const [paid, setPaid] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaidMethod>("pix");
  const [saleTarget, setSaleTarget] = useState<PackageSaleTarget | null>(null);
  const [saleAmount, setSaleAmount] = useState("");
  const [saleMethod, setSaleMethod] = useState<PaidMethod>("pix");
  const [saleRequestId, setSaleRequestId] = useState("");
  const [saleError, setSaleError] = useState("");
  const saleLock = useRef(false);
  const [allowances, setAllowances] = useState<Record<number, string>>({});
  const [futureOccurrences, setFutureOccurrences] = useState("4");
  const [recurringServiceId, setRecurringServiceId] = useState("");
  const [bookingTime, setBookingTime] = useState("10:00");
  const [calendars, setCalendars] = useState<GoogleCalendarChoice[]>([]);
  const [calendarId, setCalendarId] = useState("");
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [savingPackage, setSavingPackage] = useState(false);
  const [pendingCalendar, setPendingCalendar] = useState<RecurringAppointment[]>([]);
  const [pendingCalendarId, setPendingCalendarId] = useState("");
  const [orphanedCalendarEvents, setOrphanedCalendarEvents] = useState<OrphanedCalendarEvent[]>([]);
  const [calendarRecoveryLoaded, setCalendarRecoveryLoaded] = useState(false);
  const [calendarRecoveryStorageError, setCalendarRecoveryStorageError] = useState(false);
  const [syncingCalendar, setSyncingCalendar] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const utils = trpc.useUtils();
  const list = trpc.vila.packages.list.useQuery({ includeClosed: showClosed, includeDeleted: showDeleted });
  const clients = trpc.vila.clients.list.useQuery({});
  const services = trpc.vila.services.list.useQuery({ includeInactive: Boolean(editing) });
  const create = trpc.vila.packages.create.useMutation({ onSuccess: () => { void utils.vila.packages.invalidate(); void utils.vila.appointments.invalidate(); void utils.vila.dashboard.summary.invalidate(); void utils.vila.finance.invalidate(); void utils.vila.finance.pending.invalidate(); } });
  const update = trpc.vila.packages.update.useMutation({ onSuccess: () => { void utils.vila.packages.invalidate(); void utils.vila.finance.pending.invalidate(); close(); } });
  const markPaid = trpc.vila.packages.markPaid.useMutation({ onSuccess: () => { void utils.vila.packages.invalidate(); void utils.vila.finance.invalidate(); void utils.vila.finance.pending.invalidate(); void utils.vila.dashboard.summary.invalidate(); } });
  const closePackage = trpc.vila.packages.close.useMutation({ onSuccess: () => void utils.vila.packages.invalidate() });
  const softDeletePackage = trpc.vila.packages.softDelete.useMutation({ onSuccess: () => { void utils.vila.packages.invalidate(); void utils.vila.appointments.invalidate(); void utils.vila.finance.pending.invalidate(); void utils.vila.dashboard.summary.invalidate(); } });
  const linkEvent = trpc.vila.appointments.setCalendarEvent.useMutation();
  const clientOptions = (clients.data || []).map((client) => ({ value: String(client.id), label: client.name, detail: `${client.pets.length} ${client.pets.length === 1 ? "pet" : "pets"}` }));
  const selectedClient = clients.data?.find((client) => client.id === Number(clientId));
  const selectedPet = selectedClient?.pets.find((pet) => pet.id === Number(petId));
  const petOptions = (selectedClient?.pets || []).map((pet) => ({ value: String(pet.id), label: pet.name, detail: pet.breed || "" }));
  const legacyPackageServiceIds = new Set(editing?.benefits.map((benefit) => benefit.serviceId) || []);
  const serviceList = (services.data || []).filter((item) => (item.category !== "transport" || legacyPackageServiceIds.has(item.id)) && (item.active === 1 || Boolean(editing)) && (!selectedPet || !item.size || item.size === selectedPet.size || legacyPackageServiceIds.has(item.id)));
  const selectedServices = useMemo(() => Object.keys(allowances).map(Number).filter((id) => Number(allowances[id]) > 0), [allowances]);
  const recurringServiceOptions = selectedServices.flatMap((id) => {
  const service = serviceList.find((item) => item.id === id);
  return service ? [{ value: String(service.id), label: service.name, detail: `${Number(allowances[service.id])} usos · ${service.durationMinutes} min` }] : [];
});
  const recurringServiceForForm = serviceList.find((item) => item.id === (selectedServices.length === 1 ? selectedServices[0] : Number(recurringServiceId)));
  const recurringAllowance = recurringServiceForForm ? Number(allowances[recurringServiceForForm.id]) : 0;
  const futureOccurrenceCount = Number(futureOccurrences);
  const futureCountValid = Number.isInteger(futureOccurrenceCount) && futureOccurrenceCount >= 1 && futureOccurrenceCount <= recurringAllowance;
  const preConsumedUses = futureCountValid ? packagePreConsumedUses(recurringAllowance, futureOccurrenceCount) : 0;
  const standardRecurringDates = futureCountValid && futureOccurrenceCount <= 52 ? packageOccurrenceDates(startDate, cadence, futureOccurrenceCount) : [];
  const customOccurrenceDates = futureCountValid && futureOccurrenceCount <= 52
    ? [startDate, ...Array.from({ length: futureOccurrenceCount - 1 }, (_, index) => customDates[index] || standardRecurringDates[index + 1] || startDate)]
    : [];
  const customScheduleValid = Boolean(recurringServiceForForm && isValidCustomPackageDates(startDate, customOccurrenceDates, futureOccurrenceCount));
  const customDatePickerCount = futureCountValid && futureOccurrenceCount <= 52 ? futureOccurrenceCount - 1 : 0;
  const recurringDates = scheduleMode === "custom" ? (customScheduleValid ? customOccurrenceDates : []) : standardRecurringDates;
  const recurrenceDatePreview = recurringDates.length <= 5 ? recurringDates.map(displayDate).join(" · ") : `${recurringDates.slice(0, 3).map(displayDate).join(" · ")} … ${displayDate(recurringDates[recurringDates.length - 1])}`;
  const recurrenceSummary = !recurringServiceForForm ? "Inclua um serviço para definir os atendimentos recorrentes." : !futureCountValid ? `Informe entre 1 e ${recurringAllowance} repetições futuras.` : futureOccurrenceCount > 52 ? "A série automática aceita até 52 repetições futuras; reduza a quantidade para continuar." : scheduleMode === "custom" && !customScheduleValid ? `Selecione ${futureOccurrenceCount} datas válidas, diferentes e em ordem cronológica.` : recurringDates.length ? `Serão criados ${recurringDates.length} atendimentos em ${recurrenceDatePreview}${scheduleMode === "custom" ? " (datas escolhidas)" : ""}, sempre às ${bookingTime}. ${preConsumedUses ? `${preConsumedUses} utilização(ões) anterior(es) serão registradas como consumidas.` : "A franquia selecionada será toda agendada."} Cada atendimento terá seu evento no Google Agenda.` : "Confira a data inicial e as repetições futuras selecionadas.";
  const calendarOptions = calendars.map((calendar) => ({ value: calendar.id, label: calendar.title, detail: calendar.ownerAccount }));
  const effectiveAllowance = (serviceId: number) => {
    const contracted = Number(allowances[serviceId] || 0);
    const consumed = editing
      ? editing.benefits.find((benefit) => benefit.serviceId === serviceId)?.preConsumed || 0
      : serviceId === recurringServiceForForm?.id && futureCountValid ? preConsumedUses : 0;
    return Math.max(contracted - consumed, 0);
  };
  const otherBenefitEndDate = recurringServiceForForm ? calculatePackageEndDate(startDate, cadence, selectedServices.filter((id) => id !== recurringServiceForForm.id).map(effectiveAllowance)) : startDate;
  const customLastDate = customOccurrenceDates[customOccurrenceDates.length - 1] || "";
  const customEndDate = customLastDate > otherBenefitEndDate ? customLastDate : otherBenefitEndDate;
  const endDate = scheduleMode === "custom" && !editing ? (customScheduleValid ? customEndDate : "") : calculatePackageEndDate(startDate, cadence, selectedServices.map(effectiveAllowance));
  const history = trpc.vila.packages.history.useQuery({ id: expanded || 0 }, { enabled: Boolean(expanded) });

  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem(PACKAGE_CALENDAR_RECOVERY_KEY).then((raw) => {
      if (raw === null || !mounted) return;
      const saved: unknown = JSON.parse(raw);
      if (!isRecord(saved) || !Array.isArray(saved.pendingCalendar) || !Array.isArray(saved.orphanedCalendarEvents) || typeof saved.pendingCalendarId !== "string") {
        setCalendarRecoveryStorageError(true);
        setNotice("A fila local do Google está em formato inesperado. Confira manualmente o Google Agenda antes de criar outra série.");
        return;
      }
      const pending = saved.pendingCalendar.filter(isRecurringAppointment);
      const orphaned = saved.orphanedCalendarEvents.filter(isOrphanedCalendarEvent);
      if (pending.length !== saved.pendingCalendar.length || orphaned.length !== saved.orphanedCalendarEvents.length || (pending.length > 0) !== Boolean(saved.pendingCalendarId.trim())) {
        setCalendarRecoveryStorageError(true);
        setNotice("Não foi possível validar todos os itens da fila local. Confira manualmente o Google Agenda antes de liberar uma nova série.");
        return;
      }
      setPendingCalendar(pending);
      setPendingCalendarId(saved.pendingCalendarId);
      setOrphanedCalendarEvents(orphaned);
      if (pending.length || orphaned.length) setNotice(`Fila recuperada neste aparelho: ${pending.length} evento(s) ainda pendente(s) e ${orphaned.length} possível(is) evento(s) sem vínculo. Confira antes de iniciar outra série.`);
    }).catch(() => { if (mounted) { setCalendarRecoveryStorageError(true); setNotice("Não foi possível recuperar a fila Google anterior. Confira o Google Agenda antes de criar outra série; a criação está bloqueada até a revisão manual."); } }).finally(() => { if (mounted) setCalendarRecoveryLoaded(true); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!calendarRecoveryLoaded || calendarRecoveryStorageError) return;
    void AsyncStorage.setItem(PACKAGE_CALENDAR_RECOVERY_KEY, JSON.stringify({ pendingCalendar, pendingCalendarId, orphanedCalendarEvents })).catch(() => {
      setCalendarRecoveryStorageError(true);
      setNotice("Não foi possível salvar a fila Google neste aparelho. Mantenha a tela aberta até resolver a sincronização.");
    });
  }, [calendarRecoveryLoaded, calendarRecoveryStorageError, pendingCalendar, pendingCalendarId, orphanedCalendarEvents]);

  function close() { setOpen(false); setEditing(null); setError(""); }
  function selectScheduleMode(value: string) {
    const next = value === "custom" ? "custom" : "standard";
    setScheduleMode(next);
    setCustomDates(next === "custom" ? standardRecurringDates.slice(1) : []);
  }
  function setCustomUseDate(index: number, value: string) {
    setCustomDates((current) => { const next = [...current]; next[index] = value; return next; });
  }
  async function openNew() {
    if (calendarLoading || savingPackage || !calendarRecoveryLoaded) return;
    if (calendarRecoveryStorageError) { setNotice("Revise o Google Agenda e confirme a revisão manual antes de iniciar uma nova série."); return; }
    if (pendingCalendar.length || orphanedCalendarEvents.length) { setNotice("Revise e resolva os eventos Google sem vínculo antes de criar outra série, para evitar duplicidade."); return; }
    setCalendarLoading(true);
    setEditing(null); setClientId(""); setPetId(""); setName(""); setCadence("monthly"); setStartDate(dateInput()); setScheduleMode("standard"); setCustomDates([]); setPrice(""); setPaid(false); setPaymentMethod("pix"); setAllowances({}); setFutureOccurrences("4"); setRecurringServiceId(""); setBookingTime("10:00"); setCalendars([]); setCalendarId(""); setError("");
    try {
      const available = await requestWritableCalendars();
      const choices = available.map((calendar) => ({ id: calendar.id, title: calendar.title || "Google Agenda", ownerAccount: calendar.ownerAccount || calendar.source?.name || "Conta Google" }));
      const primary = available.find((calendar) => calendar.isPrimary) || available[0];
      setCalendars(choices);
      setCalendarId(primary.id);
      setNotice("");
      setOpen(true);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Autorize uma agenda Google editável no Android antes de criar as ocorrências recorrentes.");
    } finally { setCalendarLoading(false); }
  }
  function openEdit(item: PackageItem) { setEditing(item); setClientId(String(item.clientId)); setPetId(String(item.petId)); setName(item.name); setCadence(item.cadence); setStartDate(item.startDate); setScheduleMode("standard"); setCustomDates([]); setPrice((item.priceCents / 100).toFixed(2).replace(".", ",")); setPaid(item.paid === 1); setPaymentMethod(item.paymentMethod === "cash" || item.paymentMethod === "card" ? item.paymentMethod : "pix"); setAllowances(Object.fromEntries(item.benefits.map((benefit) => [benefit.serviceId, String(benefit.allowance)]))); setRecurringServiceId(""); setCalendars([]); setCalendarId(""); setError(""); setOpen(true); }
  function setCadenceAndDefaults(next: Cadence) {
    const oldDefault = cadence === "monthly" ? 4 : 2;
  const nextDefault = next === "monthly" ? 4 : 2;
  setAllowances((current) => Object.fromEntries(Object.entries(current).map(([id, quantity]) => [id, Number(quantity) === oldDefault ? String(nextDefault) : quantity])));
  setFutureOccurrences((current) => Number(current) === oldDefault || Number(current) > nextDefault ? String(nextDefault) : current);
  setCadence(next);
}
  function toggleService(id: number) {
  if (allowances[id]) {
    const next = Object.fromEntries(Object.entries(allowances).filter(([key]) => Number(key) !== id));
    setAllowances(next);
    if (Number(recurringServiceId) === id) {
      const replacementId = Number(Object.keys(next)[0] || 0);
      setRecurringServiceId(replacementId ? String(replacementId) : "");
      setFutureOccurrences(replacementId ? next[replacementId] : cadence === "monthly" ? "4" : "2");
    } else if (!Object.keys(next).length) setFutureOccurrences(cadence === "monthly" ? "4" : "2");
  } else {
    const quantity = cadence === "monthly" ? "4" : "2";
    setAllowances({ ...allowances, [id]: quantity });
    if (!recurringServiceId) { setRecurringServiceId(String(id)); setFutureOccurrences(quantity); }
  }
}
  function openReceipt(target: PackageSaleTarget, method: PaidMethod) {
    if (target.openBalanceCents <= 0) return;
    markPaid.reset();
    setSaleError("");
    setSaleTarget(target);
    setSaleAmount((target.openBalanceCents / 100).toFixed(2).replace(".", ","));
    setSaleMethod(method);
    setSaleRequestId(newPaymentRequestId());
  }
  function openPackageReceipt(item: PackageItem) {
    const preferredMethod = item.paymentMethod === "cash" || item.paymentMethod === "card" ? item.paymentMethod : "pix";
    openReceipt({ id: item.id, name: item.name, priceCents: item.priceCents, openBalanceCents: item.openBalanceCents }, preferredMethod);
  }
  async function saveReceipt() {
    const target = saleTarget;
    if (!target || saleLock.current) return;
    saleLock.current = true;
    setSaleError("");
    try {
      const amountCents = centsFromInput(saleAmount);
      if (amountCents <= 0) throw new Error("Informe um valor recebido maior que zero.");
      if (amountCents > target.openBalanceCents) throw new Error(`O valor não pode ultrapassar o saldo em aberto de ${money(target.openBalanceCents)}.`);
      await markPaid.mutateAsync({ id: target.id, amountCents, method: saleMethod, requestId: saleRequestId });
      const remainingCents = Math.max(target.openBalanceCents - amountCents, 0);
      setSaleTarget(null);
      setSaleRequestId("");
      setNotice(remainingCents > 0 ? `Recebimento de ${money(amountCents)} registrado. Saldo em aberto: ${money(remainingCents)}; registre os próximos recebimentos até quitar o pacote.` : `Recebimento de ${money(amountCents)} registrado. O pacote está quitado.`);
    } catch (e) {
      setSaleError(e instanceof Error ? e.message : "Não foi possível registrar este recebimento.");
    } finally { saleLock.current = false; }
  }
  async function syncOccurrences(occurrences: RecurringAppointment[], targetCalendarId: string) {
    const pending: RecurringAppointment[] = [];
    const orphaned: OrphanedCalendarEvent[] = [];
    if (!occurrences.length) return { pending, orphaned };
    let linkedRows: Awaited<ReturnType<typeof utils.vila.appointments.calendarLinks.fetch>>;
    try { linkedRows = await utils.vila.appointments.calendarLinks.fetch({ ids: occurrences.map((item) => item.id) }); }
    catch { return { pending: occurrences, orphaned }; }
    const linkedById = new Map(linkedRows.map((row) => [row.id, row]));
    for (const occurrence of occurrences) {
      const currentLink = linkedById.get(occurrence.id);
      if (!currentLink) { pending.push(occurrence); continue; }
      if (currentLink.deletedAt || ["cancelled", "no_show"].includes(currentLink.status)) continue;
      if (currentLink.calendarId && currentLink.eventId) continue;
      if (currentLink.calendarId || currentLink.eventId) { pending.push(occurrence); continue; }
      let eventId: string | null = null;
      try {
        eventId = await createCalendarEvent(targetCalendarId, {
          title: `${occurrence.clientName} - ${occurrence.petName}`,
          notes: `Serviço: ${occurrence.serviceName}\nTutor: ${occurrence.clientName}\nPet: ${occurrence.petName}\nPacote: ${occurrence.packageName}\nOcorrência ${occurrence.occurrenceIndex} de ${occurrence.occurrenceTotal}`,
          startsAt: parseLocalDateTime(occurrence.startAt),
          durationMinutes: occurrence.durationMinutes,
          marker: appointmentCalendarMarker(occurrence.id),
        });
        await linkEvent.mutateAsync({ id: occurrence.id, calendarId: targetCalendarId, eventId });
      } catch {
        if (eventId) {
          let statusChecked = false;
          let currentStatus: (typeof linkedRows)[number] | undefined;
          try {
            currentStatus = (await utils.vila.appointments.calendarLinks.fetch({ ids: [occurrence.id] }))[0];
            statusChecked = true;
          } catch { /* Keep the event for manual linking when the write outcome is unknown. */ }
          if (!statusChecked) { orphaned.push({ ...occurrence, calendarId: targetCalendarId, eventId }); continue; }
          if (currentStatus?.calendarId === targetCalendarId && currentStatus.eventId === eventId) continue;
          try { await deleteCalendarEvent(eventId); }
          catch { orphaned.push({ ...occurrence, calendarId: targetCalendarId, eventId }); continue; }
          if (!currentStatus || ["cancelled", "no_show"].includes(currentStatus.status) || (currentStatus.calendarId && currentStatus.eventId)) continue;
        }
        pending.push(occurrence);
      }
    }
    return { pending, orphaned };
  }
  async function retryCalendarSync() {
    if (syncingCalendar || !pendingCalendar.length || !pendingCalendarId) return;
    setSyncingCalendar(true);
    try {
      const result = await syncOccurrences(pendingCalendar, pendingCalendarId);
      setPendingCalendar(result.pending);
      if (!result.pending.length) setPendingCalendarId("");
      setOrphanedCalendarEvents((current) => [...current, ...result.orphaned]);
      await utils.vila.appointments.invalidate();
      const orphanedCount = orphanedCalendarEvents.length + result.orphaned.length;
      setNotice(result.pending.length || orphanedCount ? `Ainda há ${result.pending.length} evento(s) pendente(s) e ${orphanedCount} possível(is) evento(s) sem vínculo; confira a lista antes de tentar novamente.` : `Todos os ${pendingCalendar.length} eventos pendentes foram vinculados aos atendimentos já existentes.`);
    } finally { setSyncingCalendar(false); }
  }
  async function linkOrphanedEvent(event: OrphanedCalendarEvent) {
    try {
      await linkEvent.mutateAsync({ id: event.id, calendarId: event.calendarId, eventId: event.eventId });
      await utils.vila.appointments.invalidate();
      setOrphanedCalendarEvents((current) => current.filter((item) => item.eventId !== event.eventId));
      setNotice(`Evento existente da ocorrência ${event.occurrenceIndex}/${event.occurrenceTotal} vinculado ao atendimento, sem criar duplicata.`);
    } catch (e) {
      setNotice(`Não foi possível concluir o vínculo do evento existente. Confira a conexão e tente novamente. ${e instanceof Error ? e.message : ""}`);
    }
  }
  async function acknowledgeManualCalendarReview() {
    try {
      await AsyncStorage.setItem(PACKAGE_CALENDAR_RECOVERY_KEY, JSON.stringify({ pendingCalendar: [], pendingCalendarId: "", orphanedCalendarEvents: [] }));
      setPendingCalendar([]); setPendingCalendarId(""); setOrphanedCalendarEvents([]); setCalendarRecoveryStorageError(false);
      setNotice("Fila local reiniciada após sua revisão manual. Nenhum evento foi alterado no Google Agenda.");
    } catch {
      setNotice("Não foi possível atualizar a fila neste aparelho. Mantenha a tela aberta e tente novamente depois de conferir o Google Agenda.");
    }
  }
  async function submit() {
    if (savingPackage) return;
    setSavingPackage(true);
    try {
      if (!clientId || !petId) throw new Error("Selecione o tutor e o pet.");
      if (!name.trim()) throw new Error("Informe o nome do pacote.");
      if (!isValidLocalDateTime(startDate, "00:00")) throw new Error("Informe uma data inicial válida para calcular o término do pacote.");
      if (!endDate && scheduleMode !== "custom") throw new Error("Informe uma data inicial válida para calcular o término do pacote.");
      if (!selectedServices.length) throw new Error("Inclua pelo menos um serviço e sua franquia.");
      const benefits = selectedServices.map((serviceId) => ({ serviceId, allowance: Number(allowances[serviceId]) }));
      if (benefits.some((item) => !Number.isInteger(item.allowance) || item.allowance < 1 || item.allowance > 500)) throw new Error("Cada franquia deve estar entre 1 e 500 utilizações.");
      const priceCents = centsFromInput(price);
      if (editing) {
        await update.mutateAsync({ id: editing.id, name: name.trim(), cadence, startDate, endDate, priceCents, benefits });
        close();
        return;
      }
      const serviceId = selectedServices.length === 1 ? selectedServices[0] : Number(recurringServiceId);
      if (!serviceId || !selectedServices.includes(serviceId)) throw new Error("Selecione qual serviço do pacote será repetido nos atendimentos.");
      const count = Number(allowances[serviceId]);
      const futureCount = Number(futureOccurrences);
      if (!Number.isInteger(futureCount) || futureCount < 1 || futureCount > count) throw new Error(`Informe entre 1 e ${count} repetições futuras.`);
      packagePreConsumedUses(count, futureCount);
      if (futureCount > 52) throw new Error("A agenda automática permite até 52 repetições futuras; reduza a quantidade ou agende excedentes manualmente.");
      if (scheduleMode === "custom" && !customScheduleValid) throw new Error(`Selecione ${futureCount} datas válidas, diferentes e em ordem cronológica.`);
      if (!isValidLocalDateTime(startDate, bookingTime)) throw new Error("Selecione uma data inicial e um horário válidos.");
      if (!calendarId) throw new Error("Selecione uma agenda Google antes de criar os atendimentos recorrentes.");
      const recurringService = serviceList.find((item) => item.id === serviceId);
      if (!recurringService || !recurringDates.length) throw new Error("Não foi possível validar os horários da série escolhida.");
      let existingAppointments: Awaited<ReturnType<typeof utils.vila.appointments.list.fetch>> = [];
      let overlapCheckAvailable = true;
      try {
        existingAppointments = await utils.vila.appointments.list.fetch({ from: recurringDates[0], to: recurringDates[recurringDates.length - 1] });
      } catch {
        overlapCheckAvailable = false;
      }
      const conflicts = overlapCheckAvailable ? recurringDates.flatMap((date) => {
        const proposedStart = parseLocalDateTime(`${date} ${bookingTime}:00`);
        return existingAppointments.filter((item) => !item.deletedAt && !["cancelled", "no_show"].includes(item.status) && item.startAt.slice(0, 10) === date && appointmentIntervalsOverlap(proposedStart, recurringService.durationMinutes, parseLocalDateTime(item.startAt), item.durationMinutes));
      }) : [];
      if (!overlapCheckAvailable) {
        if (!await confirmPackageOverlap("Não foi possível verificar os horários da série agora. Ela ainda poderá ser criada, mas talvez coincida com atendimentos existentes. Deseja continuar?")) return;
      } else if (conflicts.length) {
        const examples = conflicts.slice(0, 4).map((item) => `${displayDateTime(item.startAt)} · ${item.petName} (${item.clientName})`).join("\n");
        const more = conflicts.length > 4 ? `\n+ ${conflicts.length - 4} outro(s)` : "";
        if (!await confirmPackageOverlap(`A série terá horário sobreposto com:\n${examples}${more}\n\nDeseja criar mesmo assim?`)) return;
      }
      const registerInitialReceipt = paid && priceCents > 0;
      const initialReceiptMethod = paymentMethod;
      const result = await create.mutateAsync({ clientId: Number(clientId), petId: Number(petId), name: name.trim(), cadence, startDate, endDate, priceCents, benefits, bookingTime, recurringServiceId: serviceId, futureOccurrences: futureOccurrenceCount, scheduleMode, customDates: scheduleMode === "custom" ? recurringDates : [] });
      const appointmentsToSync = [result.initialAppointment, ...result.appointments.filter((item) => item.id !== result.initialAppointment.id)];
      const sync = await syncOccurrences(appointmentsToSync, calendarId);
      await utils.vila.appointments.invalidate();
      setPendingCalendar(sync.pending);
      setPendingCalendarId(sync.pending.length ? calendarId : "");
      setOrphanedCalendarEvents(sync.orphaned);
      close();
      setNotice(sync.pending.length || sync.orphaned.length
        ? `O pacote e ${result.appointments.length} atendimento(s) foram criados na agenda do app. ${sync.pending.length} evento(s) Google precisam de nova tentativa; ${sync.orphaned.length} possível(is) evento(s) sem vínculo aparecem abaixo para conferência.`
        : `Pacote criado com ${result.appointments.length} atendimentos reais e eventos na agenda Google, todos às ${bookingTime}.`);
      if (registerInitialReceipt) openReceipt({ id: result.id, name: name.trim(), priceCents, openBalanceCents: priceCents }, initialReceiptMethod);
    } catch (e) { setError(e instanceof Error ? e.message : "Confira os dados do pacote e da agenda recorrente."); }
    finally { setSavingPackage(false); }
  }
  function finish(item: PackageItem) {
    const action = () => { closePackage.reset(); closePackage.mutate({ id: item.id }); };
    if (typeof window !== "undefined" && typeof window.confirm === "function") { if (window.confirm(`Encerrar o pacote “${item.name}”? O histórico será preservado.`)) action(); }
    else Alert.alert("Encerrar pacote", `Encerrar o pacote de ${item.petName}?`, [{ text: "Manter ativo", style: "cancel" }, { text: "Encerrar", style: "destructive", onPress: action }]);
  }
  function excludePackage(item: PackageItem) {
    if (item.deletedAt || softDeletePackage.isPending) return;
    const action = async () => {
      softDeletePackage.reset();
      try {
        const result = await softDeletePackage.mutateAsync({ id: item.id });
        let cleanupFailures = 0;
        for (const linked of result.calendarEvents) {
          try {
            await deleteCalendarEvent(linked.eventId);
            await linkEvent.mutateAsync({ id: linked.id, calendarId: null, eventId: null, expectedEventId: linked.eventId });
          } catch { cleanupFailures += 1; }
        }
        await utils.vila.appointments.invalidate();
        setNotice(cleanupFailures
          ? `O plano “${item.name}” foi excluído e os atendimentos foram retirados da agenda. ${cleanupFailures} evento(s) Google ainda precisam ser removidos; tente novamente em Agenda > Limpeza pendente no Google Agenda.`
          : `O plano “${item.name}” foi excluído e seus eventos Google foram removidos. Atendimentos concluídos e histórico financeiro foram preservados.`);
      } catch (e) {
        setNotice(e instanceof Error ? e.message : "Não foi possível excluir o plano. Atualize a lista e tente novamente.");
      }
    };
    const message = `Excluir o plano “${item.name}” e todos os atendimentos vinculados? Os atendimentos não concluídos serão cancelados e ocultados; os concluídos sairão da agenda, mas seu histórico e pagamentos serão preservados. Os eventos Google serão removidos. Se algum evento não puder ser apagado agora, ele ficará disponível para nova tentativa na limpeza do Google Agenda. Um atendimento em andamento precisa ser finalizado primeiro.`;
    if (typeof window !== "undefined" && typeof window.confirm === "function") { if (window.confirm(message)) void action(); }
    else Alert.alert("Excluir plano e atendimentos", message, [{ text: "Cancelar", style: "cancel" }, { text: "Excluir", style: "destructive", onPress: () => void action() }], { cancelable: true });
  }

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <AppHeader eyebrow="Fidelidade e franquias" title="Pacotes da Vila" right={<AppButton label={calendarLoading || !calendarRecoveryLoaded ? "Aguarde…" : calendarRecoveryStorageError ? "Revise" : "+ Criar"} onPress={() => void openNew()} loading={calendarLoading || !calendarRecoveryLoaded} style={styles.newButton} />} />
        {notice ? <Panel style={styles.note}><Text style={styles.noteTitle}>{orphanedCalendarEvents.length ? "Evento Google sem vínculo" : pendingCalendar.length ? "Sincronização Google pendente" : "Agenda recorrente"}</Text><Text style={uiStyles.bodyText}>{notice}</Text>{pendingCalendar.map((item) => <View key={`pending-${item.id}`} style={styles.orphanRow}><Text style={styles.orphanTitle}>{item.petName} · {item.serviceName} · {item.occurrenceIndex}/{item.occurrenceTotal}</Text><Text style={styles.muted}>{displayDateTime(item.startAt)} · {item.packageName}</Text></View>)}{orphanedCalendarEvents.map((event) => <View key={event.eventId} style={styles.orphanRow}><Text style={styles.orphanTitle}>{event.petName} · {event.serviceName} · {event.occurrenceIndex}/{event.occurrenceTotal}</Text><Text style={styles.muted}>{displayDateTime(event.startAt)} · {event.packageName}</Text><View style={styles.orphanActions}><Pressable onPress={() => { try { openCalendarEvent(event.eventId); } catch (e) { setNotice(e instanceof Error ? e.message : "Confira este evento no Google Agenda do aparelho."); } }}><Text style={styles.link}>Abrir evento</Text></Pressable><Pressable onPress={() => void linkOrphanedEvent(event)}><Text style={styles.link}>Vincular evento existente</Text></Pressable><Pressable onPress={() => { setOrphanedCalendarEvents((current) => current.filter((item) => item.eventId !== event.eventId)); setNotice("Evento conferido. Ele não será recriado automaticamente."); }}><Text style={styles.link}>Marcar conferido</Text></Pressable></View></View>)}{pendingCalendar.length ? <AppButton label="Tentar sincronizar eventos pendentes" variant="secondary" onPress={() => void retryCalendarSync()} loading={syncingCalendar} /> : null}{calendarRecoveryStorageError ? <AppButton label="Conferi o Google Agenda" variant="secondary" onPress={() => void acknowledgeManualCalendarReview()} /> : null}</Panel> : null}
        <Panel style={styles.note}><Text style={styles.noteTitle}>Saldo confiável, sem dupla baixa.</Text><Text style={uiStyles.bodyText}>O uso só é abatido quando o atendimento do pacote é concluído. Se houver reabertura permitida, o consumo é revertido com histórico.</Text></Panel>
        <Pressable onPress={() => setShowClosed(!showClosed)} style={styles.toggle}><View style={[styles.check, showClosed && styles.checkOn]} /><Text style={styles.toggleText}>Incluir todos os pacotes encerrados</Text></Pressable>
        <Pressable onPress={() => setShowDeleted(!showDeleted)} style={styles.toggle}><View style={[styles.check, showDeleted && styles.checkOn]} /><Text style={styles.toggleText}>Incluir pacotes excluídos</Text></Pressable>
        <SectionHeading title="Planos contratados" detail={`${list.data?.length ?? 0} pacotes no filtro`} />
        {list.isLoading ? <ActivityIndicator color={BRAND.orange} style={{ marginTop: 24 }} /> : list.error ? <Panel><Text style={uiStyles.bodyText}>Não foi possível carregar os pacotes. Confira a conexão.</Text></Panel> : list.data?.length ? (list.data as PackageItem[]).map((item) => {
          const total = item.benefits.reduce((sum, benefit) => sum + benefit.allowance, 0);
          const used = item.benefits.reduce((sum, benefit) => sum + benefit.used + benefit.preConsumed, 0);
          const reserved = item.benefits.reduce((sum, benefit) => sum + benefit.reserved, 0);
          const remaining = item.benefits.reduce((sum, benefit) => sum + Math.max(benefit.allowance - benefit.used - benefit.preConsumed - benefit.reserved, 0), 0);
          const expired = item.endDate < dateInput();
          return <Panel key={item.id} style={styles.packageCard}>
            <View style={styles.cardTop}><View style={{ flex: 1 }}><Text style={styles.packageName}>{item.name}</Text><Text style={styles.pet}>{item.petName} · {item.clientName}</Text></View><StatusPill label={item.deletedAt ? "Excluído" : item.status === "closed" ? "Encerrado" : expired ? "Vencido" : "Ativo"} tone={item.deletedAt || item.status === "closed" || expired ? "muted" : "green"} /></View>
            <View style={styles.tags}><StatusPill label={CADENCE_LABELS[item.cadence]} tone="orange" /><StatusPill label={item.openBalanceCents > 0 ? "Saldo em aberto" : "Pago"} tone={item.openBalanceCents > 0 ? "orange" : "teal"} /></View>
            <View style={styles.progressRow}><Text style={styles.balance}>{remaining} <Text style={styles.balanceSub}>disponíveis</Text></Text><Text style={styles.used}>{used}/{total} usados · {reserved} reservados</Text></View>
            <View style={styles.track}><View style={[styles.fill, { width: `${total ? Math.min(used / total * 100, 100) : 0}%` }]} /></View>
            <Text style={styles.dates}>{item.startDate.split("-").reverse().join("/")} — {item.endDate.split("-").reverse().join("/")} · Total {money(item.priceCents)}</Text>
            <Text style={styles.muted}>Recebido {money(item.receivedCents)} · Em aberto {money(item.openBalanceCents)}</Text>
            <View style={styles.actions}><Pressable onPress={() => setExpanded(expanded === item.id ? null : item.id)}><Text style={styles.link}>{expanded === item.id ? "Ocultar histórico" : "Ver consumo"}</Text></Pressable>{item.status === "active" && <Pressable onPress={() => openEdit(item)}><Text style={styles.link}>Editar</Text></Pressable>}{item.openBalanceCents > 0 && <Pressable onPress={() => openPackageReceipt(item)}><Text style={styles.link}>Registrar venda</Text></Pressable>}{!item.deletedAt && <Pressable disabled={softDeletePackage.isPending} onPress={() => excludePackage(item)}><Text style={styles.closeText}>{softDeletePackage.isPending && softDeletePackage.variables?.id === item.id ? "Excluindo…" : "Excluir plano"}</Text></Pressable>}</View>
            {closePackage.error ? <ErrorText message={closePackage.error.message} /> : null}
            {softDeletePackage.error && softDeletePackage.variables?.id === item.id ? <ErrorText message={softDeletePackage.error.message} /> : null}
            {expanded === item.id ? <View style={styles.history}><Text style={styles.historyTitle}>Histórico de utilização</Text>{history.isLoading ? <ActivityIndicator color={BRAND.orange} /> : history.data?.length ? history.data.map((entry) => <View key={entry.id} style={styles.historyRow}><View style={{ flex: 1 }}><Text style={styles.historyName}>{entry.serviceName}</Text><Text style={styles.historyDate}>{entry.preConsumed ? "Utilização anterior informada na criação do pacote" : entry.appointment?.startAt || "Data registrada indisponível"}{entry.reversedAt ? " · consumo revertido" : ""}</Text></View><Text style={styles.historyCount}>{entry.preConsumed ? `−${entry.count}` : entry.reversedAt ? "↺" : "−1"}</Text></View>) : <Text style={styles.muted}>Nenhum consumo registrado.</Text>}</View> : null}
            {item.status === "active" ? <Pressable onPress={() => finish(item)} style={styles.closeLink}><Text style={styles.closeText}>Encerrar plano</Text></Pressable> : null}
          </Panel>;
        }) : <EmptyState title="Sem pacotes cadastrados" body="Crie um plano quinzenal ou mensal para acompanhar franquias e saldo por pet." />}
      </ScrollView>
      <FormSheet visible={open} title={editing ? "Editar pacote" : "Criar pacote"} subtitle={editing ? "Defina tutor, vigência, valor e serviços incluídos." : "Defina os usos recorrentes do pacote e a hora de cada atendimento."} onClose={close}>
        {!editing ? <ChoiceField searchable searchPlaceholder="Buscar tutor…" label="Tutor *" value={clientId} options={clientOptions} onChange={(value) => { setClientId(value); setPetId(""); setAllowances({}); setRecurringServiceId(""); setFutureOccurrences(cadence === "monthly" ? "4" : "2"); }} /> : <Field label="Tutor" value={editing?.clientName || ""} onChangeText={() => undefined} editable={false} />}
        {editing ? <Field label="Pet" value={editing.petName} onChangeText={() => undefined} editable={false} /> : <ChoiceField label="Pet *" value={petId} options={petOptions} onChange={(value) => { setPetId(value); setAllowances({}); setRecurringServiceId(""); setFutureOccurrences(cadence === "monthly" ? "4" : "2"); }} />}
        <Field label="Nome do pacote *" value={name} onChangeText={setName} placeholder="Ex.: Plano Banhos da Luna" autoCapitalize="words" />
        <ChoiceField label="Periodicidade" value={cadence} options={[{ value: "monthly", label: "Mensal" }, { value: "biweekly", label: "Quinzenal" }]} onChange={setCadenceAndDefaults} />
        <View style={styles.dateInputs}><DateTimeField label={editing ? "Início" : scheduleMode === "custom" ? `${preConsumedUses + 1}ª utilização` : preConsumedUses > 0 ? "Próxima utilização" : "Início"} mode="date" value={startDate} onChange={setStartDate} style={{ flex: 1 }} /><Field label="Fim calculado" value={endDate} onChangeText={() => undefined} autoCapitalize="none" editable={false} style={{ flex: 1 }} /></View>
        <Text style={styles.muted}>{scheduleMode === "custom" ? "A vigência acompanha a última utilização selecionada." : "Mensal: 1 uso a cada 7 dias. Quinzenal: 1 a cada 14 dias. O início conta como primeiro uso; o fim é a última utilização prevista."}</Text>
        <Field label="Valor do pacote (R$)" value={price} onChangeText={setPrice} placeholder="0,00" keyboardType="decimal-pad" editable={!editing || editing.receivedCents === 0} />
        {editing && editing.receivedCents > 0 ? <Text style={styles.muted}>Há recebimentos registrados: o preço fica bloqueado para preservar o extrato financeiro.</Text> : null}
        <Text style={styles.serviceHeading}>Serviços e franquias *</Text>
        <Text style={styles.muted}>Transporte é um adicional do atendimento, não um benefício de pacote. Serviços Transporte já vinculados a pacotes antigos continuam visíveis e não são removidos automaticamente.</Text>
        {serviceList.length ? serviceList.map((service) => { const selected = Boolean(allowances[service.id]); return <View key={service.id} style={styles.allowanceRow}><Pressable onPress={() => toggleService(service.id)} style={styles.serviceToggle}><View style={[styles.check, selected && styles.checkOn]} /><View style={{ flex: 1 }}><Text style={styles.serviceName}>{service.name}{service.active !== 1 ? " · inativo" : ""}</Text><Text style={styles.muted}>{money(service.priceCents)} · {service.durationMinutes} min</Text></View></Pressable>{selected ? <Field label="Qtd." value={allowances[service.id]} onChangeText={(value) => setAllowances((old) => ({ ...old, [service.id]: value }))} keyboardType="number-pad" style={styles.allowanceInput} /> : null}</View>; }) : <Text style={styles.muted}>Cadastre serviços antes de montar um pacote.</Text>}
        {!editing ? <>
          <Text style={styles.serviceHeading}>Agendamentos recorrentes *</Text>
          {selectedServices.length > 1 ? <ChoiceField label="Serviço de cada utilização *" value={recurringServiceId} options={recurringServiceOptions} onChange={(value) => { setRecurringServiceId(value); const selectedAllowance = Number(allowances[Number(value)]); if (selectedAllowance > 0) setFutureOccurrences(String(selectedAllowance)); }} /> : recurringServiceForForm ? <Text style={styles.muted}>Serviço repetido: {recurringServiceForForm.name} · franquia de {recurringAllowance} utilização(ões)</Text> : <Text style={styles.muted}>Inclua pelo menos um serviço para gerar os atendimentos.</Text>}
          {recurringServiceForForm ? <><Field label={`Repetições futuras (máximo ${recurringAllowance}) *`} value={futureOccurrences} onChangeText={setFutureOccurrences} keyboardType="number-pad" accessibilityLabel="Quantidade de repetições futuras do pacote" /><Text style={styles.muted}>{futureCountValid ? preConsumedUses ? `${preConsumedUses} utilização(ões) anterior(es) será(ão) marcada(s) como consumida(s), sem criar agendamento.` : "A franquia será toda agendada. Reduza as repetições para registrar utilizações anteriores como consumidas." : `Escolha entre 1 e ${recurringAllowance} utilizações futuras.`}</Text></> : null}
          {recurringServiceForForm ? <ChoiceField label="Programação" value={scheduleMode} options={[{ value: "standard", label: "Programação padrão" }, { value: "custom", label: "Selecionar datas de utilização" }]} onChange={selectScheduleMode} /> : null}
          {scheduleMode === "custom" && recurringServiceForForm ? <><Text style={styles.muted}>Escolha uma data para cada repetição futura; as utilizações anteriores já marcadas como consumidas não recebem novos agendamentos.</Text>{Array.from({ length: customDatePickerCount }, (_, index) => <DateTimeField key={`custom-use-${index}`} label={`${preConsumedUses + index + 2}ª utilização *`} mode="date" value={customDates[index] || standardRecurringDates[index + 1] || startDate} onChange={(value) => setCustomUseDate(index, value)} />)}</> : null}
          <DateTimeField label="Horário de todos os atendimentos *" mode="time" value={bookingTime} onChange={setBookingTime} />
          {calendars.length > 1 ? <ChoiceField label="Agenda Google *" value={calendarId} options={calendarOptions} onChange={setCalendarId} /> : calendars.length === 1 ? <Text style={styles.muted}>Google Agenda: {calendars[0].title} · {calendars[0].ownerAccount}</Text> : null}
          <Text style={styles.muted}>{recurrenceSummary}</Text>
        </> : null}
        {!editing ? <><Pressable onPress={() => setPaid(!paid)} style={styles.toggle}><View style={[styles.check, paid && styles.checkOn]} /><Text style={styles.toggleText}>Registrar recebimento inicial após criar</Text></Pressable>{paid ? <><ChoiceField label="Forma do recebimento inicial" value={paymentMethod} options={[{ value: "pix", label: "Pix" }, { value: "cash", label: "Dinheiro" }, { value: "card", label: "Cartão" }]} onChange={setPaymentMethod} /><Text style={styles.muted}>Na próxima etapa, informe o valor efetivamente recebido.</Text></> : null}</> : null}
        <ErrorText message={error || create.error?.message || update.error?.message} />
        <AppButton label={editing ? "Salvar pacote" : "Criar pacote e agendamentos"} onPress={() => void submit()} loading={savingPackage || create.isPending || update.isPending} />
      </FormSheet>
      <ReceivedPaymentSheet visible={saleTarget !== null} title="Registrar recebimento do pacote" subtitle={saleTarget ? `${saleTarget.name} · total ${money(saleTarget.priceCents)} · saldo atual ${money(saleTarget.openBalanceCents)}.` : "Informe o valor efetivamente recebido."} amount={saleAmount} onAmountChange={setSaleAmount} method={saleMethod} onMethodChange={setSaleMethod} error={saleError || markPaid.error?.message} loading={markPaid.isPending} buttonLabel="Registrar venda" onSubmit={() => void saveReceipt()} onClose={() => { setSaleTarget(null); setSaleError(""); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: BRAND.background }, content: { paddingBottom: 30 }, newButton: { minHeight: 38, minWidth: 88, marginTop: 7 }, note: { marginHorizontal: 20, marginBottom: 18, backgroundColor: "#25251F", borderColor: "#55452E" }, noteTitle: { color: BRAND.orange, fontWeight: "800", marginBottom: 6 }, toggle: { flexDirection: "row", alignItems: "center", gap: 9, marginHorizontal: 20, marginBottom: 14 }, check: { width: 18, height: 18, borderRadius: 5, borderWidth: 1, borderColor: BRAND.muted }, checkOn: { borderColor: BRAND.orange, backgroundColor: BRAND.orange }, toggleText: { color: BRAND.muted, fontSize: 12 },
  packageCard: { marginHorizontal: 20, marginBottom: 12, padding: 15 }, cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 }, packageName: { color: BRAND.cream, fontWeight: "800", fontSize: 15 }, pet: { color: BRAND.muted, fontSize: 11, marginTop: 4 }, tags: { flexDirection: "row", gap: 7, marginTop: 12 }, progressRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 13 }, balance: { color: BRAND.teal, fontSize: 22, fontWeight: "900" }, balanceSub: { color: BRAND.muted, fontSize: 11, fontWeight: "600" }, used: { color: BRAND.muted, fontSize: 11 }, track: { height: 7, backgroundColor: BRAND.surfaceAlt, borderRadius: 99, overflow: "hidden", marginTop: 8 }, fill: { backgroundColor: BRAND.orange, height: "100%", borderRadius: 99 }, dates: { color: BRAND.muted, fontSize: 11, marginTop: 10 }, actions: { flexDirection: "row", gap: 15, borderTopWidth: 1, borderTopColor: BRAND.border, paddingTop: 11, marginTop: 12, flexWrap: "wrap" }, link: { color: BRAND.teal, fontSize: 11, fontWeight: "800" }, closeLink: { marginTop: 12, alignSelf: "flex-start" }, closeText: { color: "#E8897F", fontSize: 11, fontWeight: "700" }, markPay: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 10 }, payLabel: { color: BRAND.muted, fontSize: 10 }, payChoice: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: BRAND.background }, paySelected: { backgroundColor: "#4B321E" }, payChoiceText: { color: BRAND.muted, fontSize: 10, fontWeight: "700" }, history: { padding: 12, backgroundColor: BRAND.background, borderRadius: 13, marginTop: 12, gap: 8 }, historyTitle: { color: BRAND.cream, fontSize: 12, fontWeight: "800", marginBottom: 4 }, historyRow: { flexDirection: "row", alignItems: "center", gap: 8, borderBottomWidth: 1, borderBottomColor: BRAND.border, paddingBottom: 8 }, historyName: { color: BRAND.teal, fontWeight: "700", fontSize: 11 }, historyDate: { color: BRAND.muted, fontSize: 10, marginTop: 4 }, historyCount: { color: BRAND.orange, fontWeight: "900" }, muted: { color: BRAND.muted, fontSize: 10, marginTop: 3 },
  dateInputs: { flexDirection: "row", gap: 8 }, orphanRow: { marginTop: 10, padding: 10, borderRadius: 10, backgroundColor: BRAND.background, borderColor: BRAND.border, borderWidth: 1 }, orphanTitle: { color: BRAND.cream, fontSize: 11, fontWeight: "800" }, orphanActions: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 9 }, serviceHeading: { color: BRAND.cream, fontSize: 13, fontWeight: "800", marginTop: 2, marginBottom: 10 }, allowanceRow: { flexDirection: "row", alignItems: "center", gap: 8, borderBottomWidth: 1, borderBottomColor: BRAND.border, paddingVertical: 7 }, serviceToggle: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 }, serviceName: { color: BRAND.cream, fontSize: 12, fontWeight: "700" }, allowanceInput: { width: 72, marginBottom: 0 },
});
