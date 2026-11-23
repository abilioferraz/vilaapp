import { useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AppButton, AppHeader, ChoiceField, EmptyState, ErrorText, Field, Panel, SectionHeading, StatusPill, uiStyles } from "@/components/vila/ui";
import { FormSheet } from "@/components/vila/form-sheet";
import { ReceivedPaymentSheet } from "@/components/vila/received-payment-sheet";
import { BRAND, APPOINTMENT_STATUS_LABELS, CADENCE_LABELS, PAYMENT_METHOD_LABELS, appointmentChargeCents, appointmentIntervalsOverlap, centsFromInput, dateInput, isValidLocalDateTime, localDateTime, money, parseLocalDateTime, type AppointmentStatus, type PaymentMethod, type PetSize } from "@/shared/vila";
import { trpc } from "@/lib/trpc";
import { appointmentCalendarEventDetails, createCalendarEvent, deleteCalendarEvent, openCalendarEvent, requestWritableCalendars, updateCalendarEvent } from "@/lib/vila-integrations";
import type * as Calendar from "expo-calendar/legacy";
import { DateTimeField } from "../../components/vila/date-time-field";

type ViewMode = "day" | "week" | "month";
type AgendaTab = "pending" | "completed";
type PetOption = { id: number; clientId: number; name: string; size: PetSize };
type AppointmentItem = { id: number; clientId: number; petId: number; serviceId: number; transportServiceId: number | null; transportPriceCents: number; transportPaymentMethod: Exclude<PaymentMethod, "package"> | null; startAt: string; durationMinutes: number; priceCents: number; paymentMethod: PaymentMethod; paymentStatus: "pending" | "paid"; receivedAmountCents?: number | null; packageId: number | null; status: AppointmentStatus; deletedAt: Date | null; calendarCleanupRequestedAt?: Date | null; calendarSyncEnabled: number; notes: string | null; externalCalendarId: string | null; externalCalendarEventId: string | null; petName: string; clientName: string; serviceName: string; transportServiceName: string | null };
type AppointmentPaymentTarget = { id: number; petName: string; expectedAmountCents: number; transportOnly: boolean };

function rangeFor(date: string, mode: ViewMode): { from: string; to: string } {
  const [y, m, d] = date.split("-").map(Number);
  const current = new Date(y, m - 1, d);
  if (mode === "day") return { from: date, to: date };
  if (mode === "month") {
    const first = new Date(y, m - 1, 1), last = new Date(y, m, 0);
    return { from: dateInput(first), to: dateInput(last) };
  }
  const mondayOffset = (current.getDay() + 6) % 7;
  const monday = new Date(y, m - 1, d - mondayOffset);
  const sunday = new Date(y, m - 1, d - mondayOffset + 6);
  return { from: dateInput(monday), to: dateInput(sunday) };
}
function shiftDate(date: string, mode: ViewMode, delta: number) {
  const [y, m, d] = date.split("-").map(Number);
  const next = mode === "month" ? new Date(y, m - 1 + delta, 1) : new Date(y, m - 1, d + (mode === "week" ? 7 : 1) * delta);
  return dateInput(next);
}
function niceDay(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(y, m - 1, d));
}
function showNotice(title: string, message: string) {
  if (typeof window !== "undefined" && typeof window.alert === "function") window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}
