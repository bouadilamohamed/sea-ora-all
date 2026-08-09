-- CreateEnum
CREATE TYPE "PearlStatus" AS ENUM ('DRAFT', 'SEALED');

-- CreateEnum
CREATE TYPE "MemoryType" AS ENUM ('PHOTO', 'VIDEO', 'VOICE', 'NOTE');

-- CreateEnum
CREATE TYPE "SessionKind" AS ENUM ('VIEW', 'BUILDER');

-- CreateTable
CREATE TABLE "pearls" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "PearlStatus" NOT NULL DEFAULT 'SEALED',
    "pass_hash" TEXT NOT NULL,
    "pass_salt" TEXT NOT NULL,
    "pass_hint" TEXT,
    "ref_hash" TEXT,
    "ref_salt" TEXT,
    "temp_hash" TEXT,
    "temp_salt" TEXT,
    "manage_key" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Pour toi',
    "subtitle" TEXT NOT NULL DEFAULT '',
    "gate_title" TEXT NOT NULL DEFAULT 'Coquillage scellé',
    "gate_note" TEXT NOT NULL DEFAULT 'Entrez le code secret pour révéler la perle',
    "message" TEXT NOT NULL DEFAULT '',
    "autoplay" BOOLEAN NOT NULL DEFAULT true,
    "views" INTEGER NOT NULL DEFAULT 0,
    "unlocks" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pearls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memories" (
    "id" SERIAL NOT NULL,
    "pearl_id" INTEGER NOT NULL,
    "type" "MemoryType" NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "date" TEXT NOT NULL DEFAULT '',
    "media_url" TEXT,
    "thumbnail_url" TEXT,
    "poster_url" TEXT,
    "mime_type" TEXT,
    "duration" DOUBLE PRECISION,
    "width" INTEGER,
    "height" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "token" TEXT NOT NULL,
    "pearl_id" INTEGER NOT NULL,
    "kind" "SessionKind" NOT NULL DEFAULT 'BUILDER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "unlock_attempts" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unlock_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pearls_slug_key" ON "pearls"("slug");

-- CreateIndex
CREATE INDEX "memories_pearl_id_type_position_idx" ON "memories"("pearl_id", "type", "position");

-- CreateIndex
CREATE INDEX "sessions_pearl_id_idx" ON "sessions"("pearl_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "unlock_attempts_slug_ip_created_at_idx" ON "unlock_attempts"("slug", "ip", "created_at");

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_pearl_id_fkey" FOREIGN KEY ("pearl_id") REFERENCES "pearls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_pearl_id_fkey" FOREIGN KEY ("pearl_id") REFERENCES "pearls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
