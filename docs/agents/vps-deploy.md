# The self-managed VPS origin

The site has been served from this box since **2026-11-27**: a 2 vCPU / 2 GB / 30 GB Ubuntu 24.04
VPS from Illevante at **$6.70 a month**, the only recurring bill, against a **$10 a month** cap
([docs/agents/cost.md](cost.md)). Cloudflare is in front; the app runs in Docker behind Caddy; the
image is built in GitHub Actions and published to GHCR. Render is retired as the origin and kept as
the rollback (ADR-0221).

Every command below has been run on this machine. Several differ from the first version of this page
because the box disagreed with it: the network drops port 22, `.env` shipped a `localhost` origin,
and the app port is never published on the host.

## What the box is

- `sshd` listens on **2222 via `ssh.socket`** (not on 22), key-only: `PermitRootLogin no`,
  `PasswordAuthentication no`.
- The login is **`deploy`**, a sudo user. Root exists only through the Illevante console.
- `/opt/royaraqamia/` holds `compose.yaml`, `Caddyfile`, `deploy.sh`, `backup.sh`, `.env` and
  `backup.env`; both env files are `600` and root-owned, so operating them needs `sudo`.
- Caddy serves TLS for `royaraqamia.com` and `www.royaraqamia.com`; Cloudflare proxies both with
  SSL mode **Full (strict)**.
- `cron` copies the configuration to a dedicated R2 bucket at 03:00 UTC; the Illevante panel sells
  snapshots, but only by hand.
- The app port is `expose`d to the Compose network and never published, so health checks run inside
  the container, not with a host `curl`.
- `Publish origin image` holds its own ed25519 key, constrained to `deploy.sh` by a forced command and
  a sudoers rule; the owner's key is separate and still opens a shell (see _The deploy key_).

## Getting in, and out of trouble

```bash
ssh -p 2222 deploy@91.98.55.148
sudo -i            # when a root shell is genuinely needed
```

Port 22 is not merely closed, it is unreachable from the owner's network — the house connection
drops outbound SSH on 22 while allowing 2222. That is why the listener moved, and why it lives on
`ssh.socket`:

```bash
cat /etc/systemd/system/ssh.socket.d/10-alt-port.conf   # [Socket] ListenStream= / ListenStream=2222
ss -lntp | grep 2222
```

Touching `Port` in `/etc/ssh/sshd_config` corrects nothing while socket activation owns the listener;
`sshd -T` will happily report a port that nothing listens on.

If SSH is lost, the Illevante console is the way back: delete
`/etc/ssh/sshd_config.d/20-hardening.conf` (or the socket drop-in), `systemctl restart ssh`, and fix
the cause with a second session open.

## Deploy the current image

Publishing is manual and always from `main`, and one dispatch is the whole deploy:

```powershell
gh workflow run 'Publish origin image' -f reason='what this serves'
gh run watch
```

It is a chain of three jobs (ADR-0209 amendment, ADR-0221 fourth amendment):

1. `publish` builds and pushes `ghcr.io/royaraqamia/royaraqamia:latest` and `:<sha>`.
2. `deploy` connects with the workflow's own key, whose `authorized_keys` entry forces
   `sudo -n /usr/bin/bash /opt/royaraqamia/deploy.sh` — the only command sudoers allows it — and fails
   unless `https://royaraqamia.com/api/version?deploy=<sha>` answers with that commit.
3. `purge` calls `purge-cache.yml` to re-read the discovery documents and purge the zone.

`-f deploy=false` stops after the push. A failed run is re-runnable from the Actions page.

The manual path stays for the box's own operations — a pinned rollback, a `.env` change, a drill:

```bash
ssh -p 2222 deploy@91.98.55.148
cd /opt/royaraqamia
sudo bash deploy.sh
sudo docker compose exec -T app node -e \
  "fetch('http://127.0.0.1:3000/api/version').then(r=>r.json()).then(j=>console.log(j.commit))"
```

Compare that commit with `git rev-parse --short HEAD`. `deploy.sh` pulls `:latest`, starts both
containers and waits for `/manifest.json` inside the app container. It does not touch `docker
inspect`-visible build metadata: the build SHA lives in `/api/version` and `public/sw-version.js`,
because the Dockerfile sets it in the build stage only.

