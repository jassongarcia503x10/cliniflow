# cliniflow

## Required P0 security configuration

- Apply `supabase/migrations/202606120001_p0_tenant_isolation.sql` before deployment.
- Set `CRON_SECRET`; reminder processing fails closed when it is missing.
- Set `WHATSAPP_CLINIC_ID`; the WhatsApp webhook routes only to this clinic and fails closed when it is missing.
- For documented 360dialog Basic Auth, set `WHATSAPP_BASIC_AUTH_USER` and `WHATSAPP_BASIC_AUTH_PASSWORD`, then configure the same credentials on the 360dialog webhook.
- As a fallback, set `WHATSAPP_WEBHOOK_SECRET` and provide it using `X-Webhook-Secret`, `Authorization: Bearer <secret>`, or the HTTPS webhook URL query parameter `?secret=<secret>`.
- The WhatsApp webhook fails closed unless Basic Auth credentials or the shared-secret fallback are configured.
Sistema de gestión dental con IA
