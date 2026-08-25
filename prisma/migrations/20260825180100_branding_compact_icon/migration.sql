-- Compact icon assets (PRE-IA-4C): platform + tenant.
-- Existing logo/favicon rows are preserved.

ALTER TABLE "files" DROP CONSTRAINT "chk_files_ownership_by_type";

ALTER TABLE "files" ADD CONSTRAINT "chk_files_ownership_by_type" CHECK (
  ("file_type" IN ('TENANT_LOGO', 'TENANT_ICON') AND "tenant_id" IS NOT NULL)
  OR ("file_type" IN ('PLATFORM_LOGO', 'PLATFORM_ICON', 'PLATFORM_FAVICON') AND "tenant_id" IS NULL)
);

ALTER TABLE "platform_branding" ADD COLUMN "icon_file_id" UUID;

CREATE UNIQUE INDEX "platform_branding_icon_file_id_key" ON "platform_branding"("icon_file_id");

ALTER TABLE "platform_branding" ADD CONSTRAINT "platform_branding_icon_file_id_fkey" FOREIGN KEY ("icon_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tenant_branding" ADD COLUMN "icon_file_id" UUID;

CREATE UNIQUE INDEX "tenant_branding_icon_file_id_key" ON "tenant_branding"("icon_file_id");

ALTER TABLE "tenant_branding" ADD CONSTRAINT "tenant_branding_icon_file_id_fkey" FOREIGN KEY ("icon_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
