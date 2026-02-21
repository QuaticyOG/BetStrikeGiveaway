# Betstrike Giveaway Bot (PostgreSQL + Railway)

## Features

* Eligible winners must have **Striker** and **Level 5**
* Continuous Striker hold tracking (removal resets timer)
* Min server join days & min account age checks
* Weighted prize system
* CS2-style case opening animation
* Replay button (visual only, no reroll)
* Random draws inside daily time windows
* No repeat winner in the same day
* Slash commands:

  * `/eligibility`
  * `/startgiveaways`
  * `/stopgiveaways`
  * `/setgiveawaychannel`
  * `/drawnow`
  * `/resetwinners`

---

## Eligibility Requirements

Users must:

* Be in the server ≥ **MIN_DAYS_IN_SERVER**
* Have Discord account ≥ **MIN_ACCOUNT_AGE_DAYS**
* Have **Striker** role
* Have **Level 5** role
* Have held **Striker continuously ≥ MIN_DAYS_WITH_STRIKER_ROLE**

If Striker is removed, the timer resets.

---

## Local Setup

1. Install Node.js
2. `npm install`
3. Copy `.env.example` → `.env` and fill values
4. Ensure Postgres is available and `DATABASE_URL` is correct
5. `npm run db:init`
6. `npm start`

---

## Railway Setup

1. Push this repo to GitHub
2. Railway → New Project → Deploy from GitHub
3. Railway → New → Database → PostgreSQL
4. Railway will create `DATABASE_URL` automatically
5. Add Variables in Railway:

Required:

* `BOT_TOKEN`
* `DATABASE_URL`
* `TIME_WINDOWS_JSON`
* `GUILD_ID`

Recommended:

* `STRIKER_ROLE_ID` or `STRIKER_ROLE_NAME`
* `LEVEL5_ROLE_ID` or `LEVEL5_ROLE_NAME`
* `MIN_DAYS_IN_SERVER`
* `MIN_ACCOUNT_AGE_DAYS`
* `MIN_DAYS_WITH_STRIKER_ROLE`
* `WINNERS_PER_DAY`
* `GIVEAWAY_MESSAGE`
* `GIVEAWAY_COLOR`

Optional:

* cooldown settings
* message requirements

6. Deploy

---

## Prize Configuration

Edit in `config.js`:

```
PRIZES: [
  { name: "Small Reward", emoji: "🪙", weight: 60 },
  { name: "Medium Reward", emoji: "💵", weight: 25 },
  { name: "Big Reward", emoji: "💎", weight: 10 },
  { name: "JACKPOT", emoji: "🔥", weight: 5 }
]
```

Higher weight = higher drop chance.

---

## Discord Developer Portal

Enable intents:

* Server Members Intent
* Message Content Intent
