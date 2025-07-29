/*
  Warnings:

  - A unique constraint covering the columns `[invoiceNumericId]` on the table `Invoice` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[paymentNumericId]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "invoiceNumericId" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "paymentNumericId" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumericId_key" ON "Invoice"("invoiceNumericId");

-- CreateIndex
CREATE INDEX "Invoice_invoiceNumericId_idx" ON "Invoice"("invoiceNumericId" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_paymentNumericId_key" ON "Payment"("paymentNumericId");

-- CreateIndex
CREATE INDEX "Payment_paymentNumericId_idx" ON "Payment"("paymentNumericId" DESC);
