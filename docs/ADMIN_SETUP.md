# Administrator Setup and Onboarding

This document guides new administrators on initializing and setting up the ArenaX Control Panel.

---

## 1. Initial Seeding of Super Admin
To prevent public vulnerabilities in production, ArenaX does **NOT** expose any user-facing signup endpoints for administrators. The first Super Admin must be created using a local database seed script.

1. Configure your local `.env` variables inside the `backend` folder:
   - `SUPER_ADMIN_EMAIL`: Set your starting email (e.g. `admin@arenax.in`)
   - `SUPER_ADMIN_USERNAME`: Set starting username (e.g. `superadmin`)
   - `SUPER_ADMIN_PASSWORD`: Use a strong temporary password (e.g. `ChangeMe@12345!`)
2. Run the seeding tool from the backend root:
   ```bash
   npm run seed
   ```
3. Once completed, clear these temporary values from your `.env` to protect security.

---

## 2. Setting Up Merchant UPI & QR Code
Before opening tournament registrations, the Super Admin must configure the merchant details so players can complete payments.

1. Log in to the administrator panel at: `/public/admin/login.html` using the seeded credentials.
2. Navigate to **Global Settings** from the sidebar.
3. Update the **Static Merchant UPI ID** field with your business UPI address (e.g. `arenax@upi`) and click **Save**.
4. Upload your static UPI payment QR code image using the **Select QR File** field. This image is stored on Supabase Storage and displayed to players on the wallet deposit screen.

---

## 3. Disabling Default Credentials
For security compliance, the seeded Super Admin password must be changed immediately upon first login.
1. As Super Admin, navigate to **User Accounts** or update via settings to override default credentials with a unique credentials pair.
