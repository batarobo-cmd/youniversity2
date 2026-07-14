# SvelteKit (YOUniversity2)

Widget on the login/register page; canonical siteverify runs in `apps/api` (`verifyTurnstileToken`).

See Cloudflare reference: https://developers.cloudflare.com/turnstile/spin/

- Frontend: `cf-turnstile` + `data-action="turnstile-spin-v2"`
- Token field name: `cf-turnstile-response` (automatic with implicit widget)
- Backend: `POST https://challenges.cloudflare.com/turnstile/v0/siteverify`
