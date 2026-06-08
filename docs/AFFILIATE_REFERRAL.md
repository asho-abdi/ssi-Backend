# Student affiliate & referral program

Commissions from referrals go to **students who refer new users**, not instructors.

## Flow

1. Every student gets a unique `referral_code` (auto-generated on save).
2. Share link: `{CLIENT_URL}/register?ref=CODE`
3. New user registers with that code → `referred_by` + `Referral` record.
4. When the referred user completes a **paid** enrollment (admin approval / mark paid), an `AffiliateCommission` is created for the referrer.
5. After hold days, commission becomes `available`; student requests withdrawal; admin approves.

## Security

- Self-referral blocked at registration.
- One referrer per referred user (`Referral.referred_user_id` unique).
- One commission per order (`AffiliateCommission.order_id` unique).
- Referrer must have role `student`.

## API

### Student (`/api/affiliate`, auth student)

- `GET /dashboard` — code, link, wallet stats
- `GET /referrals` — referral list
- `GET /commissions` — commission history
- `GET /withdrawals` — withdrawal requests
- `POST /withdrawals` — request payout
- `GET /validate?code=` — public (no auth) validate code

### Admin (`/api/admin/affiliate`, auth admin)

- `GET/PATCH /settings` — global % and hold days
- `GET /overview` — analytics + top affiliates
- `GET /commissions` — all rows
- `GET /withdrawals` — all requests
- `PATCH /withdrawals/:id` — `{ action: approve|reject|paid }`
- `PATCH /courses/:courseId/commission` — per-course % override
- `POST /backfill-referral-codes` — assign codes to existing students

## Settings (`PlatformSettings.payment`)

- `affiliate_program_enabled` (default true)
- `affiliate_commission_percent` (default 10)
- `affiliate_hold_days` (default 7)

## Per-course override

`Course.affiliate_commission_percent` — if set, overrides global % for that course.

## Instructor earnings

Unchanged: `instructor_earning` / `admin_earning` on `Order` are separate from affiliate commissions.
