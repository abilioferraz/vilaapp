import * as Calendar from "expo-calendar/legacy";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { appointmentCalendarMarkerIds, hotelCalendarExclusiveEndDate, isOrphanVilaAppointmentEvent, money, parseLocalDateTime, toCsv } from "@/shared/vila";

type ExportData = {
  clients: Array<Record<string, any>>;
  pets: Array<Record<string, any>>;
  services: Array<Record<string, any>>;
  packages: Array<Record<string, any>>;
  appointments: Array<Record<string, any>>;
  payments: Array<Record<string, any>>;
  suppliers: Array<Record<string, any>>;
  purchases: Array<Record<string, any>>;
  purchaseItems: Array<Record<string, any>>;
};

export async function exportStoreData(data: ExportData) {
  if (Platform.OS === "web") throw new Error("A exportação CSV está disponível no app Android.");
  if (!FileSystem.documentDirectory) throw new Error("A pasta de documentos não está disponível.");
  const sections: Array<{ title: string; fields: Array<[string, string]>; rows: Array<Record<string, any>> }> = [
    { title: "TUTORES", fields: [["id", "ID"], ["name", "Nome"], ["phone", "Telefone"], ["address", "Endereço"], ["email", "E-mail"], ["active", "Ativo"]], rows: data.clients },
    { title: "PETS", fields: [["id", "ID"], ["clientId", "Tutor ID"], ["name", "Nome"], ["species", "Espécie"], ["breed", "Raça"], ["size", "Porte"], ["notes", "Observações"]], rows: data.pets },
    { title: "SERVIÇOS", fields: [["id", "ID"], ["name", "Nome"], ["category", "Categoria"], ["size", "Porte"], ["priceCents", "Preço centavos"], ["durationMinutes", "Duração minutos"], ["sortOrder", "Ordem catálogo"], ["active", "Ativo"]], rows: data.services },
    { title: "PACOTES", fields: [["id", "ID"], ["clientId", "Tutor ID"], ["petId", "Pet ID"], ["name", "Nome"], ["cadence", "Periodicidade"], ["startDate", "Início"], ["endDate", "Fim"], ["priceCents", "Preço centavos"], ["status", "Status"], ["paid", "Pago"]], rows: data.packages },
    { title: "AGENDAMENTOS", fields: [["id", "ID"], ["clientId", "Tutor ID"], ["petId", "Pet ID"], ["serviceId", "Serviço principal ID"], ["transportServiceId", "Transporte ID"], ["startAt", "Data/hora local"], ["durationMinutes", "Duração minutos"], ["priceCents", "Serviço centavos"], ["transportPriceCents", "Transporte centavos"], ["transportPaymentMethod", "Forma pagamento transporte"], ["paymentMethod", "Pagamento"], ["paymentStatus", "Pagamento status"], ["status", "Atendimento status"], ["deletedAt", "Excluído em"], ["notes", "Observações"]], rows: data.appointments },
    { title: "PAGAMENTOS", fields: [["id", "ID"], ["sourceType", "Origem"], ["appointmentId", "Atendimento ID"], ["packageId", "Pacote ID"], ["amountCents", "Valor centavos"], ["method", "Forma"], ["status", "Status"], ["paidAt", "Recebido em"]], rows: data.payments },
    { title: "FORNECEDORES", fields: [["id", "ID"], ["name", "Nome"], ["address", "Endereço"], ["phone", "Telefone"], ["productType", "Tipo de produto"], ["active", "Ativo"], ["createdAt", "Criado em"], ["updatedAt", "Atualizado em"]], rows: data.suppliers },
    { title: "SAÍDAS / COMPRAS", fields: [["id", "ID"], ["requestId", "Chave da solicitação"], ["supplierId", "Fornecedor ID"], ["purchaseDate", "Data local"], ["totalCents", "Total centavos"], ["createdAt", "Finalizada em"]], rows: data.purchases },
    { title: "ITENS DAS COMPRAS", fields: [["id", "ID"], ["purchaseId", "Compra ID"], ["itemName", "Item"], ["quantity", "Quantidade"], ["unitPriceCents", "Valor unitário centavos"], ["totalCents", "Subtotal centavos"]], rows: data.purchaseItems },
  ];
  const csvRows: Array<Array<string | number | null | undefined>> = [["VILA CARAMELO — EXPORTAÇÃO DE DADOS"], ["Valores monetários em centavos de BRL; arquivo gerado no dispositivo."]];
  for (const section of sections) {
    csvRows.push([], [section.title], section.fields.map((field) => field[1]));
    for (const row of section.rows) csvRows.push(section.fields.map(([key]) => {
      const value = row[key];
      if (value instanceof Date) return value.toISOString();
      if (typeof value === "boolean") return value ? "Sim" : "Não";
      return value ?? "";
    }));
  }
  const contents = `\uFEFF${toCsv(csvRows)}`;
  const filename = `vila-caramelo-${new Date().toISOString().slice(0, 10)}.csv`;
  const uri = `${FileSystem.documentDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(uri, contents, { encoding: FileSystem.EncodingType.UTF8 });
  const available = await Sharing.isAvailableAsync();
  if (!available) throw new Error("O compartilhamento de arquivos não está disponível neste dispositivo.");
  await Sharing.shareAsync(uri, { mimeType: "text/csv", dialogTitle: "Exportar dados Vila Caramelo", UTI: "public.comma-separated-values-text" });
}

function isGoogleCalendar(calendar: Calendar.Calendar) {
  const owner = calendar.ownerAccount || "";
  const provider = [calendar.source?.name, calendar.source?.type, calendar.name, owner].join(" ").toLowerCase();
  return /google|gmail|googlemail/.test(provider);
}

export async function requestWritableCalendars(): Promise<Calendar.Calendar[]> {
  if (Platform.OS !== "android") throw new Error("A sincronização com Google Agenda está disponível no app Android.");
  const currentPermission = await Calendar.getCalendarPermissionsAsync();
  const permission = currentPermission.granted ? currentPermission : await Calendar.requestCalendarPermissionsAsync();
  if (!permission.granted) throw new Error("Permita acesso ao calendário para sincronizar com Google Agenda.");
  const allCalendars = await Calendar.getCalendarsAsync("event");
  const googleCalendars = allCalendars.filter((calendar) => calendar.allowsModifications && isGoogleCalendar(calendar));
  if (!googleCalendars.length) {
    throw new Error("Nenhuma agenda Google editável foi encontrada. Adicione uma conta Google nas configurações do Android e ative a sincronização do Calendário.");
  }
  return googleCalendars.sort((a, b) => Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary)) || a.title.localeCompare(b.title));
}

export function appointmentCalendarMarker(appointmentId: number) {
  return `[VILA_CARAMELO_APPOINTMENT_${appointmentId}]`;
}

function withCalendarMarker(notes: string | null | undefined, marker?: string) {
  const content = notes || "Atendimento agendado na Vila Caramelo.";
  return marker && !content.includes(marker) ? `${content}\n\n${marker}` : content;
}

export async function createCalendarEvent(
  calendarId: string,
  event: { title: string; notes?: string | null; startsAt: Date; durationMinutes: number; marker?: string },
) {
  const eventId = await Calendar.createEventAsync(calendarId, {
    title: event.title,
    notes: withCalendarMarker(event.notes, event.marker),
    startDate: event.startsAt,
    endDate: new Date(event.startsAt.getTime() + event.durationMinutes * 60_000),
    allDay: false,
    alarms: [{ relativeOffset: -30 }],
  });
  return eventId;
}

function localDateAtMidnight(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("Data inválida para criar evento no Google Agenda.");
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

export async function findOrCreateHotelCalendarEvent(
  calendars: Calendar.Calendar[],
  preferredCalendarId: string,
  event: { stayId: number; title: string; notes: string; checkInDate: string; checkOutDate: string },
) {
  if (Platform.OS !== "android") throw new Error("A sincronização com Google Agenda está disponível no app Android.");
  if (!calendars.length) throw new Error("Nenhuma agenda Google editável foi encontrada.");
  const startDate = localDateAtMidnight(event.checkInDate);
  const endDate = localDateAtMidnight(hotelCalendarExclusiveEndDate(event.checkOutDate));
  const marker = `[VILA_CARAMELO_HOTEL_STAY_${event.stayId}]`;
  const existingEvents = await Calendar.getEventsAsync(calendars.map((calendar) => calendar.id), startDate, endDate);
  const existing = existingEvents.find((item) => item.notes?.includes(marker));
  if (existing) return { calendarId: existing.calendarId, eventId: existing.id, alreadyCreated: true };
  const target = calendars.find((calendar) => calendar.id === preferredCalendarId) || calendars.find((calendar) => calendar.isPrimary) || calendars[0];
  const eventId = await Calendar.createEventAsync(target.id, {
    title: event.title,
    notes: `${event.notes}\n\n${marker}`,
    startDate,
    endDate,
    allDay: true,
    alarms: [],
  });
  return { calendarId: target.id, eventId, alreadyCreated: false };
}

export async function updateCalendarEvent(calendarId: string, eventId: string, event: { title: string; notes?: string | null; startsAt: Date; durationMinutes: number; marker?: string }) {
  await Calendar.updateEventAsync(eventId, {
    calendarId,
    title: event.title,
    notes: withCalendarMarker(event.notes, event.marker),
    startDate: event.startsAt,
    endDate: new Date(event.startsAt.getTime() + event.durationMinutes * 60_000),
    allDay: false,
    });
}

export async function getCalendarEvent(eventId: string) {
  return Calendar.getEventAsync(eventId);
}

export async function deleteCalendarEvent(eventId: string) {
  const existing = await Calendar.getEventAsync(eventId);
  if (!existing) return false;
  await Calendar.deleteEventAsync(eventId);
  return true;
}

export type CalendarSyncAppointment = {
  id: number;
  startAt: string;
  durationMinutes: number;
  status: string;
  deletedAt: Date | null;
  calendarCleanupRequestedAt: Date | null;
  calendarSyncEnabled: number;
  calendarSyncChoiceSet: number;
  externalCalendarId: string | null;
  externalCalendarEventId: string | null;
  packageId: number | null;
  packageName: string | null;
  petName: string;
  clientName: string;
  serviceName: string;
  transportServiceName: string | null;
  transportPriceCents: number;
  notes: string | null;
};

type CalendarLinkInput = {
  id: number;
  calendarId: string | null;
  eventId: string | null;
  expectedEventId?: string;
  syncChoiceMade?: boolean;
};

export type CalendarSyncSummary = {
  created: number;
  updated: number;
  removed: number;
  orphanRemoved: number;
  linked: number;
  unchanged: number;
  skipped: number;
  failures: string[];
};

export function appointmentCalendarEventDetails(item: Pick<CalendarSyncAppointment, "id" | "startAt" | "durationMinutes" | "packageId" | "packageName" | "petName" | "clientName" | "serviceName" | "transportServiceName" | "transportPriceCents" | "notes">) {
  const marker = appointmentCalendarMarker(item.id);
  const packageUse = item.packageId ? /^Uso\s+(\d+)\/(\d+)\s+do pacote(?::\s*(.*))?$/i.exec(item.notes || "") : null;
  const packageName = item.packageName || packageUse?.[3]?.trim() || "Pacote";
  const transport = item.transportServiceName ? `\nTransporte: ${item.transportServiceName} · ${money(item.transportPriceCents)}` : "";
  const notes = packageUse
    ? `Serviço: ${item.serviceName}\nTutor: ${item.clientName}\nPet: ${item.petName}\nPacote: ${packageName}\nOcorrência ${packageUse[1]} de ${packageUse[2]}`
    : `Serviço: ${item.serviceName}${transport}\nTutor: ${item.clientName}\nPet: ${item.petName}${item.notes ? `\nObservações: ${item.notes}` : ""}`;
  return { title: `${item.clientName} - ${item.petName}`, notes, startsAt: parseLocalDateTime(item.startAt), durationMinutes: item.durationMinutes, marker };
}

function calendarEventMatches(event: Calendar.Event, desired: ReturnType<typeof appointmentCalendarEventDetails>) {
  const expectedEnd = desired.startsAt.getTime() + desired.durationMinutes * 60_000;
  const notes = withCalendarMarker(desired.notes, desired.marker);
  return event.title === desired.title
    && event.notes === notes
    && new Date(event.startDate).getTime() === desired.startsAt.getTime()
    && new Date(event.endDate).getTime() === expectedEnd
    && !event.allDay;
}

function calendarEventBelongsToAppointment(event: Calendar.Event, item: CalendarSyncAppointment, desired: ReturnType<typeof appointmentCalendarEventDetails>) {
  const notes = event.notes || "";
  const markers = appointmentCalendarMarkerIds(notes);
  if (markers.some((id) => id !== item.id)) return false;
  if (markers.includes(item.id)) return true;
  const lines = notes.split(/\r?\n/).map((line) => line.trim());
  return event.title === desired.title && lines.includes(`Tutor: ${item.clientName}`) && lines.includes(`Pet: ${item.petName}`) && lines.some((line) => line.startsWith("Serviço: "));
}

async function findAppointmentMarkerEvents(calendars: Calendar.Calendar[], marker: string, startAt: Date, cache: Map<string, Promise<Calendar.Event[]>>) {
  const key = String(startAt.getFullYear());
  let eventsPromise = cache.get(key);
  if (!eventsPromise) {
    const yearStart = new Date(startAt.getFullYear(), 0, 1);
    const nextYear = new Date(startAt.getFullYear() + 1, 0, 1);
    const start = new Date(yearStart.getTime() - 365 * 24 * 60 * 60_000);
    const end = new Date(nextYear.getTime() + 365 * 24 * 60 * 60_000);
    eventsPromise = Calendar.getEventsAsync(calendars.map((calendar) => calendar.id), start, end);
    cache.set(key, eventsPromise);
  }
  const events = await eventsPromise;
  return events.filter((event) => event.notes?.includes(marker));
}

async function removeGoogleOnlyAppointmentEvents(rows: CalendarSyncAppointment[], calendars: Calendar.Calendar[], summary: CalendarSyncSummary, onProgress?: (current: number, total: number, itemName: string) => void) {
  const knownAppointmentIds = new Set(rows.map((item) => item.id));
  const years = new Set<number>();
  const currentYear = new Date().getFullYear();
  for (const year of [currentYear - 1, currentYear, currentYear + 1]) years.add(year);
  for (const item of rows) {
    try {
      const year = parseLocalDateTime(item.startAt).getFullYear();
      for (const offset of [-1, 0, 1]) years.add(year + offset);
    } catch { /* Ignore malformed legacy dates; other rows are still reconciled. */ }
  }

  const orphanEvents = new Map<string, Calendar.Event>();
  const orderedYears = [...years].filter((year) => year >= 1900 && year <= 2200).sort((a, b) => a - b);
  for (const [index, year] of orderedYears.entries()) {
    onProgress?.(index + 1, orderedYears.length, `Buscando eventos marcados (${year})`);
    try {
      const events = await Calendar.getEventsAsync(calendars.map((calendar) => calendar.id), new Date(year, 0, 1), new Date(year + 1, 0, 1));
      for (const event of events) {
        if (isOrphanVilaAppointmentEvent(event.notes, knownAppointmentIds)) orphanEvents.set(event.id, event);
      }
    } catch (error) {
      summary.failures.push(`Google ${year}: ${error instanceof Error ? error.message : "não foi possível verificar esta faixa de datas"}`);
    }
  }

  for (const event of orphanEvents.values()) {
    const appointmentId = appointmentCalendarMarkerIds(event.notes)[0];
    try {
      if (await deleteCalendarEvent(event.id)) {
        summary.removed += 1;
        summary.orphanRemoved += 1;
      }
    } catch (error) {
      summary.failures.push(`Evento Vila sem atendimento #${appointmentId}: ${error instanceof Error ? error.message : "não foi possível remover"}`);
    }
  }
}

