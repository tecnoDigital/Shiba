# Shiba WhatsApp Bot

This bot integrates multiple commands for WhatsApp, including:

- **IRONPAY** (`!ironpay`): Send payment requests via a configured webhook.

## Environment Variables

Configure the following in your `.env` at project root:

```ini
# OpenAI
OPENAI_API_KEY=your_openai_api_key

# Persistence
PERSISTENCE_TYPE=inmemory|redis|sqlite

# Logging
LOG_LEVEL=info

# Webhooks
WEBHOOK_RETELL=https://your-retell-webhook-url
IRON_PAY_WEBHOOK=https://your-ironpay-webhook-url

# Authorized Numbers for IronPay (comma-separated, no +)
IRON_NUMBERS=5213331843176,521xxxxxxxxxx

# Metrics server
METRICS_PORT=3001

# Redis (if applicable)
REDIS_URL=redis://localhost:6379
```

## Usage

1. Install dependencies: `npm install`
2. Create `.env` with the variables above.
3. Run: `npm start` or `node src/index.js`
4. On WhatsApp, send a private message to the bot:
   - Simple: `!ironpay`
   - Composed: `!ironpay <phone> <amount> <due-date> p` (with optional `p` promotional flag)

The bot will send a JSON payload to `IRON_PAY_WEBHOOK` and reply with success or error notifications.
