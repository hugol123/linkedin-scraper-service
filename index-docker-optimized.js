/**
 * LinkedIn Scraper Service - Docker Optimized
 * 
 * This version is optimized to work with the Puppeteer Docker image
 */

const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Rate limiting configuration
const requestQueue = [];
let isProcessing = false;
const RATE_LIMIT_DELAY = parseInt(process.env.SCRAPER_RATE_LIMIT_DELAY) || 3000;

// Proxy configuration
const PROXY_CONFIG = {
  enabled: !!(process.env.PROXY_ENDPOINT && process.env.PROXY_USERNAME),
  endpoint: process.env.PROXY_ENDPOINT,
  username: process.env.PROXY_USERNAME,
  password: process.env.PROXY_PASSWORD
};

/**
 * Process the request queue with rate limiting
 */
async function processQueue() {
  if (isProcessing || requestQueue.length === 0) return;
  
  isProcessing = true;
  console.log(`Processing queue with ${requestQueue.length} requests`);
  
  while (requestQueue.length > 0) {
    const { request, response } = requestQueue.shift();
    
    try {
      console.log(`Processing scrape request for: ${request.url}`);
      const result = await scrapeLinkedInProfile(request);
      
      response.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
      
      console.log(`Successfully processed: ${request.url}`);
    } catch (error) {
      console.error('Scraping error:', error);
      
      response.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
    
    // Rate limiting delay between requests
    if (requestQueue.length > 0) {
      console.log(`Waiting ${RATE_LIMIT_DELAY}ms before next request...`);
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
    }
  }
  
  isProcessing = false;
  console.log('Queue processing completed');
}

/**
 * Main scraping function - optimized for Docker
 */
async function scrapeLinkedInProfile(requestData) {
  const { url, extract_sections = [], use_proxy = false } = requestData;
  
  if (!url || !url.includes('linkedin.com/in/')) {
    throw new Error('Invalid LinkedIn URL provided');
  }
  
  console.log(`Starting scrape for: ${url}`);
  console.log(`Proxy enabled: ${use_proxy && PROXY_CONFIG.enabled}`);
  console.log(`Sections to extract: ${extract_sections.join(', ')}`);
  
  // Docker-optimized browser launch options
  const launchOptions = {
    headless: 'new',
    // Use the Chrome executable from the Docker image
    executablePath: '/usr/bin/google-chrome-stable',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--disable-extensions',
      '--disable-plugins',
      '--disable-images',
      '--disable-javascript',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    ]
  };
  
  // Add proxy configuration if enabled
  if (use_proxy && PROXY_CONFIG.enabled) {
    launchOptions.args.push(`--proxy-server=${PROXY_CONFIG.endpoint}`);
    console.log(`Using proxy: ${PROXY_CONFIG.endpoint}`);
  }
  
  let browser;
  try {
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    
    // Set viewport for consistent rendering
    await page.setViewport({ width: 1366, height: 768 });
    
    // Set additional headers to appear more like a real browser
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    });
    
    // Authenticate proxy if configured
    if (use_proxy && PROXY_CONFIG.enabled) {
      await page.authenticate({
        username: PROXY_CONFIG.username,
        password: PROXY_CONFIG.password
      });
    }
    
    console.log('Navigating to LinkedIn profile...');
    
    // Navigate to LinkedIn profile with timeout
    await page.goto(url, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    // Wait a bit for content to load
    await page.waitForTimeout(2000);
    
    console.log('Extracting profile data...');
    
    // Extract profile data (same extraction logic as before)
    const profileData = await page.evaluate((sections) => {
      const data = {};
      
      try {
        // Basic info extraction - try multiple selectors
        if (sections.includes('basic_info') || sections.length === 0) {
          // Name extraction
          data.name = 
            document.querySelector('h1.text-heading-xlarge')?.textContent?.trim() ||
            document.querySelector('h1')?.textContent?.trim() ||
            document.querySelector('[data-generated-suggestion-target] h1')?.textContent?.trim();
          
          // Headline extraction
          data.headline = 
            document.querySelector('.text-body-medium.break-words')?.textContent?.trim() ||
            document.querySelector('.top-card-layout__headline')?.textContent?.trim() ||
            document.querySelector('[data-generated-suggestion-target] div')?.textContent?.trim();
          
          // Location extraction
          data.location = 
            document.querySelector('.text-body-small.inline.t-black--light.break-words')?.textContent?.trim() ||
            document.querySelector('.top-card-layout__first-subline')?.textContent?.trim() ||
            document.querySelector('[data-test-id="location"]')?.textContent?.trim();
          
          // Connection count
          data.connections = 
            document.querySelector('.top-card-layout__first-subline')?.textContent?.trim() ||
            document.querySelector('[href*="connections"]')?.textContent?.trim();
          
          console.log('Basic info extracted:', { name: data.name, headline: data.headline });
        }
        
        // About/Summary section
        if (sections.includes('basic_info') || sections.length === 0) {
          const aboutSection = 
            document.querySelector('[data-test-id="about"]') ||
            document.querySelector('.core-section-container__content .break-words') ||
            document.querySelector('.summary-section .pv-about__text');
          
          if (aboutSection) {
            data.summary = aboutSection.textContent?.trim();
          }
        }
        
        // Experience extraction
        if (sections.includes('experience') || sections.length === 0) {
          data.experience = [];
          
          const experienceSelectors = [
            '.experience-section .pv-entity__summary-info',
            '.experience .pvs-list__paged-list-item',
            '[data-test-id="experience"] li',
            '.experience-section li'
          ];
          
          for (const selector of experienceSelectors) {
            const experienceItems = document.querySelectorAll(selector);
            if (experienceItems.length > 0) {
              experienceItems.forEach(item => {
                const title = 
                  item.querySelector('.t-16.t-black.t-bold')?.textContent?.trim() ||
                  item.querySelector('h3')?.textContent?.trim() ||
                  item.querySelector('div[aria-hidden="true"]')?.textContent?.trim();
                
                const company = 
                  item.querySelector('.pv-entity__secondary-title')?.textContent?.trim() ||
                  item.querySelector('span.t-14.t-black')?.textContent?.trim() ||
                  item.querySelector('span[aria-hidden="true"]')?.textContent?.trim();
                
                const duration = 
                  item.querySelector('.pv-entity__bullet-item')?.textContent?.trim() ||
                  item.querySelector('[data-test-id="duration"]')?.textContent?.trim();
                
                if (title && company) {
                  data.experience.push({
                    title,
                    company,
                    duration: duration || 'Duration not specified',
                    location: item.querySelector('[data-test-id="location"]')?.textContent?.trim(),
                    description: item.querySelector('[data-test-id="description"]')?.textContent?.trim()
                  });
                }
              });
              break; // Stop after finding items with the first working selector
            }
          }
          
          console.log(`Experience extracted: ${data.experience.length} items`);
        }
        
        // Education extraction
        if (sections.includes('education') || sections.length === 0) {
          data.education = [];
          
          const educationSelectors = [
            '.education-section .pv-entity__summary-info',
            '.education .pvs-list__paged-list-item',
            '[data-test-id="education"] li'
          ];
          
          for (const selector of educationSelectors) {
            const educationItems = document.querySelectorAll(selector);
            if (educationItems.length > 0) {
              educationItems.forEach(item => {
                const school = 
                  item.querySelector('.pv-entity__school-name')?.textContent?.trim() ||
                  item.querySelector('h3')?.textContent?.trim() ||
                  item.querySelector('div[aria-hidden="true"]')?.textContent?.trim();
                
                const degree = 
                  item.querySelector('.pv-entity__degree-name')?.textContent?.trim() ||
                  item.querySelector('span.t-14')?.textContent?.trim();
                
                if (school) {
                  data.education.push({
                    school,
                    degree: degree || 'Degree not specified',
                    duration: item.querySelector('[data-test-id="duration"]')?.textContent?.trim(),
                    description: item.querySelector('[data-test-id="description"]')?.textContent?.trim()
                  });
                }
              });
              break;
            }
          }
          
          console.log(`Education extracted: ${data.education.length} items`);
        }
        
        // Skills extraction
        if (sections.includes('skills') || sections.length === 0) {
          data.skills = [];
          
          const skillSelectors = [
            '.skills-section .pv-skill-category-entity__name',
            '.skills .pvs-list__paged-list-item span',
            '[data-test-id="skills"] span'
          ];
          
          for (const selector of skillSelectors) {
            const skillItems = document.querySelectorAll(selector);
            if (skillItems.length > 0) {
              skillItems.forEach(skill => {
                const skillName = skill.textContent?.trim();
                if (skillName && skillName.length > 1 && !data.skills.includes(skillName)) {
                  data.skills.push(skillName);
                }
              });
              break;
            }
          }
          
          console.log(`Skills extracted: ${data.skills.length} items`);
        }
        
      } catch (extractionError) {
        console.error('Error during data extraction:', extractionError);
        data.extraction_error = extractionError.message;
      }
      
      return data;
    }, extract_sections);
    
    // Add metadata
    profileData.scraped_at = new Date().toISOString();
    profileData.url = url;
    profileData.user_agent = 'LinkedIn-Scraper-Service/1.0';
    
    console.log(`Successfully scraped profile: ${profileData.name || 'Unknown'}`);
    console.log(`Data summary: ${Object.keys(profileData).join(', ')}`);
    
    return profileData;
    
  } catch (error) {
    console.error('Scraping failed:', error);
    throw new Error(`Failed to scrape LinkedIn profile: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// API Routes (same as before)

/**
 * Health check endpoint
 */
app.get('/', (req, res) => {
  res.json({ 
    status: 'healthy',
    service: 'LinkedIn Scraper Service (Docker)',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    queue_length: requestQueue.length,
    proxy_enabled: PROXY_CONFIG.enabled,
    rate_limit_delay: RATE_LIMIT_DELAY
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    queue_length: requestQueue.length,
    proxy_enabled: PROXY_CONFIG.enabled,
    uptime: process.uptime()
  });
});

/**
 * Main scraping endpoint
 */
app.post('/scrape', (req, res) => {
  const { url, extract_sections, use_proxy, wait_time, retry_attempts } = req.body;
  
  console.log('Received scrape request:', { url, extract_sections, use_proxy });
  
  if (!url) {
    return res.status(400).json({
      success: false,
      error: 'LinkedIn URL is required',
      timestamp: new Date().toISOString()
    });
  }
  
  if (!url.includes('linkedin.com/in/')) {
    return res.status(400).json({
      success: false,
      error: 'Invalid LinkedIn URL format. Must be a LinkedIn profile URL.',
      timestamp: new Date().toISOString()
    });
  }
  
  // Add request to queue
  requestQueue.push({
    request: {
      url,
      extract_sections: extract_sections || ['basic_info', 'experience', 'education', 'skills'],
      use_proxy: use_proxy || false,
      wait_time: wait_time || RATE_LIMIT_DELAY,
      retry_attempts: retry_attempts || 2
    },
    response: res
  });
  
  console.log(`Request queued. Queue length: ${requestQueue.length}`);
  
  // Process queue
  processQueue().catch(error => {
    console.error('Queue processing error:', error);
  });
});

/**
 * Queue status endpoint
 */
app.get('/queue', (req, res) => {
  res.json({
    queue_length: requestQueue.length,
    is_processing: isProcessing,
    rate_limit_delay: RATE_LIMIT_DELAY,
    proxy_enabled: PROXY_CONFIG.enabled,
    timestamp: new Date().toISOString()
  });
});

/**
 * Test endpoint for basic connectivity
 */
app.get('/test', (req, res) => {
  res.json({
    message: 'LinkedIn Scraper Service is running! (Docker)',
    environment: {
      node_version: process.version,
      platform: process.platform,
      memory_usage: process.memoryUsage(),
      uptime: process.uptime()
    },
    configuration: {
      port: PORT,
      rate_limit_delay: RATE_LIMIT_DELAY,
      proxy_enabled: PROXY_CONFIG.enabled
    },
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: error.message,
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    available_endpoints: [
      'GET /',
      'GET /health',
      'GET /test',
      'GET /queue',
      'POST /scrape'
    ],
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 LinkedIn Scraper Service (Docker) running on port ${PORT}`);
  console.log(`📊 Proxy enabled: ${PROXY_CONFIG.enabled}`);
  console.log(`⏱️  Rate limit delay: ${RATE_LIMIT_DELAY}ms`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
  console.log(`🔧 Test endpoint: http://localhost:${PORT}/test`);
});

module.exports = app;
