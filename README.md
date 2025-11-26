# Instagram Automation SaaS - Backend API

A comprehensive backend API for automating Instagram interactions including comment-to-DM automation, keyword monitoring, and response management.

## 🚀 Features

- **Instagram Integration**: OAuth-based Instagram Business API integration
- **Automation Engine**: Comment monitoring, keyword matching, and automated DM responses
- **Webhook System**: Real-time Instagram event processing
- **Authentication**: Secure session-based auth with Better Auth
- **Multi-platform Support**: Extensible architecture for Instagram, TikTok, Twitter, and more

## 📋 Table of Contents

- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Database Schema](#database-schema)
- [API Documentation](#api-documentation)
- [Webhook Configuration](#webhook-configuration)
- [Development](#development)
- [Deployment](#deployment)

## 🛠 Tech Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: Better Auth
- **Social APIs**: Instagram Graph API
- **Security**: bcrypt, cookie-parser, CORS

## 📦 Prerequisites

- Node.js 18+ and npm/yarn
- PostgreSQL 14+
- Instagram Business Account
- Facebook Developer App with Instagram Graph API access

## 💻 Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd backend
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Initialize database**
```bash
npx prisma generate
npx prisma db push
```

5. **Start development server**
```bash
npm run dev
```

## 🔐 Environment Variables

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/instagram_automation"

# Better Auth
BETTER_AUTH_SECRET="your-32-character-secret-key"
BETTER_AUTH_URL="http://localhost:4000"

# Frontend
FRONTEND_URL="http://localhost:3000"

# Instagram API
INSTAGRAM_APP_ID="your-facebook-app-id"
INSTAGRAM_APP_SECRET="your-facebook-app-secret"
INSTAGRAM_REDIRECT_URI="http://localhost:4000/api/integrations/instagram/callback"

# Webhook (for production)
INSTAGRAM_VERIFY_TOKEN="your-webhook-verify-token"

# Server
PORT=4000
NODE_ENV=development
```

## 🗄 Database Schema

### Core Models

#### User
User accounts with authentication and plan management.

```prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  emailVerified Boolean   @default(false)
  name          String?
  image         String?
  plan          UserPlan  @default(FREE)
  
  accounts      Account[]
  sessions      Session[]
  automations   Automation[]
  integrations  Integration[]
  keywords      Keyword[]
  responses     AutoResponse[]
}
```

#### Integration
Connected social media accounts.

```prisma
model Integration {
  id            String       @id @default(cuid())
  userId        String
  platform      PlatformType @default(INSTAGRAM)
  username      String?
  accessToken   String?
  refreshToken  String?
  platformId    String?
  isActive      Boolean      @default(true)
  expiresAt     DateTime?
  
  user          User @relation(...)
  automations   Automation[]
  posts         InstagramPost[]
}
```

#### Automation
Automation workflows with triggers and actions.

```prisma
model Automation {
  id                   String            @id
  userId               String
  integrationId        String
  name                 String
  type                 AutomationType    // COMMENT_TO_DM, COMMENT_REPLY, etc.
  status               AutomationStatus  // ACTIVE, PAUSED, etc.
  config               Json
  dailyLimit           Int?
  totalExecutions      Int               @default(0)
  successfulExecutions Int               @default(0)
  
  triggers             AutomationTrigger[]
  logs                 AutomationLog[]
}
```

#### Keyword
Keywords for triggering automations.

```prisma
model Keyword {
  id            String    @id
  userId        String
  keyword       String
  matchType     MatchType @default(CONTAINS)
  isActive      Boolean   @default(true)
  caseSensitive Boolean   @default(false)
}
```

#### AutoResponse
Pre-configured or AI-generated responses.

```prisma
model AutoResponse {
  id              String       @id
  userId          String
  name            String
  responseType    ResponseType @default(CUSTOM)
  customMessage   String?
  aiPrompt        String?
  isActive        Boolean      @default(true)
  useCount        Int          @default(0)
}
```

## 📡 API Documentation

### Authentication

#### Sign Up
```http
POST /api/auth/signup
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123",
  "name": "John Doe"
}
```

#### Sign In
```http
POST /api/auth/signin
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

#### Get Current User
```http
GET /api/users/me
Authorization: Bearer <token>
```

### Integrations

#### Initiate Instagram OAuth
```http
GET /api/integrations/instagram/auth
Authorization: Bearer <token>

Response:
{
  "success": true,
  "authUrl": "https://www.facebook.com/v18.0/dialog/oauth?..."
}
```

#### Get All Integrations
```http
GET /api/integrations
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": [
    {
      "id": "clx...",
      "platform": "INSTAGRAM",
      "username": "my_account",
      "isActive": true,
      "_count": {
        "automations": 3,
        "posts": 25
      }
    }
  ]
}
```

#### Sync Posts
```http
POST /api/integrations/:id/sync
Authorization: Bearer <token>

Response:
{
  "success": true,
  "message": "Posts synced successfully",
  "data": {
    "count": 15,
    "posts": [...]
  }
}
```

### Automations

#### Create Automation
```http
POST /api/automations
Authorization: Bearer <token>
Content-Type: application/json

{
  "integrationId": "clx...",
  "name": "Price Inquiry Auto-Responder",
  "description": "Send DM when users ask about price",
  "config": {
    "triggerType": "comment",
    "keywords": ["price", "cost", "how much"],
    "dmMessage": "Thanks for your interest! Check your DMs for pricing info.",
    "commentReply": "Sent you a DM! 💬"
  },
  "triggers": [
    {
      "triggerType": "POST_COMMENT",
      "postId": "post_id_here",
      "keywordId": "keyword_id_here",
      "responseId": "response_id_here",
      "config": {
        "commentReply": "Sent you a DM! 💬"
      }
    }
  ],
  "dailyLimit": 50,
  "hourlyLimit": 10
}
```

#### Get All Automations
```http
GET /api/automations?status=ACTIVE&type=COMMENT_TO_DM
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": [
    {
      "id": "clx...",
      "name": "Price Inquiry Auto-Responder",
      "type": "COMMENT_TO_DM",
      "status": "ACTIVE",
      "totalExecutions": 45,
      "successfulExecutions": 42,
      "integration": {
        "platform": "INSTAGRAM",
        "username": "my_shop"
      },
      "triggers": [...]
    }
  ],
  "count": 1
}
```

#### Update Automation
```http
PUT /api/automations/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Name",
  "config": {
    "triggerType": "comment",
    "keywords": ["price", "cost"],
    "dmMessage": "Updated message"
  },
  "dailyLimit": 100
}
```

#### Toggle Automation Status
```http
PATCH /api/automations/:id/toggle
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "ACTIVE"
}
```

#### Get Automation Logs
```http
GET /api/automations/:id/logs?limit=50&status=SUCCESS
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": [
    {
      "id": "log_id",
      "action": "SENT_DM",
      "targetUsername": "user123",
      "status": "SUCCESS",
      "responseText": "Thanks for your interest!",
      "executedAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

#### Get Automation Statistics
```http
GET /api/automations/stats
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "totalAutomations": 5,
    "activeAutomations": 3,
    "pausedAutomations": 2,
    "totalExecutions": 245,
    "recentLogs": [...]
  }
}
```

#### Get Recent Activity
```http
GET /api/automations/activity?limit=20
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": [
    {
      "id": "log_id",
      "automationId": "auto_id",
      "automationName": "Price Inquiry",
      "type": "COMMENT_TO_DM",
      "status": "SUCCESS",
      "timestamp": "2024-01-15T10:30:00Z",
      "details": "Sent DM to @user123"
    }
  ]
}
```

### Keywords

#### Create Keyword
```http
POST /api/keywords
Authorization: Bearer <token>
Content-Type: application/json

