# Photo check on this Mac

One-time setup for the advice in the editor. The model runs here, not in
the cloud. Nothing in this file is a secret.

The check never blocks publish. When this computer is off, a job that has
been waiting a few minutes shows as waiting in the editor.

Expect roughly 30–90 seconds a photograph. Measure the first run. Do not
treat that range as a promise.

## 1. The model

Install [Ollama](https://ollama.com), then:

```bash
ollama pull gemma3:4b
```

That is about 3.3 GB. This Mac is Intel, so it runs on the CPU.

## 2. The key

Create `worker/.env` on this machine. It is gitignored. Never commit it.

```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<the service role key>
```

The service role bypasses row security. It stays in this file.

Apply `supabase/migrations/0037_photo_reviews.sql` in the Supabase SQL
editor once. Until that runs, the editor still works and simply has no
advice.

## 3. Run it

From the repo:

```bash
npm run review --prefix worker
```

The command claims every `review_photos` job, writes one row per
photograph into `photo_reviews`, and exits when the queue is empty. It
does not write the room onto the listing. The editor applies a room only
when the agent has not named one.

Ollama must be running (`ollama serve`, which the app usually starts).
The default address is `http://127.0.0.1:11434`. `OLLAMA_MODEL` overrides
`gemma3:4b` if you set it in the same `.env`.

## 4. Optional: start with the Mac

A LaunchAgent can run the same command when you log in. Point it at
`npm run review --prefix worker` with this repo as the working directory.
Leave it off if you would rather run the command yourself.
