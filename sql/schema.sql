-- One row per guild for bot config
CREATE TABLE IF NOT EXISTS bot_config (
  guild_id TEXT PRIMARY KEY,
  giveaways_running BOOLEAN NOT NULL DEFAULT TRUE,
  giveaway_channel_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Message counts tracked live
CREATE TABLE IF NOT EXISTS message_counts (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  count BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, user_id)
);

-- Winners per day (prevents same-day duplicates)
CREATE TABLE IF NOT EXISTS daily_winners (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  win_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, user_id, win_date)
);

-- Helpful index for listing winners of a day
CREATE INDEX IF NOT EXISTS idx_daily_winners_guild_date ON daily_winners (guild_id, win_date);

-- Track when a user was last granted a role (needed for "held role for X days" rules)
-- One row per (guild, user, role) representing the most recent time the role was added.
-- If the role is removed, the row is deleted.
CREATE TABLE IF NOT EXISTS role_assignments (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_role_assignments_lookup ON role_assignments (guild_id, role_id, assigned_at);
