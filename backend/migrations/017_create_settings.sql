CREATE TABLE settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES admins(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default settings
INSERT INTO settings (key, value, description) VALUES
('upi_id', 'arenax@upi', 'Merchant UPI ID displayed on deposit page'),
('qr_image_url', '', 'URL of the UPI QR code image (upload via admin)'),
('min_deposit', '10', 'Minimum deposit amount in INR'),
('max_deposit', '10000', 'Maximum deposit amount in INR'),
('min_withdrawal', '50', 'Minimum withdrawal amount in INR'),
('max_withdrawal', '5000', 'Maximum withdrawal amount in INR'),
('maintenance_mode', 'false', 'Enable maintenance mode'),
('platform_name', 'ArenaX', 'Platform display name');
