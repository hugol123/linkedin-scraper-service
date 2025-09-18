# Use an optimized Node.js image with Chrome pre-installed
FROM ghcr.io/puppeteer/puppeteer:21.5.0

# Set working directory
WORKDIR /app

# Copy package.json first for better Docker layer caching
COPY package.json ./

# Install dependencies using npm install instead of npm ci
RUN npm install --only=production && npm cache clean --force

# Copy application code
COPY . .

# Create a non-root user for security
RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser \
    && mkdir -p /home/pptruser/Downloads \
    && chown -R pptruser:pptruser /home/pptruser \
    && chown -R pptruser:pptruser /app

# Switch to non-root user
USER pptruser

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "index.js"]
