# LinkedIn Scraper Service

A cloud-deployed LinkedIn profile scraper service for the ideate-sustainably application.

## Features

- 🚀 Cloud-ready deployment configuration
- 📊 Rate limiting and request queuing
- 🔒 Proxy support for avoiding IP blocks
- 📈 Health monitoring endpoints
- 🛡️ Error handling and retry logic
- 📱 RESTful API interface

## API Endpoints

### Health Check
```
GET /health
```
Returns service health status and metrics.

### Main Scraping
```
POST /scrape
Content-Type: application/json

{
  "url": "https://linkedin.com/in/profile-name",
  "extract_sections": ["basic_info", "experience", "education", "skills"],
  "use_proxy": false
}
```

### Queue Status
```
GET /queue
```
Returns current request queue status.

## Environment Variables

- `PORT` - Server port (default: 3000)
- `SCRAPER_RATE_LIMIT_DELAY` - Delay between requests in ms (default: 3000)
- `PROXY_ENDPOINT` - Proxy server endpoint (optional)
- `PROXY_USERNAME` - Proxy authentication username (optional)
- `PROXY_PASSWORD` - Proxy authentication password (optional)

## Deployment

This service is configured for deployment on Railway, Heroku, or similar platforms.

### Railway Deployment
1. Connect your GitHub repository to Railway
2. Railway will automatically detect and deploy the Node.js application
3. Set environment variables in Railway dashboard
4. Service will be available at the provided Railway URL

### Local Development
```bash
npm install
npm start
```

## Legal Notice

This service is for educational purposes only. Always respect LinkedIn's Terms of Service and robots.txt. Only scrape public profile information with proper consent.
