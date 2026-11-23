import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, like, ne, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { appointmentChargeCents as calculateAppointmentChargeCents, calculateHotelStayNights, calculateHotelStayTotalCents, calculatePackageEndDate, canTransitionAppointmentStatus, isValidCustomPackageDates, isValidLocalDateTime, packageOccurrenceDates, packagePaymentState, packagePreConsumedUses, replacePackageReceiptState, type AppointmentStatus } from "../shared/vila";
import {
  appointments,
  clients,
  financePendingDismissals,
  hotelStays,
  packageServices,
  packageUsages,
  packages,
  payments,
  pets,
  purchaseItems,
  purchases,
  scheduleDayLocks,
  services,
  suppliers,
} from "../drizzle/schema";
import { getDb } from "./db";
import { protectedProcedure, router } from "./_core/trpc";

const dateShape = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}, "Data inválida.");
const timeShape = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const amountShape = z.number().int().min(0).max(100_000_000);
const receiptAmountShape = z.number().int().min(1).max(100_000_000);
const speciesShape = z.enum(["dog", "cat", "rabbit"]);
const sizeShape = z.enum(["small", "medium", "large", "special"]);
const categoryShape = z.enum(["bath", "grooming", "treatment", "transport", "other"]);
const methodShape = z.enum(["pix", "cash", "card"]);

async function dbOrThrow() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
  return db;
}

function localDateFromStartAt(value: string) {
  return value.slice(0, 10);
}

function minutesFromStartAt(value: string) {
  const [hour, minute] = value.slice(11, 16).split(":").map(Number);
  return hour * 60 + minute;
}

function isValidStartAt(value: string) {
  const [date, time] = value.split(" ");
  const timeMatch = /^(\d{2}:\d{2})(?::[0-5]\d)?$/.exec(time || "");
  return dateShape.safeParse(date).success && Boolean(timeMatch && isValidLocalDateTime(date, timeMatch[1]));
}

function saoPauloDate(date: string, endOfDay = false) {
  return new Date(`${date}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}-03:00`);
}

function saoPauloToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function lockDate(tx: any, localDate: string) {
  await tx.insert(scheduleDayLocks).values({ localDate }).onDuplicateKeyUpdate({ set: { localDate } });
  await tx.select().from(scheduleDayLocks).where(eq(scheduleDayLocks.localDate, localDate)).for("update");
}

function validateAppointmentDuration(startAt: string, durationMinutes: number) {
  if (minutesFromStartAt(startAt) + durationMinutes > 24 * 60) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "O horário e a duração não podem ultrapassar a meia-noite." });
  }
}

async function validatePackageReservation(tx: any, packageId: number, clientId: number, petId: number, serviceId: number, date: string, excludeAppointmentId?: number) {
  const rows = await tx.select().from(packages).where(eq(packages.id, packageId)).limit(1).for("update");
  const item = rows[0];
  if (!item || item.status !== "active" || item.clientId !== clientId || item.petId !== petId || item.startDate > date || item.endDate < date) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "O pacote selecionado não está vigente para este pet e data." });
  }
  const benefitRows = await tx.select().from(packageServices).where(and(eq(packageServices.packageId, item.id), eq(packageServices.serviceId, serviceId))).limit(1).for("update");
  if (!benefitRows[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "Este serviço não está incluído no pacote selecionado." });
  const pendingRows = await tx.select({ id: appointments.id }).from(appointments).where(and(eq(appointments.packageId, packageId), eq(appointments.serviceId, serviceId), isNull(appointments.deletedAt), ne(appointments.status, "completed"), ne(appointments.status, "cancelled"), ne(appointments.status, "no_show")));
  const reservations = pendingRows.filter((row: { id: number }) => row.id !== excludeAppointmentId).length;
  if (benefitRows[0].used + benefitRows[0].preConsumed + reservations >= benefitRows[0].allowance) throw new TRPCError({ code: "CONFLICT", message: "Não há franquia disponível: o saldo já está consumido ou reservado em outros horários." });
}

function appointmentChargeCents(appointment: typeof appointments.$inferSelect) {
  return calculateAppointmentChargeCents(appointment.paymentMethod, appointment.priceCents, appointment.transportPriceCents);
}

function appointmentChargeMethod(appointment: typeof appointments.$inferSelect) {
  return appointment.paymentMethod === "package" ? appointment.transportPaymentMethod : appointment.paymentMethod;
}

async function recordAppointmentPayment(tx: any, appointment: typeof appointments.$inferSelect, status: "settled" | "voided", receivedAmountCents?: number) {
  const amountCents = status === "settled" && receivedAmountCents !== undefined ? receivedAmountCents : appointmentChargeCents(appointment);
  const method = appointmentChargeMethod(appointment);
  const existing = await tx.select().from(payments).where(eq(payments.appointmentId, appointment.id)).limit(1);
  if (amountCents <= 0 || !method) {
    if (existing.length) await tx.update(payments).set({ status, amountCents: 0, paidAt: new Date() }).where(eq(payments.id, existing[0].id));
    return;
  }
  if (existing.length) {
    await tx.update(payments).set({ status, amountCents, method, paidAt: new Date() }).where(eq(payments.id, existing[0].id));
  } else if (status === "settled") {
    await tx.insert(payments).values({
      sourceType: "service",
      appointmentId: appointment.id,
      amountCents,
      method,
      status,
      paidAt: new Date(),
    });
  }
}

async function reverseCompletedEffects(tx: any, appointment: typeof appointments.$inferSelect) {
  const usageRows = await tx.select().from(packageUsages).where(eq(packageUsages.appointmentId, appointment.id)).limit(1);
  const usage = usageRows[0];
  if (usage && !usage.reversedAt) {
    const packageRows = await tx.select().from(packages).where(eq(packages.id, usage.packageId)).limit(1).for("update");
    const petPackage = packageRows[0];
    const benefitRows = await tx.select().from(packageServices).where(eq(packageServices.id, usage.packageServiceId)).limit(1).for("update");
    if (benefitRows[0]) await tx.update(packageServices).set({ used: Math.max(0, benefitRows[0].used - 1) }).where(eq(packageServices.id, benefitRows[0].id));
    await tx.update(packageUsages).set({ reversedAt: new Date() }).where(eq(packageUsages.id, usage.id));
    const refreshedBenefits = await tx.select().from(packageServices).where(eq(packageServices.packageId, usage.packageId));
    const stillClosed = refreshedBenefits.length > 0 && refreshedBenefits.every((benefit: typeof packageServices.$inferSelect) => benefit.used + benefit.preConsumed >= benefit.allowance);
    await tx.update(packages).set({ status: stillClosed ? "closed" : "active", closedAt: stillClosed ? petPackage?.closedAt || new Date() : null }).where(eq(packages.id, usage.packageId));
  }
  await recordAppointmentPayment(tx, appointment, "voided");
}

async function setAppointmentStatus(tx: any, appointment: typeof appointments.$inferSelect, nextStatus: AppointmentStatus) {
  if (appointment.status === nextStatus) return;
  if (!canTransitionAppointmentStatus(appointment.status, nextStatus)) {
    throw new TRPCError({ code: "CONFLICT", message: "Siga as etapas do atendimento: confirmar, iniciar e concluir." });
  }
  if (appointment.status === "completed" && !["confirmed", "scheduled"].includes(nextStatus)) {
    throw new TRPCError({ code: "CONFLICT", message: "Um atendimento concluído só pode ser reaberto como agendado ou confirmado." });
  }
  if (["cancelled", "no_show"].includes(appointment.status) && nextStatus === "completed") {
    throw new TRPCError({ code: "CONFLICT", message: "Reagende o atendimento antes de concluí-lo." });
  }
  if (nextStatus === "completed") {
    if (appointment.paymentMethod === "package") {
      if (!appointment.packageId) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione o pacote que será utilizado." });
      const packageRows = await tx.select().from(packages).where(eq(packages.id, appointment.packageId)).limit(1).for("update");
      const petPackage = packageRows[0];
      if (!petPackage || petPackage.status !== "active" || petPackage.petId !== appointment.petId || petPackage.clientId !== appointment.clientId || petPackage.startDate > localDateFromStartAt(appointment.startAt) || petPackage.endDate < localDateFromStartAt(appointment.startAt)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "O pacote não está ativo para este pet e atendimento." });
      }
      const benefitRows = await tx.select().from(packageServices).where(and(eq(packageServices.packageId, petPackage.id), eq(packageServices.serviceId, appointment.serviceId))).limit(1).for("update");
      const benefit = benefitRows[0];
      const usageRows = await tx.select().from(packageUsages).where(eq(packageUsages.appointmentId, appointment.id)).limit(1);
      const previousUsage = usageRows[0];
      if (!benefit) throw new TRPCError({ code: "BAD_REQUEST", message: "Este serviço não está incluído no pacote." });
      if (!previousUsage || previousUsage.reversedAt) {
        if (benefit.used + benefit.preConsumed >= benefit.allowance) throw new TRPCError({ code: "CONFLICT", message: "O pacote não possui saldo para este serviço." });
        if (previousUsage) {
          await tx.update(packageUsages).set({ packageServiceId: benefit.id, usedAt: new Date(), reversedAt: null }).where(eq(packageUsages.id, previousUsage.id));
        } else {
          await tx.insert(packageUsages).values({ packageId: petPackage.id, packageServiceId: benefit.id, appointmentId: appointment.id });
        }
        await tx.update(packageServices).set({ used: benefit.used + 1 }).where(eq(packageServices.id, benefit.id));
      }
      const refreshedBenefits = await tx.select().from(packageServices).where(eq(packageServices.packageId, petPackage.id));
      if (refreshedBenefits.length && refreshedBenefits.every((row: typeof packageServices.$inferSelect) => row.used + row.preConsumed >= row.allowance)) {
        await tx.update(packages).set({ status: "closed", closedAt: new Date() }).where(eq(packages.id, petPackage.id));
      }
    } else if (appointment.paymentStatus === "paid") {
      await recordAppointmentPayment(tx, appointment, "settled");
    }
  }
  if (appointment.status === "completed" && nextStatus !== "completed") {
    await reverseCompletedEffects(tx, appointment);
  }
  const reopened = appointment.status === "completed" && ["scheduled", "confirmed"].includes(nextStatus);
  await tx.update(appointments).set({ status: nextStatus, ...(reopened ? { paymentStatus: "pending" as const } : {}) }).where(eq(appointments.id, appointment.id));
}

