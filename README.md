# Betstrike Giveaway Bot (PostgreSQL + Railway)

## Features
- Eligible winners must have the configured role (default: "striker")
- Min messages, min server join days, min account age
- Random draws inside daily time windows
- No repeat winner in the same day 
- Embed announcement with custom message and color
- Slash commands:
  - /startgiveaways
  - /stopgiveaways
  - /setgiveawaychannel
  - /drawnow

## Local Setup
1) Install Node.js
2) `npm install`
3) Copy `.env.example` -> `.env` and fill values
4) Ensure Postgres is available and DATABASE_URL is correct
5) `npm run db:init`
6) `npm start`

## Railway Setup
1) Push this repo to GitHub
2) Railway -> New Project -> Deploy from GitHub
3) Railway -> New -> Database -> PostgreSQL
4) Railway will create `DATABASE_URL` automatically
5) Add Variables in Railway:
   - BOT_TOKEN
   - ELIGIBLE_ROLE_NAME or ELIGIBLE_ROLE_ID
   - MIN_MESSAGES, MIN_DAYS_IN_SERVER, MIN_ACCOUNT_AGE_DAYS
   - WINNERS_PER_DAY
   - TIME_WINDOWS_JSON
   - GIVEAWAY_MESSAGE
   - GIVEAWAY_COLOR
   - (Recommended) GUILD_ID
6) Deploy

## Discord Developer Portal
Enable intents:
- Server Members Intent
- Message Content Intent
