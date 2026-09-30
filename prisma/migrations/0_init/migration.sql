-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'RECEPTION', 'SPECIALIST');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('PREPARATION', 'COSMETIC');

-- CreateEnum
CREATE TYPE "UnitType" AS ENUM ('UNIT', 'ML', 'MG', 'G', 'AMPULE', 'BOTOX_UNIT');

-- CreateEnum
CREATE TYPE "ConsumptionKind" AS ENUM ('APPOINTMENT', 'INTERNAL', 'SALE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'VOUCHER', 'ONLINE');

-- CreateEnum
CREATE TYPE "ConsumptionStatus" AS ENUM ('APPLIED', 'PENDING', 'REJECTED');

-- CreateEnum
CREATE TYPE "RetailSaleStatus" AS ENUM ('COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "LoyaltyTransactionType" AS ENUM ('EARNED', 'REDEEMED');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('AMOUNT', 'PERCENT');

-- CreateEnum
CREATE TYPE "PatientDataChangeField" AS ENUM ('NAME', 'PHONE', 'EMAIL');

-- CreateEnum
CREATE TYPE "PatientConsentType" AS ENUM ('RODO', 'MARKETING');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('STAFF', 'PATIENT', 'GUEST', 'SYSTEM');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'SPECIALIST',
    "login" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "phone" TEXT,
    "specialistCode" INTEGER,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "isAvailable" BOOLEAN NOT NULL DEFAULT false,
    "avatarUrl" TEXT,
    "jobTitle" TEXT,
    "bio" TEXT,
    "location" TEXT,
    "locationId" TEXT NOT NULL DEFAULT 'grodzisk-mazowiecki',
    "specialization" TEXT,
    "sourceProfileUrl" TEXT,
    "sidebarPermissions" JSONB,
    "payoutPercent" INTEGER NOT NULL DEFAULT 50,
    "baseRate" INTEGER,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "note" TEXT,
    "passwordHash" TEXT,
    "passwordResetTokenHash" TEXT,
    "passwordResetExpiresAt" TIMESTAMP(3),
    "loyaltyPoints" INTEGER NOT NULL DEFAULT 0,
    "locationId" TEXT NOT NULL DEFAULT 'grodzisk-mazowiecki',

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "categoryColor" TEXT,
    "description" TEXT,
    "durationMin" INTEGER NOT NULL DEFAULT 30,
    "priceSuggested" INTEGER,
    "priceFrom" INTEGER,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceSuggestedProduct" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unit" "UnitType" NOT NULL DEFAULT 'UNIT',

    CONSTRAINT "ServiceSuggestedProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecialistServiceRate" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "specialistId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "SpecialistServiceRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecialistService" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "specialistId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,

    CONSTRAINT "SpecialistService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecialistWarehouse" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "specialistId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,

    CONSTRAINT "SpecialistWarehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecialistWorkDay" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "specialistId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,

    CONSTRAINT "SpecialistWorkDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecialistCustomWorkDay" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "specialistId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,

    CONSTRAINT "SpecialistCustomWorkDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecialistTimeOff" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "specialistId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT true,
    "startTime" TEXT,
    "endTime" TEXT,
    "note" TEXT,

    CONSTRAINT "SpecialistTimeOff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "category" "ProductCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "ean" TEXT,
    "unit" "UnitType" NOT NULL DEFAULT 'UNIT',
    "manufacturer" TEXT,
    "catalogCategory" TEXT,
    "purchasePrice" INTEGER,
    "salePrice" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "locationId" TEXT NOT NULL DEFAULT 'grodzisk-mazowiecki',
    "parentId" TEXT,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stock" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "quantity" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "Stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductLot" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "quantity" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "purchasePrice" INTEGER,
    "salePrice" INTEGER,
    "status" TEXT,
    "location" TEXT,
    "note" TEXT,

    CONSTRAINT "ProductLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "patientId" TEXT NOT NULL,
    "specialistId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL DEFAULT 'grodzisk-mazowiecki',
    "serviceId" TEXT NOT NULL,
    "customServiceName" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "rejectionReason" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletionReason" TEXT,
    "priceEstimate" INTEGER,
    "priceFinal" INTEGER,
    "note" TEXT,
    "photoBefore" TEXT,
    "photoAfter" TEXT,
    "loyaltyPointsUsed" INTEGER,
    "loyaltyDiscountAmount" INTEGER,
    "loyaltyPointsAwardedAt" TIMESTAMP(3),
    "imageConsent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consumption" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" "ConsumptionKind" NOT NULL DEFAULT 'APPOINTMENT',
    "appointmentId" TEXT,
    "specialistId" TEXT,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT,
    "quantity" DECIMAL(14,2) NOT NULL,
    "unit" "UnitType" NOT NULL DEFAULT 'UNIT',
    "createdById" TEXT NOT NULL,
    "note" TEXT,
    "status" "ConsumptionStatus" NOT NULL DEFAULT 'APPLIED',
    "suggestedQuantity" DECIMAL(14,2),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "Consumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailSale" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "patientId" TEXT,
    "soldById" TEXT NOT NULL,
    "locationId" TEXT NOT NULL DEFAULT 'grodzisk-mazowiecki',
    "status" "RetailSaleStatus" NOT NULL DEFAULT 'COMPLETED',
    "note" TEXT,
    "subtotal" INTEGER NOT NULL DEFAULT 0,
    "discountType" "DiscountType",
    "discountValue" INTEGER,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "discountApprovedById" TEXT,

    CONSTRAINT "RetailSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailSaleItem" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(14,2) NOT NULL,
    "unitPrice" INTEGER,
    "total" INTEGER,

    CONSTRAINT "RetailSaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" "PaymentMethod" NOT NULL,
    "amount" INTEGER NOT NULL,
    "appointmentId" TEXT,
    "retailSaleId" TEXT,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyPointsTransaction" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "type" "LoyaltyTransactionType" NOT NULL,
    "points" INTEGER NOT NULL,
    "note" TEXT,

    CONSTRAINT "LoyaltyPointsTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientDataChangeRequest" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "patientId" TEXT NOT NULL,
    "field" "PatientDataChangeField" NOT NULL,
    "currentValue" TEXT,
    "newValue" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "rejectionReason" TEXT,

    CONSTRAINT "PatientDataChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientConsent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "patientId" TEXT NOT NULL,
    "type" "PatientConsentType" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "grantedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "PatientConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientConsentEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "patientId" TEXT NOT NULL,
    "type" "PatientConsentType" NOT NULL,
    "granted" BOOLEAN NOT NULL,

    CONSTRAINT "PatientConsentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorType" "AuditActorType" NOT NULL DEFAULT 'STAFF',
    "actorId" TEXT,
    "actorName" TEXT,
    "actorLogin" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT,
    "data" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRead" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,

    CONSTRAINT "NotificationRead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_login_key" ON "User"("login");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_locationId_idx" ON "User"("locationId");

-- CreateIndex
CREATE INDEX "User_specialistCode_idx" ON "User"("specialistCode");

-- CreateIndex
CREATE INDEX "Patient_name_idx" ON "Patient"("name");

-- CreateIndex
CREATE INDEX "Patient_phone_idx" ON "Patient"("phone");

-- CreateIndex
CREATE INDEX "Patient_locationId_idx" ON "Patient"("locationId");

-- CreateIndex
CREATE INDEX "Patient_passwordResetTokenHash_idx" ON "Patient"("passwordResetTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Location_name_key" ON "Location"("name");

-- CreateIndex
CREATE INDEX "Location_name_idx" ON "Location"("name");

-- CreateIndex
CREATE INDEX "Service_name_idx" ON "Service"("name");

-- CreateIndex
CREATE INDEX "Service_category_idx" ON "Service"("category");

-- CreateIndex
CREATE INDEX "ServiceSuggestedProduct_serviceId_idx" ON "ServiceSuggestedProduct"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceSuggestedProduct_serviceId_productId_key" ON "ServiceSuggestedProduct"("serviceId", "productId");

-- CreateIndex
CREATE INDEX "SpecialistServiceRate_specialistId_idx" ON "SpecialistServiceRate"("specialistId");

-- CreateIndex
CREATE INDEX "SpecialistServiceRate_serviceId_idx" ON "SpecialistServiceRate"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "SpecialistServiceRate_specialistId_serviceId_key" ON "SpecialistServiceRate"("specialistId", "serviceId");

-- CreateIndex
CREATE INDEX "SpecialistService_specialistId_idx" ON "SpecialistService"("specialistId");

-- CreateIndex
CREATE INDEX "SpecialistService_serviceId_idx" ON "SpecialistService"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "SpecialistService_specialistId_serviceId_key" ON "SpecialistService"("specialistId", "serviceId");

-- CreateIndex
CREATE INDEX "SpecialistWarehouse_specialistId_idx" ON "SpecialistWarehouse"("specialistId");

-- CreateIndex
CREATE INDEX "SpecialistWarehouse_warehouseId_idx" ON "SpecialistWarehouse"("warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "SpecialistWarehouse_specialistId_warehouseId_key" ON "SpecialistWarehouse"("specialistId", "warehouseId");

-- CreateIndex
CREATE INDEX "SpecialistWorkDay_specialistId_idx" ON "SpecialistWorkDay"("specialistId");

-- CreateIndex
CREATE UNIQUE INDEX "SpecialistWorkDay_specialistId_weekday_key" ON "SpecialistWorkDay"("specialistId", "weekday");

-- CreateIndex
CREATE INDEX "SpecialistCustomWorkDay_specialistId_date_idx" ON "SpecialistCustomWorkDay"("specialistId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "SpecialistCustomWorkDay_specialistId_date_key" ON "SpecialistCustomWorkDay"("specialistId", "date");

-- CreateIndex
CREATE INDEX "SpecialistTimeOff_specialistId_date_idx" ON "SpecialistTimeOff"("specialistId", "date");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "Product"("name");

-- CreateIndex
CREATE INDEX "Product_sku_idx" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_ean_idx" ON "Product"("ean");

-- CreateIndex
CREATE INDEX "Product_manufacturer_idx" ON "Product"("manufacturer");

-- CreateIndex
CREATE INDEX "Product_catalogCategory_idx" ON "Product"("catalogCategory");

-- CreateIndex
CREATE INDEX "Warehouse_parentId_idx" ON "Warehouse"("parentId");

-- CreateIndex
CREATE INDEX "Warehouse_locationId_idx" ON "Warehouse"("locationId");

-- CreateIndex
CREATE INDEX "Warehouse_name_idx" ON "Warehouse"("name");

-- CreateIndex
CREATE INDEX "Stock_warehouseId_idx" ON "Stock"("warehouseId");

-- CreateIndex
CREATE INDEX "Stock_productId_idx" ON "Stock"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Stock_productId_warehouseId_key" ON "Stock"("productId", "warehouseId");

-- CreateIndex
CREATE INDEX "ProductLot_productId_idx" ON "ProductLot"("productId");

-- CreateIndex
CREATE INDEX "ProductLot_warehouseId_idx" ON "ProductLot"("warehouseId");

-- CreateIndex
CREATE INDEX "ProductLot_expiryDate_idx" ON "ProductLot"("expiryDate");

-- CreateIndex
CREATE INDEX "ProductLot_batchNumber_idx" ON "ProductLot"("batchNumber");

-- CreateIndex
CREATE INDEX "Appointment_specialistId_startsAt_idx" ON "Appointment"("specialistId", "startsAt");

-- CreateIndex
CREATE INDEX "Appointment_locationId_startsAt_idx" ON "Appointment"("locationId", "startsAt");

-- CreateIndex
CREATE INDEX "Appointment_patientId_startsAt_idx" ON "Appointment"("patientId", "startsAt");

-- CreateIndex
CREATE INDEX "Appointment_status_idx" ON "Appointment"("status");

-- CreateIndex
CREATE INDEX "Appointment_deletedAt_idx" ON "Appointment"("deletedAt");

-- CreateIndex
CREATE INDEX "Consumption_appointmentId_idx" ON "Consumption"("appointmentId");

-- CreateIndex
CREATE INDEX "Consumption_productId_idx" ON "Consumption"("productId");

-- CreateIndex
CREATE INDEX "Consumption_createdById_idx" ON "Consumption"("createdById");

-- CreateIndex
CREATE INDEX "Consumption_status_idx" ON "Consumption"("status");

-- CreateIndex
CREATE INDEX "RetailSale_soldById_createdAt_idx" ON "RetailSale"("soldById", "createdAt");

-- CreateIndex
CREATE INDEX "RetailSale_locationId_createdAt_idx" ON "RetailSale"("locationId", "createdAt");

-- CreateIndex
CREATE INDEX "RetailSaleItem_saleId_idx" ON "RetailSaleItem"("saleId");

-- CreateIndex
CREATE INDEX "RetailSaleItem_productId_idx" ON "RetailSaleItem"("productId");

-- CreateIndex
CREATE INDEX "Payment_appointmentId_idx" ON "Payment"("appointmentId");

-- CreateIndex
CREATE INDEX "Payment_retailSaleId_idx" ON "Payment"("retailSaleId");

-- CreateIndex
CREATE INDEX "LoyaltyPointsTransaction_patientId_createdAt_idx" ON "LoyaltyPointsTransaction"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "LoyaltyPointsTransaction_appointmentId_idx" ON "LoyaltyPointsTransaction"("appointmentId");

-- CreateIndex
CREATE INDEX "PatientDataChangeRequest_patientId_idx" ON "PatientDataChangeRequest"("patientId");

-- CreateIndex
CREATE INDEX "PatientDataChangeRequest_status_createdAt_idx" ON "PatientDataChangeRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PatientConsent_patientId_idx" ON "PatientConsent"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientConsent_patientId_type_key" ON "PatientConsent"("patientId", "type");

-- CreateIndex
CREATE INDEX "PatientConsentEvent_patientId_createdAt_idx" ON "PatientConsentEvent"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_createdAt_idx" ON "AuditLog"("entity", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationRead_userId_idx" ON "NotificationRead"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationRead_userId_notificationId_key" ON "NotificationRead"("userId", "notificationId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceSuggestedProduct" ADD CONSTRAINT "ServiceSuggestedProduct_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceSuggestedProduct" ADD CONSTRAINT "ServiceSuggestedProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialistServiceRate" ADD CONSTRAINT "SpecialistServiceRate_specialistId_fkey" FOREIGN KEY ("specialistId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialistServiceRate" ADD CONSTRAINT "SpecialistServiceRate_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialistService" ADD CONSTRAINT "SpecialistService_specialistId_fkey" FOREIGN KEY ("specialistId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialistService" ADD CONSTRAINT "SpecialistService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialistWarehouse" ADD CONSTRAINT "SpecialistWarehouse_specialistId_fkey" FOREIGN KEY ("specialistId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialistWarehouse" ADD CONSTRAINT "SpecialistWarehouse_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialistWorkDay" ADD CONSTRAINT "SpecialistWorkDay_specialistId_fkey" FOREIGN KEY ("specialistId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialistCustomWorkDay" ADD CONSTRAINT "SpecialistCustomWorkDay_specialistId_fkey" FOREIGN KEY ("specialistId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialistTimeOff" ADD CONSTRAINT "SpecialistTimeOff_specialistId_fkey" FOREIGN KEY ("specialistId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stock" ADD CONSTRAINT "Stock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stock" ADD CONSTRAINT "Stock_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductLot" ADD CONSTRAINT "ProductLot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductLot" ADD CONSTRAINT "ProductLot_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_specialistId_fkey" FOREIGN KEY ("specialistId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consumption" ADD CONSTRAINT "Consumption_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consumption" ADD CONSTRAINT "Consumption_specialistId_fkey" FOREIGN KEY ("specialistId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consumption" ADD CONSTRAINT "Consumption_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consumption" ADD CONSTRAINT "Consumption_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consumption" ADD CONSTRAINT "Consumption_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consumption" ADD CONSTRAINT "Consumption_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailSale" ADD CONSTRAINT "RetailSale_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailSale" ADD CONSTRAINT "RetailSale_soldById_fkey" FOREIGN KEY ("soldById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailSale" ADD CONSTRAINT "RetailSale_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailSale" ADD CONSTRAINT "RetailSale_discountApprovedById_fkey" FOREIGN KEY ("discountApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailSaleItem" ADD CONSTRAINT "RetailSaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "RetailSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailSaleItem" ADD CONSTRAINT "RetailSaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_retailSaleId_fkey" FOREIGN KEY ("retailSaleId") REFERENCES "RetailSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyPointsTransaction" ADD CONSTRAINT "LoyaltyPointsTransaction_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyPointsTransaction" ADD CONSTRAINT "LoyaltyPointsTransaction_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientDataChangeRequest" ADD CONSTRAINT "PatientDataChangeRequest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientDataChangeRequest" ADD CONSTRAINT "PatientDataChangeRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientConsent" ADD CONSTRAINT "PatientConsent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientConsentEvent" ADD CONSTRAINT "PatientConsentEvent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRead" ADD CONSTRAINT "NotificationRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

