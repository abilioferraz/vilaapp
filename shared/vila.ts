export const BRAND = {
  orange: "#E67E22",
  green: "#1E3D2B",
  brown: "#4B2E1A",
  cream: "#F5F1E8",
  background: "#111311",
  surface: "#1C201D",
  surfaceAlt: "#252A26",
  text: "#F5F1E8",
  muted: "#A8AEA8",
  border: "#343A35",
  teal: "#80C8BE",
  danger: "#D96A5F",
} as const;

export const SPECIES_LABELS = { dog: "Cão", cat: "Gato", rabbit: "Coelho" } as const;
export const SIZE_LABELS = { small: "Pequeno", medium: "Médio", large: "Grande", special: "Especial" } as const;
export const SERVICE_CATEGORY_LABELS = {
  bath: "Banho",
  grooming: "Tosa",
  treatment: "Tratamento",
  transport: "Transporte",
  other: "Outro",
} as const;
export const CADENCE_LABELS = { monthly: "Mensal", biweekly: "Quinzenal" } as const;
export const PAYMENT_METHOD_LABELS = {
  pix: "Pix",
  cash: "Dinheiro",
  card: "Cartão",
  package: "Pacote",
} as const;
export const APPOINTMENT_STATUS_LABELS = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  in_progress: "Em atendimento",
  completed: "Concluído",
  cancelled: "Cancelado",
  no_show: "Não compareceu",
} as const;

export type Species = keyof typeof SPECIES_LABELS;
export type PetSize = keyof typeof SIZE_LABELS;
export type ServiceCategory = keyof typeof SERVICE_CATEGORY_LABELS;
export type Cadence = keyof typeof CADENCE_LABELS;
export type PaymentMethod = keyof typeof PAYMENT_METHOD_LABELS;
export type AppointmentStatus = keyof typeof APPOINTMENT_STATUS_LABELS;

const APPOINTMENT_TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  scheduled: ["confirmed", "cancelled", "no_show"],
  confirmed: ["scheduled", "in_progress", "cancelled", "no_show"],
  in_progress: ["completed", "cancelled", "no_show"],
  completed: ["scheduled", "confirmed"],
  cancelled: ["scheduled", "confirmed"],
  no_show: ["scheduled", "confirmed"],
};

export function canTransitionAppointmentStatus(current: AppointmentStatus, next: AppointmentStatus): boolean {
  return current === next || APPOINTMENT_TRANSITIONS[current].includes(next);
}

export function appointmentCalendarMarkerIds(notes: string | null | undefined): number[] {
  if (!notes) return [];
  const matches = [...notes.matchAll(/\[VILA_CARAMELO_APPOINTMENT_(\d+)\]/g)];
  const ids = new Set<number>();
  for (const match of matches) {
    const id = Number(match[1]);
    if (!Number.isSafeInteger(id) || id < 1 || String(id) !== match[1]) return [];
    ids.add(id);
  }
  return [...ids];
}

export function isOrphanVilaAppointmentEvent(notes: string | null | undefined, appointmentIds: ReadonlySet<number>): boolean {
  const ids = appointmentCalendarMarkerIds(notes);
  return ids.length === 1 && !appointmentIds.has(ids[0]);
}

export function money(cents: number | null | undefined): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents ?? 0) / 100);
}

export function paymentAdjustment(expectedCents: number, receivedCents: number) {
  if (!Number.isSafeInteger(expectedCents) || expectedCents < 0 || !Number.isSafeInteger(receivedCents) || receivedCents < 0) {
    throw new Error("Valores de cobrança e recebimento inválidos.");
  }
  const difference = receivedCents - expectedCents;
  if (difference < 0) return { type: "discount" as const, amountCents: -difference };
  if (difference > 0) return { type: "surcharge" as const, amountCents: difference };
  return { type: "none" as const, amountCents: 0 };
}

export function packagePaymentState(priceCents: number, receivedCents: number) {
  if (!Number.isSafeInteger(priceCents) || priceCents < 0 || !Number.isSafeInteger(receivedCents) || receivedCents < 0) {
    throw new Error("Valores de pagamento do pacote inválidos.");
  }
  const openBalanceCents = Math.max(priceCents - receivedCents, 0);
  return { receivedCents, openBalanceCents, paid: openBalanceCents === 0 };
}

export function replacePackageReceiptState(priceCents: number, totalReceivedCents: number, previousReceiptCents: number, nextReceiptCents: number) {
  if (!Number.isSafeInteger(previousReceiptCents) || previousReceiptCents < 1 || !Number.isSafeInteger(nextReceiptCents) || nextReceiptCents < 1 || previousReceiptCents > totalReceivedCents) {
    throw new Error("Valores da parcela inválidos.");
  }
  const otherPaymentsCents = totalReceivedCents - previousReceiptCents;
  if (otherPaymentsCents + nextReceiptCents > priceCents) {
    throw new Error("A parcela editada não pode ultrapassar o saldo restante do pacote.");
  }
  return packagePaymentState(priceCents, otherPaymentsCents + nextReceiptCents);
}

export function centsFromInput(value: string): number {
  const normalized = value.trim().replace(/\s/g, "").replace(/R\$/i, "");
  if (!normalized) return 0;
  const numeric = normalized.includes(",") ? normalized.replace(/\./g, "").replace(",", ".") : normalized;
  const amount = Number(numeric);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Informe um valor válido em reais.");
  return Math.round(amount * 100);
}

