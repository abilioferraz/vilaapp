import { describe, expect, it } from "vitest";
import { appointmentCalendarMarkerIds, appointmentChargeCents, appointmentIntervalsOverlap, calculateHotelStayNights, calculateHotelStayTotalCents, calculatePackageEndDate, canTransitionAppointmentStatus, centsFromInput, dateInput, hotelCalendarExclusiveEndDate, isOrphanVilaAppointmentEvent, isValidLocalDateTime, localDateTime, money, packageOccurrenceDates, isValidCustomPackageDates, packagePaymentState, parseLocalDateTime, replacePackageReceiptState, toCsv } from "../shared/vila";

describe("domínio Vila Caramelo", () => {
  it("converte reais brasileiros em centavos inteiros", () => {
    expect(centsFromInput("1.234,56")).toBe(123456);
    expect(centsFromInput("79,90")).toBe(7990);
    expect(centsFromInput("0")).toBe(0);
  });

  it("formata centavos como BRL", () => {
    expect(money(123456)).toContain("1.234,56");
    expect(money(null)).toContain("0,00");
  });

  it("rejeita valores negativos ou não numéricos", () => {
    expect(() => centsFromInput("-5,00")).toThrow();
    expect(() => centsFromInput("abc")).toThrow();
  });

  it("cobra transporte além do serviço avulso e somente a taxa quando o serviço é coberto por pacote", () => {
    expect(appointmentChargeCents("pix", 7000, 1500)).toBe(8500);
    expect(appointmentChargeCents("package", 7000, 1500)).toBe(1500);
    expect(appointmentChargeCents("package", 7000, 0)).toBe(0);
  });

  it("classifica valores recebidos abaixo, acima ou iguais ao valor cobrado", async () => {
    const { paymentAdjustment } = await import("../shared/vila");
    expect(paymentAdjustment(10000, 8500)).toEqual({ type: "discount", amountCents: 1500 });
    expect(paymentAdjustment(10000, 11500)).toEqual({ type: "surcharge", amountCents: 1500 });
    expect(paymentAdjustment(10000, 10000)).toEqual({ type: "none", amountCents: 0 });
  });

  it("mantém saldo de pacote aberto após recebimento parcial e quita ao alcançar o valor contratado", () => {
    expect(packagePaymentState(13000, 6500)).toEqual({ receivedCents: 6500, openBalanceCents: 6500, paid: false });
    expect(packagePaymentState(13000, 13000)).toEqual({ receivedCents: 13000, openBalanceCents: 0, paid: true });
  });

  it("recalcula o saldo ao editar uma parcela existente sem permitir ultrapassar as demais parcelas", () => {
    expect(replacePackageReceiptState(13000, 13000, 6500, 5500)).toEqual({ receivedCents: 12000, openBalanceCents: 1000, paid: false });
    expect(replacePackageReceiptState(13000, 13000, 6500, 6500)).toEqual({ receivedCents: 13000, openBalanceCents: 0, paid: true });
    expect(() => replacePackageReceiptState(13000, 13000, 6500, 7000)).toThrow();
  });

  it("serializa datas locais sem alterar o horário textual", () => {
    const date = new Date(2026, 8, 4, 0, 0, 0);
    expect(dateInput(date)).toBe("2026-09-04");
    expect(localDateTime("2026-09-04", "14:30")).toBe("2026-09-04 14:30:00");
    const parsed = parseLocalDateTime("2026-09-04 14:30:00");
    expect(parsed.getHours()).toBe(14);
    expect(parsed.getMinutes()).toBe(30);
  });

  it("calcula diárias pela diferença entre check-in e checkout, sem cobrar o dia de saída", () => {
    expect(calculateHotelStayNights("2026-11-13", "2026-11-15")).toBe(2);
    expect(calculateHotelStayNights("2026-11-13", "2026-11-14")).toBe(1);
    expect(calculateHotelStayNights("2026-11-13", "2026-11-13")).toBe(0);
    expect(calculateHotelStayNights("2026-11-15", "2026-11-13")).toBe(0);
    expect(calculateHotelStayNights("2026-02-30", "2026-03-02")).toBe(0);
    expect(hotelCalendarExclusiveEndDate("2026-11-15")).toBe("2026-11-16");
    expect(hotelCalendarExclusiveEndDate("2026-12-31")).toBe("2027-01-01");
    expect(calculateHotelStayTotalCents(12500, 2)).toBe(25000);
    expect(() => calculateHotelStayTotalCents(12500, 0)).toThrow();
  });

  it("calcula a data final inclusiva a partir do primeiro uso e dos intervalos do plano", () => {
    expect(calculatePackageEndDate("2026-10-22", "monthly", [4])).toBe("2026-11-12");
    expect(calculatePackageEndDate("2026-10-22", "biweekly", [2])).toBe("2026-11-05");
    expect(calculatePackageEndDate("2026-10-22", "monthly", [1, 2])).toBe("2026-10-29");
    expect(calculatePackageEndDate("2026-02-30", "monthly", [4])).toBe("");
  });

  it("registra como consumidas as utilizações anteriores não agendadas neste app", async () => {
    const { packagePreConsumedUses } = await import("../shared/vila");
    expect(packagePreConsumedUses(4, 3)).toBe(1);
    expect(packagePreConsumedUses(4, 4)).toBe(0);
    expect(() => packagePreConsumedUses(4, 5)).toThrow();
    expect(() => packagePreConsumedUses(4, 0)).toThrow();
  });

  it("gera cada utilização semanal, incluindo a data inicial", () => {
    expect(packageOccurrenceDates("2026-10-25", "monthly", 4)).toEqual([
      "2026-10-25",
      "2026-11-01",
      "2026-11-08",
      "2026-11-15",
    ]);
  });

  it("gera usos quinzenais a cada 14 dias e respeita quantidades personalizadas", () => {
    expect(packageOccurrenceDates("2026-10-25", "biweekly", 2)).toEqual(["2026-10-25", "2026-11-08"]);
    expect(packageOccurrenceDates("2026-10-25", "monthly", 1)).toEqual(["2026-10-25"]);
  });

  it("não gera recorrências para data inválida ou quantidade fora de faixa", () => {
    expect(packageOccurrenceDates("2026-02-30", "monthly", 4)).toEqual([]);
    expect(packageOccurrenceDates("2026-10-25", "monthly", 0)).toEqual([]);
    expect(packageOccurrenceDates("2026-10-25", "monthly", 501)).toEqual([]);
  });

  it("valida uma lista completa de utilizações personalizadas em ordem cronológica", () => {
    const dates = ["2026-10-25", "2026-11-02", "2026-11-09", "2026-11-16"];
    expect(isValidCustomPackageDates(dates[0], dates, 4)).toBe(true);
    expect(isValidCustomPackageDates(dates[0], dates.slice(0, 3), 4)).toBe(false);
    expect(isValidCustomPackageDates(dates[0], [dates[0], dates[1], dates[1], dates[3]], 4)).toBe(false);
    expect(isValidCustomPackageDates(dates[0], [dates[0], dates[2], dates[1], dates[3]], 4)).toBe(false);
    expect(isValidCustomPackageDates(dates[0], [dates[0], "2026-02-30", dates[2], dates[3]], 4)).toBe(false);
  });

  it("valida datas reais do calendário e horário no formato 24 horas", () => {
    expect(isValidLocalDateTime("2026-10-22", "09:00")).toBe(true);
    expect(isValidLocalDateTime("2026-02-30", "09:00")).toBe(false);
    expect(isValidLocalDateTime("2026-10-22", "24:00")).toBe(false);
    expect(isValidLocalDateTime("2026-10-22", "09:60")).toBe(false);
  });

  it("detecta choques reais e não considera sobreposição horários adjacentes", () => {
    const nine = parseLocalDateTime("2026-10-22 09:00:00");
    const nineThirty = parseLocalDateTime("2026-10-22 09:30:00");
    const ten = parseLocalDateTime("2026-10-22 10:00:00");
    expect(appointmentIntervalsOverlap(nine, 60, nine, 60)).toBe(true);
    expect(appointmentIntervalsOverlap(nine, 60, nineThirty, 60)).toBe(true);
    expect(appointmentIntervalsOverlap(nine, 60, ten, 60)).toBe(false);
  });

  it("identifica somente eventos de atendimento Vila com um marcador canônico e sem registro correspondente", () => {
    const knownIds = new Set([21, 22]);
    expect(appointmentCalendarMarkerIds("Serviço: Banho\n[VILA_CARAMELO_APPOINTMENT_35]")).toEqual([35]);
    expect(isOrphanVilaAppointmentEvent("[VILA_CARAMELO_APPOINTMENT_35]", knownIds)).toBe(true);
    expect(isOrphanVilaAppointmentEvent("[VILA_CARAMELO_APPOINTMENT_21]", knownIds)).toBe(false);
    expect(isOrphanVilaAppointmentEvent("Compromisso manual da parceira", knownIds)).toBe(false);
    expect(isOrphanVilaAppointmentEvent("[VILA_CARAMELO_APPOINTMENT_35] [VILA_CARAMELO_APPOINTMENT_36]", knownIds)).toBe(false);
    expect(appointmentCalendarMarkerIds("[VILA_CARAMELO_APPOINTMENT_035]")).toEqual([]);
  });

  it("exige confirmar, iniciar e concluir em etapas separadas", () => {
    expect(canTransitionAppointmentStatus("scheduled", "confirmed")).toBe(true);
    expect(canTransitionAppointmentStatus("scheduled", "in_progress")).toBe(false);
    expect(canTransitionAppointmentStatus("scheduled", "completed")).toBe(false);
    expect(canTransitionAppointmentStatus("confirmed", "in_progress")).toBe(true);
    expect(canTransitionAppointmentStatus("confirmed", "completed")).toBe(false);
    expect(canTransitionAppointmentStatus("in_progress", "completed")).toBe(true);
  });

  it("escapa aspas, separadores e quebras de linha no CSV para planilhas", () => {
    expect(toCsv([["Nome", "Observação"], ["Toby", 'Shampoo; "premium"\nsem perfume']])).toBe('"Nome";"Observação"\r\n"Toby";"Shampoo; ""premium"" sem perfume"');
  });

  it("neutraliza fórmulas iniciadas em texto exportado para CSV sem alterar valores numéricos", () => {
    expect(toCsv([["=1+1", " @SUM(A1)", "-1+1", "+2+3", -1500]])).toBe('"\'=1+1";"\' @SUM(A1)";"\'-1+1";"\'+2+3";"-1500"');
  });
});
