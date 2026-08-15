-- Platform Branding singleton + global file ownership (docs/17, ADR-049).

-- tenant_id nullable: NULL = asset global da plataforma.
ALTER TABLE "files" ALTER COLUMN "tenant_id" DROP NOT NULL;

-- Ownership: TENANT_LOGO exige tenant; PLATFORM_* exige tenant_id NULL.
ALTER TABLE "files" ADD CONSTRAINT "chk_files_ownership_by_type" CHECK (
  ("file_type" = 'TENANT_LOGO' AND "tenant_id" IS NOT NULL)
  OR ("file_type" IN ('PLATFORM_LOGO', 'PLATFORM_FAVICON') AND "tenant_id" IS NULL)
);

-- Singleton lógico via singleton_key único ("default").
CREATE TABLE "platform_branding" (
    "id" UUID NOT NULL,
    "singleton_key" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT NOT NULL,
    "light_colors" JSONB,
    "dark_colors" JSONB,
    "logo_file_id" UUID,
    "favicon_file_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "platform_branding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_platform_branding_singleton" ON "platform_branding"("singleton_key");

CREATE UNIQUE INDEX "platform_branding_logo_file_id_key" ON "platform_branding"("logo_file_id");

CREATE UNIQUE INDEX "platform_branding_favicon_file_id_key" ON "platform_branding"("favicon_file_id");

ALTER TABLE "platform_branding" ADD CONSTRAINT "platform_branding_logo_file_id_fkey" FOREIGN KEY ("logo_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "platform_branding" ADD CONSTRAINT "platform_branding_favicon_file_id_fkey" FOREIGN KEY ("favicon_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
