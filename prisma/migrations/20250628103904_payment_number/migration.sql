/*
  Warnings:

  - A unique constraint covering the columns `[paymentNumber]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.
  - The required column `paymentNumber` was added to the `Payment` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "paymentNumber" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_paymentNumber_key" ON "Payment"("paymentNumber");
