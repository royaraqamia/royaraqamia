# Moving the origin to the self-managed VPS

This is the operator's runbook for the 2 vCPU / 2 GB / 30 GB Ubuntu 24.04 VPS
(ADR-0221). The image is built in GitHub Actions and published to GHCR; this
machine only pulls and runs it. Render stays live until the last step.

Do not paste passwords or API keys into chat, a pull request or a terminal
recording. Everything secret goes into `/opt/royaraqamia/.env` on the VPS or
into GitHub Actions secrets.

## 1. Connect to the machine

From PowerShell on your Windows machine:

```powershell
ssh root@91.98.55.148
```

Accept the host fingerprint once, then paste the root password from the
Illevante panel or email. If root login is refused, use the server user the
panel gave you and run `sudo -i` after logging in.

If SSH is blocked, open the **VMx Console** from the same panel and work there.

## 2. Base system

Run these once, as root:

```bash
apt update && apt upgrade -y
apt install -y curl ufw
hostnamectl set-hostname royaraqamia
timedatectl set-timezone UTC
```

Add a small swap file. The app runs in a 1 GB heap budget and the build no
longer happens here, but swap absorbs a short spike without killing the
process:

```bash
fallocate -l 1G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

Open only the ports you need. **Allow SSH first**, or you will lock yourself
out:

```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status
```

If your provider also has a firewall in its panel, allow the same three ports
there.

## 3. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
docker --version
docker compose version
```

## 4. Put the deployment files on the VPS

From the repository root on Windows, copy only the VPS files; the Dockerfile
is used by GitHub, not here:

```powershell
scp -r deploy/vps/* root@91.98.55.148:/opt/royaraqamia/
```

If `/opt/royaraqamia` does not exist yet, create it first on the VPS:

```bash
mkdir -p /opt/royaraqamia
```

You should now have `compose.yaml`, `Caddyfile` and `deploy.sh` in that
directory.

## 5. Create the runtime environment file

Copy the template and fill it from the values currently in the Render
dashboard:

```bash
cp example.env /opt/royaraqamia/.env
nano /opt/royaraqamia/.env
```

Alternatively, copy it from Windows:

```powershell
scp example.env root@91.98.55.148:/opt/royaraqamia/.env
```

Every `KEY=` must have its real value on the right. The blank ones may stay
blank only where the code documents an empty value as "feature off" (for
example `TAVILY_API_KEY`). The important ones are the Supabase URL and keys,
`NEXT_PUBLIC_SITE_URL=https://royaraqamia.com`,
`PUBLIC_ORIGIN=https://royaraqamia.com`, `NEXT_PUBLIC_WHATSAPP_PHONE`, the
Resend keys, Turnstile, VAPID, `CRON_SECRET`, `MCP_TOKEN_ENCRYPTION_KEY`, and
the assistant provider keys. Lock the file down:

```bash
chmod 600 /opt/royaraqamia/.env
```

## 6. Set GitHub Actions values

In GitHub: Settings -> Secrets and variables -> Actions. Add these as secrets
(or variables; the workflow accepts either, except the service-role key which
must be a secret):

- `NEXT_PUBLIC_SITE_URL`
- `PUBLIC_ORIGIN`
- `NEXT_PUBLIC_WHATSAPP_PHONE`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- optional: `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`

The first six are required; the publish workflow fails loudly if any is
empty. These are build-time values only. The VPS `.env` is the runtime copy.

## 7. Publish the image

After the migration change is merged into `main`:

```powershell
gh workflow run 'Publish origin image'
gh run watch
```

The first push creates a GHCR package. Set that package to **public** in GitHub
(Packages -> royaraqamia -> Package settings -> Change visibility -> Public)
so the VPS can pull it without another credential. The image contains no
secrets, so public is safe.

## 8. Start the origin

On the VPS:

```bash
cd /opt/royaraqamia
bash deploy.sh
docker compose ps
```

`deploy.sh` pulls the image, starts both containers and waits for
`/manifest.json` to answer. Read logs with:

```bash
docker compose logs -f app
docker compose logs -f caddy
```

## 9. Test before moving DNS

Add a temporary DNS record in Cloudflare:

- Type `A`, name `vps`, value `91.98.55.148`
- Proxy status **DNS only** (grey cloud)

On the VPS, uncomment the `vps.royaraqamia.com` block at the bottom of
`/opt/royaraqamia/Caddyfile`, then reload Caddy:

```bash
nano /opt/royaraqamia/Caddyfile
docker compose restart caddy
```

Open `https://vps.royaraqamia.com` and check:

- the home page and a public post render
- sign-in works
- a chat turn with نور streams and finishes
- `/manifest.json` and `/api/version` answer
- the Android update manifest answers at `/android/latest.json`

Any certificate error from Caddy for the _main_ domain at this stage is
expected: DNS for it still points at Render. The temporary hostname is the one
that must work.

## 10. Cut over

1. Save a screenshot of the current Cloudflare DNS records so you can restore
   them exactly.
2. Set the `royaraqamia.com` A record to `91.98.55.148` and `www` the same,
   both with proxy **off** and TTL 300 seconds.
3. Restart Caddy so it obtains certificates for the main names:
   `docker compose restart caddy`. Watch `docker compose logs -f caddy` until
   the certificates are issued.
4. Verify the site works with the proxy off, then turn the orange cloud back
   on for both records.
5. In Cloudflare -> SSL/TLS, set encryption mode to **Full (strict)** now that
   Caddy has a valid certificate.
6. Purge the edge cache so cached HTML does not still point at the old origin:

   ```powershell
   gh workflow run deploy.yml -f purge_only=true
   ```

7. Comment the temporary `vps.royaraqamia.com` block out again and restart
   Caddy.

Leave the Render service running for a few days. Rollback is the reverse of
step 2: restore the saved DNS records and run the same purge workflow.

## 11. Routine operations

New image published: on the VPS run

```bash
cd /opt/royaraqamia
bash deploy.sh
docker image prune -f
```

Watch resources:

```bash
free -h
df -h
docker stats --no-stream
```

Backups: the database already has verified daily dumps in R2 with a restore
drill (`docs/supabase.md`). The VPS itself is not backed up by any of that.
Enable provider snapshots, or be ready to rebuild the box from the image and
the `.env` file. Keep at least one recent copy of `.env` somewhere safe outside
the VPS.

## 12. Hardening, after everything works

- Create a non-root `deploy` user, add your SSH public key to it, then disable
  password and root SSH login in `/etc/ssh/sshd_config` and restart `ssh`.
- Keep `ufw` on with only 22, 80 and 443 allowed.
- Do not add Coolify, a database or any second workload to this 2 GB box.
