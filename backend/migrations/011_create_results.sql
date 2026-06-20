CREATE TABLE results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rank INTEGER CHECK (rank > 0),
  kills INTEGER DEFAULT 0 CHECK (kills >= 0),
  got_booyah BOOLEAN DEFAULT false,
  is_mvp BOOLEAN DEFAULT false,
  match_screenshot_url TEXT,
  kill_screenshot_url TEXT,
  result_screenshot_url TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note TEXT,
  reviewed_by UUID REFERENCES admins(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tournament_id, user_id)
);

CREATE INDEX idx_results_tournament_id ON results(tournament_id);
CREATE INDEX idx_results_status ON results(status);
