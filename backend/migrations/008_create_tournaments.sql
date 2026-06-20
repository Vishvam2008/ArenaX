CREATE TABLE tournaments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  game VARCHAR(20) NOT NULL DEFAULT 'free_fire' CHECK (game IN ('free_fire', 'bgmi')),
  match_type VARCHAR(10) NOT NULL CHECK (match_type IN ('solo', 'duo', 'squad')),
  banner_url TEXT,
  entry_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00 CHECK (entry_fee >= 0),
  prize_pool DECIMAL(10,2) NOT NULL DEFAULT 0.00 CHECK (prize_pool >= 0),
  per_kill_reward DECIMAL(10,2) NOT NULL DEFAULT 0.00 CHECK (per_kill_reward >= 0),
  booyah_reward DECIMAL(10,2) NOT NULL DEFAULT 0.00 CHECK (booyah_reward >= 0),
  total_slots INTEGER NOT NULL CHECK (total_slots > 0),
  filled_slots INTEGER NOT NULL DEFAULT 0 CHECK (filled_slots >= 0),
  match_time TIMESTAMPTZ NOT NULL,
  registration_end_time TIMESTAMPTZ NOT NULL,
  checkin_open_time TIMESTAMPTZ,
  room_release_time TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'registration_open', 'registration_closed', 'checkin_open', 'room_released', 'live', 'result_verification', 'completed', 'cancelled')),
  rules_text TEXT,
  created_by UUID REFERENCES admins(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tournaments_status ON tournaments(status);
CREATE INDEX idx_tournaments_match_time ON tournaments(match_time);
CREATE INDEX idx_tournaments_game ON tournaments(game);
