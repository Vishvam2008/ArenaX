CREATE MATERIALIZED VIEW leaderboard_stats AS
SELECT
  u.id AS user_id,
  u.username,
  u.avatar_url,
  u.ff_uid,
  u.ff_username,
  COUNT(DISTINCT p.tournament_id) AS matches_played,
  COUNT(DISTINCT CASE WHEN r.status = 'approved' AND r.rank = 1 THEN r.id END) AS wins,
  COUNT(DISTINCT CASE WHEN r.status = 'approved' AND r.got_booyah = true THEN r.id END) AS booyahs,
  COALESCE(SUM(CASE WHEN r.status = 'approved' THEN r.kills ELSE 0 END), 0) AS total_kills,
  COALESCE(SUM(CASE WHEN rw.transaction_id IS NOT NULL THEN rw.amount ELSE 0 END), 0) AS total_earnings
FROM users u
LEFT JOIN participants p ON p.user_id = u.id
LEFT JOIN results r ON r.user_id = u.id AND r.tournament_id = p.tournament_id
LEFT JOIN rewards rw ON rw.user_id = u.id
WHERE u.is_active = true AND u.is_banned = false
GROUP BY u.id, u.username, u.avatar_url, u.ff_uid, u.ff_username;

CREATE UNIQUE INDEX ON leaderboard_stats(user_id);
