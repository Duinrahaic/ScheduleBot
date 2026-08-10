# ScheduleBot

<p align="center">
  <img src="Resources/ScheduleBotLogo.png" alt="ScheduleBot — An Automated Discord Event Bot">
</p>

ScheduleBot is a small, self-hosted Discord event bot written in strict TypeScript. It posts event cards, tracks attending/tentative responses, manages per-event roles and threads, produces CSV attendance reports, and runs lifecycle transitions before and after events.

![ScheduleBot example](Resources/ScheduleBotExample.png)

## Requirements

- Node.js 22.13+ (current Node.js 24 LTS is used by Docker and CI)
- A Discord application/bot token
- SQLite (default) or MySQL 8

Enable the **Server Members Intent** for the bot in the Discord Developer Portal. Invite it with the `bot` and `applications.commands` scopes. It needs View/Send Messages, Manage Messages, Manage Roles, Create Public Threads, Send Messages in Threads, and Manage Threads. Keep the bot's role above roles it creates.

## Quick start with SQLite

```sh
cp .env.example .env
# Put the token in .env; DATABASE_TYPE=sqlite is already selected
npm ci
npm run build
npm start
```

Then run `/seteventchannel`. SQLite data is stored at `SQLITE_FILE` (`./data/schedulebot.sqlite3` by default).

With Docker Compose:

```sh
cp .env.example .env
# Edit DISCORD_BOT_TOKEN

docker compose up -d --build
```

The named `schedulebot-data` volume persists SQLite data. The service does not publish a host port; its internal `/health` endpoint is used by the image healthcheck.

## MySQL

Existing deployments can retain the legacy variables `MYSQL_SERVER`, `MYSQL_DB`, `MYSQL_USER`, and `MYSQL_USER_PW`. `MYSQL_DATABASE`/`MYSQL_PASSWORD` aliases and `DISCORD_BOT_CONNECTION_STRING` are also accepted. Select MySQL explicitly:

```env
DATABASE_TYPE=mysql
MYSQL_SERVER=db
MYSQL_DB=ScheduleBot
MYSQL_USER=schedulebot
MYSQL_USER_PW=a-strong-password
```

The Compose database requests a random root password from the official MySQL
image; only the application user's strong password must be supplied. Missing or
known placeholder application passwords are rejected at bot configuration time.

Start the Compose MySQL profile:

```sh
docker compose --profile mysql up -d --build
```

MySQL is only on the private Compose network and is not published to the host. There is no `init.sql`: the bot creates missing tables itself after MySQL becomes healthy.

### Compatibility and migration notes

The TypeScript version deliberately retains the legacy table and column names: `Schedules`, `ServerSettings`, and the historical misspelling `Attenants`. Discord snowflakes remain `BIGINT UNSIGNED` in MySQL and are handled as strings by the application so they do not lose precision. Signed `int` primary/foreign keys match the legacy EF schema exactly. Existing EF-created MySQL tables are used in place; startup creates absent tables and adds the composite attendance uniqueness invariant after deterministically removing legacy duplicates.

Before changing versions or database engines, stop the old bot and take a database backup. To keep an existing MySQL database, point this bot at it using the variables above—do not initialize a second schema. Moving records between MySQL and SQLite is not automatic; use a database export/import tool that preserves names, UTC timestamps, boolean values, primary keys, and snowflakes as text/integer values. Test a copy first. SQLite uses text snowflakes to avoid JavaScript/SQLite numeric precision loss.

## Commands and controls

Commands require Manage Messages by default:

- `/seteventchannel` — choose the event channel
- `/event` — create an event from an ISO date/time or Discord timestamp
- `/edit` — edit an event by its Discord message ID
- `/restartevent` — reactivate an ended event and restore attendee roles
- `/refresh` — rebuild active event messages
- `/getattendancereport` — DM a CSV for an IANA-zone date range
- `/version` — show the running version

Event cards have Attend, Tentative, and Delete buttons. Selecting the current attendance state again removes it; switching changes it. Delete opens a typed confirmation and authorization is checked again when submitted.

The scheduler creates a thread and announces the event one hour before start, marks the card ended at end time, and archives the thread/deletes the role one hour later. Intervals are configurable in `.env.example`; ticks never overlap.

## Dates

Use ISO 8601 values, preferably with an offset (`2026-04-15T19:00:00-04:00`), or a Discord timestamp such as `<t:1776294000:F>`. If an ISO value has no offset, the command's IANA timezone (for example `America/New_York`) is applied. Data is stored and compared in UTC.

## Development

```sh
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

`npm test` collects V8 coverage. The MySQL integration suite is enabled with `RUN_MYSQL_INTEGRATION=true` plus `MYSQL_TEST_HOST`, `MYSQL_TEST_DATABASE`, `MYSQL_TEST_USER`, and `MYSQL_TEST_PASSWORD`; it resets that dedicated test database, so never point it at production. CI provisions MySQL and always runs this path. Attendance callback/toggle sequencing is serialized per event only within one bot process; the database unique index prevents duplicate attendance rows across processes. Security workflows run CodeQL, dependency review, npm audit, and a Trivy container scan. Trusted pushes to `dev`/`master` and `v*` tags publish a multi-platform GHCR image only after validation and a container scan; pull requests never publish. The prepublish scan covers a reproducible default-platform container build rather than the exact multi-architecture manifest, which remains a publication-pipeline limitation.

The dependency set uses current compatible stable releases. TypeScript is intentionally held on 5.9 because the current `typescript-eslint` peer range is below TypeScript 6.1. Docker uses the official mutable multi-architecture Node and MySQL tags rather than unverifiable single-architecture digest pins; Dependabot tracks those tags.

## Configuration

See [`.env.example`](.env.example). `DATABASE_TYPE` defaults to `sqlite` when omitted and must be set explicitly to `mysql` for MySQL. SQLite Compose startup requires no database credentials. Legacy MySQL connection strings accept common `Server`/`Host`/`Data Source`, `User`/`User Id`/`Uid`, `Password`/`Pwd`, and `Database`/`Initial Catalog` aliases. Credentials and tokens are never printed by the bot. Invalid configuration fails startup with a clear error.

The Compose bot runs with a read-only root filesystem, no Linux capabilities, no-new-privileges, a bounded PID count, and a temporary `/tmp`; `/app/data` remains writable for SQLite.

## License and support

Licensed under the [MIT License](LICENSE.txt). Please use the repository issue tracker for support. Funding links are in [`.github/FUNDING.yml`](.github/FUNDING.yml).
