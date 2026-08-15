-- Enum values for Platform Branding assets (docs/17, ADR-049).
-- Must be committed before use in CHECK / data (PostgreSQL).
ALTER TYPE "stored_file_type" ADD VALUE 'PLATFORM_LOGO';
ALTER TYPE "stored_file_type" ADD VALUE 'PLATFORM_FAVICON';
