# Security Specification & Payload-First TDD

## 1. Data Invariants
1. Every document in `users`, `stacks`, `customers`, `invoices`, `payments`, and `gstFilings` is strictly owned by an authenticated, email-verified user (`request.auth.uid`).
2. `users/{userId}` PII (email, GSTIN, address) can only be read or written by the matching `userId == request.auth.uid`.
3. `invoices` cannot be created without an existing `customers/{customerId}` owned by the same `request.auth.uid`, and `grandTotal` must be non-negative with `paidAmount + remainingAmount == grandTotal` (within floating-point tolerance or exact arithmetic).
4. Once an invoice reaches `paymentStatus == 'paid'`, its financial totals and payment status are terminal and immutable.
5. `payments/{paymentId}` cannot be created without an invoice (`existsAfter(/databases/$(database)/documents/invoices/$(incoming().invoiceId))`) and is append-only (no client updates or deletes).
6. Once a monthly GST filing in `gstFilings` reaches `filingStatus == 'paid'`, it is terminal and locked against tampering.
7. All `createdAt` and `updatedAt` timestamps must equal `request.time`. All IDs match `^[a-zA-Z0-9_\-]+$` and are bounded `<= 128` chars.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Write**: Create `/stacks/s1` with `request.auth == null` -> `PERMISSION_DENIED`.
2. **Unverified Email Write**: Create `/stacks/s1` with `email_verified: false` -> `PERMISSION_DENIED`.
3. **Owner Spoofing on Create**: User A creates `/customers/c1` with `ownerId: "userB"` -> `PERMISSION_DENIED`.
4. **Shadow Field Injection**: Create `/stacks/s1` with extra ghost key `isVerified: true` -> `PERMISSION_DENIED`.
5. **ID Poisoning**: Create `/stacks/invalid$id_with_1500_chars...` -> `PERMISSION_DENIED`.
6. **PII Cross-Tenant Read**: User A reads `/users/userB` -> `PERMISSION_DENIED`.
7. **Unscoped List Query**: User A runs `collection('invoices')` without `where('ownerId', '==', userA)` -> `PERMISSION_DENIED`.
8. **Orphaned Invoice Create**: Create `/invoices/inv1` referencing non-existent `customerId: "ghost_cust"` -> `PERMISSION_DENIED`.
9. **Terminal Invoice Tampering**: Update `/invoices/inv_paid` when `existing().paymentStatus == 'paid'` -> `PERMISSION_DENIED`.
10. **Client Timestamp Forgery**: Create `/invoices/inv1` with `createdAt: "2020-01-01T00:00:00Z"` instead of `request.time` -> `PERMISSION_DENIED`.
11. **Payment Ledger Mutation**: Attempt `update` or `delete` on `/payments/pay1` -> `PERMISSION_DENIED`.
12. **Type / Boundary Exhaustion**: Update `/stacks/s1` with `name` of 500 chars (> 140 max) or `lineItems` array of 25 items (> 20 max) -> `PERMISSION_DENIED`.
