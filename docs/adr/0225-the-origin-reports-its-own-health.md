# The origin reports its own health and evicts its own cache

Nothing measured the box after the cutover (issue #1885): a deploy proves the app answers, and nothing
else. A disk that fills, a container that starts restarting, or a memory climb surfaced as a failed pull
or a customer's `500`. At the same time the doc for the box admitted the opposite risk — every pull keeps
the previous image, and 30 GB is the whole disk — with no mechanism to bound it.

Two properties of the origin make the answer cheap. It is a single Compose host, so the things worth
watching are countable and local. And the registry keeps a tag per commit, so a local image is a cache:
losing one costs a re-pull, never the rollback.

## Decision

1. **One cron, on the box.** `deploy/vps/monitor.sh` runs hourly from root's crontab and checks disk,
   memory, both containers running, the app's own Compose healthcheck, and restarts that happened within
   the last hour.
2. **Alerts go to the bot the repository already uses.** Silence means healthy, except one line a day at
   `HEARTBEAT_HOUR`, because a cron that died is otherwise indistinguishable from a box that is fine. A
   persisting problem is re-sent every `REPEAT_HOURS`, not on every run, and a recovered box forgets the
   reminder so the next problem speaks at once.
3. **Eviction is by a gauge, never by an image's age.** Over `DISK_SOFT_PCT` the dangling layers go; over
   `DISK_HARD_PCT` every unused image goes. The rule holds whatever the image grows to, and the run
   reports what is left.
4. **The monitor is not part of the deploy.** A cleanup that fails must never fail a good deploy, and a
   deploy is the wrong clock for a disk that fills on its own schedule.
5. **Thresholds and credentials are the box's, in `monitor.env`** (`600`, root). The script is in git so a
   rebuilt box is the same box.

## Why not the alternatives

- **A hosted monitor** (healthchecks, UptimeRobot) sees `HTTPS 200`, not disk, memory or restarts, and adds
  another account to a $6.70 origin.
- **A metrics agent** (node_exporter, Prometheus, Grafana) is a second service on 2 GB to watch 2 GB, and a
  dashboard nobody opens overnight is not an alert.
- **Pruning inside `deploy.sh`** couples cleanup to shipping: a failed prune turns a good deploy red, and
  deploys are rare next to a disk that grows for other reasons.
- **`docker image prune --filter until=168h`** looks right and is not: the filter compares an image's
  **build** date, and every image this box pulls was built minutes before the deploy, so it prunes nothing
  except images a week old that are still there.
- **`docker image prune -af` on a blind cron** deletes the previous image, which is the fast rollback.

## Consequences

- The box holds the bot token. A compromised box can message the owner; it cannot read the database, and
  the token is revocable in one place.
- Alerting depends on the box being alive: a dead box sends no message, and the daily heartbeat is what
  makes that silence visible within a day.
- Raising a threshold is an edit to `monitor.env`, not a release — which also means a threshold that
  proves wrong is cheap to correct.
- An evicted image makes a hand-rolled rollback re-pull from GHCR. The rollback contract is unchanged, and
  this is the trade recorded above: the box holds a cache, not the history.
