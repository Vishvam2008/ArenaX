CREATE TABLE apk_versions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  version_name VARCHAR(20) NOT NULL,
  version_code INTEGER NOT NULL UNIQUE,
  apk_url TEXT NOT NULL,
  changelog TEXT,
  is_latest BOOLEAN DEFAULT false,
  uploaded_by UUID REFERENCES admins(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
