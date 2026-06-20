CREATE TABLE teams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(8) UNIQUE NOT NULL,
  captain_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  max_members INTEGER NOT NULL DEFAULT 4 CHECK (max_members IN (1, 2, 4)),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE team_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_team_members_team_id ON team_members(team_id);
