CREATE TABLE participants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  slot_number INTEGER NOT NULL CHECK (slot_number > 0),
  payment_deducted BOOLEAN DEFAULT false,
  has_checked_in BOOLEAN DEFAULT false,
  is_eliminated BOOLEAN DEFAULT false,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  checked_in_at TIMESTAMPTZ,
  UNIQUE(tournament_id, user_id),
  UNIQUE(tournament_id, slot_number)
);

CREATE INDEX idx_participants_tournament_id ON participants(tournament_id);
CREATE INDEX idx_participants_user_id ON participants(user_id);

CREATE TABLE room_details (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID UNIQUE NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  room_id VARCHAR(100) NOT NULL,
  room_password VARCHAR(100) NOT NULL,
  released_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES admins(id) ON DELETE SET NULL
);
