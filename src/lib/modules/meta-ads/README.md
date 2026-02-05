# Meta Ads Control Module

## Purpose
This module provides a deterministic Recommendation Engine for Meta Ads management, integrating read-only data from Zoho CRM and Meta Ads.

## Architecture
- **Domain**: Pure business logic, rules, and templates.
- **Infrastructure**: Read-only adapters for external services.
- **Application**: Orchestration, governance, and auditing.

## Constraints
- No side effects in the Rules Engine.
- No timestamps generated in the Domain Layer.
- Strict versioning of Configuration and Rules.

## Setup Guide

### 1. Enable Production Adapters
Modify your `.env.local` file:
```bash
USE_REAL_ADAPTERS=true
```

### 2. Get Access Token and Account ID

#### META_ACCESS_TOKEN
1. Go to [Meta for Developers](https://developers.facebook.com/).
2. Create or Select an App.
3. Add "Marketing API" product.
4. Go to **Tools > Graph API Explorer**.
5. Select your App and "Get Token" -> "Get User Access Token".
6. Select permissions: `ads_read`, `read_insights`.
7. Click "Generate Access Token".

*Note: For long-term use, you should generate a System User Token in Business Manager.*

#### META_AD_ACCOUNT_ID
1. Go to [Ads Manager](https://adsmanager.facebook.com/).
2. Look at the URL or the Campaign selector dropdown.
3. The ID usually starts with `act_` (e.g., `act_123456789`).
4. Copy only the part **after** `act_` (or include it, the adapter handles it depending on implementation, but standard is `act_1234...`).

#### Configure .env.local
```bash
META_ACCESS_TOKEN=EAAB...
META_AD_ACCOUNT_ID=act_123456...
```
