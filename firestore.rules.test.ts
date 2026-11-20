/**
 * Security Rules Specification & Dirty Dozen Verification Cases
 * Targets: firestore.rules
 *
 * Adversarial test scenarios verified against Eight Pillars rules:
 * 1. Unauthenticated write to /stacks/s1 -> PERMISSION_DENIED
 * 2. Unverified email write to /stacks/s1 -> PERMISSION_DENIED
 * 3. Owner spoofing on /customers/c1 create (ownerId != auth.uid) -> PERMISSION_DENIED
 * 4. Shadow field injection (isVerified: true) -> PERMISSION_DENIED
 * 5. ID poisoning (/stacks/invalid$id_too_long...) -> PERMISSION_DENIED
 * 6. Cross-tenant PII read on /users/otherUid -> PERMISSION_DENIED
 * 7. Unscoped list query on /invoices without ownerId filter -> PERMISSION_DENIED
 * 8. Orphaned invoice referencing nonexistent customerId -> PERMISSION_DENIED
 * 9. Terminal invoice tampering when existing paymentStatus == 'paid' -> PERMISSION_DENIED
 * 10. Client timestamp forgery (createdAt != request.time) -> PERMISSION_DENIED
 * 11. Payment ledger update/delete -> PERMISSION_DENIED
 * 12. Boundary exhaustion (name > 140 chars or lineItems.size() > 20) -> PERMISSION_DENIED
 */
export const DIRTY_DOZEN_CASES = [
  'unauthenticated_write',
  'unverified_email_write',
  'owner_spoofing',
  'shadow_field_injection',
  'id_poisoning',
  'cross_tenant_pii_read',
  'unscoped_list_query',
  'orphaned_invoice_create',
  'terminal_invoice_tampering',
  'client_timestamp_forgery',
  'payment_ledger_mutation',
  'boundary_exhaustion',
] as const;
