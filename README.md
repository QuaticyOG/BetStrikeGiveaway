# Betstrike Giveaway Bot (PostgreSQL + Railway)

## Features

* Eligible winners must have **Striker** and **Level 5**
* Continuous Striker hold tracking (removal resets timer)
* Min server join days & min account age checks
* Weighted prize system
* CS2-style case opening animation
* Premium horizontal reel with centered reward
* Replay button (private replay, no reroll)
* Random draws inside daily time windows
* No repeat winner in the same day
* Configurable giveaway channel
* Configurable winner log channel
* PostgreSQL persistent tracking
* Slash commands:

  * `/eligibility`
  * `/startgiveaways`
  * `/stopgiveaways`
  * `/setgiveawaychannel`
  * `/setwinnerlog`
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

## Giveaway Flow

1. Scheduler selects eligible users
2. Winner is stored in PostgreSQL
3. Case animation posts in giveaway channel
4. Users can press **Replay**
5. Replay is:

   * private (only clicker sees it)
   * visual only (no new reward)
   * anti-spam protected
6. Optional winner logs are sent to the log channel

---

## Admin Commands

### `/setgiveawaychannel`

Sets where the public case animation is posted.

**Admin only**

---

### `/setwinnerlog`

Sets where internal winner logs are sent.

**Admin only**

---

### `/startgiveaways`

Enables scheduled draws.

**Admin only**

---

### `/stopgiveaways`

Disables scheduled draws.

**Admin only**

---

### `/drawnow`

Forces an immediate draw.

**Admin only**

---

### `/resetwinners`

Reset winner history.

Options:

* `today`
* `all`

**Admin only**

---

### `/eligibility`

Check if a user qualifies for giveaways.

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

### Required

* `BOT_TOKEN`
* `DATABASE_URL`
* `TIME_WINDOWS_JSON`
* `GUILD_ID`

### Recommended

* `STRIKER_ROLE_ID` or `STRIKER_ROLE_NAME`
* `LEVEL5_ROLE_ID` or `LEVEL5_ROLE_NAME`
* `MIN_DAYS_IN_SERVER`
* `MIN_ACCOUNT_AGE_DAYS`
* `MIN_DAYS_WITH_STRIKER_ROLE`
* `WINNERS_PER_DAY`
* `GIVEAWAY_MESSAGE`
* `GIVEAWAY_COLOR`

### Optional

* cooldown settings
* message requirements

6. Deploy

---

## Prize Configuration

Edit in `config.js`:

```js
PRIZES: [
  { name: "Small Reward", emoji: "🪙", weight: 60 },
  { name: "Medium Reward", emoji: "💵", weight: 25 },
  { name: "Big Reward", emoji: "💎", weight: 10 },
  { name: "JACKPOT", emoji: "🔥", weight: 5 }
]