export function dateInput(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isValidLocalDateTime(date: string, time: string): boolean {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dateMatch || !timeMatch) return false;
  const [, yearText, monthText, dayText] = dateMatch;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));
  return parsedDate.getUTCFullYear() === year && parsedDate.getUTCMonth() === month - 1 && parsedDate.getUTCDate() === day && Number(timeMatch[1]) <= 23 && Number(timeMatch[2]) <= 59;
}

export function timeInput(date = new Date()): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function localDateTime(date: string, time: string): string {
  return `${date} ${time}:00`;
}

export function parseLocalDateTime(value: string): Date {
  const [datePart, timePart] = value.split(" ");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute, second = 0] = timePart.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, second);
}

export function appointmentIntervalsOverlap(startA: Date, durationA: number, startB: Date, durationB: number): boolean {
  const a = startA.getTime();
  const b = startB.getTime();
  return a < b + durationB * 60_000 && b < a + durationA * 60_000;
}

export function appointmentChargeCents(paymentMethod: PaymentMethod, servicePriceCents: number, transportPriceCents = 0): number {
  const service = Math.max(0, Math.trunc(servicePriceCents));
  const transport = Math.max(0, Math.trunc(transportPriceCents));
  return paymentMethod === "package" ? transport : service + transport;
}

export function displayDate(value: string): string {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(y, m - 1, d));
}

export function displayDateTime(value: string): string {
  const date = parseLocalDateTime(value);
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function periodStart(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

export function periodEnd(date = new Date()): string {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

export function addDays(date: string, delta: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(y, m - 1, d + delta);
  return dateInput(next);
}

export function calculateHotelStayNights(checkInDate: string, checkOutDate: string): number {
  const toUtcDay = (value: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return Number.NaN;
    const [, yearText, monthText, dayText] = match;
    const timestamp = Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText));
    return new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : Number.NaN;
  };
  const start = toUtcDay(checkInDate);
  const end = toUtcDay(checkOutDate);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return (end - start) / 86_400_000;
}

export function calculateHotelStayTotalCents(dailyRateCents: number, nights: number): number {
  if (!Number.isSafeInteger(dailyRateCents) || dailyRateCents < 1 || !Number.isInteger(nights) || nights < 1) {
    throw new Error("Informe uma diária positiva e pelo menos uma diária de hospedagem.");
  }
  const totalCents = dailyRateCents * nights;
  if (!Number.isSafeInteger(totalCents) || totalCents > 100_000_000) throw new Error("O total da hospedagem ultrapassa o limite permitido.");
  return totalCents;
}

export function hotelCalendarExclusiveEndDate(checkOutDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(checkOutDate);
  if (!match) throw new Error("Data de checkout inválida para o Google Agenda.");
  const [, yearText, monthText, dayText] = match;
  const date = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)));
  if (date.toISOString().slice(0, 10) !== checkOutDate) throw new Error("Data de checkout inválida para o Google Agenda.");
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function calculatePackageEndDate(startDate: string, cadence: Cadence, allowances: number[]): string {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !Number.isFinite(start.getTime()) || start.toISOString().slice(0, 10) !== startDate) return "";
  const occurrences = Math.max(1, ...allowances.filter((value) => Number.isInteger(value) && value > 0));
  const intervalDays = cadence === "monthly" ? 7 : 14;
  return new Date(start.getTime() + (occurrences - 1) * intervalDays * 86_400_000).toISOString().slice(0, 10);
}

export function packagePreConsumedUses(contractedUses: number, futureOccurrences: number): number {
  if (!Number.isInteger(contractedUses) || contractedUses < 1 || !Number.isInteger(futureOccurrences) || futureOccurrences < 1 || futureOccurrences > contractedUses) {
    throw new RangeError("As repetições futuras devem ficar entre 1 e a franquia contratada.");
  }
  return contractedUses - futureOccurrences;
}

export function packageOccurrenceDates(startDate: string, cadence: Cadence, occurrences: number): string[] {
  if (!isValidLocalDateTime(startDate, "00:00") || !Number.isInteger(occurrences) || occurrences < 1 || occurrences > 500) return [];
  const [year, month, day] = startDate.split("-").map(Number);
  const startUtc = Date.UTC(year, month - 1, day);
  const intervalDays = cadence === "monthly" ? 7 : 14;
  return Array.from({ length: occurrences }, (_, index) => new Date(startUtc + index * intervalDays * 86_400_000).toISOString().slice(0, 10));
}

export function isValidCustomPackageDates(startDate: string, dates: string[], expectedCount: number): boolean {
  if (!Number.isInteger(expectedCount) || expectedCount < 1 || expectedCount > 52 || dates.length !== expectedCount || dates[0] !== startDate) return false;
  return dates.every((date, index) => isValidLocalDateTime(date, "00:00") && (index === 0 || date > dates[index - 1]));
}

export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return rows.map((row) => row.map((value) => {
    const text = String(value ?? "").replace(/\r?\n/g, " ");
    const safeText = typeof value === "string" && /^[\s]*[=+\-@]/u.test(text) ? `'${text}` : text;
    return `"${safeText.replace(/"/g, '""')}"`;
  }).join(";")).join("\r\n");
}