{
  "keyword": "price",
  "matchType": "CONTAINS",
  "caseSensitive": false,
  "isActive": true
}
```

#### Get All Keywords
```http
GET /api/keywords
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": [
    {
      "id": "keyword_id",
      "keyword": "price",
      "matchType": "CONTAINS",
      "isActive": true
    }
  ]
}
```

### Responses

#### Create Response Template
```http
POST /api/responses
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Price Inquiry Response",
  "responseType": "CUSTOM",
  "customMessage": "Thanks for asking! Please check your DMs for pricing details.",
  "isActive": true
}
```

#### Get All Responses
```http
GET /api/responses
Authorization: Bearer <token>
```

## 🔗 Webhook Configuration

### Setting Up Instagram Webhooks

1. **Configure Facebook App**
   - Go to Facebook Developers Console
   - Add Webhooks product to your app
   - Subscribe to Instagram topic

2. **Set Callback URL**
   ```
   Callback URL: https://yourdomain.com/webhooks/instagram
   Verify Token: your-webhook-verify-token
   ```

3. **Subscribe to Fields**
   - `comments`
   - `messages`
   - `mentions`

### Webhook Verification (GET)
Instagram will send a GET request to verify your webhook:

```http
GET /webhooks/instagram?hub.mode=subscribe&hub.verify_token=your-token&hub.challenge=123456