Disk is the recurring risk: each pull keeps the previous image. Keep the box near a third full.

```bash
sudo docker image prune -af
df -h /
```

## The deploy key

`Publish origin image` authenticates with its own ed25519 key, never the owner's. It has three halves,
and all three are what make the key harmless to hold in Actions:

- `ORIGIN_SSH_KEY` (Actions secret) — the private half.
- `deploy`'s `~/.ssh/authorized_keys` — one line, with a forced command and no PTY:

  ```
  command="sudo -n /usr/bin/bash /opt/royaraqamia/deploy.sh",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding ssh-ed25519 AAAA... gh-actions@royaraqamia
  ```

- `/etc/sudoers.d/royaraqamia-deploy` — the one command it may run as root:

  ```
  deploy ALL=(root) NOPASSWD: /usr/bin/bash /opt/royaraqamia/deploy.sh
  ```

`no-pty` plus the forced command is load-bearing: the key cannot open a shell, so the workflow's
verification runs over HTTPS from the runner rather than on the box. `sudo -n true` still fails
afterwards — that is the proof the scope is one command, not sudo. `deploy` stays in the `sudo` group
for interactive work, which is password-gated and irrelevant to a headless run.

`ORIGIN_KNOWN_HOSTS` pins the box's host keys as `[91.98.55.148]:2222`; `VPS_HOST`, `VPS_PORT` and
`VPS_USER` are Actions variables. `ssh-keyscan` does not work from the owner's network (the client's
first key exchange is unsupported against this server), so read the keys from the box instead and
check the fingerprint:

```bash
cat /etc/ssh/ssh_host_ed25519_key.pub /etc/ssh/ssh_host_rsa_key.pub   # ed25519 is SHA256:FDmP5Bo+7vzF6ty93jJR4RPHaSjg3tWh/nLAdaaF0b0
```

**Rotating.** Generate a new pair, append its constrained line to `authorized_keys`, set
`ORIGIN_SSH_KEY` to the new private key, prove one dispatch, then delete the old line. A line whose
`command=` option loses its quotes is rejected by `sshd` exactly like a wrong key, so check the file
after editing it (`tail -1 ~/.ssh/authorized_keys`).

**Nothing about this changes the rollback.** It is still the previous tag, run by hand — a dispatch
tags `:latest` with the commit it just built and its verification would fail against the pinned older
image.

## Runtime configuration

`.env` is root-owned and `600`, so it is edited with `sudo`, never copied into the repository.

**The one key that breaks everything quietly** is `NEXT_PUBLIC_SITE_URL`. It must name the same
origin as `PUBLIC_ORIGIN` — `https://royaraqamia.com`, never `http://localhost:3000`. The app treats
a disagreement as fatal (ADR-0178): every route that builds an absolute URL throws, while pages that
were prerendered at build time keep rendering, so the first symptom is a `500` from a single
endpoint such as Google sign-in.

After editing, recreate the app — a config change is not picked up by a running container:

```bash
sudo docker compose up -d --force-recreate app
sudo docker compose exec -T app printenv PUBLIC_ORIGIN NEXT_PUBLIC_SITE_URL
```

## Backups

The box has nothing to lose except `.env`: the image is public and every other file is in git. The
recovery contract is `/opt/royaraqamia` copied nightly to an R2 bucket of its own
(`royaraqamia-vps`), with a credential scoped to that bucket so a compromised VPS cannot read the
database dumps (`docs/supabase.md`).

`backup.sh` archives `compose.yaml`, `Caddyfile`, `deploy.sh` and `.env`, uploads it under `vps/`,
and re-lists the object so a backup that was never stored fails loudly. `backup.env` carries the
credentials and is not inside the archive.

Schedule and retention, as configured:

```bash
crontab -l        # PATH=/usr/local/bin:/usr/bin:/bin, then 0 3 * * * /opt/royaraqamia/backup.sh
cat /etc/logrotate.d/royaraqamia-backup
```

The `PATH` line is load-bearing: cron's own is `/usr/bin:/bin` and the AWS CLI v2 installs into
`/usr/local/bin`, so without it the job fails nightly with `aws: command not found`. Prove the cron
environment any time with:

```bash
env -i PATH=/usr/local/bin:/usr/bin:/bin /opt/royaraqamia/backup.sh
```

