# Moving the origin to the self-managed VPS

This is the operator's runbook for the origin (ADR-0221): a **2 vCPU / 2 GB / 30 GB Ubuntu 24.04
VPS from Illevante at $6.70 a month**, the only recurring bill, against a **$10 a month** cap
([docs/agents/cost.md](cost.md)). The image is built in GitHub Actions and published to GHCR; this
machine only pulls and runs it. Render stays live until the last step.

Do not paste passwords or API keys into chat, a pull request or a terminal recording. Everything
secret goes into `/opt/royaraqamia/.env` on the VPS or into GitHub Actions secrets.

## 1. Connect to the machine

From PowerShell on your Windows machine:

```powershell
ssh root@91.98.55.148
```

Accept the host fingerprint once, then paste the root password from the Illevante panel or email. If
root login is refused, use the server user the panel gave you and run `sudo -i` after logging in.

If SSH is blocked, open the **VMx Console** from the same panel and work there. Confirm the panel's
own firewall allows **22** as well as 80 and 443: a connection that times out before the banner is
the panel, not `sshd`.

## 2. Base system

Run these once, as root:

```bash
apt update && apt upgrade -y
apt install -y curl ufw
hostnamectl set-hostname royaraqamia
timedatectl set-timezone UTC
```

Add a small swap file. The app runs in a 1 GB heap budget and the build no longer happens here, but
swap absorbs a short spike without killing the process:

```bash
fallocate -l 1G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

Open only the ports you need. **Allow SSH first**, or you will lock yourself out:

```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status
```

If your provider also has a firewall in its panel, allow the same three ports there.

## 3. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
docker --version
docker compose version
```

## 4. Put the deployment files on the VPS

From the repository root on Windows, copy only the VPS files; the Dockerfile is used by GitHub, not
here:

```powershell
scp -r deploy/vps/* root@91.98.55.148:/opt/royaraqamia/
```

If `/opt/royaraqamia` does not exist yet, create it first on the VPS:

```bash
mkdir -p /opt/royaraqamia
```

You should now have `compose.yaml`, `Caddyfile`, `deploy.sh` and `backup.sh` in that directory.

## 5. Create the runtime environment file

The template is the repository's own `example.env`, the file `npm run check:env-docs` keeps equal to
what the code reads. There is no second copy to drift: send this one straight to the name the app
loads.

```powershell
scp example.env root@91.98.55.148:/opt/royaraqamia/.env
```

Then, on the VPS, fill it from the values currently in the Render dashboard:

```bash
nano /opt/royaraqamia/.env
chmod 600 /opt/royaraqamia/.env
```

Every `KEY=` must have its real value on the right. The blank ones may stay blank only where the code
documents an empty value as "feature off" (for example `TAVILY_API_KEY`). The important ones are the
Supabase URL and keys, `NEXT_PUBLIC_SITE_URL=https://royaraqamia.com`,
`PUBLIC_ORIGIN=https://royaraqamia.com`, `NEXT_PUBLIC_WHATSAPP_PHONE`, the Resend keys, Turnstile,
VAPID, `CRON_SECRET`, `MCP_TOKEN_ENCRYPTION_KEY`, and the assistant provider keys.

## 6. Back up the configuration

The box has nothing to lose except `.env`. The images are public and every other file is in git, so
the recovery contract is this directory, copied nightly to an R2 bucket of its own, and a restore that
has actually been run. A separate bucket matters: the database's dumps live in their own bucket, and a
credential on the VPS must not be able to read them (`docs/supabase.md`).

1. In the Cloudflare dashboard, create a bucket named `royaraqamia-vps` and an R2 API token scoped to
   **that bucket only**. Note the endpoint (`https://<account>.r2.cloudflarestorage.com`), the key id
   and the secret.
2. Install the CLI and write the credential file, so the secret is never in a shell history:

   ```bash
   apt install -y awscli
   cat > /opt/royaraqamia/backup.env <<'EOF'
   R2_ENDPOINT=
   R2_ACCESS_KEY_ID=
   R2_SECRET_ACCESS_KEY=
   R2_BACKUP_BUCKET=royaraqamia-vps
   EOF
   chmod 600 /opt/royaraqamia/backup.env
   nano /opt/royaraqamia/backup.env
   ```

3. Run it once by hand and read the answer:

   ```bash
   chmod +x /opt/royaraqamia/backup.sh
   /opt/royaraqamia/backup.sh
   ```

4. Schedule it at 03:00 UTC, an hour clear of the database dump, and keep the log rotated. `crontab -`
   replaces the whole table, so if this box already has entries use `crontab -e` and add the line
   instead of piping:

   ```bash
   echo '0 3 * * * /opt/royaraqamia/backup.sh >> /var/log/royaraqamia-backup.log 2>&1' \
     | crontab -
   cat > /etc/logrotate.d/royaraqamia-backup <<'EOF'
   /var/log/royaraqamia-backup.log {
     weekly
     rotate 8
     compress
     missingok
     notifempty
   }
   EOF
   ```