Response: 123456 (echo the challenge)
```

### Webhook Events (POST)
Instagram sends POST requests for real-time updates:

```json
{
  "object": "instagram",
  "entry": [
    {
      "id": "instagram_account_id",
      "time": 1234567890,
      "changes": [
        {
          "field": "comments",
          "value": {
            "id": "comment_id",
            "text": "What's the price?",
            "from": {
              "id": "user_id",
              "username": "john_doe"
            },
            "media": {
              "id": "media_id"
            }
          }
        }
      ]
    }
  ]
}
```

## 🔧 Development

### Project Structure
```
backend/
├── src/
│   ├── controllers/       # Request handlers
│   │   ├── auth.controller.ts
│   │   ├── automation.controller.ts
│   │   ├── integration.controller.ts
│   │   ├── keyword.controller.ts
│   │   ├── response.controller.ts
│   │   └── webhook.controller.ts
│   ├── middleware/        # Express middleware
│   │   └── auth.middleware.ts
│   ├── routes/           # API routes
│   │   ├── auth.routes.ts
│   │   ├── automation.routes.ts
│   │   ├── integration.routes.ts
│   │   ├── keyword.routes.ts
│   │   ├── response.routes.ts
│   │   ├── user.routes.ts
│   │   └── webhook.routes.ts
│   ├── services/         # Business logic
│   │   ├── automation-engine.service.ts
│   │   └── instagram.service.ts
│   ├── lib/             # Utilities
│   │   ├── auth.ts
│   │   └── prisma.ts
│   ├── app.ts           # Express app setup
│   └── server.ts        # Server entry point
├── prisma/
│   └── schema.prisma    # Database schema
├── .env                 # Environment variables
├── package.json
└── tsconfig.json
```

### Running Tests
```bash
npm run test
```

### Database Migrations
```bash
# Create migration
npx prisma migrate dev --name your_migration_name

# Apply migrations
npx prisma migrate deploy

# Reset database (development only)
npx prisma migrate reset
```

### Prisma Studio
View and edit your database:
```bash
npx prisma studio
```

## 🚀 Deployment

### Railway / Render / Heroku

1. **Set environment variables**
   - Add all variables from `.env`
   - Ensure `DATABASE_URL` points to production database

2. **Build command**
   ```bash
   npm run build
   ```

3. **Start command**
   ```bash
   npm start
   ```

### Docker Deployment

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npx prisma generate
RUN npm run build

EXPOSE 4000

CMD ["npm", "start"]
```

### Important Production Settings

1. **Enable CORS for your frontend domain**
   ```typescript
   cors({
     origin: process.env.FRONTEND_URL,
     credentials: true
   })
   ```

2. **Set secure session cookies**
   ```typescript
   session: {
     expiresIn: 60 * 60 * 24 * 7,
     updateAge: 60 * 60 * 24
   }
   ```

3. **Configure webhook URL**
   - Update Instagram webhook callback to production URL
   - Use HTTPS only

## 🔒 Security Best Practices

- Never commit `.env` file
- Use strong `BETTER_AUTH_SECRET` (32+ characters)
- Rotate Instagram access tokens regularly
- Implement rate limiting for API endpoints
- Validate and sanitize all user inputs
- Use HTTPS in production
- Keep dependencies updated

## 📊 Monitoring & Logging

The API logs important events:

```typescript
console.log('✅ Integration saved:', integration.id);
console.log('🔄 Processing webhook for:', mediaId);
console.error('❌ Failed to send DM:', error);
```

Consider integrating:
- Sentry for error tracking
- LogRocket for session replay
- DataDog for performance monitoring

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License.

## 🆘 Support

For issues and questions:
- Open an issue on GitHub
- Contact: support@yourcompany.com
- Documentation: https://docs.yourcompany.com

## 🗺 Roadmap

- [ ] AI-powered response generation
- [ ] Multi-language support
- [ ] Advanced analytics dashboard
- [ ] Bulk automation management
- [ ] Custom webhook integrations
- [ ] A/B testing for responses
- [ ] Scheduled automation campaigns

---

Built with ❤️ using Node.js, Express, Prisma, and Better Auth
