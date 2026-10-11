# Photo check

DeepSeek looks at each photograph from the editor. It is the same key the
description already uses, on the Worker:

```bash
npx wrangler secret put DEEPSEEK_API_KEY
```

A value saved under Workers Builds → Settings → Build → Variables and
secrets is not that. It exists only while the site is building. The deploy
copies `DEEPSEEK_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` from that build
environment onto the latest Worker version
(`scripts/bind-worker-secrets.mjs`, via `wrangler versions secret bulk`).
The same name under Settings → Variables & Secrets is already a runtime
secret and does not need the copy.

The model is `deepseek-flash`. It can see a picture. The description model
does not. The key never goes in the browser and never goes in git.

Apply these two files in the Supabase SQL editor, in order, if they are
not there yet:

- `supabase/migrations/0037_photo_reviews.sql`
- `supabase/migrations/0038_photo_review_owner.sql`

Until they are applied, the editor still works and simply has no advice.
Advice never blocks publish.

The check runs when the photographs are on the listing. One picture at a
time. Hebrew on screen comes from `locales/`, not from the model.

`npm run review --prefix worker` drains a `review_photos` job that is
already queued. It calls the same DeepSeek key from `worker/.env`
(`DEEPSEEK_API_KEY`, plus `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`).
That file is gitignored. The editor does not need that command.
