/**
 * Ações administrativas que já existem no produto.
 * Não inclui login, suporte, itens de sync nem leituras.
 */
export const AUDIT_ACTIONS = {
  TENANT_CREATED: 'tenant.created',
  TENANT_UPDATED: 'tenant.updated',
  TENANT_DISABLED: 'tenant.disabled',
  TENANT_REACTIVATED: 'tenant.reactivated',
  TENANT_DELETED: 'tenant.deleted',
  TENANT_USER_CREATED: 'tenant_user.created',
  TENANT_USER_UPDATED: 'tenant_user.updated',
  TENANT_USER_PASSWORD_RESET: 'tenant_user.password_reset',
  TENANT_USER_DISABLED: 'tenant_user.disabled',
  TENANT_USER_ENABLED: 'tenant_user.enabled',
  TENANT_USER_BLOCKED: 'tenant_user.blocked',
  TENANT_USER_UNBLOCKED: 'tenant_user.unblocked',
  TENANT_USER_REMOVED: 'tenant_user.removed',
  ADMINISTRATOR_CREATED: 'administrator.created',
  ADMINISTRATOR_UPDATED: 'administrator.updated',
  ADMINISTRATOR_PASSWORD_RESET: 'administrator.password_reset',
  ADMINISTRATOR_DISABLED: 'administrator.disabled',
  ADMINISTRATOR_ENABLED: 'administrator.enabled',
  ADMINISTRATOR_BLOCKED: 'administrator.blocked',
  ADMINISTRATOR_UNBLOCKED: 'administrator.unblocked',
  TENANT_BRANDING_UPDATED: 'tenant_branding.updated',
  TENANT_BRANDING_RESET: 'tenant_branding.reset',
  TENANT_BRANDING_LOGO_UPDATED: 'tenant_branding.logo_updated',
  TENANT_BRANDING_LOGO_REMOVED: 'tenant_branding.logo_removed',
  TENANT_BRANDING_ICON_UPDATED: 'tenant_branding.icon_updated',
  TENANT_BRANDING_ICON_REMOVED: 'tenant_branding.icon_removed',
  PLATFORM_BRANDING_UPDATED: 'platform_branding.updated',
  PLATFORM_BRANDING_RESET: 'platform_branding.reset',
  PLATFORM_BRANDING_LOGO_UPDATED: 'platform_branding.logo_updated',
  PLATFORM_BRANDING_LOGO_REMOVED: 'platform_branding.logo_removed',
  PLATFORM_BRANDING_ICON_UPDATED: 'platform_branding.icon_updated',
  PLATFORM_BRANDING_ICON_REMOVED: 'platform_branding.icon_removed',
  PLATFORM_BRANDING_FAVICON_UPDATED: 'platform_branding.favicon_updated',
  PLATFORM_BRANDING_FAVICON_REMOVED: 'platform_branding.favicon_removed',
  CONSULTANT_SETTINGS_UPDATED: 'consultant.settings_updated',
  CONSULTANT_PROVIDER_CREDENTIAL_SET: 'consultant.provider_credential_set',
  CONSULTANT_PROVIDER_CREDENTIAL_REMOVED: 'consultant.provider_credential_removed',
  KNOWLEDGE_ENTRY_CREATED: 'knowledge_entry.created',
  KNOWLEDGE_ENTRY_UPDATED: 'knowledge_entry.updated',
  KNOWLEDGE_ENTRY_DELETED: 'knowledge_entry.deleted',
  KNOWLEDGE_DOCUMENT_CREATED: 'knowledge_document.created',
  KNOWLEDGE_DOCUMENT_UPDATED: 'knowledge_document.updated',
  KNOWLEDGE_DOCUMENT_DELETED: 'knowledge_document.deleted',
  PROACTIVE_TRIGGER_CREATED: 'proactive_trigger.created',
  PROACTIVE_TRIGGER_UPDATED: 'proactive_trigger.updated',
  PROACTIVE_TRIGGER_ACTIVATED: 'proactive_trigger.activated',
  PROACTIVE_TRIGGER_DELETED: 'proactive_trigger.deleted',
  INTEGRATION_CONNECT_STARTED: 'integration.connect_started',
  INTEGRATION_CONNECTED: 'integration.connected',
  INTEGRATION_DISCONNECTED: 'integration.disconnected',
  INTEGRATION_SYNC_TRIGGERED: 'integration.sync_triggered',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

const AUDIT_ACTION_VALUES = new Set<string>(Object.values(AUDIT_ACTIONS));

export function isAuditAction(value: string): value is AuditAction {
  return AUDIT_ACTION_VALUES.has(value);
}