function confirmScheduleOverlap(message: string): Promise<boolean> {
  if (typeof window !== "undefined" && typeof window.confirm === "function") return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => {
    Alert.alert("Atenção: horário sobreposto", message, [
      { text: "Voltar", style: "cancel", onPress: () => resolve(false) },
      { text: "Agendar mesmo assim", onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}
function confirmCompletedDeletion(item: AppointmentItem): Promise<boolean> {
  const message = `Excluir o atendimento concluído de ${item.petName} em ${item.startAt.slice(0, 10).split("-").reverse().join("/")} às ${item.startAt.slice(11, 16)}? O registro sairá da agenda ativa, o pagamento será anulado no financeiro e, se foi usado pacote, a franquia será devolvida. Isso não inicia reembolso bancário.`;
  if (typeof window !== "undefined" && typeof window.confirm === "function") return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => {
    Alert.alert("Excluir atendimento concluído", message, [
      { text: "Manter", style: "cancel", onPress: () => resolve(false) },
      { text: "Excluir", style: "destructive", onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}
function confirmAppointmentDiscount(expectedCents: number, receivedCents: number): Promise<boolean> {
  const differenceCents = expectedCents - receivedCents;
  const message = `Valor agendado: ${money(expectedCents)}. Valor recebido: ${money(receivedCents)}. Desconto: ${money(differenceCents)}. O Financeiro registrará exatamente o valor recebido. Deseja confirmar?`;
  if (typeof window !== "undefined" && typeof window.confirm === "function") return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => {
    Alert.alert("Confirmar desconto", message, [
      { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
      { text: "OK", onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}
function monthDays(date: string) {
  const [year, month] = date.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const offset = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(year, month - 1, 1 - offset + index);
    return { date: dateInput(day), number: day.getDate(), currentMonth: day.getMonth() === month - 1 };
  });
}

export default function AgendaScreen() {
  const [mode, setMode] = useState<ViewMode>("day");
  const [agendaTab, setAgendaTab] = useState<AgendaTab>("pending");
  const [selectedDate, setSelectedDate] = useState(dateInput());
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AppointmentItem | null>(null);
  const [clientId, setClientId] = useState("");
  const [petId, setPetId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState(dateInput());
  const [time, setTime] = useState("09:00");
  const [method, setMethod] = useState<PaymentMethod>("pix");
  const [packageId, setPackageId] = useState("");
  const [transportEnabled, setTransportEnabled] = useState(false);
  const [transportServiceId, setTransportServiceId] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentTarget, setPaymentTarget] = useState<AppointmentPaymentTarget | null>(null);
  const [receivedAmount, setReceivedAmount] = useState("");
  const [receivedMethod, setReceivedMethod] = useState<Exclude<PaymentMethod, "package">>("pix");
  const [paymentError, setPaymentError] = useState("");
  const [calendars, setCalendars] = useState<Calendar.Calendar[]>([]);
  const [calendarId, setCalendarId] = useState("");
  const [syncCalendar, setSyncCalendar] = useState(false);
  const [calendarSetupError, setCalendarSetupError] = useState("");
  const [calendarSetupLoading, setCalendarSetupLoading] = useState(false);
  const [calendarRetryOnly, setCalendarRetryOnly] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [calendarCleanupId, setCalendarCleanupId] = useState<number | null>(null);
  const saveLock = useRef(false);
  const cleanupLock = useRef<number | null>(null);
  const calendarRequestLock = useRef(false);
  const range = useMemo(() => rangeFor(selectedDate, mode), [selectedDate, mode]);
  const calendarDays = useMemo(() => monthDays(selectedDate), [selectedDate]);
  const utils = trpc.useUtils();
  const appts = trpc.vila.appointments.list.useQuery({ ...range, includeCalendarCleanup: true }, { staleTime: 15000 });
  const clients = trpc.vila.clients.list.useQuery({});
  const services = trpc.vila.services.list.useQuery({ includeInactive: Boolean(editing) });
  const packages = trpc.vila.packages.list.useQuery({});
  const create = trpc.vila.appointments.create.useMutation({ onSuccess: () => { void utils.vila.appointments.invalidate(); void utils.vila.dashboard.summary.invalidate(); } });
  const update = trpc.vila.appointments.update.useMutation({ onSuccess: () => { void utils.vila.appointments.invalidate(); void utils.vila.packages.invalidate(); void utils.vila.finance.invalidate(); void utils.vila.dashboard.summary.invalidate(); } });
  const changeStatus = trpc.vila.appointments.setStatus.useMutation({ onSuccess: (_data, variables) => { utils.vila.appointments.list.setData({ ...range, includeCalendarCleanup: true }, (old) => old?.map((item) => item.id === variables.id ? { ...item, status: variables.status } : item)); if (variables.status === "completed") setAgendaTab("completed"); void utils.vila.appointments.invalidate(); void utils.vila.packages.invalidate(); void utils.vila.finance.invalidate(); void utils.vila.dashboard.summary.invalidate(); } });
  const deleteCompleted = trpc.vila.appointments.deleteCompleted.useMutation({ onSuccess: (_data, variables) => { utils.vila.appointments.list.setData({ ...range, includeCalendarCleanup: true }, (old) => old?.map((item) => item.id === variables.id ? { ...item, deletedAt: new Date() } : item)); void utils.vila.appointments.invalidate(); void utils.vila.packages.invalidate(); void utils.vila.finance.invalidate(); void utils.vila.dashboard.summary.invalidate(); } });
  const setPayment = trpc.vila.appointments.setPayment.useMutation({ onSuccess: () => { void utils.vila.appointments.invalidate(); void utils.vila.finance.invalidate(); void utils.vila.dashboard.summary.invalidate(); } });
  const linkEvent = trpc.vila.appointments.setCalendarEvent.useMutation({ onSuccess: () => { void utils.vila.appointments.invalidate(); void utils.vila.dashboard.summary.invalidate(); } });
  const activeClients = clients.data || [];
  const pets: PetOption[] = activeClients.flatMap((client) => client.pets.map((pet) => ({ ...pet, clientId: client.id })));
  const clientOptions = activeClients.map((client) => ({ value: String(client.id), label: client.name, detail: `${client.pets.length} ${client.pets.length === 1 ? "pet" : "pets"}` }));
  const selectedClient = activeClients.find((client) => client.id === Number(clientId));
  const selectedPet = pets.find((pet) => pet.id === Number(petId));
  const serviceList = (services.data || []).filter((service) => (service.category !== "transport" || service.id === editing?.serviceId) && (service.active === 1 || service.id === editing?.serviceId) && (!service.size || !selectedPet || service.size === selectedPet.size || service.id === editing?.serviceId));
  const transportServiceList = (services.data || []).filter((service) => service.category === "transport" && (service.active === 1 || service.id === editing?.transportServiceId) && (!service.size || !selectedPet || service.size === selectedPet.size || service.id === editing?.transportServiceId));
  const packageList = (packages.data || []).filter((item) => item.status === "active" && item.startDate <= date && item.endDate >= date);
  const petOptions = (selectedClient?.pets || []).map((pet) => ({ value: String(pet.id), label: pet.name, detail: pet.breed || "" }));
  const serviceOptions = serviceList.map((service) => ({ value: String(service.id), label: service.name, detail: `${money(service.priceCents)} · ${service.durationMinutes} min` }));
  const transportOptions = transportServiceList.map((service) => ({ value: String(service.id), label: service.name, detail: money(service.priceCents) }));
  const selectedTransport = transportServiceList.find((service) => service.id === Number(transportServiceId));
  const packageOptions = packageList.filter((item) => !petId || item.petId === Number(petId)).map((item) => {
    const selectedBenefit = item.benefits.find((benefit) => benefit.serviceId === Number(serviceId));
    const free = selectedBenefit ? Math.max(selectedBenefit.allowance - selectedBenefit.used - selectedBenefit.reserved, 0) : item.benefits.reduce((sum, benefit) => sum + Math.max(benefit.allowance - benefit.used - benefit.reserved, 0), 0);
    return { value: String(item.id), label: item.name, detail: `${item.petName} · ${CADENCE_LABELS[item.cadence]} · ${free} ${serviceId ? "livres neste serviço" : "franquias livres"} · até ${item.endDate}` };
  });
  const calendarOptions = calendars.map((calendar) => ({ value: calendar.id, label: calendar.title || "Google Agenda", detail: calendar.ownerAccount || calendar.source?.name || "Conta Google" }));

  function close() { setOpen(false); setEditing(null); setCalendarRetryOnly(false); setError(""); }
  async function startNew() {
    if (calendarRequestLock.current) return;
    calendarRequestLock.current = true;
    setEditing(null); setCalendarRetryOnly(false); setClientId(""); setPetId(""); setServiceId(""); setDate(selectedDate); setTime("09:00"); setMethod("pix"); setPackageId(""); setTransportEnabled(false); setTransportServiceId(""); setNotes(""); setSyncCalendar(true); setCalendarId(""); setCalendars([]); setCalendarSetupError(""); setError(""); setCalendarSetupLoading(true);
    try {
      const available = await requestWritableCalendars();
      setCalendars(available);
      setCalendarId((available.find((item) => item.isPrimary) || available[0]).id);
    } catch (e) {
      setCalendarSetupError(e instanceof Error ? e.message : "Não foi possível localizar uma agenda Google no aparelho.");
    } finally {
      calendarRequestLock.current = false;
      setCalendarSetupLoading(false);
      setOpen(true);
    }
  }
  function edit(item: AppointmentItem) { setEditing(item); setCalendarRetryOnly(false); setClientId(String(item.clientId)); setPetId(String(item.petId)); setServiceId(String(item.serviceId)); setDate(item.startAt.slice(0, 10)); setTime(item.startAt.slice(11, 16)); setMethod(item.paymentMethod); setPackageId(item.packageId ? String(item.packageId) : ""); setTransportEnabled(Boolean(item.transportServiceId)); setTransportServiceId(item.transportServiceId ? String(item.transportServiceId) : ""); setNotes(item.notes || ""); setSyncCalendar(Boolean(item.externalCalendarEventId || item.calendarSyncEnabled)); setCalendarId(item.externalCalendarId || ""); setCalendars([]); setCalendarSetupError(""); setError(""); setOpen(true); }
  async function enableDeviceCalendar() {
    if (calendarRequestLock.current) return;
    calendarRequestLock.current = true;
    const reopen = open;
    if (reopen) { setOpen(false); await new Promise((resolve) => setTimeout(resolve, 300)); }
    setCalendarSetupLoading(true);
    try {
      const available = await requestWritableCalendars();
      setCalendars(available);
      const primary = available.find((item) => item.isPrimary) || available[0];
      setCalendarId(primary.id);
      setSyncCalendar(true);
      setCalendarSetupError("");
    } catch (e) { setCalendarSetupError(e instanceof Error ? e.message : "Não foi possível acessar uma agenda Google."); }
    finally { calendarRequestLock.current = false; setCalendarSetupLoading(false); if (reopen) setOpen(true); }
  }
  function toggleCalendarSync() {
    if (syncCalendar) { setSyncCalendar(false); setCalendarSetupError(""); return; }
    if (calendars.length) { setSyncCalendar(true); setCalendarSetupError(""); if (!calendarId) setCalendarId(calendars[0].id); return; }
    void enableDeviceCalendar();
  }
  function toggleTransport() {
    if (transportEnabled) { setTransportEnabled(false); setTransportServiceId(""); return; }
    setTransportEnabled(true);
  }
  function openAppointmentPayment(item: AppointmentItem, transportOnly = false) {
    const expectedAmountCents = transportOnly ? item.transportPriceCents : appointmentChargeCents(item.paymentMethod, item.priceCents, item.transportPriceCents);
    if (expectedAmountCents <= 0) { showNotice("Pagamento", "Não há valor positivo pendente para receber neste atendimento."); return; }
    setPayment.reset();
    setPaymentError("");
    setPaymentTarget({ id: item.id, petName: item.petName, expectedAmountCents, transportOnly });
    setReceivedAmount((expectedAmountCents / 100).toFixed(2).replace(".", ","));
    setReceivedMethod(item.transportPaymentMethod || "pix");
  }
  async function saveReceivedPayment() {
    const target = paymentTarget;
    if (!target) return;
    try {
      const amountCents = centsFromInput(receivedAmount);
      if (amountCents <= 0) throw new Error("Informe um valor recebido maior que zero.");
      if (amountCents < target.expectedAmountCents && !await confirmAppointmentDiscount(target.expectedAmountCents, amountCents)) return;
      await setPayment.mutateAsync({ id: target.id, paymentStatus: "paid", amountCents, ...(target.transportOnly ? { paymentMethod: receivedMethod } : {}) });
      setPaymentTarget(null);
      setPaymentError("");
    } catch (e) { setPaymentError(e instanceof Error ? e.message : "Não foi possível registrar o valor recebido."); }
  }
  function toEventDetails(item: { petName: string; serviceName: string; clientName: string; transportServiceName?: string | null; transportPriceCents?: number; notes?: string | null; startAt: string; durationMinutes: number; packageId?: number | null; packageName?: string | null }, appointmentId?: number) {
    const details = appointmentCalendarEventDetails({
      id: appointmentId || 0,
      packageId: item.packageId ?? null,
      packageName: item.packageName || packages.data?.find((candidate) => candidate.id === item.packageId)?.name || null,
      petName: item.petName,
      clientName: item.clientName,
      serviceName: item.serviceName,
      transportServiceName: item.transportServiceName || null,
      transportPriceCents: item.transportPriceCents || 0,
      notes: item.notes || null,
      startAt: item.startAt,
      durationMinutes: item.durationMinutes,
    });
    return { ...details, marker: appointmentId ? details.marker : undefined };
  }
  async function saveAppointment() {
    if (saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    try { await saveAppointmentFlow(); }
    finally { saveLock.current = false; setSaving(false); }
  }
  async function saveAppointmentFlow() {
    setError("");
    const pet = pets.find((item) => item.id === Number(petId));
    const service = serviceList.find((item) => item.id === Number(serviceId));
    if (!pet || pet.clientId !== Number(clientId) || !service) { setError("Selecione o tutor, o pet e o serviço."); return; }
    const transport = transportEnabled ? transportServiceList.find((item) => item.id === Number(transportServiceId)) : undefined;
    if (transportEnabled && !transport) { setError(transportOptions.length ? "Selecione uma modalidade de transporte do catálogo." : "Cadastre uma modalidade de transporte no catálogo antes de ativá-la."); return; }
    if (!isValidLocalDateTime(date, time)) { setError("Selecione uma data e um horário válidos."); return; }
    if (method === "package" && !packageId) { setError("Selecione um pacote para este atendimento."); return; }
    if (syncCalendar && !calendarId) { setError(calendarSetupError || "Selecione uma agenda Google antes de salvar."); return; }
    const clientName = activeClients.find((client) => client.id === pet.clientId)?.name || "Tutor";
    const updatedItem = { petName: pet.name, clientName, serviceName: service.name, transportServiceName: transport?.name || null, transportPriceCents: transport?.priceCents || 0, startAt: localDateTime(date, time), durationMinutes: service.durationMinutes, notes, packageId: method === "package" ? Number(packageId) : null };
    const updatedEventDetails = toEventDetails(updatedItem, editing?.id);
    function retainPendingCalendarEvent(eventId: string, targetCalendarId: string, message: string) {
      if (!editing) return;
      setEditing({ ...editing, externalCalendarId: targetCalendarId, externalCalendarEventId: eventId });
      setCalendarId(targetCalendarId);
      setSyncCalendar(true);
      setCalendarRetryOnly(true);
      setError(message);
    }
    let sameDayAppointments: AppointmentItem[] = [];
    let overlapCheckAvailable = true;
    try {
      sameDayAppointments = await utils.vila.appointments.list.fetch({ from: date, to: date });
    } catch {
      overlapCheckAvailable = false;
    }
    const overlaps = sameDayAppointments.filter((item) => !item.deletedAt && item.id !== editing?.id && !["cancelled", "no_show"].includes(item.status)).filter((item) => {
      return appointmentIntervalsOverlap(parseLocalDateTime(localDateTime(date, time)), service.durationMinutes, parseLocalDateTime(item.startAt), item.durationMinutes);
    });
    if (!overlapCheckAvailable) {
      if (!await confirmScheduleOverlap("Não foi possível consultar os outros horários agora. O agendamento pode continuar, mas talvez coincida com outro. Deseja prosseguir?")) return;
    } else if (overlaps.length) {
      const examples = overlaps.slice(0, 3).map((item) => `${item.startAt.slice(11, 16)} · ${item.petName} (${item.clientName})`).join("\n");
      const more = overlaps.length > 3 ? `\n+ ${overlaps.length - 3} outro(s)` : "";
      const message = `${pet.name} ficará em horário sobreposto com:\n${examples}${more}\n\nDeseja agendar assim mesmo?`;
      if (!await confirmScheduleOverlap(message)) return;
    }
    if (editing) {
      const hasOldEvent = Boolean(editing.externalCalendarId && editing.externalCalendarEventId);
      if (syncCalendar && hasOldEvent && calendarId !== editing.externalCalendarId) {
        setError("Para trocar de agenda com segurança, primeiro salve com a sincronização desligada e conclua a remoção do evento antigo. Depois, edite novamente e escolha a nova agenda.");
        return;
      }
      const oldDetails = toEventDetails(editing, editing.id);
      let createdEventId: string | null = null;
      let existingEventUpdated = false;
      try {
        if (syncCalendar && hasOldEvent && calendarId === editing.externalCalendarId) {
          existingEventUpdated = true;
          await updateCalendarEvent(calendarId, editing.externalCalendarEventId as string, updatedEventDetails);
        } else if (syncCalendar) {
          createdEventId = await createCalendarEvent(calendarId, updatedEventDetails);
        }
      } catch (e) {
        if (existingEventUpdated && hasOldEvent) await updateCalendarEvent(editing.externalCalendarId as string, editing.externalCalendarEventId as string, oldDetails).catch(() => undefined);
        setError(e instanceof Error ? e.message : "Não foi possível preparar o evento do calendário.");
        return;
      }

      try {
        await update.mutateAsync({ id: editing.id, date, time, serviceId: Number(serviceId), transportServiceId: transport?.id || null, paymentMethod: method, packageId: method === "package" ? Number(packageId) : null, notes: notes.trim() || undefined, calendarCleanupRequested: !syncCalendar && hasOldEvent, calendarSyncEnabled: syncCalendar });
      } catch (e) {
        const compensationProblems: string[] = [];
        if (existingEventUpdated && hasOldEvent) {
          try { await updateCalendarEvent(editing.externalCalendarId as string, editing.externalCalendarEventId as string, oldDetails); }
          catch { compensationProblems.push("O app recusou o reagendamento, mas não foi possível restaurar o evento anterior."); }
        }
        if (createdEventId) {
          try { await deleteCalendarEvent(createdEventId); }
          catch {
            retainPendingCalendarEvent(createdEventId, calendarId, `O atendimento não foi atualizado, mas o evento provisório continua no Google Agenda. Tente novamente neste formulário para vinculá-lo sem criar outro. ${e instanceof Error ? e.message : ""}`);
            return;
          }
        }
        setError(`${e instanceof Error ? e.message : "Não foi possível salvar o agendamento."}${compensationProblems.length ? ` ${compensationProblems.join(" ")}` : ""}`);
        return;
      }

      if (syncCalendar && createdEventId) {
        try {
          await linkEvent.mutateAsync({ id: editing.id, calendarId, eventId: createdEventId });
        } catch (e) {
          try { await deleteCalendarEvent(createdEventId); }
          catch {
            retainPendingCalendarEvent(createdEventId, calendarId, `O agendamento foi salvo, mas o evento Google continua sem vínculo no app. Tente novamente neste formulário para vincular o mesmo evento, sem criar outra cópia. ${e instanceof Error ? e.message : ""}`);
            return;
          }
          showNotice("Agendamento salvo com aviso", `O atendimento foi atualizado, mas o evento Google não foi vinculado. A cópia temporária foi removida; tente salvar novamente para criar outro evento. ${e instanceof Error ? e.message : ""}`);
          close();
          return;
        }
        if (hasOldEvent) {
          try { await deleteCalendarEvent(editing.externalCalendarEventId as string); }
          catch {
            await updateCalendarEvent(editing.externalCalendarId as string, editing.externalCalendarEventId as string, updatedEventDetails).catch(() => undefined);
            showNotice("Calendário parcialmente atualizado", "O novo evento está vinculado, mas não foi possível remover o compromisso anterior. Revise o calendário antigo para evitar duplicidade.");
          }
        }
      } else if (syncCalendar && calendarRetryOnly && hasOldEvent) {
        try { await linkEvent.mutateAsync({ id: editing.id, calendarId, eventId: editing.externalCalendarEventId as string }); }
        catch (e) { setError(`O atendimento continua salvo, mas o vínculo ao Google Agenda falhou. Tente novamente. ${e instanceof Error ? e.message : ""}`); return; }
      } else if (syncCalendar && hasOldEvent) {
        try { await linkEvent.mutateAsync({ id: editing.id, calendarId: editing.externalCalendarId as string, eventId: editing.externalCalendarEventId as string }); }
        catch (e) { showNotice("Agendamento salvo", `O evento foi atualizado, mas a fila de limpeza Google ainda não foi encerrada. A pendência continua visível na Agenda. ${e instanceof Error ? e.message : ""}`); close(); return; }
      } else if (!syncCalendar && hasOldEvent) {
        try {
          await deleteCalendarEvent(editing.externalCalendarEventId as string);
        } catch (e) {
          showNotice("Remoção Google pendente", `O atendimento foi salvo e o vínculo antigo foi mantido para retry. A pendência aparece na Agenda; tente excluir o evento novamente. ${e instanceof Error ? e.message : ""}`);
          close();
          return;
        }
        try {
          await linkEvent.mutateAsync({ id: editing.id, calendarId: null, eventId: null, expectedEventId: editing.externalCalendarEventId as string });
        } catch (e) {
          showNotice("Evento removido; limpeza pendente", `O evento foi removido do aparelho, mas o vínculo ainda não foi limpo no app. A pendência permanece visível e o retry pode concluir sem duplicar o evento. ${e instanceof Error ? e.message : ""}`);
          close();
          return;
        }
      }
      void utils.vila.appointments.invalidate();
      close();
      return;
    }

    let result: { id: number };
    try {
      result = await create.mutateAsync({ petId: pet.id, serviceId: service.id, transportServiceId: transport?.id || null, date, time, paymentMethod: method, packageId: method === "package" ? Number(packageId) : null, notes: notes.trim() || undefined, calendarSyncEnabled: syncCalendar });
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar o agendamento."); return; }
    const savedItem: AppointmentItem = {
      id: result.id, clientId: pet.clientId, petId: pet.id, serviceId: service.id, transportServiceId: transport?.id || null, transportPriceCents: transport?.priceCents || 0, transportPaymentMethod: null,
      startAt: localDateTime(date, time), durationMinutes: service.durationMinutes, priceCents: service.priceCents,
      paymentMethod: method, paymentStatus: "pending", packageId: method === "package" ? Number(packageId) : null, calendarSyncEnabled: syncCalendar ? 1 : 0,
      status: "scheduled", deletedAt: null, notes: notes.trim() || null, externalCalendarId: null, externalCalendarEventId: null,
      petName: pet.name, clientName, serviceName: service.name, transportServiceName: transport?.name || null,
    };
    if (syncCalendar) {
      let pendingEventId: string | null = null;
      try {
        pendingEventId = await createCalendarEvent(calendarId, toEventDetails(updatedItem, result.id));
        await linkEvent.mutateAsync({ id: result.id, calendarId, eventId: pendingEventId });
      } catch (e) {
        if (pendingEventId) {
          try { await deleteCalendarEvent(pendingEventId); pendingEventId = null; }
          catch { /* Preserve the event ID so a retry can finish linking it instead of duplicating it. */ }
        }
        setEditing({ ...savedItem, externalCalendarId: pendingEventId ? calendarId : null, externalCalendarEventId: pendingEventId });
        setCalendarRetryOnly(true);
        setError(`O atendimento #${result.id} já foi salvo na agenda da Vila, mas não terminou a sincronização Google. Tente novamente neste formulário antes de criar outro agendamento. ${e instanceof Error ? e.message : ""}`);
        return;
      }
    }
    close();
  }
  async function cleanupCalendarEvent(item: AppointmentItem, unlinkOnly = false) {
    if (!item.externalCalendarEventId || cleanupLock.current !== null) return;
    cleanupLock.current = item.id;
    setCalendarCleanupId(item.id);
    try {
      if (!unlinkOnly) await deleteCalendarEvent(item.externalCalendarEventId);
      await linkEvent.mutateAsync({ id: item.id, calendarId: null, eventId: null, expectedEventId: item.externalCalendarEventId, syncChoiceMade: unlinkOnly });
      if (unlinkOnly) showNotice("Referência removida", "O app não tentará mais excluir este evento. Se ele continuar no calendário do aparelho, remova-o manualmente.");
    } catch (e) {
      showNotice("Limpeza do calendário pendente", `O atendimento permanece salvo. Tente novamente para remover o evento e limpar o vínculo, ou desvincule a referência e remova o evento manualmente. ${e instanceof Error ? e.message : ""}`);
    } finally {
      cleanupLock.current = null;
      setCalendarCleanupId(null);
    }
  }
  async function removeCompletedAppointment(item: AppointmentItem) {
    if (item.status !== "completed" || item.deletedAt) return;
    if (!await confirmCompletedDeletion(item)) return;
    try {
      await deleteCompleted.mutateAsync({ id: item.id });
      if (item.externalCalendarEventId) await cleanupCalendarEvent(item);
      else showNotice("Atendimento excluído", "O pagamento interno foi anulado e, se havia pacote, a franquia foi devolvida ao saldo.");
    } catch (e) { showNotice("Não foi possível excluir", e instanceof Error ? e.message : "Tente novamente após atualizar a agenda."); }
  }
  function openGoogleEvent(item: AppointmentItem) {
    if (!item.externalCalendarEventId) return;
    try { openCalendarEvent(item.externalCalendarEventId); }
    catch (e) { showNotice("Google Agenda", e instanceof Error ? e.message : "Não foi possível abrir o evento no calendário do aparelho."); }
  }
  function updateStatus(item: AppointmentItem, status: AppointmentStatus) {
    const action = () => {
      changeStatus.mutate({ id: item.id, status }, {
        onSuccess: async () => {
          if (["cancelled", "no_show"].includes(status) && item.externalCalendarEventId) {
            await cleanupCalendarEvent(item);
          }
        },
      });
    };
    if (status === "cancelled") {
      if (typeof window !== "undefined" && typeof window.confirm === "function") { if (window.confirm(`Cancelar o horário de ${item.petName}?`)) action(); }
      else Alert.alert("Cancelar atendimento", `Cancelar o horário de ${item.petName}?`, [{ text: "Voltar", style: "cancel" }, { text: "Cancelar", style: "destructive", onPress: action }]);
      return;
    }
    action();
  }
  const heading = mode === "day" ? niceDay(selectedDate) : mode === "week" ? `${niceDay(range.from)} — ${niceDay(range.to)}` : new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(Number(selectedDate.slice(0, 4)), Number(selectedDate.slice(5, 7)) - 1, 1));
  const visibleItems = (appts.data || []) as AppointmentItem[];
  const activeItems = visibleItems.filter((item) => !item.deletedAt && !["cancelled", "no_show"].includes(item.status));
  const periodItems = activeItems.filter((item) => { const day = item.startAt.slice(0, 10); return mode === "month" ? day === selectedDate : day >= range.from && day <= range.to; });
  const pendingItems = periodItems.filter((item) => item.status !== "completed");
  const completedItems = periodItems.filter((item) => item.status === "completed");
  const displayedItems = agendaTab === "completed" ? completedItems : pendingItems;
  const pendingCalendarCleanup = visibleItems.filter((item) => Boolean(item.externalCalendarEventId) && (Boolean(item.calendarCleanupRequestedAt) || Boolean(item.deletedAt) || ["cancelled", "no_show"].includes(item.status)));

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <AppHeader eyebrow="Organização de horários" title="Agenda da Vila" right={<Pressable disabled={calendarSetupLoading} onPress={() => void startNew()} style={styles.newButton}><Text style={styles.newText}>{calendarSetupLoading ? "Aguarde…" : "+ Agendar"}</Text></Pressable>} />
        <View style={styles.modeSwitch}>{(["day", "week", "month"] as ViewMode[]).map((item) => <Pressable key={item} onPress={() => setMode(item)} style={[styles.modeItem, mode === item && styles.modeActive]}><Text style={[styles.modeText, mode === item && styles.modeTextActive]}>{item === "day" ? "Dia" : item === "week" ? "Semana" : "Mês"}</Text></Pressable>)}</View>
        <View style={styles.dateNav}><Pressable onPress={() => setSelectedDate(shiftDate(selectedDate, mode, -1))} style={styles.arrow}><Text style={styles.arrowText}>‹</Text></Pressable><View style={{ flex: 1, alignItems: "center" }}><Text style={styles.dateLabel}>{heading}</Text><Pressable onPress={() => setSelectedDate(dateInput())}><Text style={styles.todayLink}>Ir para hoje</Text></Pressable></View><Pressable onPress={() => setSelectedDate(shiftDate(selectedDate, mode, 1))} style={styles.arrow}><Text style={styles.arrowText}>›</Text></Pressable></View>
        {mode === "month" ? <Panel style={styles.monthPanel}>
          <View style={styles.weekdayRow}>{["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"].map((day, index) => <Text key={`${day}-${index}`} style={styles.weekday}>{day}</Text>)}</View>
          <View style={styles.monthGrid}>{calendarDays.map((day) => {
            const count = day.currentMonth ? visibleItems.filter((item) => !item.deletedAt && item.startAt.slice(0, 10) === day.date && !["cancelled", "no_show"].includes(item.status)).length : 0;
            return <Pressable key={day.date} onPress={() => setSelectedDate(day.date)} style={[styles.monthDay, !day.currentMonth && styles.monthDayOutside, day.date === selectedDate && styles.monthDaySelected, day.date === dateInput() && day.date !== selectedDate && styles.monthDayToday]}><Text style={[styles.monthDayText, !day.currentMonth && styles.monthDayTextOutside, day.date === selectedDate && styles.monthDayTextSelected]}>{day.number}</Text>{count > 0 ? <View style={[styles.eventDot, day.date === selectedDate && styles.eventDotSelected]} /> : <View style={styles.noEventDot} />}</Pressable>;
          })}</View>
          <Text style={styles.monthHint}>Toque em um dia para ver seus horários. O ponto indica agendamentos.</Text>
        </Panel> : null}
        <Panel style={styles.daySummary}><Text style={styles.dayNumber}>{displayedItems.length}</Text><Text style={styles.daySummaryText}>{agendaTab === "pending" ? "agendamentos pendentes" : "agendamentos concluídos"} · {mode === "month" ? niceDay(selectedDate) : range.from === range.to ? "dia selecionado" : `${range.from} a ${range.to}`}</Text></Panel>
        <View style={styles.section}><SectionHeading title={agendaTab === "pending" ? "Agendamentos pendentes" : "Agendamentos concluídos"} detail={mode === "month" ? `Horários de ${niceDay(selectedDate)}.` : mode === "week" ? "Filtrados pela semana selecionada." : "Filtrados pelo dia selecionado."} />
          <View style={agendaSectionStyles.agendaTabs}>
            <Pressable accessibilityRole="button" accessibilityState={{ selected: agendaTab === "pending" }} onPress={() => setAgendaTab("pending")} style={[agendaSectionStyles.agendaTab, agendaTab === "pending" && agendaSectionStyles.agendaTabActive]}><Text style={[agendaSectionStyles.agendaTabText, agendaTab === "pending" && agendaSectionStyles.agendaTabTextActive]}>Pendentes ({pendingItems.length})</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{ selected: agendaTab === "completed" }} onPress={() => setAgendaTab("completed")} style={[agendaSectionStyles.agendaTab, agendaTab === "completed" && agendaSectionStyles.agendaTabActive]}><Text style={[agendaSectionStyles.agendaTabText, agendaTab === "completed" && agendaSectionStyles.agendaTabTextActive]}>Concluídos ({completedItems.length})</Text></Pressable>
          </View>
          {appts.isLoading ? <ActivityIndicator color={BRAND.orange} style={{ marginTop: 26 }} /> : appts.error ? <Panel><Text style={uiStyles.bodyText}>Não foi possível carregar a agenda. Confira a conexão.</Text></Panel> : displayedItems.length ? displayedItems.map((item) => <Panel key={item.id} style={styles.appointment}>
            <View style={styles.timeRow}><Text style={styles.time}>{item.startAt.slice(11, 16)}</Text><Text style={styles.dateMini}>{item.startAt.slice(0, 10).split("-").reverse().join("/")}</Text><StatusPill label={APPOINTMENT_STATUS_LABELS[item.status]} tone={item.status === "completed" ? "green" : "teal"} /></View>
            <Text style={styles.petName}>{item.petName}</Text><Text style={styles.details}>{item.serviceName} · {item.clientName}</Text>
            {item.transportServiceId ? <Text style={agendaSectionStyles.transportDetails}>Transporte · {item.transportServiceName || "Modalidade"} · {money(item.transportPriceCents)}</Text> : null}
            <View style={styles.priceRow}><Text style={styles.price}>{item.paymentMethod === "package" ? "Pacote" : money(appointmentChargeCents(item.paymentMethod, item.priceCents, item.transportPriceCents))}</Text><Text style={styles.duration}>{item.durationMinutes} min</Text><Text style={styles.duration}>{item.paymentMethod === "package" ? item.transportPriceCents > 0 ? item.paymentStatus === "paid" ? "Transporte pago" : "Transporte pendente" : "Franquia" : item.paymentStatus === "paid" ? "Pago" : "Pendente"}</Text></View>
            {item.paymentStatus === "paid" && item.receivedAmountCents !== null && item.receivedAmountCents !== undefined ? <Text style={styles.details}>Valor recebido: {money(item.receivedAmountCents)}{item.paymentMethod === "package" ? " · transporte" : ""}</Text> : null}
            {item.notes ? <Text style={styles.note}>{item.notes}</Text> : null}
            <View style={styles.cardActions}>
              {item.status === "scheduled" && <AppButton label="Confirmar agendamento" variant="secondary" onPress={() => updateStatus(item, "confirmed")} style={styles.smallAction} />}
              {item.status === "confirmed" && <AppButton label="Iniciar serviço" variant="secondary" onPress={() => updateStatus(item, "in_progress")} style={styles.smallAction} />}
              {item.status === "in_progress" && <AppButton label="Concluir serviço" onPress={() => updateStatus(item, "completed")} style={styles.smallAction} />}
              {item.status === "completed" && item.paymentStatus !== "paid" && item.paymentMethod !== "package" && <AppButton label="Confirmar pagamento" variant="secondary" onPress={() => openAppointmentPayment(item)} loading={setPayment.isPending} style={styles.smallAction} />}
              {item.status === "completed" && item.paymentMethod === "package" && item.transportPriceCents > 0 && item.paymentStatus !== "paid" && <AppButton label="Pagar transporte" variant="secondary" onPress={() => openAppointmentPayment(item, true)} loading={setPayment.isPending} style={styles.smallAction} />}
              {item.externalCalendarEventId ? <Pressable onPress={() => openGoogleEvent(item)} style={styles.textAction}><Text style={styles.editText}>Abrir Google Agenda</Text></Pressable> : null}
              {["scheduled", "confirmed"].includes(item.status) && <Pressable onPress={() => edit(item)} style={styles.textAction}><Text style={styles.editText}>Reagendar</Text></Pressable>}
              {item.status === "completed" && <Pressable onPress={() => edit(item)} style={styles.textAction}><Text style={styles.editText}>Editar</Text></Pressable>}
              {item.status === "completed" && <Pressable disabled={deleteCompleted.isPending} onPress={() => void removeCompletedAppointment(item)} style={styles.textAction}><Text style={styles.cancelText}>{deleteCompleted.isPending ? "Excluindo…" : "Excluir"}</Text></Pressable>}
              {["scheduled", "confirmed", "in_progress"].includes(item.status) && <Pressable onPress={() => updateStatus(item, "cancelled")} style={styles.textAction}><Text style={styles.cancelText}>Cancelar</Text></Pressable>}
            </View>
          </Panel>) : <EmptyState title={agendaTab === "pending" ? "Nenhum agendamento pendente" : "Nenhum agendamento concluído"} body={mode === "month" ? "Não há registros deste tipo neste dia. Toque em outro dia no calendário para consultar." : agendaTab === "pending" ? "Não há horários pendentes neste período." : "Os atendimentos concluídos neste período aparecerão aqui."} />}
        </View>
        {pendingCalendarCleanup.length ? <View style={styles.section}><SectionHeading title="Limpeza pendente no Google Agenda" detail="A fila inclui pedidos de remoção e eventos de atendimentos cancelados, não comparecidos ou excluídos, mesmo fora do período aberto." />{pendingCalendarCleanup.map((item) => <Panel key={`cleanup-${item.id}`} style={styles.cleanupPanel}><Text style={styles.petName}>{item.petName}</Text><Text style={styles.details}>{item.clientName} · {item.serviceName} · {item.calendarCleanupRequestedAt ? "Remoção solicitada" : item.deletedAt ? "Atendimento excluído" : item.status === "no_show" ? "Não compareceu" : "Cancelado"} · {item.startAt.slice(0, 10).split("-").reverse().join("/")} às {item.startAt.slice(11, 16)}</Text><View style={styles.cardActions}><AppButton label="Tentar excluir evento" variant="secondary" onPress={() => void cleanupCalendarEvent(item)} loading={calendarCleanupId === item.id} style={styles.smallAction} /><Pressable disabled={calendarCleanupId !== null} onPress={() => void cleanupCalendarEvent(item, true)} style={styles.textAction}><Text style={styles.cancelText}>Desvincular sem excluir</Text></Pressable><Pressable onPress={() => openGoogleEvent(item)} style={styles.textAction}><Text style={styles.editText}>Abrir Google Agenda</Text></Pressable></View></Panel>)}</View> : null}
        <Panel style={styles.calendarInfo}><Text style={styles.calendarTitle}>Sincronização com Google Agenda</Text><Text style={uiStyles.bodyText}>Novos horários são adicionados à conta Google selecionada no Android. O aparelho precisa ter essa conta adicionada e a sincronização do Calendário ativada. Toque em “Abrir Google Agenda” no agendamento para conferir o evento.</Text></Panel>
      </ScrollView>

      <FormSheet visible={open} title={calendarRetryOnly ? "Concluir sincronização Google" : editing?.status === "completed" ? "Editar atendimento concluído" : editing ? "Reagendar atendimento" : "Novo agendamento"} subtitle={calendarRetryOnly ? "O atendimento já foi salvo. Conclua a sincronização sem criar outro agendamento." : editing?.status === "completed" ? "A edição preserva o status concluído; o financeiro e a franquia são ajustados com segurança." : "O horário é validado contra os outros atendimentos da agenda."} onClose={close}>
        {editing ? <><Field label="Tutor" value={editing.clientName} onChangeText={() => undefined} editable={false} /><Field label="Pet" value={editing.petName} onChangeText={() => undefined} editable={false} /></> : <><ChoiceField searchable searchPlaceholder="Buscar tutor…" label="Tutor *" value={clientId} options={clientOptions} onChange={(value) => { setClientId(value); setPetId(""); setServiceId(""); setPackageId(""); setTransportServiceId(""); }} /><ChoiceField label="Pet *" value={petId} options={petOptions} onChange={(value) => { setPetId(value); setServiceId(""); setPackageId(""); setTransportServiceId(""); }} /></>}
        <ChoiceField label="Serviço *" value={serviceId} options={serviceOptions} onChange={setServiceId} />
        <Pressable onPress={toggleTransport} style={styles.paidToggle}><View style={[styles.checkbox, transportEnabled && styles.checkboxChecked]} /><View style={{ flex: 1 }}><Text style={styles.checkboxLabel}>Solicitar transporte</Text><Text style={styles.muted}>{transportEnabled ? "Ativado: escolha uma modalidade do catálogo." : "Desativado: nenhum transporte será incluído."}</Text></View></Pressable>
        {transportEnabled ? transportOptions.length ? <ChoiceField label="Modalidade de transporte *" value={transportServiceId} options={transportOptions} onChange={setTransportServiceId} /> : <Panel style={agendaSectionStyles.transportEmpty}><Text style={styles.muted}>Não há modalidade de transporte compatível ativa. Cadastre opções na categoria Transporte do Catálogo.</Text></Panel> : null}
        {transportEnabled && selectedTransport ? <Text style={styles.muted}>{method === "package" ? `Taxa de transporte cobrada à parte: ${money(selectedTransport.priceCents)}.` : `Total estimado: ${money(appointmentChargeCents(method, serviceList.find((item) => item.id === Number(serviceId))?.priceCents || 0, selectedTransport.priceCents))}.`}</Text> : null}
        <View style={styles.fieldRow}><DateTimeField label="Data *" mode="date" value={date} onChange={setDate} style={styles.half} /><DateTimeField label="Horário *" mode="time" value={time} onChange={setTime} style={styles.half} /></View>
        {editing?.status === "completed" ? <Text style={styles.muted}>Forma de pagamento: {PAYMENT_METHOD_LABELS[method]}. O pacote e a forma de pagamento ficam bloqueados para preservar o histórico financeiro.</Text> : <ChoiceField label="Forma de pagamento" value={method} options={[{ value: "pix", label: "Pix" }, { value: "cash", label: "Dinheiro" }, { value: "card", label: "Cartão" }, { value: "package", label: "Usar pacote" }]} onChange={setMethod} />}
        {method === "package" ? editing?.status === "completed" ? <Text style={styles.muted}>Pacote vinculado: {packages.data?.find((item) => item.id === Number(packageId))?.name || (packageId ? `#${packageId}` : "não localizado")}.</Text> : <ChoiceField label="Pacote do pet" value={packageId} options={packageOptions} onChange={setPackageId} /> : <Text style={styles.muted}>O pagamento só poderá ser confirmado depois de concluir o serviço.</Text>}
        <Field label="Observações" value={notes} onChangeText={setNotes} placeholder="Instruções para o atendimento…" multiline />
        <Pressable disabled={calendarSetupLoading} onPress={toggleCalendarSync} style={styles.paidToggle}><View style={[styles.checkbox, syncCalendar && styles.checkboxChecked]} /><View style={{ flex: 1 }}><Text style={styles.checkboxLabel}>{editing?.externalCalendarEventId ? "Manter evento no Google Agenda" : "Sincronizar com Google Agenda"}</Text><Text style={styles.muted}>{syncCalendar && calendarId ? `Agenda selecionada: ${calendars.find((item) => item.id === calendarId)?.title || "Conta Google"}` : syncCalendar ? "Ativada por padrão; falta localizar uma agenda Google." : "Desativada: o horário ficará somente na agenda da Vila."}</Text></View></Pressable>
        {syncCalendar && calendars.length > 1 ? <ChoiceField label="Escolher agenda Google" value={calendarId} options={calendarOptions} onChange={setCalendarId} /> : null}
        {syncCalendar && calendars.length === 1 ? <Text style={styles.googleAccount}>Google: {calendars[0].title} · {calendars[0].ownerAccount || calendars[0].source?.name}</Text> : null}
        <ErrorText message={error || calendarSetupError || create.error?.message || update.error?.message} />
        <AppButton label={calendarRetryOnly ? "Tentar sincronizar no Google Agenda" : editing?.status === "completed" ? "Salvar alterações" : editing ? "Salvar reagendamento" : "Salvar agendamento"} onPress={() => void saveAppointment()} loading={saving || calendarSetupLoading || create.isPending || update.isPending} />
      </FormSheet>
      <ReceivedPaymentSheet visible={paymentTarget !== null} title={paymentTarget?.transportOnly ? "Receber transporte" : "Confirmar pagamento"} subtitle={paymentTarget ? `${paymentTarget.petName} · previsto ${money(paymentTarget.expectedAmountCents)}. Informe o valor realmente recebido.` : "Informe o valor realmente recebido."} amount={receivedAmount} onAmountChange={setReceivedAmount} method={paymentTarget?.transportOnly ? receivedMethod : undefined} onMethodChange={paymentTarget?.transportOnly ? setReceivedMethod : undefined} error={paymentError || setPayment.error?.message} loading={setPayment.isPending} onSubmit={() => void saveReceivedPayment()} onClose={() => { setPaymentTarget(null); setPaymentError(""); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: BRAND.background }, content: { paddingBottom: 34 }, newButton: { borderRadius: 12, backgroundColor: BRAND.orange, paddingHorizontal: 12, paddingVertical: 9, marginTop: 8 }, newText: { color: BRAND.brown, fontSize: 11, fontWeight: "900" },
  monthPanel: { marginHorizontal: 20, padding: 12 }, weekdayRow: { flexDirection: "row", marginBottom: 5 }, weekday: { width: "14.2857%", color: BRAND.muted, textAlign: "center", fontSize: 8, fontWeight: "900", paddingVertical: 5 }, monthGrid: { flexDirection: "row", flexWrap: "wrap" }, monthDay: { width: "14.2857%", minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: 11, marginVertical: 1 }, monthDayOutside: { opacity: 0.35 }, monthDaySelected: { backgroundColor: BRAND.green }, monthDayToday: { borderWidth: 1, borderColor: BRAND.orange }, monthDayText: { color: BRAND.cream, fontSize: 12, fontWeight: "700" }, monthDayTextOutside: { color: BRAND.muted }, monthDayTextSelected: { color: BRAND.cream }, eventDot: { width: 4, height: 4, borderRadius: 3, backgroundColor: BRAND.orange, marginTop: 3 }, eventDotSelected: { backgroundColor: BRAND.cream }, noEventDot: { width: 4, height: 4, marginTop: 3 }, monthHint: { color: BRAND.muted, fontSize: 10, lineHeight: 15, textAlign: "center", marginTop: 9 },
  modeSwitch: { flexDirection: "row", marginHorizontal: 20, padding: 4, borderRadius: 14, backgroundColor: BRAND.surface, marginBottom: 12 }, modeItem: { flex: 1, paddingVertical: 9, alignItems: "center", borderRadius: 11 }, modeActive: { backgroundColor: BRAND.green }, modeText: { color: BRAND.muted, fontSize: 12, fontWeight: "700" }, modeTextActive: { color: BRAND.cream },
  dateNav: { flexDirection: "row", alignItems: "center", marginHorizontal: 20, gap: 10, marginBottom: 13 }, arrow: { width: 40, height: 40, borderRadius: 13, backgroundColor: BRAND.surface, justifyContent: "center", alignItems: "center" }, arrowText: { color: BRAND.orange, fontSize: 24, lineHeight: 27 }, dateLabel: { color: BRAND.cream, fontWeight: "800", fontSize: 15, textTransform: "capitalize", textAlign: "center" }, todayLink: { color: BRAND.teal, fontSize: 11, fontWeight: "800", marginTop: 4 },
  daySummary: { marginHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 10, padding: 14 }, dayNumber: { color: BRAND.orange, fontSize: 24, fontWeight: "900" }, daySummaryText: { color: BRAND.muted, fontSize: 12, flex: 1 }, section: { marginTop: 21, paddingHorizontal: 20 }, appointment: { padding: 14, marginBottom: 10 }, cleanupPanel: { padding: 12, marginBottom: 8, borderColor: BRAND.danger }, cancelled: { opacity: 0.65 }, timeRow: { flexDirection: "row", alignItems: "center", gap: 10 }, time: { color: BRAND.teal, fontSize: 14, fontWeight: "900" }, dateMini: { color: BRAND.muted, fontSize: 10, flex: 1 }, petName: { color: BRAND.cream, fontSize: 16, fontWeight: "800", marginTop: 13 }, details: { color: BRAND.muted, fontSize: 12, marginTop: 4 }, priceRow: { borderTopColor: BRAND.border, borderTopWidth: 1, flexDirection: "row", alignItems: "center", gap: 12, marginTop: 11, paddingTop: 9 }, price: { color: BRAND.orange, fontSize: 14, fontWeight: "900", flex: 1 }, duration: { color: BRAND.muted, fontSize: 10 }, note: { color: BRAND.teal, fontSize: 11, marginTop: 8 }, cardActions: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 12, flexWrap: "wrap" }, smallAction: { minHeight: 36, paddingVertical: 8, paddingHorizontal: 12 }, textAction: { paddingHorizontal: 4, paddingVertical: 8 }, editText: { color: BRAND.teal, fontSize: 11, fontWeight: "800" }, cancelText: { color: "#E8897F", fontSize: 11, fontWeight: "800" }, calendarInfo: { marginHorizontal: 20, marginTop: 18, backgroundColor: "#25251F", borderColor: "#55452E" }, calendarTitle: { color: BRAND.orange, fontWeight: "800", fontSize: 14, marginBottom: 7 }, googleAccount: { color: BRAND.teal, fontSize: 11, marginBottom: 12 },
  fieldRow: { flexDirection: "row", gap: 8 }, half: { flex: 1 }, paidToggle: { flexDirection: "row", alignItems: "center", gap: 9, minHeight: 44, marginBottom: 14 }, checkbox: { width: 18, height: 18, borderWidth: 1, borderColor: BRAND.muted, borderRadius: 5 }, checkboxChecked: { backgroundColor: BRAND.orange, borderColor: BRAND.orange }, checkboxLabel: { color: BRAND.cream, fontSize: 13, fontWeight: "700" }, muted: { color: BRAND.muted, fontSize: 10, marginTop: 3 },
});

const agendaSectionStyles = StyleSheet.create({
  agendaTabs: { flexDirection: "row", gap: 6, padding: 4, marginTop: 14, marginBottom: 14, borderRadius: 14, backgroundColor: BRAND.surface },
  agendaTab: { flex: 1, minHeight: 42, justifyContent: "center", alignItems: "center", paddingHorizontal: 6, borderRadius: 11 },
  agendaTabActive: { backgroundColor: BRAND.green },
  agendaTabText: { color: BRAND.muted, fontSize: 11, fontWeight: "700", textAlign: "center" },
  agendaTabTextActive: { color: BRAND.cream },
  transportDetails: { color: BRAND.teal, fontSize: 11, marginTop: 4 },
  transportEmpty: { marginVertical: 8, padding: 12 },
});