5. Retain about 30 daily copies with an R2 **lifecycle rule** on the `vps/` prefix, and check the
   panel still sells snapshots: if it does, enable a daily one as the second line of defence. The tar
   is the contract either way, because it is the one restore that has been rehearsed.

**The restore is rehearsed before the DNS record moves**, not after. This is the drill, and it is the
whole of it:

```bash
cd /opt/royaraqamia
set -a; . ./backup.env; set +a
aws s3 ls s3://royaraqamia-vps/vps/ --endpoint-url "$R2_ENDPOINT" | tail -3
aws s3 cp s3://royaraqamia-vps/vps/<newest>.tar.gz /tmp/ --endpoint-url "$R2_ENDPOINT"
mv .env .env.before-drill
tar -xzf /tmp/<newest>.tar.gz -C /opt/royaraqamia
docker compose up -d --force-recreate app
bash deploy.sh
curl -fsS http://127.0.0.1:3000/manifest.json > /dev/null && echo restored
```

`--force-recreate` is the point: with an identical env file Compose would leave the running
container alone, and the drill would prove nothing about the restored copy.

A `restored` line means the untarred `.env` is the one the app is running on. Record the date and the
archive name in issue #1779, then remove `.env.before-drill`.

## 7. Set GitHub Actions values

In GitHub: Settings -> Secrets and variables -> Actions. Add these as secrets (or variables; the
workflow accepts either, except the service-role key which must be a secret):

- `NEXT_PUBLIC_SITE_URL`
- `PUBLIC_ORIGIN`
- `NEXT_PUBLIC_WHATSAPP_PHONE`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- optional: `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`

The first six are required; the publish workflow fails loudly if any is empty. These are build-time
values only. The VPS `.env` is the runtime copy.

## 8. Publish the image

After the migration change is merged into `main`:

```powershell
gh workflow run 'Publish origin image'
gh run watch
```

The first push creates a GHCR package. Set that package to **public** in GitHub (Packages ->
royaraqamia -> Package settings -> Change visibility -> Public) so the VPS can pull it without
another credential. The image contains no secrets, so public is safe.

## 9. Start the origin

On the VPS:

```bash
cd /opt/royaraqamia
bash deploy.sh
docker compose ps
docker stats --no-stream
```

`deploy.sh` pulls the image, starts both containers and waits for `/manifest.json` to answer. Read
logs with:

```bash
docker compose logs -f app
docker compose logs -f caddy
```

The app container is capped at 1536 MB and Caddy at 192 MB, so an out-of-memory kill takes one
container and `restart: unless-stopped` brings it back, rather than the kernel choosing a victim on a
2 GB box.

## 10. Test before moving DNS

Add a temporary DNS record in Cloudflare:

- Type `A`, name `vps`, value `91.98.55.148`
- Proxy status **DNS only** (grey cloud)

On the VPS, uncomment the `vps.royaraqamia.com` block at the bottom of `/opt/royaraqamia/Caddyfile`,
then reload Caddy:

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

Any certificate error from Caddy for the _main_ domain at this stage is expected: DNS for it still
points at Render. The temporary hostname is the one that must work.

## 11. Cut over

1. Save a screenshot of the current Cloudflare DNS records so you can restore them exactly.
2. Set the `royaraqamia.com` A record to `91.98.55.148` and `www` the same, both with proxy **off**
   and TTL 300 seconds.
3. Restart Caddy so it obtains certificates for the main names:
   `docker compose restart caddy`. Watch `docker compose logs -f caddy` until the certificates are
   issued.
4. Verify the site works with the proxy off, then turn the orange cloud back on for both records.
5. In Cloudflare -> SSL/TLS, set encryption mode to **Full (strict)** now that Caddy has a valid
   certificate.
6. Purge the edge cache so cached HTML does not still point at the old origin:

   ```powershell
   gh workflow run deploy.yml -f purge_only=true
   ```

7. Comment the temporary `vps.royaraqamia.com` block out again and restart Caddy.

Leave the Render service running for a few days. Rollback is the reverse of step 2: restore the saved
DNS records and run the same purge workflow. Rehearse it once while both origins are live, pointing a
throwaway hostname at Render to confirm it still answers — the rollback is a DNS record, and only
worth having if it is known to work.

## 12. Routine operations

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

Backups: the nightly tar from step 6 is the box's recovery; the database keeps its own verified dumps
in R2 with a restore drill (`docs/supabase.md`). Keep a copy of `backup.env` somewhere safe outside
the VPS too — the credential is not inside the archive.

## 13. Hardening, after everything works

- Create a non-root `deploy` user, add your SSH public key to it and to the `docker` group, then
  disable password and root SSH login in `/etc/ssh/sshd_config` and restart `ssh`. From then on the
  commands above run as `deploy@91.98.55.148`, and `bash deploy.sh` needs `sudo` unless the user is
  in the `docker` group.
- Keep `ufw` on with only 22, 80 and 443 allowed.
- Do not add Coolify, a database or any second workload to this 2 GB box.