An R2 lifecycle rule on the `vps/` prefix expires objects after 30 days. The panel's snapshots are
manual: take one before anything risky (`pre-cutover-<date>`), and know that the tar is the layer
that has actually been restored.

**The drill**, run once already and worth repeating after any change to the file set. It proves the
restored file is the one the app boots from, not merely that an archive exists:

```bash
cd /opt/royaraqamia
sudo -i
set -a; . ./backup.env; set +a
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" AWS_DEFAULT_REGION=auto
aws s3 cp s3://royaraqamia-vps/vps/<newest>.tar.gz /tmp/ --endpoint-url "$R2_ENDPOINT"
sha256sum .env > /tmp/env.sha
mv .env .env.before-drill
tar -xzf /tmp/<newest>.tar.gz -C /opt/royaraqamia
sha256sum -c /tmp/env.sha
docker compose up -d --force-recreate app
docker inspect -f '{{.State.StartedAt}}' royaraqamia
docker compose exec -T app node -e \
  "fetch('http://127.0.0.1:3000/manifest.json').then(r => process.exit(r.ok ? 0 : 1))" && echo restored
rm -f .env.before-drill /tmp/<newest>.tar.gz /tmp/env.sha
```

`R2_*` names are not what the CLI reads, hence the `export`; `--force-recreate` is what makes the
new `.env` the one the container reads; `StartedAt` is the evidence it happened.

## Certificates, and testing a new origin before cutover

Caddy obtains Let's Encrypt certificates itself. The order matters, and it is the order that was
used here: a name must resolve **directly** at the box (Cloudflare proxy off) before Caddy can get a
certificate for it, and only then does the proxy go back on. Doing it the other way gives
`Full (strict)` an origin it cannot verify.

In the zone: the apex is now an **A record to `91.98.55.148`**; it used to be a CNAME to
`royaraqamia.onrender.com`, and a CNAME and an A record cannot share the apex, so a future move is a
delete-then-add, not an edit. Two proxied `*.royaraqamia.com` wildcards belong to other hosts;
explicit records always win over them.

A temporary hostname (`vps.royaraqamia.com`) was used for the pre-cutover checks and then removed,
together with its Caddy block. If it is ever repeated, know that **Google sign-in on a temporary
hostname lands on production**: the OAuth callback is built from `PUBLIC_ORIGIN`. Testing the
authenticated pages there needs two temporary changes, both reverted afterwards — `PUBLIC_ORIGIN`
and `NEXT_PUBLIC_SITE_URL` set to the test origin in `.env`, and the test origin added to Supabase →
Authentication → URL Configuration → Redirect URLs.

## Rollback to the previous image

The rollback is a tag, not a second host. GHCR keeps one tag per commit, so pin the previous
one and re-run the deploy:

```bash
cd /opt/royaraqamia
sudo sed -i 's|royaraqamia:latest|royaraqamia:<previous-sha>|' compose.yaml
sudo bash deploy.sh
```

Then dispatch `Purge the edge` (or purge from the Cloudflare dashboard), revert the pin on the next
good publish, and note the sha in the incident. Do not roll back by dispatching `Publish origin
image`: it tags the image it builds `:latest`, and its deploy job fails when the serving commit is not
the one it built. The Render service and `render.yaml` were deleted on 2026-11-27; there is no DNS
rollback any more, which is why the image tag is the one that has to be right.

## Rebuilding the box

If the machine is lost, nothing here needs to be invented: provision the same 2 vCPU / 2 GB / 30 GB
Ubuntu 24.04 image, then

1. install Docker (`curl -fsSL https://get.docker.com | sh`) and enable it;
2. copy `deploy/vps/*` over and restore `backup.env` and `.env` from the newest archive in
   `royaraqamia-vps/vps/` — that file is the only irreplaceable input;
3. move `sshd` to 2222 through `ssh.socket`, create `deploy` with your key, then disable root and
   password login;
4. `ufw allow 22/tcp 80/tcp 2222/tcp 443/tcp` (22 is harmless and useful on another network);
5. `sudo bash deploy.sh`, then point DNS at the new IP and purge.

## Still open

- `#1885` — nothing measures the box's request rate, latency or memory yet. Until it lands, the
  audit prompts say so instead of inventing a number.
- `#1776` (server-side MP4) and the realtime-voice transport were blocked on this move and can start.
