import {
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/** Users supplied by the starter's Manus OAuth session. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const clients = mysqlTable(
  "clients",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    phone: varchar("phone", { length: 32 }),
    address: varchar("address", { length: 255 }),
    email: varchar("email", { length: 320 }),
    active: int("active").notNull().default(1),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [index("clients_name_idx").on(table.name), index("clients_active_idx").on(table.active)],
);

export const pets = mysqlTable(
  "pets",
  {
    id: int("id").autoincrement().primaryKey(),
    clientId: int("clientId").notNull().references(() => clients.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 120 }).notNull(),
    species: mysqlEnum("species", ["dog", "cat", "rabbit"]).notNull(),
    breed: varchar("breed", { length: 120 }),
    size: mysqlEnum("size", ["small", "medium", "large", "special"]).notNull(),
    notes: text("notes"),
    active: int("active").notNull().default(1),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [index("pets_client_idx").on(table.clientId), index("pets_name_idx").on(table.name)],
);

export const services = mysqlTable(
  "services",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 140 }).notNull(),
    category: mysqlEnum("category", ["bath", "grooming", "treatment", "transport", "other"]).notNull(),
    size: mysqlEnum("size", ["small", "medium", "large", "special"]),
    priceCents: int("priceCents").notNull().default(0),
    durationMinutes: int("durationMinutes").notNull().default(60),
    active: int("active").notNull().default(1),
    sortOrder: int("sortOrder").notNull().default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [index("services_active_idx").on(table.active), index("services_category_idx").on(table.category), index("services_sort_order_idx").on(table.sortOrder)],
);

export const packages = mysqlTable(
  "packages",
  {
    id: int("id").autoincrement().primaryKey(),
    clientId: int("clientId").notNull().references(() => clients.id, { onDelete: "restrict" }),
    petId: int("petId").notNull().references(() => pets.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 140 }).notNull(),
    cadence: mysqlEnum("cadence", ["monthly", "biweekly"]).notNull(),
    startDate: varchar("startDate", { length: 10 }).notNull(),
    endDate: varchar("endDate", { length: 10 }).notNull(),
    priceCents: int("priceCents").notNull(),
    status: mysqlEnum("status", ["active", "closed"]).notNull().default("active"),
    paid: int("paid").notNull().default(0),
    paymentMethod: mysqlEnum("paymentMethod", ["pix", "cash", "card"]),
    closedAt: timestamp("closedAt"),
    deletedAt: timestamp("deletedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("packages_pet_idx").on(table.petId),
    index("packages_client_idx").on(table.clientId),
    index("packages_status_end_idx").on(table.status, table.endDate),
  ],
);

export const packageServices = mysqlTable(
  "packageServices",
  {
    id: int("id").autoincrement().primaryKey(),
    packageId: int("packageId").notNull().references(() => packages.id, { onDelete: "cascade" }),
    serviceId: int("serviceId").notNull().references(() => services.id, { onDelete: "restrict" }),
    allowance: int("allowance").notNull(),
    used: int("used").notNull().default(0),
    preConsumed: int("preConsumed").notNull().default(0),
  },
  (table) => [
    uniqueIndex("package_service_unique").on(table.packageId, table.serviceId),
    index("package_service_package_idx").on(table.packageId),
  ],
);

export const appointments = mysqlTable(
  "appointments",
  {
    id: int("id").autoincrement().primaryKey(),
    clientId: int("clientId").notNull().references(() => clients.id, { onDelete: "restrict" }),
    petId: int("petId").notNull().references(() => pets.id, { onDelete: "restrict" }),
    serviceId: int("serviceId").notNull().references(() => services.id, { onDelete: "restrict" }),
    startAt: varchar("startAt", { length: 19 }).notNull(),
    durationMinutes: int("durationMinutes").notNull(),
    priceCents: int("priceCents").notNull(),
    paymentMethod: mysqlEnum("paymentMethod", ["pix", "cash", "card", "package"]).notNull(),
    paymentStatus: mysqlEnum("paymentStatus", ["pending", "paid"]).notNull().default("pending"),
    packageId: int("packageId").references(() => packages.id, { onDelete: "restrict" }),
    transportServiceId: int("transportServiceId").references(() => services.id, { onDelete: "restrict" }),
    transportPriceCents: int("transportPriceCents").notNull().default(0),
    transportPaymentMethod: mysqlEnum("transportPaymentMethod", ["pix", "cash", "card"]),
    status: mysqlEnum("appointmentStatus", ["scheduled", "confirmed", "in_progress", "completed", "cancelled", "no_show"]).notNull().default("scheduled"),
    notes: text("notes"),
    externalCalendarId: varchar("externalCalendarId", { length: 255 }),
    externalCalendarEventId: varchar("externalCalendarEventId", { length: 255 }),
    calendarSyncEnabled: int("calendarSyncEnabled").notNull().default(0),
    calendarSyncChoiceSet: int("calendarSyncChoiceSet").notNull().default(0),
    deletedAt: timestamp("deletedAt"),
    calendarCleanupRequestedAt: timestamp("calendarCleanupRequestedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("appointments_start_idx").on(table.startAt),
    index("appointments_pet_start_idx").on(table.petId, table.startAt),
    index("appointments_status_idx").on(table.status),
    index("appointments_deleted_idx").on(table.deletedAt),
  ],
);

export const packageUsages = mysqlTable(
  "packageUsages",
  {
    id: int("id").autoincrement().primaryKey(),
    packageId: int("packageId").notNull().references(() => packages.id, { onDelete: "restrict" }),
    packageServiceId: int("packageServiceId").notNull().references(() => packageServices.id, { onDelete: "restrict" }),
    appointmentId: int("appointmentId").notNull().references(() => appointments.id, { onDelete: "restrict" }),
    usedAt: timestamp("usedAt").defaultNow().notNull(),
    reversedAt: timestamp("reversedAt"),
  },
  (table) => [
    uniqueIndex("package_usage_appointment_unique").on(table.appointmentId),
    index("package_usage_package_idx").on(table.packageId),
  ],
);

export const hotelStays = mysqlTable(
  "hotelStays",
  {
    id: int("id").autoincrement().primaryKey(),
    clientId: int("clientId").notNull().references(() => clients.id, { onDelete: "restrict" }),
    petId: int("petId").notNull().references(() => pets.id, { onDelete: "restrict" }),
    petSize: mysqlEnum("petSize", ["small", "medium", "large", "special"]).notNull(),
    checkInDate: varchar("checkInDate", { length: 10 }).notNull(),
    checkOutDate: varchar("checkOutDate", { length: 10 }).notNull(),
    dailyRateCents: int("dailyRateCents").notNull(),
    totalCents: int("totalCents").notNull(),
    status: mysqlEnum("hotelStayStatus", ["reserved", "checked_in", "completed"]).notNull().default("reserved"),
    deletedAt: timestamp("deletedAt"),
    calendarId: varchar("calendarId", { length: 255 }),
    calendarEventId: varchar("calendarEventId", { length: 255 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("hotel_stays_client_idx").on(table.clientId),
    index("hotel_stays_pet_idx").on(table.petId),
    index("hotel_stays_dates_idx").on(table.checkInDate, table.checkOutDate),
    index("hotel_stays_status_idx").on(table.status),
    uniqueIndex("hotel_stays_calendar_event_unique").on(table.calendarEventId),
  ],
);

export const payments = mysqlTable(
  "payments",
  {
    id: int("id").autoincrement().primaryKey(),
    sourceType: mysqlEnum("sourceType", ["service", "package", "hotel"]).notNull(),
    appointmentId: int("appointmentId").references(() => appointments.id, { onDelete: "restrict" }),
    packageId: int("packageId").references(() => packages.id, { onDelete: "restrict" }),
    hotelStayId: int("hotelStayId").references(() => hotelStays.id, { onDelete: "restrict" }),
    amountCents: int("amountCents").notNull(),
    method: mysqlEnum("method", ["pix", "cash", "card"]).notNull(),
    status: mysqlEnum("paymentRecordStatus", ["settled", "voided"]).notNull().default("settled"),
    idempotencyKey: varchar("idempotencyKey", { length: 64 }),
    paidAt: timestamp("paidAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("payments_appointment_unique").on(table.appointmentId),
    uniqueIndex("payments_hotel_stay_unique").on(table.hotelStayId),
    index("payments_package_idx").on(table.packageId),
    uniqueIndex("payments_idempotency_unique").on(table.idempotencyKey),
    index("payments_paid_at_idx").on(table.paidAt),
    index("payments_status_idx").on(table.status),
  ],
);

export const financePendingDismissals = mysqlTable(
  "financePendingDismissals",
  {
    id: int("id").autoincrement().primaryKey(),
    sourceType: mysqlEnum("sourceType", ["service", "package", "hotel"]).notNull(),
    sourceId: int("sourceId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("finance_pending_dismissals_source_unique").on(table.sourceType, table.sourceId)],
);

/** Transactional day locks serialize concurrent appointment writes for the same local business date. */
export const scheduleDayLocks = mysqlTable("scheduleDayLocks", {
  id: int("id").autoincrement().primaryKey(),
  localDate: varchar("localDate", { length: 10 }).notNull().unique(),
});

export const suppliers = mysqlTable(
  "suppliers",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    address: varchar("address", { length: 255 }),
    phone: varchar("phone", { length: 32 }),
    productType: varchar("productType", { length: 120 }).notNull(),
    active: int("active").notNull().default(1),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [index("suppliers_name_idx").on(table.name), index("suppliers_active_idx").on(table.active)],
);

export const purchases = mysqlTable(
  "purchases",
  {
    id: int("id").autoincrement().primaryKey(),
    requestId: varchar("requestId", { length: 64 }).notNull(),
    supplierId: int("supplierId").notNull().references(() => suppliers.id, { onDelete: "restrict" }),
    purchaseDate: varchar("purchaseDate", { length: 10 }).notNull(),
    totalCents: int("totalCents").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("purchases_request_id_unique").on(table.requestId),
    index("purchases_supplier_date_idx").on(table.supplierId, table.purchaseDate),
    index("purchases_date_idx").on(table.purchaseDate),
  ],
);

export const purchaseItems = mysqlTable(
  "purchaseItems",
  {
    id: int("id").autoincrement().primaryKey(),
    purchaseId: int("purchaseId").notNull().references(() => purchases.id, { onDelete: "restrict" }),
    itemName: varchar("itemName", { length: 140 }).notNull(),
    quantity: int("quantity").notNull(),
    unitPriceCents: int("unitPriceCents").notNull(),
    totalCents: int("totalCents").notNull(),
  },
  (table) => [index("purchase_items_purchase_idx").on(table.purchaseId)],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Client = typeof clients.$inferSelect;
export type Pet = typeof pets.$inferSelect;
export type Service = typeof services.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;
export type PetPackage = typeof packages.$inferSelect;
export type HotelStay = typeof hotelStays.$inferSelect;
