/*
  Warnings:

  - Added the required column `netAmount` to the `Invoice` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
ADD COLUMN     "netAmount" DOUBLE PRECISION NOT NULL;
