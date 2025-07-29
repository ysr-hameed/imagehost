# 🚀 SaaS Image Hosting Platform - Complete Architecture Guide

## 📋 Table of Contents
- [System Overview](#system-overview)
- [Architecture Design](#architecture-design)
- [Technology Stack](#technology-stack)
- [Server Components](#server-components)
- [Database Schema](#database-schema)
- [API Documentation](#api-documentation)
- [Setup Instructions](#setup-instructions)
- [Deployment Guide](#deployment-guide)
- [Security Features](#security-features)
- [Monitoring & Analytics](#monitoring--analytics)

---

## 🏗️ System Overview

This is a **modular SaaS image hosting platform** designed for multi-server deployment with the following characteristics:

### Core Architecture Principles
- **Microservices Pattern**: 3 independent servers (Auth, Upload, View)
- **Stateless Design**: Each server can run independently 
- **Horizontal Scalability**: Servers can be deployed across multiple cloud providers
- **API-First**: All functionality accessible via REST APIs
- **Multi-tenant**: User isolation through API keys and JWT tokens

### Business Model
- **Freemium SaaS**: Free tier with upgrade options
- **Usage-based Pricing**: Upload limits, storage quotas, bandwidth limits
- **API Access**: Developers can integrate via API keys
- **CDN Integration**: Global image delivery via Cloudflare

---

## 🏛️ Architecture Design

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   AUTH SERVER   │    │  UPLOAD SERVER  │    │   VIEW SERVER   │
│    Port: 5001   │    │    Port: 5002   │    │    Port: 5003   │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ • User Mgmt     │    │ • File Upload   │    │ • Image Serve   │
│ • Authentication│    │ • Processing    │    │ • Analytics     │
│ • API Keys      │    │ • B2 Storage    │    │ • CDN Cache     │
│ • Admin Panel   │    │ • Thumbnails    │    │ • Embed Widgets │
│ • Account Mgmt  │    │ • Metadata      │    │ • View Tracking │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────────┐
                    │   SHARED SERVICES   │
                    ├─────────────────────┤
                    │ • PostgreSQL DB     │
                    │ • Backblaze B2      │
                    │ • Cloudflare CDN    │
                    │ • Email Service     │
                    │ • Cron Jobs         │
                    └─────────────────────┘
```

### Server Communication Flow
1. **User Registration/Login** → Auth Server → Issues JWT + API Keys
2. **Image Upload** → Upload Server → Validates API Key → Stores in B2 → Updates DB
3. **Image View** → View Server → Serves from CDN → Tracks Analytics
4. **Account Management** → Auth Server → Updates user settings, billing, etc.

---

## 💻 Technology Stack

### Backend Framework
- **Fastify** - High-performance Node.js web framework
- **Node.js 18+** - JavaScript runtime
- **ES Modules** - Modern JavaScript module system

### Database & Storage
- **PostgreSQL** - Primary database for user data, metadata
- **Backblaze B2** - Cloud object storage for images
- **Cloudflare CDN** - Global content delivery network

### Authentication & Security
- **JWT (JSON Web Tokens)** - User session management
- **API Keys** - Application authentication
- **bcryptjs** - Password hashing
- **Rate Limiting** - Abuse prevention

### Image Processing
- **Sharp** - High-performance image processing
- **Automatic Thumbnails** - Multiple size variants
- **Format Support** - JPEG, PNG, GIF, WebP, BMP

### Utilities & Services
- **node-cron** - Scheduled tasks
- **nodemailer** - Email notifications
- **zod** - Input validation
- **uuid** - Unique identifier generation

---

## 🖥️ Server Components

### 1. Auth Server (Port 5001)
**Purpose**: User management, authentication, and administrative functions

**Responsibilities**:
- User registration and login (email/password, OAuth)
- JWT token generation and validation
- API key management (CRUD operations)
- Account settings and profile management
- Scheduled account deletion system
- Admin dashboard and user management
- Usage analytics and reporting
- Email notifications and verification

**Key Routes**:
```
POST /api/v1/auth/register
POST /api/v1/auth/login
GET  /api/v1/auth/google
GET  /api/v1/auth/github
GET  /api/v1/account
PUT  /api/v1/account
POST /api/v1/account/delete-request
GET  /api/v1/api-keys
POST /api/v1/api-keys
GET  /api/v1/admin/users
```

### 2. Upload Server (Port 5002)
**Purpose**: Image upload, processing, and metadata management

**Responsibilities**:
- File upload handling (multipart/form-data)
- Image validation and processing
- Thumbnail generation (multiple sizes)
- Backblaze B2 storage integration
- Upload rate limiting and quota enforcement
- Image metadata extraction and storage
- User upload history and management

**Key Routes**:
```
POST /upload (with API key auth)
GET  /images (list user uploads)
DELETE /images/{id}
GET  /upload/quota
```

### 3. View Server (Port 5003)
**Purpose**: Image delivery, analytics, and public access

**Responsibilities**:
- Image serving with CDN integration
- View analytics and tracking
- Referrer and device detection
- Hotlink protection
- Embeddable widgets
- Public image information API
- Download and direct access URLs

**Key Routes**:
```
GET /i/{image_id}
GET /i/{image_id}?size=thumb
GET /info/{image_id}
GET /stats/{image_id}  
GET /embed/{image_id}
```

---

## 🗄️ Database Schema

### Users Table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT,
  provider TEXT DEFAULT 'form',  -- 'form', 'google', 'github'
  is_admin BOOLEAN DEFAULT false,
  is_verified BOOLEAN DEFAULT false,
  is_blocked BOOLEAN DEFAULT false,
  plan_type TEXT DEFAULT 'free', -- 'free', 'pro', 'enterprise'
  upload_limit_per_day INTEGER DEFAULT 100,
  storage_used BIGINT DEFAULT 0,
  delete_scheduled_for TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### API Keys Table
```sql
CREATE TABLE api_keys (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  key_name TEXT NOT NULL,
  api_key TEXT UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  rate_limit_per_hour INTEGER DEFAULT 1000,
  requests_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Images Table
```sql
CREATE TABLE images (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  filename TEXT NOT NULL,
  original_name TEXT,
  b2_file_id TEXT,
  b2_file_name TEXT,
  mime_type TEXT,
  file_size BIGINT,
  width INTEGER,
  height INTEGER,
  views INTEGER DEFAULT 0,
  is_public BOOLEAN DEFAULT true,
  uploaded_at TIMESTAMP DEFAULT NOW()
);
```

### Analytics Tables
```sql
CREATE TABLE image_analytics (
  id UUID PRIMARY KEY,
  image_id UUID REFERENCES images(id),
  viewer_ip TEXT,
  referrer TEXT,
  user_agent TEXT,
  device_type TEXT,
  browser TEXT,
  country TEXT,
  viewed_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE user_usage (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  date DATE,
  uploads_count INTEGER DEFAULT 0,
  views_count INTEGER DEFAULT 0,
  bandwidth_used BIGINT DEFAULT 0
);
```

---

## 🔌 API Documentation

### Authentication Methods

#### 1. JWT Token (User Sessions)
```http
Authorization: Bearer <jwt_token>
Cookie: token=<jwt_token>
```

#### 2. API Key (Application Access)
```http
X-API-Key: ih_<api_key>
```

### Core API Endpoints

#### User Authentication
```http
# Register new user
POST /api/v1/auth/register
Content-Type: application/json
{
  "first_name": "John",
  "last_name": "Doe",
  "username": "johndoe",
  "email": "john@example.com",
  "password": "secure123"
}

# Login user
POST /api/v1/auth/login
Content-Type: application/json
{
  "identifier": "john@example.com",
  "password": "secure123"
}

# OAuth login
GET /api/v1/auth/google
GET /api/v1/auth/github
```

#### Image Upload
```http
POST /upload
X-API-Key: ih_your_api_key
Content-Type: multipart/form-data
Form Data: file=<image_file>

Response:
{
  "success": true,
  "image": {
    "id": "abc123",
    "filename": "abc123.jpg",
    "url": "https://cdn.example.com/abc123.jpg",
    "thumbnail": "https://cdn.example.com/abc123_thumb.jpg",
    "view_url": "http://view-server/i/abc123",
    "metadata": {
      "width": 1920,
      "height": 1080,
      "size": 245760,
      "format": "jpeg"
    }
  }
}
```

#### Image Access
```http
# View image
GET /i/{image_id}
GET /i/{image_id}?size=thumb
GET /i/{image_id}?download=true

# Image information
GET /info/{image_id}
Response:
{
  "id": "abc123",
  "filename": "example.jpg",
  "size": 245760,
  "dimensions": { "width": 1920, "height": 1080 },
  "mime_type": "image/jpeg",
  "views": 1337,
  "uploaded_at": "2024-01-15T10:30:00Z"
}
```

#### Account Management
```http
# Get account details
GET /api/v1/account
Authorization: Bearer <token>

# Update account
PUT /api/v1/account
Authorization: Bearer <token>
Content-Type: application/json
{
  "first_name": "John",
  "username": "john_updated"
}

# Request account deletion (7-day grace period)
POST /api/v1/account/delete-request
Authorization: Bearer <token>
```

#### API Key Management
```http
# List API keys
GET /api/v1/api-keys
Authorization: Bearer <token>

# Create API key
POST /api/v1/api-keys
Authorization: Bearer <token>
Content-Type: application/json
{
  "key_name": "My App",
  "rate_limit_per_hour": 1000
}

# Delete API key
DELETE /api/v1/api-keys/{key_id}
Authorization: Bearer <token>
```

### Rate Limits by Plan

| Plan | Uploads/Day | API Requests/Hour | Storage | Bandwidth/Month |
|------|-------------|-------------------|---------|-----------------|
| Free | 100 | 1,000 | 1GB | 10GB |
| Pro | 1,000 | 5,000 | 50GB | 500GB |
| Enterprise | 10,000 | 20,000 | 500GB | 5TB |

---

## ⚙️ Setup Instructions

### Prerequisites
- Node.js 18+ installed
- PostgreSQL database (for Replit: add from Tools → Database)
- Backblaze B2 account
- Cloudflare account (optional but recommended)

### Replit Setup (Recommended)
1. **Add PostgreSQL Database**: 
   - Click "Tools" in the left sidebar
   - Click "Database" 
   - Click "Create Database"
   - This automatically sets up DATABASE_URL environment variable
2. **Install Dependencies**: Run `npm install` in the Shell  
3. **Start the Application**: Use the Run button or `npm run dev`
4. **Access Services**:
   - Auth Server: `https://your-repl-name.your-username.repl.co:5001`
   - Upload Server: `https://your-repl-name.your-username.repl.co:5002` 
   - View Server: `https://your-repl-name.your-username.repl.co:5003`

### 1. Environment Configuration

Create `.env` file:
```env
# Database
DATABASE_URL=postgresql://user:pass@host:port/db

# Security
JWT_SECRET=your-super-secret-jwt-key-32-chars-min
COOKIE_SECRET=your-cookie-secret-key
CRON_SECRET_TOKEN=your-cron-cleanup-token

# Server URLs
FRONTEND_URL=http://localhost:5173
AUTH_SERVER_URL=http://localhost:5001
UPLOAD_SERVER_URL=http://localhost:5002
VIEW_SERVER_URL=http://localhost:5003

# Backblaze B2
B2_APPLICATION_KEY_ID=your_key_id
B2_APPLICATION_KEY=your_key
B2_BUCKET_ID=your_bucket_id
B2_BUCKET_NAME=your-bucket-name

# OAuth (Optional)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_secret
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_secret

# Email (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=your_password

# Cloudflare (Optional)
CLOUDFLARE_ZONE_ID=your_zone_id
CLOUDFLARE_API_TOKEN=your_token
CDN_BASE_URL=https://your-cdn.com
```

### 2. Database Setup
```bash
# Install dependencies
npm install

# Run database schema
psql $DATABASE_URL < src/config/database.sql
```

### 3. Development Mode

**Option A: All servers together**
```bash
npm run dev
```

**Option B: Individual servers**
```bash
# Terminal 1 - Auth Server
npm run auth-server

# Terminal 2 - Upload Server
npm run upload-server

# Terminal 3 - View Server
npm run view-server
```

### 4. Server Access
- Auth Server: http://localhost:5001
- Upload Server: http://localhost:5002  
- View Server: http://localhost:5003

---

## 🚀 Replit Deployment Guide

### Single Repl Deployment (Development)
1. Import this repository to Replit
2. Set environment variables in Secrets panel
3. Enable PostgreSQL from Tools panel
4. Run with `npm run dev`

### Multi-Server Production Deployment

#### Step 1: Create 3 Separate Repls
1. **Auth Repl**: Clone repo, set SERVER_MODE=auth
2. **Upload Repl**: Clone repo, set SERVER_MODE=upload  
3. **View Repl**: Clone repo, set SERVER_MODE=view

#### Step 2: Configure Each Repl

**Auth Server Repl**:
```bash
# Set in Secrets
SERVER_MODE=auth
DATABASE_URL=your_db_url
JWT_SECRET=your_secret
GOOGLE_CLIENT_ID=your_id
GITHUB_CLIENT_ID=your_id
SMTP_HOST=your_smtp

# Update package.json scripts
"start": "node src/servers/auth-server.js"
```

**Upload Server Repl**:
```bash
# Set in Secrets  
SERVER_MODE=upload
DATABASE_URL=your_db_url
B2_APPLICATION_KEY_ID=your_key
B2_APPLICATION_KEY=your_secret
B2_BUCKET_ID=your_bucket

# Update package.json scripts
"start": "node src/servers/upload-server.js"
```

**View Server Repl**:
```bash
# Set in Secrets
SERVER_MODE=view  
DATABASE_URL=your_db_url
CLOUDFLARE_ZONE_ID=your_zone
CDN_BASE_URL=your_cdn_url

# Update package.json scripts
"start": "node src/servers/view-server.js"
```

#### Step 3: Update Server URLs
Update cross-server communication URLs in each Repl's secrets:
```bash
AUTH_SERVER_URL=https://your-auth-repl.replit.app
UPLOAD_SERVER_URL=https://your-upload-repl.replit.app  
VIEW_SERVER_URL=https://your-view-repl.replit.app
```

#### Step 4: Deploy
1. Deploy each Repl using the Deployments tab
2. Test endpoints with provided URLs
3. Configure custom domains if needed

---

## 🔒 Security Features

### Authentication & Authorization
- **Multi-factor Auth**: Email/password + OAuth (Google, GitHub)
- **JWT Tokens**: Secure session management with HTTP-only cookies
- **API Key System**: Rate-limited application access
- **Role-based Access**: Admin vs regular user permissions

### Data Protection
- **Password Hashing**: bcrypt with salt rounds
- **SQL Injection Prevention**: Parameterized queries
- **XSS Protection**: Input sanitization and validation
- **CORS Configuration**: Whitelisted origins only

### Rate Limiting & Abuse Prevention
- **Per-user Rate Limits**: Based on subscription plan
- **IP-based Throttling**: Prevent spam and abuse  
- **File Type Validation**: Only allow image formats
- **Size Limits**: Configurable max file sizes
- **Hotlink Protection**: Referrer-based access control

### Privacy & Compliance
- **Account Deletion**: 7-day grace period with full data removal
- **Data Retention**: Configurable analytics retention periods
- **GDPR Ready**: User data export and deletion capabilities

---

## 📊 Monitoring & Analytics

### Built-in Analytics
- **Image Views**: Track unique and total views per image
- **User Behavior**: Device types, browsers, geographic data
- **Referrer Tracking**: See where traffic originates
- **API Usage**: Monitor request patterns and quotas
- **Storage Metrics**: Track usage per user and globally

### Health Monitoring
```bash
# Server health checks
GET /health

Response:
{
  "status": "ok",
  "service": "auth-server",
  "time": "2024-01-15T10:30:00Z"
}
```

### Automated Maintenance
- **Daily Cleanup**: Remove scheduled accounts and orphaned files
- **Usage Reset**: Reset daily upload counters at midnight
- **Analytics Pruning**: Remove old analytics data
- **Cron Job Monitoring**: Track cleanup job success/failure

---

## 🛠️ Troubleshooting

### Common Issues

#### Database Connection Errors
```bash
Error: connect ECONNREFUSED 127.0.0.1:5432
```
**Solution**: Enable PostgreSQL in Replit Tools panel or verify DATABASE_URL

#### Missing Dependencies
```bash
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'jsonwebtoken'
```
**Solution**: Run `npm install` to install all dependencies

#### CORS Errors
**Solution**: Verify FRONTEND_URL and server URLs are correctly set in environment

#### Rate Limit Issues
**Solution**: Check API key rate limits and user plan quotas

### Debug Mode
Set `NODE_ENV=development` for detailed error logging and stack traces.

---

## 📈 Scaling Considerations

### Horizontal Scaling
- Each server can be replicated independently
- Database connection pooling handles concurrent requests
- Stateless design allows load balancing

### Performance Optimization
- CDN caching for image delivery
- Database indexing on frequently queried fields
- Image processing with Sharp (optimized C++ bindings)
- Connection pooling and query optimization

### Storage Scaling
- Backblaze B2 handles unlimited storage
- Automatic thumbnail generation reduces bandwidth
- Optional Cloudflare CDN for global distribution

---

## 🔄 API Usage Examples

### JavaScript/Node.js Client
```javascript
const API_KEY = 'ih_your_api_key_here'
const UPLOAD_SERVER = 'https://your-upload-server.replit.app'

// Upload image
const formData = new FormData()
formData.append('file', imageFile)

const response = await fetch(`${UPLOAD_SERVER}/upload`, {
  method: 'POST',
  headers: {
    'X-API-Key': API_KEY
  },
  body: formData
})

const result = await response.json()
console.log('Uploaded:', result.image.url)
```

### cURL Examples
```bash
# Upload image
curl -X POST "https://upload-server.replit.app/upload" \
  -H "X-API-Key: ih_your_key" \
  -F "file=@image.jpg"

# Get account info  
curl -X GET "https://auth-server.replit.app/api/v1/account" \
  -H "Authorization: Bearer your_jwt_token"

# View image
curl -X GET "https://view-server.replit.app/i/abc123"
```

---
# 🚀 SaaS Image Hosting Platform

A modern, scalable image hosting platform built with Fastify and PostgreSQL, featuring multi-server architecture, CDN integration, and comprehensive analytics.

## 🏗️ Architecture Overview

This platform uses a **microservices architecture** with three specialized servers:

### Server Architecture
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Auth Server   │    │  Upload Server  │    │   View Server   │
│    Port 5001    │    │    Port 5002    │    │    Port 5003    │
│                 │    │                 │    │                 │
│ • Authentication│    │ • File Uploads  │    │ • Image Serving │
│ • User Management│    │ • Image Process │    │ • Analytics     │
│ • API Keys      │    │ • Storage (B2)  │    │ • Public Access │
│ • Admin Panel   │    │ • Rate Limiting │    │ • Embed Widgets │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   PostgreSQL    │
                    │    Database     │
                    │                 │
                    │ • Users         │
                    │ • Images        │
                    │ • Analytics     │
                    │ • Settings      │
                    └─────────────────┘
```

This README provides complete architectural understanding for AI systems to comprehend the full platform structure, deployment options, and implementation details. The modular design allows each component to be understood and deployed independently while maintaining system cohesion.