export async function reconcileAppointmentCalendar(
  rows: CalendarSyncAppointment[],
  calendars: Calendar.Calendar[],
  onLinkEvent: (input: CalendarLinkInput) => Promise<unknown>,
  onProgress?: (current: number, total: number, itemName: string) => void,
): Promise<CalendarSyncSummary> {
  const summary: CalendarSyncSummary = { created: 0, updated: 0, removed: 0, orphanRemoved: 0, linked: 0, unchanged: 0, skipped: 0, failures: [] };
  const calendarIds = new Set(calendars.map((calendar) => calendar.id));
  const markerEventCache = new Map<string, Promise<Calendar.Event[]>>();
  const targetCalendar = calendars.find((calendar) => calendar.isPrimary) || calendars[0];
  if (!targetCalendar) throw new Error("Nenhuma agenda Google editável está disponível.");

  for (const [index, item] of rows.entries()) {
    onProgress?.(index + 1, rows.length, `${item.clientName} · ${item.petName}`);
    const explicitLocalOnly = item.calendarSyncChoiceSet === 1 && item.calendarSyncEnabled !== 1;
    const removeFromGoogle = Boolean(item.deletedAt || item.calendarCleanupRequestedAt || ["cancelled", "no_show"].includes(item.status) || explicitLocalOnly);
    const existingEventId = item.externalCalendarEventId;

    if (removeFromGoogle) {
      try {
        const desired = appointmentCalendarEventDetails(item);
        let linkedEvent: Calendar.Event | null = null;
        if (existingEventId) {
          linkedEvent = await getCalendarEvent(existingEventId);
          if (linkedEvent) {
            const linkedMarkers = appointmentCalendarMarkerIds(linkedEvent.notes);
            if (linkedMarkers.length !== 1 || linkedMarkers[0] !== item.id) {
              throw new Error("O evento vinculado não tem o marcador exclusivo deste atendimento; preservei-o.");
            }
          }
        }
        const markerEvents = await findAppointmentMarkerEvents(calendars, desired.marker, desired.startsAt, markerEventCache);
        const ownedMarkerEvents = markerEvents.filter((event) => {
          const ids = appointmentCalendarMarkerIds(event.notes);
          return ids.length === 1 && ids[0] === item.id;
        });
        const eventIds = new Set([...(linkedEvent && existingEventId ? [existingEventId] : []), ...ownedMarkerEvents.map((event) => event.id)]);
        for (const eventId of eventIds) if (await deleteCalendarEvent(eventId)) summary.removed += 1;
        const syncChoiceMade = Boolean(item.calendarCleanupRequestedAt || explicitLocalOnly);
        if (existingEventId) await onLinkEvent({ id: item.id, calendarId: null, eventId: null, expectedEventId: existingEventId, syncChoiceMade });
        else await onLinkEvent({ id: item.id, calendarId: null, eventId: null, syncChoiceMade });
        if (!eventIds.size) summary.skipped += 1;
      } catch (error) {
        summary.failures.push(`#${item.id} ${item.petName}: ${error instanceof Error ? error.message : "falha ao remover o evento"}`);
      }
      continue;
    }

    try {
      const desired = appointmentCalendarEventDetails(item);
      const marker = desired.marker;
      let event = existingEventId ? await getCalendarEvent(existingEventId) : null;
      let eventId = event?.id || "";
      let eventCalendarId = event?.calendarId || item.externalCalendarId || targetCalendar!.id;
      const markerEvents = await findAppointmentMarkerEvents(calendars, marker, desired.startsAt, markerEventCache);
      let recoveredLink = false;
      let wasCreated = false;

      if (!event) {
        event = markerEvents.find((candidate) => candidate.id === existingEventId)
          || markerEvents.find((candidate) => candidate.calendarId === targetCalendar!.id)
          || markerEvents[0]
          || null;
        if (event) {
          eventId = event.id;
          eventCalendarId = event.calendarId;
          recoveredLink = true;
        }
      }

      if (event && !calendarEventBelongsToAppointment(event, item, desired)) throw new Error("O evento vinculado não corresponde a este atendimento; não alterei o evento Google.");

      if (event && !calendarIds.has(eventCalendarId)) {
        throw new Error("A agenda vinculada não está disponível ou editável neste aparelho; não criei uma cópia em outra agenda.");
      }

      if (event && !calendarEventMatches(event, desired)) {
        await updateCalendarEvent(eventCalendarId, eventId, desired);
        summary.updated += 1;
      } else if (event) {
        summary.unchanged += 1;
      }

      if (!event) {
        eventCalendarId = targetCalendar!.id;
        eventId = await createCalendarEvent(eventCalendarId, desired);
        wasCreated = true;
      }

      if (!existingEventId || existingEventId !== eventId || item.externalCalendarId !== eventCalendarId || item.calendarSyncEnabled !== 1 || item.calendarSyncChoiceSet !== 1) {
        try {
          await onLinkEvent({ id: item.id, calendarId: eventCalendarId, eventId, ...(existingEventId ? { expectedEventId: existingEventId } : {}) });
        } catch (error) {
          if (wasCreated) await deleteCalendarEvent(eventId).catch(() => false);
          throw error;
        }
        if (recoveredLink) summary.linked += 1;
      }
      if (wasCreated) summary.created += 1;

      if (event && markerEvents.length) {
        for (const duplicate of markerEvents) {
          if (duplicate.id === eventId) continue;
          const duplicateMarkerIds = appointmentCalendarMarkerIds(duplicate.notes);
          if (duplicateMarkerIds.length !== 1 || duplicateMarkerIds[0] !== item.id) continue;
          try { if (await deleteCalendarEvent(duplicate.id)) summary.removed += 1; }
          catch (error) { summary.failures.push(`#${item.id} ${item.petName}: não foi possível remover uma cópia duplicada (${error instanceof Error ? error.message : "erro Google"}).`); }
        }
      }
    } catch (error) {
      summary.failures.push(`#${item.id} ${item.petName}: ${error instanceof Error ? error.message : "falha ao sincronizar"}`);
    }
  }

  await removeGoogleOnlyAppointmentEvents(rows, calendars, summary, onProgress);
  return summary;
}

export function openCalendarEvent(eventId: string) {
  if (Platform.OS !== "android") throw new Error("Abra este evento no app Android da Vila Caramelo.");
  Calendar.openEventInCalendar(eventId);
}


export async function updateHotelCalendarEvent(
  calendarId: string,
  eventId: string,
  event: { stayId: number; title: string; notes: string; checkInDate: string; checkOutDate: string },
) {
  if (Platform.OS !== "android") throw new Error("A sincronização com Google Agenda está disponível no app Android.");
  const marker = `[VILA_CARAMELO_HOTEL_STAY_${event.stayId}]`;
  await Calendar.updateEventAsync(eventId, {
    calendarId,
    title: event.title,
    notes: `${event.notes}\n\n${marker}`,
    startDate: localDateAtMidnight(event.checkInDate),
    endDate: localDateAtMidnight(hotelCalendarExclusiveEndDate(event.checkOutDate)),
    allDay: true,
    alarms: [],
  });
}
