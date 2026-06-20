CREATE TABLE rewards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  result_id UUID NOT NULL REFERENCES results(id) ON DELETE CASCADE,
  reward_type VARCHAR(20) NOT NULL CHECK (reward_type IN ('rank', 'kill', 'booyah', 'mvp')),
  amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  credited_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rewards_user_id ON rewards(user_id);
CREATE INDEX idx_rewards_tournament_id ON rewards(tournament_id);