export const vilaRouter = router({
  dashboard: router({
    summary: protectedProcedure.query(async () => {
      const db = await dbOrThrow();
      const date = saoPauloToday();
      const monthStart = `${date.slice(0, 7)}-01`;
      const [appointmentsToday, activeClients, activePackages, currentPayments] = await Promise.all([
        db.select().from(appointments).where(and(like(appointments.startAt, `${date}%`), isNull(appointments.deletedAt), ne(appointments.status, "cancelled"), ne(appointments.status, "no_show"))).orderBy(asc(appointments.startAt)),
        db.select({ id: clients.id }).from(clients).where(eq(clients.active, 1)),
        db.select({ id: packages.id }).from(packages).where(and(eq(packages.status, "active"), lte(packages.startDate, date), gte(packages.endDate, date))),
        db.select().from(payments).where(and(eq(payments.status, "settled"), gte(payments.paidAt, saoPauloDate(monthStart)))),
      ]);
      return {
        date,
        todayAppointments: appointmentsToday.length,
        activeClients: activeClients.length,
        activePackages: activePackages.length,
        monthRevenueCents: currentPayments.reduce((sum, payment) => sum + payment.amountCents, 0),
      };
    }),
  }),

  calendarSync: router({
    snapshot: protectedProcedure.query(async () => {
      const db = await dbOrThrow();
      const rows = await db.select().from(appointments).orderBy(asc(appointments.startAt));
      if (!rows.length) return [];
      const petIds = [...new Set(rows.map((row) => row.petId))];
      const clientIds = [...new Set(rows.map((row) => row.clientId))];
      const serviceIds = [...new Set(rows.flatMap((row) => [row.serviceId, ...(row.transportServiceId ? [row.transportServiceId] : [])]))];
      const packageIds = [...new Set(rows.flatMap((row) => row.packageId ? [row.packageId] : []))];
      const [petRows, clientRows, serviceRows, packageRows] = await Promise.all([
        db.select().from(pets).where(inArray(pets.id, petIds)),
        db.select().from(clients).where(inArray(clients.id, clientIds)),
        db.select().from(services).where(inArray(services.id, serviceIds)),
        packageIds.length ? db.select({ id: packages.id, name: packages.name }).from(packages).where(inArray(packages.id, packageIds)) : [],
      ]);
      return rows.map((row) => ({
        ...row,
        petName: petRows.find((item) => item.id === row.petId)?.name || "Pet",
        clientName: clientRows.find((item) => item.id === row.clientId)?.name || "Tutor",
        serviceName: serviceRows.find((item) => item.id === row.serviceId)?.name || "Serviço",
        transportServiceName: row.transportServiceId ? serviceRows.find((item) => item.id === row.transportServiceId)?.name || "Transporte" : null,
        packageName: row.packageId ? packageRows.find((item) => item.id === row.packageId)?.name || null : null,
      }));
    }),
  }),

  clients: router({
    list: protectedProcedure.input(z.object({ search: z.string().max(120).optional() }).optional()).query(async ({ input }) => {
      const db = await dbOrThrow();
      const filter = input?.search?.trim();
      const search = filter ? or(like(clients.name, `%${filter}%`), like(clients.phone, `%${filter}%`), like(clients.email, `%${filter}%`)) : undefined;
      const rows = await db.select().from(clients).where(search ? and(eq(clients.active, 1), search) : eq(clients.active, 1)).orderBy(asc(clients.name));
      const petRows = rows.length ? await db.select().from(pets).where(and(inArray(pets.clientId, rows.map((row) => row.id)), eq(pets.active, 1))) : [];
      return rows.map((client) => ({ ...client, pets: petRows.filter((pet) => pet.clientId === client.id) }));
    }),
    create: protectedProcedure.input(z.object({ name: z.string().trim().min(1).max(160), phone: z.string().max(32).optional(), address: z.string().max(255).optional(), email: z.string().email().max(320).or(z.literal("")).optional() })).mutation(async ({ input }) => {
      const db = await dbOrThrow();
      const result = await db.insert(clients).values({ name: input.name, phone: input.phone || null, address: input.address || null, email: input.email || null });
      return { id: Number(result[0].insertId) };
    }),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().trim().min(1).max(160), phone: z.string().max(32).optional(), address: z.string().max(255).optional(), email: z.string().email().max(320).or(z.literal("")).optional() })).mutation(async ({ input }) => {
      const db = await dbOrThrow();
      await db.update(clients).set({ name: input.name, phone: input.phone || null, address: input.address || null, email: input.email || null }).where(eq(clients.id, input.id));
      return { ok: true };
    }),
    archive: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      const db = await dbOrThrow();
      await db.update(clients).set({ active: 0 }).where(eq(clients.id, input.id));
      return { ok: true };
    }),
    addPet: protectedProcedure.input(z.object({ clientId: z.number().int().positive(), name: z.string().trim().min(1).max(120), species: speciesShape, breed: z.string().max(120).optional(), size: sizeShape, notes: z.string().max(2000).optional() })).mutation(async ({ input }) => {
      const db = await dbOrThrow();
      const owner = await db.select().from(clients).where(and(eq(clients.id, input.clientId), eq(clients.active, 1))).limit(1);
      if (!owner[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Tutor não encontrado." });
      const result = await db.insert(pets).values({ clientId: input.clientId, name: input.name, species: input.species, breed: input.breed || null, size: input.size, notes: input.notes || null });
      return { id: Number(result[0].insertId) };
    }),
    updatePet: protectedProcedure.input(z.object({ id: z.number().int().positive(), clientId: z.number().int().positive(), name: z.string().trim().min(1).max(120), species: speciesShape, breed: z.string().max(120).optional(), size: sizeShape, notes: z.string().max(2000).optional() })).mutation(async ({ input }) => {
      const db = await dbOrThrow();
      const owner = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.id, input.clientId), eq(clients.active, 1))).limit(1);
      const petRows = await db.select({ id: pets.id, clientId: pets.clientId }).from(pets).where(and(eq(pets.id, input.id), eq(pets.clientId, input.clientId), eq(pets.active, 1))).limit(1);
      if (!owner[0] || !petRows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Pet ou tutor não encontrado." });
      await db.update(pets).set({ name: input.name, species: input.species, breed: input.breed || null, size: input.size, notes: input.notes || null }).where(eq(pets.id, input.id));
      return { ok: true };
    }),
  }),

  services: router({
    list: protectedProcedure.input(z.object({ includeInactive: z.boolean().optional() }).optional()).query(async ({ input }) => {
      const db = await dbOrThrow();
      return db.select().from(services).where(input?.includeInactive ? undefined : eq(services.active, 1)).orderBy(desc(services.active), asc(services.sortOrder), asc(services.name));
    }),
    save: protectedProcedure.input(z.object({ id: z.number().int().positive().optional(), name: z.string().trim().min(1).max(140), category: categoryShape, size: sizeShape.nullable().optional(), priceCents: amountShape, durationMinutes: z.number().int().min(5).max(720) })).mutation(async ({ input }) => {
      const db = await dbOrThrow();
      if (input.id) await db.update(services).set({ name: input.name, category: input.category, size: input.size || null, priceCents: input.priceCents, durationMinutes: input.durationMinutes }).where(eq(services.id, input.id));
      else {
        const lastRows = await db.select({ sortOrder: services.sortOrder }).from(services).orderBy(desc(services.sortOrder)).limit(1);
        const result = await db.insert(services).values({ name: input.name, category: input.category, size: input.size || null, priceCents: input.priceCents, durationMinutes: input.durationMinutes, sortOrder: (lastRows[0]?.sortOrder || 0) + 1000 });
        return { id: Number(result[0].insertId) };
      }
      return { id: input.id };
    }),
    reorder: protectedProcedure.input(z.object({ ids: z.array(z.number().int().positive()).min(1).max(500) })).mutation(async ({ input }) => {
      const db = await dbOrThrow();
      await db.transaction(async (tx) => {
        const currentRows = await tx.select({ id: services.id }).from(services).where(eq(services.active, 1)).for("update");
        const currentIds = new Set(currentRows.map((row) => row.id));
        const requestedIds = new Set(input.ids);
        if (requestedIds.size !== input.ids.length || currentIds.size !== requestedIds.size || [...currentIds].some((id) => !requestedIds.has(id))) {
          throw new TRPCError({ code: "CONFLICT", message: "O catálogo mudou. Atualize a tela antes de reorganizar os serviços." });
        }
        for (const [index, id] of input.ids.entries()) {
          await tx.update(services).set({ sortOrder: (index + 1) * 1000 }).where(and(eq(services.id, id), eq(services.active, 1)));
        }
      });
      return { ok: true };
    }),
    setActive: protectedProcedure.input(z.object({ id: z.number().int().positive(), active: z.boolean() })).mutation(async ({ input }) => {
      const db = await dbOrThrow();
      await db.update(services).set({ active: input.active ? 1 : 0 }).where(eq(services.id, input.id));
      return { ok: true };
    }),
  }),

  appointments: router({
    list: protectedProcedure.input(z.object({ from: dateShape, to: dateShape, includeCalendarCleanup: z.boolean().optional() })).query(async ({ input }) => {
      const db = await dbOrThrow();
      const visibleRows = or(isNull(appointments.deletedAt), and(isNotNull(appointments.deletedAt), isNotNull(appointments.externalCalendarEventId)));
      const periodRows = and(gte(appointments.startAt, `${input.from} 00:00:00`), lte(appointments.startAt, `${input.to} 23:59:59`), visibleRows);
      const cleanupRows = input.includeCalendarCleanup ? and(isNotNull(appointments.externalCalendarEventId), or(isNotNull(appointments.calendarCleanupRequestedAt), isNotNull(appointments.deletedAt), eq(appointments.status, "cancelled"), eq(appointments.status, "no_show"))) : undefined;
      const rows = await db.select().from(appointments).where(cleanupRows ? or(periodRows, cleanupRows) : periodRows).orderBy(asc(appointments.startAt));
      if (!rows.length) return [];
      const petIds = [...new Set(rows.map((row) => row.petId))];
      const clientIds = [...new Set(rows.map((row) => row.clientId))];
      const serviceIds = [...new Set(rows.flatMap((row) => [row.serviceId, ...(row.transportServiceId ? [row.transportServiceId] : [])]))];
      const appointmentIds = rows.map((row) => row.id);
      const [petRows, clientRows, serviceRows, paymentRows] = await Promise.all([
        db.select().from(pets).where(inArray(pets.id, petIds)),
        db.select().from(clients).where(inArray(clients.id, clientIds)),
        db.select().from(services).where(inArray(services.id, serviceIds)),
        db.select({ appointmentId: payments.appointmentId, amountCents: payments.amountCents }).from(payments).where(and(inArray(payments.appointmentId, appointmentIds), eq(payments.sourceType, "service"), eq(payments.status, "settled"))),
      ]);
      return rows.map((row) => ({ ...row, petName: petRows.find((item) => item.id === row.petId)?.name || "Pet", clientName: clientRows.find((item) => item.id === row.clientId)?.name || "Tutor", serviceName: serviceRows.find((item) => item.id === row.serviceId)?.name || "Serviço", transportServiceName: row.transportServiceId ? serviceRows.find((item) => item.id === row.transportServiceId)?.name || "Transporte" : null, receivedAmountCents: paymentRows.find((item) => item.appointmentId === row.id)?.amountCents ?? null }));
    }),
    calendarLinks: protectedProcedure.input(z.object({ ids: z.array(z.number().int().positive()).min(1).max(52) })).query(async ({ input }) => {
      const db = await dbOrThrow();
      return db.select({ id: appointments.id, calendarId: appointments.externalCalendarId, eventId: appointments.externalCalendarEventId, status: appointments.status, deletedAt: appointments.deletedAt, calendarCleanupRequestedAt: appointments.calendarCleanupRequestedAt }).from(appointments).where(inArray(appointments.id, input.ids));
    }),
    create: protectedProcedure.input(z.object({ petId: z.number().int().positive(), serviceId: z.number().int().positive(), transportServiceId: z.number().int().positive().nullable().optional(), date: dateShape, time: timeShape, paymentMethod: z.enum(["pix", "cash", "card", "package"]), packageId: z.number().int().positive().nullable().optional(), notes: z.string().max(2000).optional(), calendarSyncEnabled: z.boolean().optional() })).mutation(async ({ input }) => {
      const startAt = `${input.date} ${input.time}:00`;
      if (!isValidStartAt(startAt)) throw new TRPCError({ code: "BAD_REQUEST", message: "Data e horário inválidos." });
      const db = await dbOrThrow();
      const petRows = await db.select().from(pets).where(and(eq(pets.id, input.petId), eq(pets.active, 1))).limit(1);
      const pet = petRows[0];
      if (!pet) throw new TRPCError({ code: "NOT_FOUND", message: "Pet não encontrado." });
      const clientRows = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.id, pet.clientId), eq(clients.active, 1))).limit(1);
      if (!clientRows[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "O tutor deste pet está arquivado." });
      const serviceRows = await db.select().from(services).where(and(eq(services.id, input.serviceId), eq(services.active, 1))).limit(1);
      const service = serviceRows[0];
      if (!service) throw new TRPCError({ code: "NOT_FOUND", message: "Serviço não encontrado." });
      if (service.category === "transport") throw new TRPCError({ code: "BAD_REQUEST", message: "Escolha o serviço principal e selecione o transporte separadamente." });
      if (service.size && service.size !== pet.size) throw new TRPCError({ code: "BAD_REQUEST", message: "Este serviço não está disponível para o porte do pet." });
      const transportRows = input.transportServiceId ? await db.select().from(services).where(and(eq(services.id, input.transportServiceId), eq(services.active, 1), eq(services.category, "transport"))).limit(1) : [];
      const transport = transportRows[0];
      if (input.transportServiceId && !transport) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione uma modalidade de transporte ativa do catálogo." });
      if (transport?.size && transport.size !== pet.size) throw new TRPCError({ code: "BAD_REQUEST", message: "Esta modalidade de transporte não atende ao porte deste pet." });
      validateAppointmentDuration(startAt, service.durationMinutes);
      if (input.paymentMethod === "package" && !input.packageId) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione o pacote para este atendimento." });
      return db.transaction(async (tx) => {
        await lockDate(tx, input.date);
        if (input.paymentMethod === "package" && input.packageId) await validatePackageReservation(tx, input.packageId, pet.clientId, pet.id, service.id, input.date);
        const result = await tx.insert(appointments).values({
          clientId: pet.clientId,
          petId: pet.id,
          serviceId: service.id,
          transportServiceId: transport?.id || null,
          transportPriceCents: transport?.priceCents || 0,
          startAt,
          durationMinutes: service.durationMinutes,
          priceCents: service.priceCents,
          paymentMethod: input.paymentMethod,
          paymentStatus: "pending",
          packageId: input.paymentMethod === "package" ? input.packageId || null : null,
          calendarSyncEnabled: input.calendarSyncEnabled ? 1 : 0,
          calendarSyncChoiceSet: input.calendarSyncEnabled === undefined ? 0 : 1,
          notes: input.notes || null,
        });
        return { id: Number(result[0].insertId) };
      });
    }),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), date: dateShape, time: timeShape, serviceId: z.number().int().positive(), transportServiceId: z.number().int().positive().nullable().optional(), paymentMethod: z.enum(["pix", "cash", "card", "package"]), packageId: z.number().int().positive().nullable().optional(), notes: z.string().max(2000).optional(), calendarCleanupRequested: z.boolean().optional(), calendarSyncEnabled: z.boolean().optional() })).mutation(async ({ input }) => {
      const startAt = `${input.date} ${input.time}:00`;
      if (!isValidStartAt(startAt)) throw new TRPCError({ code: "BAD_REQUEST", message: "Data e horário inválidos." });
      const db = await dbOrThrow();
      if (input.paymentMethod === "package" && !input.packageId) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione o pacote para este atendimento." });
      return db.transaction(async (tx) => {
        const lockedRows = await tx.select().from(appointments).where(eq(appointments.id, input.id)).limit(1).for("update");
        const current = lockedRows[0];
        if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado." });
        if (current.deletedAt) throw new TRPCError({ code: "CONFLICT", message: "Este atendimento foi apagado." });
        if (["in_progress", "cancelled", "no_show"].includes(current.status)) throw new TRPCError({ code: "CONFLICT", message: "Somente atendimentos pendentes ou concluídos podem ser alterados." });
        if (input.calendarCleanupRequested && !current.externalCalendarEventId) throw new TRPCError({ code: "CONFLICT", message: "Não há evento Google vinculado para solicitar remoção." });
        const nextPackageId = input.paymentMethod === "package" ? input.packageId || null : null;
        if (current.status === "completed" && (input.paymentMethod !== current.paymentMethod || nextPackageId !== current.packageId)) {
          throw new TRPCError({ code: "CONFLICT", message: "Para preservar o financeiro, a forma de pagamento e o pacote de um atendimento concluído não podem ser trocados." });
        }
        const serviceRows = await tx.select().from(services).where(eq(services.id, input.serviceId)).limit(1);
        const service = serviceRows[0];
        if (!service || (service.id !== current.serviceId && service.active !== 1)) throw new TRPCError({ code: "NOT_FOUND", message: "Serviço não encontrado ou inativo." });
        if (service.category === "transport" && service.id !== current.serviceId) throw new TRPCError({ code: "BAD_REQUEST", message: "Escolha o serviço principal; transporte é um adicional separado." });
        const petRows = await tx.select().from(pets).where(eq(pets.id, current.petId)).limit(1);
        const pet = petRows[0];
        if (!pet || (service.size && service.size !== pet.size && service.id !== current.serviceId)) throw new TRPCError({ code: "BAD_REQUEST", message: "Este serviço não está disponível para o porte do pet." });
        const durationMinutes = service.id === current.serviceId ? current.durationMinutes : service.durationMinutes;
        const priceCents = service.id === current.serviceId ? current.priceCents : service.priceCents;
        validateAppointmentDuration(startAt, durationMinutes);
        const transportServiceId = input.transportServiceId === undefined ? current.transportServiceId : input.transportServiceId;
        const transportRows = transportServiceId ? await tx.select().from(services).where(eq(services.id, transportServiceId)).limit(1) : [];
        const transport = transportRows[0];
        if (transportServiceId && (!transport || transport.category !== "transport" || (transport.id !== current.transportServiceId && transport.active !== 1))) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione uma modalidade de transporte ativa do catálogo." });
        }
        if (transport?.size && transport.size !== pet.size && transport.id !== current.transportServiceId) throw new TRPCError({ code: "BAD_REQUEST", message: "Esta modalidade de transporte não atende ao porte deste pet." });
        const transportPriceCents = transportServiceId ? (transportServiceId === current.transportServiceId ? current.transportPriceCents : transport!.priceCents) : 0;
        const dates = [...new Set([localDateFromStartAt(current.startAt), input.date])].sort();
        for (const date of dates) await lockDate(tx, date);
        if (current.status === "completed" && current.paymentMethod === "package" && current.packageId) {
          const packageRows = await tx.select().from(packages).where(eq(packages.id, current.packageId)).limit(1).for("update");
          const petPackage = packageRows[0];
          if (!petPackage || petPackage.petId !== current.petId || petPackage.clientId !== current.clientId || petPackage.startDate > input.date || petPackage.endDate < input.date) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "A nova data e o serviço precisam continuar dentro da vigência do pacote deste pet." });
          }
          if (service.id !== current.serviceId) {
            const usageRows = await tx.select().from(packageUsages).where(eq(packageUsages.appointmentId, current.id)).limit(1).for("update");
            const usage = usageRows[0];
            if (!usage || usage.reversedAt) throw new TRPCError({ code: "CONFLICT", message: "O consumo deste pacote não pôde ser localizado; não alterei o serviço para preservar o saldo." });
            const [oldBenefits, newBenefits] = await Promise.all([
              tx.select().from(packageServices).where(eq(packageServices.id, usage.packageServiceId)).limit(1).for("update"),
              tx.select().from(packageServices).where(and(eq(packageServices.packageId, petPackage.id), eq(packageServices.serviceId, service.id))).limit(1).for("update"),
            ]);
            const oldBenefit = oldBenefits[0], newBenefit = newBenefits[0];
            if (!oldBenefit || oldBenefit.packageId !== petPackage.id || oldBenefit.serviceId !== current.serviceId || !newBenefit || newBenefit.allowance <= 0) {
              throw new TRPCError({ code: "BAD_REQUEST", message: "O novo serviço não está incluído no pacote ou o histórico de consumo está inconsistente." });
            }
            const pendingRows = await tx.select({ id: appointments.id }).from(appointments).where(and(eq(appointments.packageId, petPackage.id), eq(appointments.serviceId, service.id), isNull(appointments.deletedAt), ne(appointments.status, "completed"), ne(appointments.status, "cancelled"), ne(appointments.status, "no_show")));
            if (newBenefit.used + newBenefit.preConsumed + pendingRows.length >= newBenefit.allowance) throw new TRPCError({ code: "CONFLICT", message: "Não há franquia livre para transferir o consumo ao novo serviço." });
            await tx.update(packageServices).set({ used: Math.max(0, oldBenefit.used - 1) }).where(eq(packageServices.id, oldBenefit.id));
            await tx.update(packageServices).set({ used: newBenefit.used + 1 }).where(eq(packageServices.id, newBenefit.id));
            await tx.update(packageUsages).set({ packageServiceId: newBenefit.id, usedAt: new Date() }).where(eq(packageUsages.id, usage.id));
            const refreshedBenefits = await tx.select().from(packageServices).where(eq(packageServices.packageId, petPackage.id));
            const closed = refreshedBenefits.length > 0 && refreshedBenefits.every((benefit: typeof packageServices.$inferSelect) => benefit.used + benefit.preConsumed >= benefit.allowance);
            await tx.update(packages).set({ status: closed ? "closed" : "active", closedAt: closed ? petPackage.closedAt || new Date() : null }).where(eq(packages.id, petPackage.id));
          }
        } else if (current.status !== "completed" && input.paymentMethod === "package" && nextPackageId) {
          await validatePackageReservation(tx, nextPackageId, current.clientId, current.petId, service.id, input.date, current.id);
        }
        const nextTransportPaymentMethod = input.paymentMethod === "package" && transportServiceId && transportPriceCents > 0 && transportPriceCents === current.transportPriceCents ? current.transportPaymentMethod : null;
        const updatedAppointment = { ...current, startAt, durationMinutes, serviceId: service.id, priceCents, transportServiceId, transportPriceCents, transportPaymentMethod: nextTransportPaymentMethod, paymentMethod: input.paymentMethod, packageId: nextPackageId, notes: input.notes || null };
        const amountChanged = appointmentChargeCents(updatedAppointment) !== appointmentChargeCents(current);
        const paymentStatus = current.status === "completed" && current.paymentStatus === "paid" && amountChanged ? "pending" as const : input.paymentMethod === "package" && current.paymentMethod !== "package" ? "pending" as const : current.paymentStatus;
        await tx.update(appointments).set({ startAt, durationMinutes, serviceId: service.id, priceCents, transportServiceId, transportPriceCents, transportPaymentMethod: nextTransportPaymentMethod, paymentMethod: input.paymentMethod, paymentStatus, packageId: nextPackageId, notes: input.notes || null, ...(input.calendarSyncEnabled !== undefined ? { calendarSyncEnabled: input.calendarSyncEnabled ? 1 : 0, calendarSyncChoiceSet: 1 } : input.calendarCleanupRequested ? { calendarSyncEnabled: 0, calendarSyncChoiceSet: 1 } : {}), ...(input.calendarSyncEnabled === true ? { calendarCleanupRequestedAt: null } : input.calendarCleanupRequested ? { calendarCleanupRequestedAt: current.calendarCleanupRequestedAt || new Date() } : {}) }).where(eq(appointments.id, current.id));
        if (current.status === "completed" && current.paymentStatus === "paid" && amountChanged) await recordAppointmentPayment(tx, current, "voided");
        return { ok: true };
      });
    }),
    setStatus: protectedProcedure.input(z.object({ id: z.number().int().positive(), status: z.enum(["scheduled", "confirmed", "in_progress", "completed", "cancelled", "no_show"]) })).mutation(async ({ input }) => {
      const db = await dbOrThrow();
      await db.transaction(async (tx) => {
        const rows = await tx.select().from(appointments).where(eq(appointments.id, input.id)).for("update");
        const appointment = rows[0];
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado." });
        if (appointment.deletedAt) throw new TRPCError({ code: "CONFLICT", message: "Este atendimento foi apagado." });
        await setAppointmentStatus(tx, appointment, input.status);
      });
      return { ok: true };
    }),
    deleteCompleted: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      const db = await dbOrThrow();
      await db.transaction(async (tx) => {
        const rows = await tx.select().from(appointments).where(eq(appointments.id, input.id)).limit(1).for("update");
        const appointment = rows[0];
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado." });
        if (appointment.deletedAt) return;
        if (appointment.status !== "completed") throw new TRPCError({ code: "CONFLICT", message: "Só é possível apagar um atendimento concluído por esta opção." });
        await reverseCompletedEffects(tx, appointment);
        await tx.update(appointments).set({ deletedAt: new Date() }).where(eq(appointments.id, appointment.id));
      });
      return { ok: true };
    }),
    setPayment: protectedProcedure.input(z.object({ id: z.number().int().positive(), paymentStatus: z.enum(["pending", "paid"]), paymentMethod: methodShape.optional(), amountCents: receiptAmountShape.optional() }).refine((value) => value.paymentStatus !== "paid" || value.amountCents !== undefined, { message: "Informe o valor efetivamente recebido.", path: ["amountCents"] })).mutation(async ({ input }) => {
      const db = await dbOrThrow();
      await db.transaction(async (tx) => {
        const rows = await tx.select().from(appointments).where(eq(appointments.id, input.id)).for("update");
        const appointment = rows[0];
        if (!appointment || appointment.deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado." });
        if (appointment.paymentMethod === "package" && (!appointment.transportServiceId || appointment.transportPriceCents <= 0)) throw new TRPCError({ code: "BAD_REQUEST", message: "Não há transporte avulso para cobrar neste atendimento de pacote." });
        if (["cancelled", "no_show"].includes(appointment.status)) throw new TRPCError({ code: "CONFLICT", message: "Não é possível registrar pagamento para atendimento cancelado ou não comparecido." });
        if (appointment.status !== "completed") throw new TRPCError({ code: "CONFLICT", message: "Conclua o serviço antes de confirmar o pagamento." });
        const method = input.paymentMethod || (appointment.paymentMethod === "package" ? appointment.transportPaymentMethod : appointment.paymentMethod);
        if (input.paymentStatus === "paid" && !method) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione a forma de pagamento do transporte." });
        const updated = appointment.paymentMethod === "package"
          ? { ...appointment, paymentStatus: input.paymentStatus, transportPaymentMethod: method || appointment.transportPaymentMethod }
          : { ...appointment, paymentStatus: input.paymentStatus, paymentMethod: method || appointment.paymentMethod };
        await tx.update(appointments).set(appointment.paymentMethod === "package" ? { paymentStatus: input.paymentStatus, transportPaymentMethod: method || appointment.transportPaymentMethod } : { paymentStatus: input.paymentStatus, paymentMethod: method || appointment.paymentMethod }).where(eq(appointments.id, input.id));
        if (appointment.status === "completed") await recordAppointmentPayment(tx, updated, input.paymentStatus === "paid" ? "settled" : "voided", input.paymentStatus === "paid" ? input.amountCents : undefined);
      });
      return { ok: true };
    }),
    setCalendarEvent: protectedProcedure.input(z.object({ id: z.number().int().positive(), calendarId: z.string().trim().min(1).max(255).nullable(), eventId: z.string().trim().min(1).max(255).nullable(), expectedEventId: z.string().trim().min(1).max(255).optional(), syncChoiceMade: z.boolean().optional() }).refine((value) => (value.calendarId === null && value.eventId === null) || (Boolean(value.calendarId) && Boolean(value.eventId)), "Calendário e evento devem ser informados ou limpos juntos.")).mutation(async ({ input }) => {
      const db = await dbOrThrow();
      await db.transaction(async (tx) => {
        const rows = await tx.select().from(appointments).where(eq(appointments.id, input.id)).limit(1).for("update");
        const appointment = rows[0];
        if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado." });
        if (input.eventId && (appointment.deletedAt || ["cancelled", "no_show"].includes(appointment.status))) throw new TRPCError({ code: "CONFLICT", message: "Não vincule um evento a um atendimento apagado, cancelado ou não comparecido." });
        if (input.eventId && appointment.externalCalendarEventId) {
          if (appointment.externalCalendarId === input.calendarId && appointment.externalCalendarEventId === input.eventId) {
            await tx.update(appointments).set({ calendarSyncEnabled: 1, calendarSyncChoiceSet: 1, calendarCleanupRequestedAt: null }).where(eq(appointments.id, input.id));
            return;
          }
          if (input.expectedEventId === appointment.externalCalendarEventId) {
            await tx.update(appointments).set({ externalCalendarId: input.calendarId, externalCalendarEventId: input.eventId, calendarSyncEnabled: 1, calendarSyncChoiceSet: 1, calendarCleanupRequestedAt: null }).where(eq(appointments.id, input.id));
            return;
          }
          throw new TRPCError({ code: "CONFLICT", message: "Este atendimento já tem outro evento Google vinculado. Atualize a agenda antes de criar outro." });
        }
        if (!input.eventId && appointment.externalCalendarEventId && input.expectedEventId !== appointment.externalCalendarEventId) throw new TRPCError({ code: "CONFLICT", message: "O vínculo do calendário mudou. Atualize a agenda antes de tentar removê-lo." });
        await tx.update(appointments).set({ externalCalendarId: input.calendarId, externalCalendarEventId: input.eventId, calendarSyncEnabled: input.eventId ? 1 : 0, calendarSyncChoiceSet: input.eventId || input.syncChoiceMade ? 1 : appointment.calendarSyncChoiceSet, calendarCleanupRequestedAt: null }).where(eq(appointments.id, input.id));
      });
      return { ok: true };
    }),
  }),

  packages: router({
    list: protectedProcedure.input(z.object({ includeClosed: z.boolean().optional(), includeDeleted: z.boolean().optional() }).optional()).query(async ({ input }) => {
      const db = await dbOrThrow();
      const rows = await db.select().from(packages).orderBy(desc(packages.createdAt));
      if (!rows.length) return [];
      const [clientRows, petRows, benefits, paymentRows] = await Promise.all([
        db.select().from(clients).where(inArray(clients.id, [...new Set(rows.map((row) => row.clientId))])),
        db.select().from(pets).where(inArray(pets.id, [...new Set(rows.map((row) => row.petId))])),
        db.select().from(packageServices).where(inArray(packageServices.packageId, rows.map((row) => row.id))),
        db.select({ packageId: payments.packageId, amountCents: payments.amountCents }).from(payments).where(and(eq(payments.sourceType, "package"), eq(payments.status, "settled"), inArray(payments.packageId, rows.map((row) => row.id)))),
      ]);
      const reservations = await db.select({ packageId: appointments.packageId, serviceId: appointments.serviceId }).from(appointments).where(and(inArray(appointments.packageId, rows.map((row) => row.id)), isNull(appointments.deletedAt), ne(appointments.status, "completed"), ne(appointments.status, "cancelled"), ne(appointments.status, "no_show")));
      const receivedByPackage = new Map<number, number>();
      for (const payment of paymentRows) {
        if (payment.packageId !== null) receivedByPackage.set(payment.packageId, (receivedByPackage.get(payment.packageId) || 0) + payment.amountCents);
      }
      return rows.map((row) => {
        const receivedCents = Math.max(receivedByPackage.get(row.id) || 0, row.paid === 1 ? row.priceCents : 0);
        const paymentState = packagePaymentState(row.priceCents, receivedCents);
        return { ...row, paid: paymentState.paid ? 1 : 0, receivedCents: paymentState.receivedCents, openBalanceCents: paymentState.openBalanceCents, clientName: clientRows.find((item) => item.id === row.clientId)?.name || "Tutor", petName: petRows.find((item) => item.id === row.petId)?.name || "Pet", benefits: benefits.filter((item) => item.packageId === row.id && item.allowance > 0).map((benefit) => ({ ...benefit, reserved: reservations.filter((reservation) => reservation.packageId === row.id && reservation.serviceId === benefit.serviceId).length })) };
      }).filter((row) => row.deletedAt ? Boolean(input?.includeDeleted) : Boolean(input?.includeClosed) || row.status === "active" || row.openBalanceCents > 0);
    }),
    history: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
      const db = await dbOrThrow();
      const [rows, benefits] = await Promise.all([
        db.select().from(packageUsages).where(eq(packageUsages.packageId, input.id)).orderBy(desc(packageUsages.usedAt)),
        db.select().from(packageServices).where(eq(packageServices.packageId, input.id)),
      ]);
      const preConsumedBenefits = benefits.filter((benefit) => benefit.preConsumed > 0);
      if (!rows.length && !preConsumedBenefits.length) return [];
      const appointmentIds = rows.map((row) => row.appointmentId);
      const serviceIds = [...new Set([...rows.map((row) => row.packageServiceId), ...preConsumedBenefits.map((benefit) => benefit.id)])];
      const [appointmentRows, benefitRows] = await Promise.all([
        appointmentIds.length ? db.select().from(appointments).where(inArray(appointments.id, appointmentIds)) : [],
        serviceIds.length ? db.select().from(packageServices).where(inArray(packageServices.id, serviceIds)) : [],
      ]);
      const catalog = benefitRows.length ? await db.select().from(services).where(inArray(services.id, [...new Set(benefitRows.map((row) => row.serviceId))])) : [];
      const actualUsages = rows.map((row) => ({ ...row, preConsumed: false, count: 1, appointment: appointmentRows.find((item) => item.id === row.appointmentId) || null, serviceName: catalog.find((item) => item.id === benefitRows.find((benefit) => benefit.id === row.packageServiceId)?.serviceId)?.name || "Serviço" }));
      const priorUses = preConsumedBenefits.map((benefit) => ({ id: -benefit.id, packageId: input.id, packageServiceId: benefit.id, appointmentId: 0, usedAt: new Date(0), reversedAt: null, preConsumed: true, count: benefit.preConsumed, appointment: null, serviceName: catalog.find((item) => item.id === benefit.serviceId)?.name || "Serviço" }));
      return [...priorUses, ...actualUsages];
    }),
    create: protectedProcedure.input(z.object({ clientId: z.number().int().positive(), petId: z.number().int().positive(), name: z.string().trim().min(1).max(140), cadence: z.enum(["monthly", "biweekly"]), startDate: dateShape, endDate: dateShape, priceCents: amountShape, benefits: z.array(z.object({ serviceId: z.number().int().positive(), allowance: z.number().int().min(1).max(500) })).min(1), bookingTime: timeShape, recurringServiceId: z.number().int().positive(), futureOccurrences: z.number().int().min(1).max(52).optional(), scheduleMode: z.enum(["standard", "custom"]).default("standard"), customDates: z.array(dateShape).max(52).optional() })).mutation(async ({ input }) => {
      const requestedFutureOccurrences = input.futureOccurrences ?? input.benefits.find((benefit) => benefit.serviceId === input.recurringServiceId)?.allowance ?? 0;
      let calculatedEndDate = calculatePackageEndDate(input.startDate, input.cadence, input.benefits.map((benefit) => benefit.serviceId === input.recurringServiceId ? requestedFutureOccurrences : benefit.allowance));
      if (!calculatedEndDate) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe uma data inicial válida para calcular o término do pacote." });
      const db = await dbOrThrow();
      const petRows = await db.select().from(pets).where(and(eq(pets.id, input.petId), eq(pets.clientId, input.clientId), eq(pets.active, 1))).limit(1);
      if (!petRows[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "O pet não pertence ao tutor selecionado." });
      const ownerRows = await db.select({ id: clients.id, name: clients.name }).from(clients).where(and(eq(clients.id, input.clientId), eq(clients.active, 1))).limit(1);
      if (!ownerRows[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "O tutor selecionado está arquivado." });
      const serviceRows = await db.select().from(services).where(and(inArray(services.id, input.benefits.map((item) => item.serviceId)), eq(services.active, 1)));
      if (serviceRows.length !== input.benefits.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Um ou mais serviços do pacote não estão disponíveis." });
      if (serviceRows.some((service) => service.category === "transport")) throw new TRPCError({ code: "BAD_REQUEST", message: "Transporte é um adicional do agendamento e não pode fazer parte de um pacote. Selecione um serviço principal." });
      if (serviceRows.some((service) => service.size && service.size !== petRows[0].size)) throw new TRPCError({ code: "BAD_REQUEST", message: "Um ou mais serviços do pacote não são compatíveis com o porte deste pet." });
      const recurringBenefit = input.recurringServiceId ? input.benefits.find((benefit) => benefit.serviceId === input.recurringServiceId) : undefined;
      if (input.recurringServiceId && !recurringBenefit) throw new TRPCError({ code: "BAD_REQUEST", message: "O serviço recorrente deve estar incluído no pacote." });
      if (recurringBenefit && requestedFutureOccurrences > recurringBenefit.allowance) throw new TRPCError({ code: "BAD_REQUEST", message: "As repetições futuras não podem ultrapassar a franquia contratada." });
      const preConsumedUses = recurringBenefit ? packagePreConsumedUses(recurringBenefit.allowance, requestedFutureOccurrences) : 0;
      const recurringService = serviceRows.find((service) => service.id === input.recurringServiceId);
      if (recurringService && recurringService.size && recurringService.size !== petRows[0].size) throw new TRPCError({ code: "BAD_REQUEST", message: "O serviço recorrente não está disponível para o porte deste pet." });
      if (recurringBenefit && requestedFutureOccurrences > 52) throw new TRPCError({ code: "BAD_REQUEST", message: "A série automática permite até 52 repetições futuras; reduza a quantidade ou agende excedentes manualmente." });
      if (recurringBenefit && input.startDate < saoPauloToday()) throw new TRPCError({ code: "BAD_REQUEST", message: "A primeira ocorrência do pacote precisa ser hoje ou em uma data futura." });
      let occurrenceDates = recurringBenefit ? packageOccurrenceDates(input.startDate, input.cadence, requestedFutureOccurrences) : [];
      if (input.scheduleMode === "custom") {
        const selectedDates = input.customDates ?? [];
        if (!recurringBenefit || !isValidCustomPackageDates(input.startDate, selectedDates, requestedFutureOccurrences)) throw new TRPCError({ code: "BAD_REQUEST", message: `Selecione ${requestedFutureOccurrences} datas únicas, válidas e em ordem cronológica, incluindo a primeira utilização futura.` });
        occurrenceDates = selectedDates;
        const otherBenefitEndDate = calculatePackageEndDate(input.startDate, input.cadence, input.benefits.filter((benefit) => benefit.serviceId !== input.recurringServiceId).map((benefit) => benefit.allowance));
        const selectedEndDate = selectedDates[selectedDates.length - 1];
        calculatedEndDate = selectedEndDate > otherBenefitEndDate ? selectedEndDate : otherBenefitEndDate;
      }
      if (recurringBenefit && !occurrenceDates.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Não foi possível gerar as datas das ocorrências do pacote." });
      return db.transaction(async (tx) => {
        const result = await tx.insert(packages).values({ clientId: input.clientId, petId: input.petId, name: input.name, cadence: input.cadence, startDate: input.startDate, endDate: calculatedEndDate, priceCents: input.priceCents, status: "active", paid: 0, paymentMethod: null });
        const packageId = Number(result[0].insertId);
        await tx.insert(packageServices).values(input.benefits.map((benefit) => ({ packageId, serviceId: benefit.serviceId, allowance: benefit.allowance, used: 0, preConsumed: benefit.serviceId === input.recurringServiceId ? preConsumedUses : 0 })));
        const recurringAppointments: Array<{ id: number; startAt: string; durationMinutes: number; serviceName: string; petName: string; clientName: string; packageName: string; occurrenceIndex: number; occurrenceTotal: number }> = [];
        if (recurringService && input.recurringServiceId && input.bookingTime) {
          for (const [index, date] of occurrenceDates.entries()) {
            const startAt = `${date} ${input.bookingTime}:00`;
            await lockDate(tx, date);
            validateAppointmentDuration(startAt, recurringService.durationMinutes);
            await validatePackageReservation(tx, packageId, input.clientId, input.petId, recurringService.id, date);
            const appointmentResult = await tx.insert(appointments).values({
              clientId: input.clientId,
              petId: input.petId,
              serviceId: recurringService.id,
              startAt,
              durationMinutes: recurringService.durationMinutes,
              priceCents: recurringService.priceCents,
              paymentMethod: "package",
              paymentStatus: "pending",
              packageId,
              calendarSyncEnabled: 1,
              calendarSyncChoiceSet: 1,
              status: "scheduled",
              notes: `Uso ${preConsumedUses + index + 1}/${recurringBenefit?.allowance ?? occurrenceDates.length} do pacote: ${input.name}`,
            });
            recurringAppointments.push({ id: Number(appointmentResult[0].insertId), startAt, durationMinutes: recurringService.durationMinutes, serviceName: recurringService.name, petName: petRows[0].name, clientName: ownerRows[0].name, packageName: input.name, occurrenceIndex: preConsumedUses + index + 1, occurrenceTotal: recurringBenefit?.allowance ?? occurrenceDates.length });
          }
        }
        const initialAppointment = recurringAppointments[0];
        if (!initialAppointment) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "O pacote foi validado sem gerar a primeira utilização recorrente." });
        return { id: packageId, initialAppointment, appointments: recurringAppointments };
      });
    }),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().trim().min(1).max(140), cadence: z.enum(["monthly", "biweekly"]), startDate: dateShape, endDate: dateShape, priceCents: amountShape, benefits: z.array(z.object({ serviceId: z.number().int().positive(), allowance: z.number().int().min(1).max(500) })).min(1) })).mutation(async ({ input }) => {
      const db = await dbOrThrow();
      const serviceRows = await db.select().from(services).where(inArray(services.id, input.benefits.map((item) => item.serviceId)));
      if (serviceRows.length !== input.benefits.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Um ou mais serviços do pacote não estão disponíveis." });
      return db.transaction(async (tx) => {
        const packageRows = await tx.select().from(packages).where(eq(packages.id, input.id)).for("update");
        const item = packageRows[0];
        if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Pacote não encontrado." });
        const oldRows = await tx.select().from(packageServices).where(eq(packageServices.packageId, item.id)).for("update");
        const calculatedEndDate = calculatePackageEndDate(input.startDate, input.cadence, input.benefits.map((benefit) => Math.max(benefit.allowance - (oldRows.find((old) => old.serviceId === benefit.serviceId)?.preConsumed || 0), 0)));
        if (!calculatedEndDate) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe uma data inicial válida para calcular o término do pacote." });
        const existingBenefitIds = new Set(oldRows.map((benefit) => benefit.serviceId));
        if (serviceRows.some((service) => service.active !== 1 && !existingBenefitIds.has(service.id))) throw new TRPCError({ code: "BAD_REQUEST", message: "Um ou mais serviços do pacote não estão disponíveis." });
        if (serviceRows.some((service) => service.category === "transport" && !existingBenefitIds.has(service.id))) throw new TRPCError({ code: "BAD_REQUEST", message: "Transporte é um adicional do agendamento e não pode ser adicionado como benefício de pacote." });
        const packagePets = await tx.select({ size: pets.size }).from(pets).where(eq(pets.id, item.petId)).limit(1);
        if (!packagePets[0] || serviceRows.some((service) => service.size && service.size !== packagePets[0].size)) throw new TRPCError({ code: "BAD_REQUEST", message: "Um ou mais serviços do pacote não são compatíveis com o porte deste pet." });
        if (item.status !== "active") throw new TRPCError({ code: "CONFLICT", message: "Somente pacotes ativos podem ser editados." });
        const recordedPayments = await tx.select({ amountCents: payments.amountCents }).from(payments).where(and(eq(payments.packageId, item.id), eq(payments.sourceType, "package"), eq(payments.status, "settled")));
        const receivedCents = recordedPayments.reduce((sum: number, payment: { amountCents: number }) => sum + payment.amountCents, 0);
        if ((item.paid === 1 || receivedCents > 0) && input.priceCents !== item.priceCents) throw new TRPCError({ code: "CONFLICT", message: "O preço não pode ser alterado depois que algum recebimento já foi registrado." });
        const reservedRows = await tx.select({ serviceId: appointments.serviceId, startAt: appointments.startAt }).from(appointments).where(and(eq(appointments.packageId, item.id), isNull(appointments.deletedAt), ne(appointments.status, "completed"), ne(appointments.status, "cancelled"), ne(appointments.status, "no_show")));
        if (reservedRows.some((appointment) => { const date = localDateFromStartAt(appointment.startAt); return date < input.startDate || date > calculatedEndDate; })) {
          throw new TRPCError({ code: "CONFLICT", message: "A nova vigência deixaria um atendimento agendado fora do pacote." });
        }
        for (const old of oldRows) {
          if (!input.benefits.some((benefit) => benefit.serviceId === old.serviceId) && (old.used > 0 || old.preConsumed > 0 || reservedRows.some((appointment) => appointment.serviceId === old.serviceId))) {
            throw new TRPCError({ code: "CONFLICT", message: "Não remova um serviço com atendimentos consumidos ou agendados." });
          }
        }
        for (const old of oldRows) {
          if (input.benefits.some((benefit) => benefit.serviceId === old.serviceId)) continue;
          const usageRows = await tx.select({ id: packageUsages.id }).from(packageUsages).where(eq(packageUsages.packageServiceId, old.id)).limit(1);
          if (usageRows.length) await tx.update(packageServices).set({ allowance: 0 }).where(eq(packageServices.id, old.id));
          else await tx.delete(packageServices).where(eq(packageServices.id, old.id));
        }
        for (const benefit of input.benefits) {
          const existing = oldRows.find((row) => row.serviceId === benefit.serviceId);
          const reservedCount = reservedRows.filter((appointment) => appointment.serviceId === benefit.serviceId).length;
          if (existing && benefit.allowance < existing.used + existing.preConsumed + reservedCount) throw new TRPCError({ code: "CONFLICT", message: "A franquia não pode ficar abaixo das utilizações anteriores, consumos concluídos e atendimentos já reservados." });
          if (existing) await tx.update(packageServices).set({ allowance: benefit.allowance }).where(eq(packageServices.id, existing.id));
          else await tx.insert(packageServices).values({ packageId: item.id, serviceId: benefit.serviceId, allowance: benefit.allowance, used: 0 });
        }
        await tx.update(packages).set({ name: input.name, cadence: input.cadence, startDate: input.startDate, endDate: calculatedEndDate, priceCents: input.priceCents }).where(eq(packages.id, item.id));
        return { ok: true };
      });
    }),
    markPaid: protectedProcedure.input(z.object({ id: z.number().int().positive(), amountCents: receiptAmountShape, method: methodShape, requestId: z.string().trim().min(8).max(64) })).mutation(async ({ input }) => {
      const db = await dbOrThrow();
      return db.transaction(async (tx) => {
        const rows = await tx.select().from(packages).where(eq(packages.id, input.id)).for("update");
        const item = rows[0];
        if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Pacote não encontrado." });
        const receiptRows = await tx.select({ amountCents: payments.amountCents }).from(payments).where(and(eq(payments.packageId, item.id), eq(payments.sourceType, "package"), eq(payments.status, "settled")));
        const recordedCents = Math.max(receiptRows.reduce((sum: number, payment: { amountCents: number }) => sum + payment.amountCents, 0), item.paid === 1 ? item.priceCents : 0);
        const currentState = packagePaymentState(item.priceCents, recordedCents);
        const priorReceipt = await tx.select().from(payments).where(eq(payments.idempotencyKey, input.requestId)).limit(1).for("update");
        if (priorReceipt.length) {
          const receipt = priorReceipt[0];
          if (receipt.packageId !== item.id || receipt.amountCents !== input.amountCents || receipt.method !== input.method || receipt.status !== "settled") throw new TRPCError({ code: "CONFLICT", message: "Esta chave já foi usada por outro recebimento. Atualize os dados do pacote." });
          return { ok: true, alreadyRecorded: true, receivedCents: currentState.receivedCents, openBalanceCents: currentState.openBalanceCents, paid: currentState.paid };
        }
        if (currentState.openBalanceCents === 0) return { ok: true, alreadyPaid: true, receivedCents: currentState.receivedCents, openBalanceCents: 0, paid: true };
        if (input.amountCents > currentState.openBalanceCents) throw new TRPCError({ code: "BAD_REQUEST", message: `O valor recebido não pode ultrapassar o saldo de ${currentState.openBalanceCents} centavos.` });
        const nextState = packagePaymentState(item.priceCents, currentState.receivedCents + input.amountCents);
        await tx.insert(payments).values({ sourceType: "package", packageId: item.id, amountCents: input.amountCents, method: input.method, status: "settled", idempotencyKey: input.requestId });
        await tx.update(packages).set({ paid: nextState.paid ? 1 : 0, paymentMethod: input.method }).where(eq(packages.id, item.id));
        return { ok: true, alreadyRecorded: false, receivedCents: nextState.receivedCents, openBalanceCents: nextState.openBalanceCents, paid: nextState.paid };
      });
    }),
    close: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      const db = await dbOrThrow();
      await db.transaction(async (tx) => {
        const rows = await tx.select().from(packages).where(eq(packages.id, input.id)).for("update");
        const item = rows[0];
        if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Pacote não encontrado." });
        const pending = await tx.select({ id: appointments.id }).from(appointments).where(and(eq(appointments.packageId, item.id), ne(appointments.status, "completed"), ne(appointments.status, "cancelled"), ne(appointments.status, "no_show")));
        if (pending.length) throw new TRPCError({ code: "CONFLICT", message: "Cancele ou altere os atendimentos ainda agendados com este pacote antes de encerrá-lo." });
        await tx.update(packages).set({ status: "closed", closedAt: new Date() }).where(eq(packages.id, item.id));
      });
      return { ok: true };
    }),
    softDelete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      const db = await dbOrThrow();
      return db.transaction(async (tx) => {
        const rows = await tx.select().from(packages).where(eq(packages.id, input.id)).for("update");
        const item = rows[0];
        if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Pacote não encontrado." });
        const linkedAppointments = await tx.select({ id: appointments.id, status: appointments.status, externalCalendarId: appointments.externalCalendarId, externalCalendarEventId: appointments.externalCalendarEventId }).from(appointments).where(eq(appointments.packageId, item.id)).for("update");
        if (linkedAppointments.some((appointment) => appointment.status === "in_progress")) throw new TRPCError({ code: "CONFLICT", message: "Finalize primeiro o atendimento que está em andamento; depois será possível excluir o pacote." });
        if (item.deletedAt) return { ok: true, alreadyDeleted: true, calendarEvents: linkedAppointments.filter((appointment) => appointment.externalCalendarEventId).map((appointment) => ({ id: appointment.id, calendarId: appointment.externalCalendarId, eventId: appointment.externalCalendarEventId as string })) };
        const now = new Date();
        const appointmentIds = linkedAppointments.map((appointment) => appointment.id);
        if (appointmentIds.length) {
          await tx.update(appointments).set({ deletedAt: now, calendarCleanupRequestedAt: now }).where(inArray(appointments.id, appointmentIds));
          const cancellableIds = linkedAppointments.filter((appointment) => !["completed", "cancelled", "no_show"].includes(appointment.status)).map((appointment) => appointment.id);
          if (cancellableIds.length) await tx.update(appointments).set({ status: "cancelled" }).where(inArray(appointments.id, cancellableIds));
        }
        await tx.update(packages).set({ status: "closed", closedAt: item.closedAt || now, deletedAt: now }).where(eq(packages.id, item.id));
        return { ok: true, alreadyDeleted: false, calendarEvents: linkedAppointments.filter((appointment) => appointment.externalCalendarEventId).map((appointment) => ({ id: appointment.id, calendarId: appointment.externalCalendarId, eventId: appointment.externalCalendarEventId as string })) };
      });
    }),
  }),

  suppliers: router({
    list: protectedProcedure.input(z.object({ includeInactive: z.boolean().optional() }).optional()).query(async ({ input }) => {
      const db = await dbOrThrow();
      return db.select().from(suppliers).where(input?.includeInactive ? undefined : eq(suppliers.active, 1)).orderBy(asc(suppliers.name));
    }),
    create: protectedProcedure.input(z.object({ name: z.string().trim().min(1).max(160), address: z.string().trim().max(255).nullable().optional(), phone: z.string().trim().max(32).nullable().optional(), productType: z.string().trim().min(1).max(120) })).mutation(async ({ input }) => {
      const db = await dbOrThrow();
      const result = await db.insert(suppliers).values({ name: input.name, address: input.address || null, phone: input.phone || null, productType: input.productType, active: 1 });
      return { id: Number(result[0].insertId) };
    }),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().trim().min(1).max(160), address: z.string().trim().max(255).nullable().optional(), phone: z.string().trim().max(32).nullable().optional(), productType: z.string().trim().min(1).max(120), active: z.union([z.literal(0), z.literal(1)]) })).mutation(async ({ input }) => {
      const db = await dbOrThrow();
      const result = await db.update(suppliers).set({ name: input.name, address: input.address || null, phone: input.phone || null, productType: input.productType, active: input.active }).where(eq(suppliers.id, input.id));
      if (!result[0].affectedRows) throw new TRPCError({ code: "NOT_FOUND", message: "Fornecedor não encontrado." });
      return { ok: true };
    }),
  }),

  purchases: router({
    list: protectedProcedure.query(async () => {
      const db = await dbOrThrow();
      const rows = await db.select().from(purchases).orderBy(desc(purchases.purchaseDate), desc(purchases.createdAt), desc(purchases.id)).limit(200);
      if (!rows.length) return [];
      const [supplierRows, itemRows] = await Promise.all([
        db.select().from(suppliers).where(inArray(suppliers.id, [...new Set(rows.map((row) => row.supplierId))])),
        db.select().from(purchaseItems).where(inArray(purchaseItems.purchaseId, rows.map((row) => row.id))).orderBy(asc(purchaseItems.id)),
      ]);
      return rows.map((row) => ({ ...row, supplierName: supplierRows.find((supplier) => supplier.id === row.supplierId)?.name || "Fornecedor", items: itemRows.filter((item) => item.purchaseId === row.id) }));
    }),
    create: protectedProcedure.input(z.object({ requestId: z.string().trim().min(8).max(64), supplierId: z.number().int().positive(), items: z.array(z.object({ itemName: z.string().trim().min(1).max(140), quantity: z.number().int().min(1).max(100_000), unitPriceCents: z.number().int().min(1).max(100_000_000) })).min(1).max(100) })).mutation(async ({ input }) => {
      const itemTotals = input.items.map((item) => item.quantity * item.unitPriceCents);
      if (itemTotals.some((total) => !Number.isSafeInteger(total) || total > 2_000_000_000)) throw new TRPCError({ code: "BAD_REQUEST", message: "O subtotal de cada item excede o limite permitido." });
      const totalCents = itemTotals.reduce((sum, total) => sum + total, 0);
      if (!Number.isSafeInteger(totalCents) || totalCents <= 0 || totalCents > 2_000_000_000) throw new TRPCError({ code: "BAD_REQUEST", message: "O total da compra deve ser maior que zero e estar dentro do limite permitido." });
      const db = await dbOrThrow();
      return db.transaction(async (tx) => {
        const priorRows = await tx.select().from(purchases).where(eq(purchases.requestId, input.requestId)).limit(1).for("update");
        const prior = priorRows[0];
        if (prior) {
          const savedItems = await tx.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, prior.id)).orderBy(asc(purchaseItems.id));
          const sameItems = savedItems.length === input.items.length && savedItems.every((saved, index) => saved.itemName === input.items[index].itemName && saved.quantity === input.items[index].quantity && saved.unitPriceCents === input.items[index].unitPriceCents);
          if (prior.supplierId !== input.supplierId || prior.totalCents !== totalCents || !sameItems) throw new TRPCError({ code: "CONFLICT", message: "Esta solicitação de compra já foi usada para outros dados. Atualize a tela e confira o histórico." });
          return { id: prior.id, alreadyRecorded: true };
        }
        const supplierRows = await tx.select().from(suppliers).where(eq(suppliers.id, input.supplierId)).limit(1).for("update");
        if (!supplierRows[0] || supplierRows[0].active !== 1) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione um fornecedor ativo antes de finalizar a compra." });
        const purchaseDate = saoPauloToday();
        const result = await tx.insert(purchases).values({ requestId: input.requestId, supplierId: input.supplierId, purchaseDate, totalCents });
        const purchaseId = Number(result[0].insertId);
        await tx.insert(purchaseItems).values(input.items.map((item, index) => ({ purchaseId, itemName: item.itemName, quantity: item.quantity, unitPriceCents: item.unitPriceCents, totalCents: itemTotals[index] })));
        return { id: purchaseId, alreadyRecorded: false };
      });
    }),
  }),

  finance: router({
    pending: protectedProcedure.query(async () => {
      const db = await dbOrThrow();
      const [appointmentRows, packageRows, hotelRows, dismissalRows] = await Promise.all([
        db.select().from(appointments).where(and(eq(appointments.status, "completed"), eq(appointments.paymentStatus, "pending"), isNull(appointments.deletedAt))),
        db.select().from(packages).where(isNull(packages.deletedAt)),
        db.select().from(hotelStays).where(and(eq(hotelStays.status, "checked_in"), isNull(hotelStays.deletedAt))),
        db.select().from(financePendingDismissals),
      ]);
      const packageIds = packageRows.map((row) => row.id);
      const hotelIds = hotelRows.map((row) => row.id);
      const clientIds = [...new Set([...appointmentRows.map((row) => row.clientId), ...packageRows.map((row) => row.clientId), ...hotelRows.map((row) => row.clientId)])];
      const petIds = [...new Set([...appointmentRows.map((row) => row.petId), ...packageRows.map((row) => row.petId), ...hotelRows.map((row) => row.petId)])];
      const serviceIds = [...new Set(appointmentRows.flatMap((row) => [row.serviceId, ...(row.transportServiceId ? [row.transportServiceId] : [])]))];
      const [clientRows, petRows, serviceRows, packageReceipts, hotelReceipts] = await Promise.all([
        clientIds.length ? db.select({ id: clients.id, name: clients.name }).from(clients).where(inArray(clients.id, clientIds)) : [],
        petIds.length ? db.select({ id: pets.id, name: pets.name }).from(pets).where(inArray(pets.id, petIds)) : [],
        serviceIds.length ? db.select({ id: services.id, name: services.name }).from(services).where(inArray(services.id, serviceIds)) : [],
        packageIds.length ? db.select({ packageId: payments.packageId, amountCents: payments.amountCents }).from(payments).where(and(eq(payments.sourceType, "package"), eq(payments.status, "settled"), inArray(payments.packageId, packageIds))) : [],
        hotelIds.length ? db.select({ hotelStayId: payments.hotelStayId }).from(payments).where(and(eq(payments.sourceType, "hotel"), eq(payments.status, "settled"), inArray(payments.hotelStayId, hotelIds))) : [],
      ]);
      const receivedByPackage = new Map<number, number>();
      for (const receipt of packageReceipts) if (receipt.packageId) receivedByPackage.set(receipt.packageId, (receivedByPackage.get(receipt.packageId) || 0) + receipt.amountCents);
      const paidHotelIds = new Set(hotelReceipts.flatMap((receipt) => receipt.hotelStayId ? [receipt.hotelStayId] : []));
      const pending = [
        ...appointmentRows.flatMap((appointment) => {
          const amountCents = appointmentChargeCents(appointment);
          if (amountCents <= 0 || (appointment.paymentMethod === "package" && !appointment.transportServiceId)) return [];
          const serviceName = serviceRows.find((row) => row.id === appointment.serviceId)?.name || "Serviço";
          const transportName = appointment.transportServiceId ? serviceRows.find((row) => row.id === appointment.transportServiceId)?.name || "Transporte" : null;
          const description = appointment.paymentMethod === "package" ? `Transporte · ${transportName || "não informado"}` : transportName ? `${serviceName} + ${transportName}` : serviceName;
          return [{
            sourceType: "service" as const,
            id: appointment.id,
            description,
            clientName: clientRows.find((row) => row.id === appointment.clientId)?.name || "Tutor não informado",
            petName: petRows.find((row) => row.id === appointment.petId)?.name || "Pet não informado",
            dueAmountCents: amountCents,
            expectedAmountCents: amountCents,
            method: appointmentChargeMethod(appointment) || null,
            reference: `Concluído em ${appointment.startAt.slice(0, 10).split("-").reverse().join("/")} às ${appointment.startAt.slice(11, 16)}`,
            sortAt: appointment.startAt,
          }];
        }),
        ...packageRows.flatMap((item) => {
          const recordedCents = Math.max(receivedByPackage.get(item.id) || 0, item.paid === 1 ? item.priceCents : 0);
          const paymentState = packagePaymentState(item.priceCents, recordedCents);
          if (paymentState.openBalanceCents <= 0) return [];
          return [{
            sourceType: "package" as const,
            id: item.id,
            description: item.name,
            clientName: clientRows.find((row) => row.id === item.clientId)?.name || "Tutor não informado",
            petName: petRows.find((row) => row.id === item.petId)?.name || "Pet não informado",
            dueAmountCents: paymentState.openBalanceCents,
            expectedAmountCents: item.priceCents,
            method: item.paymentMethod === "pix" || item.paymentMethod === "cash" || item.paymentMethod === "card" ? item.paymentMethod : null,
            reference: `Pacote · início ${item.startDate.split("-").reverse().join("/")}`,
            sortAt: `${item.startDate} 00:00`,
          }];
        }),
        ...hotelRows.flatMap((stay) => {
          if (paidHotelIds.has(stay.id) || stay.totalCents <= 0) return [];
          return [{
            sourceType: "hotel" as const,
            id: stay.id,
            description: "Hospedagem",
            clientName: clientRows.find((row) => row.id === stay.clientId)?.name || "Tutor não informado",
            petName: petRows.find((row) => row.id === stay.petId)?.name || "Pet não informado",
            dueAmountCents: stay.totalCents,
            expectedAmountCents: stay.totalCents,
            method: null,
            reference: `Checkout previsto para ${stay.checkOutDate.split("-").reverse().join("/")}`,
            sortAt: `${stay.checkOutDate} 00:00`,
          }];
        }),
      ];
      const sorted = pending.sort((a, b) => a.sortAt.localeCompare(b.sortAt));
      const excludedKeys = new Set(dismissalRows.map((row) => `${row.sourceType}:${row.sourceId}`));
      return {
        items: sorted.filter((item) => !excludedKeys.has(`${item.sourceType}:${item.id}`)),
        excludedItems: sorted.filter((item) => excludedKeys.has(`${item.sourceType}:${item.id}`)),
      };
    }),
    excludePending: protectedProcedure.input(z.object({ sourceType: z.enum(["service", "package", "hotel"]), sourceId: z.number().int().positive() })).mutation(async ({ input }) => {
      const db = await dbOrThrow();
      await db.insert(financePendingDismissals).values(input).onDuplicateKeyUpdate({ set: { createdAt: new Date() } });
      return { ok: true };
    }),
    restorePending: protectedProcedure.input(z.object({ sourceType: z.enum(["service", "package", "hotel"]), sourceId: z.number().int().positive() })).mutation(async ({ input }) => {
      const db = await dbOrThrow();
      await db.delete(financePendingDismissals).where(and(eq(financePendingDismissals.sourceType, input.sourceType), eq(financePendingDismissals.sourceId, input.sourceId)));
      return { ok: true };
    }),
    overview: protectedProcedure.input(z.object({ from: dateShape, to: dateShape })).query(async ({ input }) => {
      const db = await dbOrThrow();
      const [paymentsRows, purchaseRows] = await Promise.all([
        db.select().from(payments).where(and(eq(payments.status, "settled"), gte(payments.paidAt, saoPauloDate(input.from)), lte(payments.paidAt, saoPauloDate(input.to, true)))).orderBy(desc(payments.paidAt)),
        db.select().from(purchases).where(and(gte(purchases.purchaseDate, input.from), lte(purchases.purchaseDate, input.to))).orderBy(desc(purchases.purchaseDate), desc(purchases.createdAt), desc(purchases.id)),
      ]);
      const appointmentIds = paymentsRows.flatMap((row) => row.appointmentId ? [row.appointmentId] : []);
      const packageIds = paymentsRows.flatMap((row) => row.packageId ? [row.packageId] : []);
      const hotelStayIds = paymentsRows.flatMap((row) => row.hotelStayId ? [row.hotelStayId] : []);
      const [appointmentRows, packageRows, hotelStayRows] = await Promise.all([
        appointmentIds.length ? db.select().from(appointments).where(inArray(appointments.id, appointmentIds)) : [],
        packageIds.length ? db.select().from(packages).where(inArray(packages.id, packageIds)) : [],
        hotelStayIds.length ? db.select().from(hotelStays).where(inArray(hotelStays.id, hotelStayIds)) : [],
      ]);
      const clientIds = [...new Set([...appointmentRows.map((row) => row.clientId), ...packageRows.map((row) => row.clientId), ...hotelStayRows.map((row) => row.clientId)])];
      const petIds = [...new Set([...appointmentRows.map((row) => row.petId), ...packageRows.map((row) => row.petId), ...hotelStayRows.map((row) => row.petId)])];
      const [clientRows, petRows] = await Promise.all([
        clientIds.length ? db.select().from(clients).where(inArray(clients.id, clientIds)) : [],
        petIds.length ? db.select().from(pets).where(inArray(pets.id, petIds)) : [],
      ]);
      const uniquePackageIds = [...new Set(packageIds)];
      const packageReceiptRows = uniquePackageIds.length ? await db.select({ packageId: payments.packageId, amountCents: payments.amountCents }).from(payments).where(and(eq(payments.sourceType, "package"), eq(payments.status, "settled"), inArray(payments.packageId, uniquePackageIds))) : [];
      const packageReceivedTotals = new Map<number, number>();
      for (const receipt of packageReceiptRows) if (receipt.packageId) packageReceivedTotals.set(receipt.packageId, (packageReceivedTotals.get(receipt.packageId) || 0) + receipt.amountCents);
      const allServiceIds = [...new Set(appointmentRows.flatMap((row) => [row.serviceId, ...(row.transportServiceId ? [row.transportServiceId] : [])]))];
      const serviceRows = allServiceIds.length ? await db.select().from(services).where(inArray(services.id, allServiceIds)) : [];
      const purchaseIds = purchaseRows.map((row) => row.id);
      const supplierIds = [...new Set(purchaseRows.map((row) => row.supplierId))];
      const [purchaseSupplierRows, purchaseItemRows] = await Promise.all([
        supplierIds.length ? db.select().from(suppliers).where(inArray(suppliers.id, supplierIds)) : [],
        purchaseIds.length ? db.select().from(purchaseItems).where(inArray(purchaseItems.purchaseId, purchaseIds)).orderBy(asc(purchaseItems.id)) : [],
      ]);
      const expenses = purchaseRows.map((purchase) => ({ ...purchase, supplierName: purchaseSupplierRows.find((supplier) => supplier.id === purchase.supplierId)?.name || "Fornecedor", items: purchaseItemRows.filter((item) => item.purchaseId === purchase.id) }));
      const lines = paymentsRows.map((payment) => {
        const appointment = appointmentRows.find((row) => row.id === payment.appointmentId);
        const petPackage = packageRows.find((row) => row.id === payment.packageId);
        const hotelStay = hotelStayRows.find((row) => row.id === payment.hotelStayId);
        const serviceName = serviceRows.find((row) => row.id === appointment?.serviceId)?.name || "Serviço";
        const transportName = appointment?.transportServiceId ? serviceRows.find((row) => row.id === appointment.transportServiceId)?.name || "Transporte" : null;
        const clientPetRecord = appointment || petPackage || hotelStay;
        const petName = petRows.find((row) => row.id === clientPetRecord?.petId)?.name || "Pet não informado";
        const description = payment.sourceType === "service" ? appointment?.paymentMethod === "package" ? `Transporte · ${transportName || "não informado"}` : transportName ? `${serviceName} + ${transportName}` : serviceName : payment.sourceType === "package" ? petPackage?.name || "Pacote" : `Hospedagem · ${petName}`;
        return {
          ...payment,
          description,
          clientName: clientRows.find((row) => row.id === clientPetRecord?.clientId)?.name || "Tutor não informado",
          petName,
          expectedAmountCents: payment.sourceType === "service" && appointment ? appointmentChargeCents(appointment) : payment.sourceType === "hotel" && hotelStay ? hotelStay.totalCents : null,
          packagePriceCents: petPackage?.priceCents ?? null,
          packageReceivedCents: payment.packageId ? packageReceivedTotals.get(payment.packageId) ?? 0 : null,
        };
      });
      const serviceRevenueCents = lines.filter((line) => line.sourceType === "service").reduce((sum, line) => sum + line.amountCents, 0);
      const packageRevenueCents = lines.filter((line) => line.sourceType === "package").reduce((sum, line) => sum + line.amountCents, 0);
      const hotelRevenueCents = lines.filter((line) => line.sourceType === "hotel").reduce((sum, line) => sum + line.amountCents, 0);
      const expensesCents = expenses.reduce((sum, purchase) => sum + purchase.totalCents, 0);
      const paymentCount = lines.length;
      const methods = { pix: 0, cash: 0, card: 0 };
      for (const line of lines) methods[line.method] += line.amountCents;
      const perService: Record<string, number> = {};
      for (const line of lines.filter((item) => item.sourceType === "service")) {
        const appointment = appointmentRows.find((row) => row.id === line.appointmentId);
        if (!appointment) continue;
        if (appointment.paymentMethod === "package") {
          const name = appointment.transportServiceId ? serviceRows.find((row) => row.id === appointment.transportServiceId)?.name || "Transporte" : "Transporte";
          perService[name] = (perService[name] || 0) + line.amountCents;
        } else {
          const transportAmount = Math.min(appointment.transportPriceCents, line.amountCents);
          const serviceAmount = Math.max(0, line.amountCents - transportAmount);
          const serviceName = serviceRows.find((row) => row.id === appointment.serviceId)?.name || "Serviço";
          if (serviceAmount) perService[serviceName] = (perService[serviceName] || 0) + serviceAmount;
          if (transportAmount) {
            const transportName = appointment.transportServiceId ? serviceRows.find((row) => row.id === appointment.transportServiceId)?.name || "Transporte" : "Transporte";
            perService[transportName] = (perService[transportName] || 0) + transportAmount;
          }
        }
      }
      const totalCents = serviceRevenueCents + packageRevenueCents + hotelRevenueCents;
      return { lines, expenses, serviceRevenueCents, packageRevenueCents, hotelRevenueCents, expensesCents, totalCents, netCents: totalCents - expensesCents, ticketAverageCents: paymentCount ? Math.round(totalCents / paymentCount) : 0, methods, perService };
    }),
    updatePayment: protectedProcedure.input(z.object({ paymentId: z.number().int().positive(), amountCents: receiptAmountShape, method: methodShape })).mutation(async ({ input }) => {
      const db = await dbOrThrow();
      return db.transaction(async (tx) => {
        const initialRows = await tx.select().from(payments).where(eq(payments.id, input.paymentId)).limit(1);
        const initial = initialRows[0];
        if (!initial || initial.status !== "settled") throw new TRPCError({ code: "NOT_FOUND", message: "Pagamento liquidado não encontrado." });

        let appointment: typeof appointments.$inferSelect | null = null;
        let petPackage: typeof packages.$inferSelect | null = null;
        let hotelStay: typeof hotelStays.$inferSelect | null = null;
        if (initial.sourceType === "service") {
          if (!initial.appointmentId) throw new TRPCError({ code: "BAD_REQUEST", message: "O pagamento não está ligado a um atendimento." });
          const appointmentRows = await tx.select().from(appointments).where(eq(appointments.id, initial.appointmentId)).for("update");
          appointment = appointmentRows[0] || null;
          if (!appointment || appointment.deletedAt || appointment.paymentStatus !== "paid") throw new TRPCError({ code: "CONFLICT", message: "O atendimento não possui um pagamento liquidado editável." });
        } else if (initial.sourceType === "package") {
          if (!initial.packageId) throw new TRPCError({ code: "BAD_REQUEST", message: "O pagamento não está ligado a um pacote." });
          const packageRows = await tx.select().from(packages).where(eq(packages.id, initial.packageId)).for("update");
          petPackage = packageRows[0] || null;
          if (!petPackage) throw new TRPCError({ code: "NOT_FOUND", message: "Pacote do pagamento não encontrado." });
        } else {
          if (!initial.hotelStayId) throw new TRPCError({ code: "BAD_REQUEST", message: "O pagamento não está ligado a uma hospedagem." });
          const stayRows = await tx.select().from(hotelStays).where(eq(hotelStays.id, initial.hotelStayId)).for("update");
          hotelStay = stayRows[0] || null;
          if (!hotelStay || hotelStay.status !== "completed") throw new TRPCError({ code: "CONFLICT", message: "A hospedagem não possui um checkout concluído editável." });
        }

        const lockedRows = await tx.select().from(payments).where(eq(payments.id, input.paymentId)).limit(1).for("update");
        const payment = lockedRows[0];
        if (!payment || payment.status !== "settled" || payment.sourceType !== initial.sourceType) throw new TRPCError({ code: "CONFLICT", message: "Este pagamento deixou de estar liquidado; atualize o Financeiro." });

        if (payment.sourceType === "service" && appointment) {
          const expectedAmountCents = appointmentChargeCents(appointment);
          if (expectedAmountCents <= 0) throw new TRPCError({ code: "CONFLICT", message: "O atendimento não possui valor editável." });
          await tx.update(payments).set({ amountCents: input.amountCents, method: input.method }).where(eq(payments.id, payment.id));
          if (appointment.paymentMethod === "package") {
            if (!appointment.transportServiceId || appointment.transportPriceCents <= 0) throw new TRPCError({ code: "CONFLICT", message: "Este pagamento de pacote não possui transporte editável." });
            await tx.update(appointments).set({ transportPaymentMethod: input.method }).where(eq(appointments.id, appointment.id));
          } else {
            await tx.update(appointments).set({ paymentMethod: input.method }).where(eq(appointments.id, appointment.id));
          }
          return { ok: true, sourceType: "service" as const, amountCents: input.amountCents, expectedAmountCents };
        }

        if (payment.sourceType === "package" && petPackage && payment.packageId === petPackage.id) {
          const receiptRows = await tx.select({ id: payments.id, amountCents: payments.amountCents }).from(payments).where(and(eq(payments.packageId, petPackage.id), eq(payments.sourceType, "package"), eq(payments.status, "settled")));
          const totalReceivedCents = receiptRows.reduce((sum: number, receipt: { amountCents: number }) => sum + receipt.amountCents, 0);
          let nextState: ReturnType<typeof replacePackageReceiptState>;
          try {
            nextState = replacePackageReceiptState(petPackage.priceCents, totalReceivedCents, payment.amountCents, input.amountCents);
          } catch {
            throw new TRPCError({ code: "BAD_REQUEST", message: "O valor editado não pode ultrapassar o saldo restante após considerar os outros recebimentos." });
          }
          await tx.update(payments).set({ amountCents: input.amountCents, method: input.method }).where(eq(payments.id, payment.id));
          const latestReceipt = await tx.select({ method: payments.method }).from(payments).where(and(eq(payments.packageId, petPackage.id), eq(payments.sourceType, "package"), eq(payments.status, "settled"))).orderBy(desc(payments.paidAt), desc(payments.id)).limit(1);
          await tx.update(packages).set({ paid: nextState.paid ? 1 : 0, paymentMethod: latestReceipt[0]?.method ?? input.method }).where(eq(packages.id, petPackage.id));
          return { ok: true, sourceType: "package" as const, amountCents: input.amountCents, ...nextState };
        }
        if (payment.sourceType === "hotel" && hotelStay && payment.hotelStayId === hotelStay.id) {
          if (hotelStay.totalCents <= 0) throw new TRPCError({ code: "CONFLICT", message: "A hospedagem não possui valor previsto editável." });
          await tx.update(payments).set({ amountCents: input.amountCents, method: input.method }).where(eq(payments.id, payment.id));
          return { ok: true, sourceType: "hotel" as const, amountCents: input.amountCents, expectedAmountCents: hotelStay.totalCents };
        }
        throw new TRPCError({ code: "CONFLICT", message: "O pagamento não corresponde ao atendimento ou pacote vinculado." });
      });
    }),
  }),

  export: router({
    all: protectedProcedure.query(async () => {
      const db = await dbOrThrow();
      const [clientRows, petRows, serviceRows, packageRows, appointmentRows, paymentRows, supplierRows, purchaseRows] = await Promise.all([
        db.select().from(clients).orderBy(asc(clients.name)),
        db.select().from(pets).orderBy(asc(pets.name)),
        db.select().from(services).orderBy(asc(services.name)),
        db.select().from(packages).orderBy(desc(packages.createdAt)),
        db.select().from(appointments).orderBy(desc(appointments.startAt)),
        db.select().from(payments).orderBy(desc(payments.paidAt)),
        db.select().from(suppliers).orderBy(asc(suppliers.name)),
        db.select().from(purchases).orderBy(desc(purchases.purchaseDate), desc(purchases.createdAt)),
      ]);
      const itemRows = purchaseRows.length ? await db.select().from(purchaseItems).where(inArray(purchaseItems.purchaseId, purchaseRows.map((row) => row.id))).orderBy(asc(purchaseItems.id)) : [];
      return { clients: clientRows, pets: petRows, services: serviceRows, packages: packageRows, appointments: appointmentRows, payments: paymentRows, suppliers: supplierRows, purchases: purchaseRows, purchaseItems: itemRows };
    }),
  }),
  hotel: router({
    list: protectedProcedure.query(async () => {
      const db = await dbOrThrow();
      const rows = await db.select().from(hotelStays).where(isNull(hotelStays.deletedAt)).orderBy(desc(hotelStays.checkInDate), desc(hotelStays.id));
      if (!rows.length) return [];
      const clientIds = [...new Set(rows.map((row) => row.clientId))];
      const petIds = [...new Set(rows.map((row) => row.petId))];
      const stayIds = rows.map((row) => row.id);
      const [clientRows, petRows, paymentRows] = await Promise.all([
        db.select({ id: clients.id, name: clients.name }).from(clients).where(inArray(clients.id, clientIds)),
        db.select({ id: pets.id, name: pets.name }).from(pets).where(inArray(pets.id, petIds)),
        db.select({ hotelStayId: payments.hotelStayId, amountCents: payments.amountCents, method: payments.method }).from(payments).where(and(inArray(payments.hotelStayId, stayIds), eq(payments.sourceType, "hotel"), eq(payments.status, "settled"))),
      ]);
      return rows.map((row) => {
        const receipt = paymentRows.find((item) => item.hotelStayId === row.id);
        return { ...row, clientName: clientRows.find((item) => item.id === row.clientId)?.name || "Tutor", petName: petRows.find((item) => item.id === row.petId)?.name || "Pet", receivedAmountCents: receipt?.amountCents ?? null, paymentMethod: receipt?.method ?? null };
      });
    }),
    create: protectedProcedure.input(z.object({ clientId: z.number().int().positive(), petId: z.number().int().positive(), petSize: sizeShape, checkInDate: dateShape, checkOutDate: dateShape, dailyRateCents: z.number().int().min(1).max(100_000_000) })).mutation(async ({ input }) => {
      const nights = calculateHotelStayNights(input.checkInDate, input.checkOutDate);
      if (!nights) throw new TRPCError({ code: "BAD_REQUEST", message: "O checkout deve ser posterior ao check-in, com pelo menos uma diária." });
      let totalCents: number;
      try { totalCents = calculateHotelStayTotalCents(input.dailyRateCents, nights); }
      catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Não foi possível calcular o total da hospedagem." }); }
      const db = await dbOrThrow();
      const [ownerRows, petRows] = await Promise.all([
        db.select({ id: clients.id }).from(clients).where(and(eq(clients.id, input.clientId), eq(clients.active, 1))).limit(1),
        db.select({ id: pets.id }).from(pets).where(and(eq(pets.id, input.petId), eq(pets.clientId, input.clientId), eq(pets.active, 1))).limit(1),
      ]);
      if (!ownerRows[0] || !petRows[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "O pet ativo precisa pertencer ao tutor selecionado." });
      const result = await db.insert(hotelStays).values({ clientId: input.clientId, petId: input.petId, petSize: input.petSize, checkInDate: input.checkInDate, checkOutDate: input.checkOutDate, dailyRateCents: input.dailyRateCents, totalCents, status: "reserved" });
      return { id: Number(result[0].insertId), nights, totalCents };
    }),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), clientId: z.number().int().positive(), petId: z.number().int().positive(), petSize: sizeShape, checkInDate: dateShape, checkOutDate: dateShape, dailyRateCents: z.number().int().min(1).max(100_000_000) })).mutation(async ({ input }) => {
      const nights = calculateHotelStayNights(input.checkInDate, input.checkOutDate);
      if (!nights) throw new TRPCError({ code: "BAD_REQUEST", message: "O checkout deve ser posterior ao check-in, com pelo menos uma diária." });
      let totalCents: number;
      try { totalCents = calculateHotelStayTotalCents(input.dailyRateCents, nights); }
      catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Não foi possível calcular o total da hospedagem." }); }
      const db = await dbOrThrow();
      return db.transaction(async (tx) => {
        const rows = await tx.select().from(hotelStays).where(eq(hotelStays.id, input.id)).limit(1).for("update");
        const stay = rows[0];
        if (!stay || stay.deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Hospedagem não encontrada." });
        const [ownerRows, petRows] = await Promise.all([
          tx.select({ id: clients.id }).from(clients).where(and(eq(clients.id, input.clientId), eq(clients.active, 1))).limit(1),
          tx.select({ id: pets.id }).from(pets).where(and(eq(pets.id, input.petId), eq(pets.clientId, input.clientId), eq(pets.active, 1))).limit(1),
        ]);
        if (!ownerRows[0] || !petRows[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "O pet ativo precisa pertencer ao tutor selecionado." });
        await tx.update(hotelStays).set({ clientId: input.clientId, petId: input.petId, petSize: input.petSize, checkInDate: input.checkInDate, checkOutDate: input.checkOutDate, dailyRateCents: input.dailyRateCents, totalCents }).where(eq(hotelStays.id, input.id));
        return { ok: true, nights, totalCents };
      });
    }),
    setCalendarEvent: protectedProcedure.input(z.object({ id: z.number().int().positive(), calendarId: z.string().trim().min(1).max(255), eventId: z.string().trim().min(1).max(255), expectedEventId: z.string().trim().min(1).max(255).optional() })).mutation(async ({ input }) => {
      const db = await dbOrThrow();
      return db.transaction(async (tx) => {
        const rows = await tx.select().from(hotelStays).where(eq(hotelStays.id, input.id)).limit(1).for("update");
        const stay = rows[0];
        if (!stay || stay.deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Hospedagem não encontrada." });
        if (stay.calendarEventId) {
          if (stay.calendarId === input.calendarId && stay.calendarEventId === input.eventId) return { ok: true, alreadyLinked: true };
          if (input.expectedEventId === stay.calendarEventId) {
            await tx.update(hotelStays).set({ calendarId: input.calendarId, calendarEventId: input.eventId }).where(eq(hotelStays.id, input.id));
            return { ok: true, alreadyLinked: false, replaced: true };
          }
          throw new TRPCError({ code: "CONFLICT", message: "Esta hospedagem já está vinculada a outro evento Google." });
        }
        if (input.expectedEventId) throw new TRPCError({ code: "CONFLICT", message: "O vínculo Google mudou; atualize a hospedagem antes de sincronizar." });
        await tx.update(hotelStays).set({ calendarId: input.calendarId, calendarEventId: input.eventId }).where(eq(hotelStays.id, input.id));
        return { ok: true, alreadyLinked: false };
      });
    }),
    delete: protectedProcedure.input(z.object({ id: z.number().int().positive(), expectedEventId: z.string().trim().min(1).max(255).nullable().optional() })).mutation(async ({ input }) => {
      const db = await dbOrThrow();
      return db.transaction(async (tx) => {
        const rows = await tx.select().from(hotelStays).where(eq(hotelStays.id, input.id)).limit(1).for("update");
        const stay = rows[0];
        if (!stay) throw new TRPCError({ code: "NOT_FOUND", message: "Hospedagem não encontrada." });
        if (stay.deletedAt) return { ok: true, alreadyDeleted: true };
        if (input.expectedEventId !== undefined && input.expectedEventId !== stay.calendarEventId) throw new TRPCError({ code: "CONFLICT", message: "O evento Google foi alterado; atualize a hospedagem antes de excluí-la." });
        await tx.update(hotelStays).set({ deletedAt: new Date(), calendarId: null, calendarEventId: null }).where(eq(hotelStays.id, stay.id));
        await tx.update(payments).set({ status: "voided" }).where(and(eq(payments.hotelStayId, stay.id), eq(payments.sourceType, "hotel"), eq(payments.status, "settled")));
        return { ok: true, alreadyDeleted: false };
      });
    }),
    checkIn: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      const db = await dbOrThrow();
      return db.transaction(async (tx) => {
        const rows = await tx.select().from(hotelStays).where(eq(hotelStays.id, input.id)).limit(1).for("update");
        const stay = rows[0];
        if (!stay || stay.deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Hospedagem não encontrada." });
        if (stay.status === "checked_in") return { ok: true, alreadyCheckedIn: true };
        if (stay.status !== "reserved") throw new TRPCError({ code: "CONFLICT", message: "Somente uma hospedagem reservada pode receber check-in." });
        await tx.update(hotelStays).set({ status: "checked_in" }).where(eq(hotelStays.id, stay.id));
        return { ok: true, alreadyCheckedIn: false };
      });
    }),
    checkOut: protectedProcedure.input(z.object({ id: z.number().int().positive(), amountCents: receiptAmountShape, method: methodShape })).mutation(async ({ input }) => {
      const db = await dbOrThrow();
      return db.transaction(async (tx) => {
        const rows = await tx.select().from(hotelStays).where(eq(hotelStays.id, input.id)).limit(1).for("update");
        const stay = rows[0];
        if (!stay || stay.deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Hospedagem não encontrada." });
        const receiptRows = await tx.select().from(payments).where(and(eq(payments.hotelStayId, stay.id), eq(payments.sourceType, "hotel"))).limit(1).for("update");
        const priorReceipt = receiptRows[0];
        if (stay.status === "completed") {
          if (priorReceipt?.status === "settled") return { ok: true, alreadyCompleted: true, amountCents: priorReceipt.amountCents };
          throw new TRPCError({ code: "CONFLICT", message: "O checkout foi concluído sem uma transação financeira válida; solicite suporte antes de tentar novamente." });
        }
        if (stay.status !== "checked_in") throw new TRPCError({ code: "CONFLICT", message: "Registre o check-in antes de finalizar o checkout." });
        if (priorReceipt) throw new TRPCError({ code: "CONFLICT", message: "Já existe um recebimento ligado a esta hospedagem." });
        const nights = calculateHotelStayNights(stay.checkInDate, stay.checkOutDate);
        let expectedAmountCents: number;
        try { expectedAmountCents = calculateHotelStayTotalCents(stay.dailyRateCents, nights); }
        catch (error) { throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "O total da hospedagem está inválido." }); }
        if (expectedAmountCents !== stay.totalCents) throw new TRPCError({ code: "CONFLICT", message: "O valor salvo da hospedagem não corresponde às datas e à diária. O checkout foi bloqueado para preservar o Financeiro." });
        await tx.insert(payments).values({ sourceType: "hotel", hotelStayId: stay.id, amountCents: input.amountCents, method: input.method, status: "settled", paidAt: new Date() });
        await tx.update(hotelStays).set({ status: "completed" }).where(eq(hotelStays.id, stay.id));
        return { ok: true, alreadyCompleted: false, amountCents: input.amountCents, expectedAmountCents };
      });
    }),
  }),
});
