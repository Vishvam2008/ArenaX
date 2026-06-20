# ArenaX API Reference Documentation

This document describes all API endpoints available on the ArenaX backend server. 
Default Base URL: `http://localhost:5000/api`

All endpoints return responses in the following JSON format:
- **Success**: `{ "success": true, "message": "Success message.", "data": { ... } }`
- **Error**: `{ "success": false, "message": "Error details.", "data": null }`

---

## Authentication Endpoints

### 1. Player Registration
- **Route**: `POST /api/auth/register`
- **Rate Limit**: 10 req/min
- **Payload**:
```json
{
  "username": "superstar9",
  "email": "player@arenax.in",
  "password": "SecurePassword123!",
  "phone": "9876543210",
  "ff_uid": "987654321",
  "ff_username": "AX_SuperStar"
}
```
- **Response (201 Created)**:
```json
{
  "success": true,
  "message": "Registration successful.",
  "data": {
    "user": {
      "id": 101,
      "username": "superstar9",
      "email": "player@arenax.in"
    },
    "token": "JWT_ACCESS_TOKEN_HERE"
  }
}
```

### 2. Player Login
- **Route**: `POST /api/auth/login`
- **Rate Limit**: 10 req/min
- **Payload**:
```json
{
  "email": "player@arenax.in",
  "password": "SecurePassword123!"
}
```
- **Response (200 OK)**:
```json
{
  "success": true,
  "message": "Login successful.",
  "data": {
    "user": {
      "id": 101,
      "username": "superstar9",
      "email": "player@arenax.in",
      "role": "player"
    },
    "token": "JWT_ACCESS_TOKEN_HERE"
  }
}
```
*Note: Sets an `httpOnly`, `sameSite: strict` cookie named `refreshToken` containing the refresh token.*

### 3. Logout
- **Route**: `POST /api/auth/logout`
- **Headers**: `Authorization: Bearer <token>`
- **Response**: Clears the `refreshToken` cookie.

### 4. Silent Token Refresh
- **Route**: `POST /api/auth/refresh`
- **Payload**: None (reads the `refreshToken` cookie)
- **Response (200 OK)**:
```json
{
  "success": true,
  "message": "Token refreshed.",
  "data": {
    "accessToken": "NEW_JWT_ACCESS_TOKEN_HERE"
  }
}
```

---

## User Profile Endpoints

### 1. Get Profile Details
- **Route**: `GET /api/users/profile`
- **Headers**: `Authorization: Bearer <token>`
- **Response (200 OK)**:
```json
{
  "success": true,
  "message": "Profile retrieved successfully.",
  "data": {
    "id": 101,
    "username": "superstar9",
    "email": "player@arenax.in",
    "phone": "9876543210",
    "ff_uid": "987654321",
    "ff_username": "AX_SuperStar",
    "avatar_url": "https://bucket.co/avatars/101/pic.png",
    "wallet_balance": "0.00",
    "stats": {
      "matches_played": 5,
      "wins": 1,
      "booyahs": 1,
      "total_kills": 12,
      "total_earnings": "150.00"
    }
  }
}
```

### 2. Update Profile Settings
- **Route**: `PUT /api/users/profile`
- **Headers**: `Authorization: Bearer <token>`
- **Payload**:
```json
{
  "phone": "9988776655",
  "ff_uid": "12345678",
  "ff_username": "AX_GodSpeed"
}
```

---

## Wallet & Payment Endpoints

### 1. Get Transactions History
- **Route**: `GET /api/wallet/transactions`
- **Query Params**: `page=1`, `limit=10`
- **Headers**: `Authorization: Bearer <token>`

### 2. Submit Manual Deposit Receipt
- **Route**: `POST /api/payments/submit`
- **Headers**: `Authorization: Bearer <token>`
- **Content-Type**: `multipart/form-data`
- **Payload**:
  - `amount`: "100" (INR)
  - `utr_number`: "602312345678" (12-digit UTR)
  - `screenshot`: File binary (deposit screenshot)

---

## Support Tickets Endpoints

### 1. Open Ticket
- **Route**: `POST /api/tickets`
- **Headers**: `Authorization: Bearer <token>`
- **Content-Type**: `multipart/form-data`
- **Payload**:
  - `title`: "Deposit Not Credited"
  - `description`: "I completed payment 2 hours ago but balance is still 0."
  - `category`: "payment"
  - `screenshot`: Optional file attachment

---

## Admin control panel Endpoints

*All routes require an administrator JWT in the header: `Authorization: Bearer <admin_token>`.*

### 1. Admin Login
- **Route**: `POST /api/admin/login`
- **Payload**:
```json
{
  "email": "admin@arenax.in",
  "password": "ChangeMe@12345!"
}
```
- **Response**: Sets `adminRefreshToken` cookie and returns admin details + accessToken.

### 2. Approve Deposit Request
- **Route**: `PUT /api/admin/payments/:id/approve`
- **Response**: Automatically credits user's wallet, records transaction, and notifies the player.

### 3. Reject Deposit Request
- **Route**: `PUT /api/admin/payments/:id/reject`
- **Payload**: `{ "adminNote": "Mismatched UTR number." }`

### 4. Create Tournament
- **Route**: `POST /api/admin/tournaments`
- **Content-Type**: `multipart/form-data`
- **Payload**:
  - `title`: "Grand Squad Tournament"
  - `game`: "free_fire"
  - `matchType`: "squad"
  - `entryFee`: "20"
  - `prizePool`: "1000"
  - `perKillReward`: "5"
  - `booyahReward`: "100"
  - `totalSlots`: "48"
  - `matchTime`: "2026-06-25T18:00:00Z"
  - `registrationEndTime`: "2026-06-25T17:00:00Z"
  - `banner`: File binary
  - `rulesText`: "Instructions text..."
