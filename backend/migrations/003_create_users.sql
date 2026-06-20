CREATE TABLE users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(15) UNIQUE NOT NULL,
  ff_uid VARCHAR(50) UNIQUE NOT NULL,
  ff_username VARCHAR(100) NOT NULL,
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  is_banned BOOLEAN DEFAULT false,
  email_verified BOOLEAN DEFAULT false,
  password_reset_token VARCHAR(255),
  password_reset_expires TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_ff_uid ON users(ff_uid);
CREATE INDEX idx_users_username ON users(username);
