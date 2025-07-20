# Naver SmartStore Scraper API

A sophisticated, undetectable web scraper for Naver SmartStore products that extracts `__PRELOADED_STATE__` data using advanced anti-detection techniques.

## 🚀 Features

- **REST API**: Simple HTTP endpoint for single product scraping
- **Batch Mode**: Process multiple product URLs
- **Proxy Rotation**: Round-robin and random proxy selection
- **Request Throttling**: Rate limiting with p-limit and random delays
- **Anti-Detection**: Puppeteer stealth plugins and fingerprint rotation
- **Cookie Management**: Automatic NA_CO and X-Wtm-Cpt-Tk cookie handling
- **Error Handling**: Retry mechanism with CAPTCHA detection
- **Logging**: Comprehensive Winston-based logging system
- **Modular Architecture**: Clean SOLID principles implementation

## 📋 Prerequisites

- Node.js 18+ 
- npm or yarn
- Proxy servers (optional but recommended)

## 🛠️ Installation

1. **Clone and install dependencies:**
   ```bash
   git clone <repository-url>
   cd naver-task
   npm install
   ```

2. **Create environment configuration:**
   ```bash
   # Create .env file
   echo "PROXIES=your_proxy_here:port" > .env
   echo "HEADLESS=true" >> .env
   echo "PORT=3001" >> .env
   echo "MAX_CONCURRENT=1" >> .env
   ```

## 🎯 Usage

### API Mode (Default)

Start the REST API server:

```bash
npm start
# or
node index.js api
```

**API Endpoint:**
```
GET /naver?productUrl=https://smartstore.naver.com/{store}/products/{product_id}
```

**Example Request:**
```bash
curl "http://localhost:3001/naver?productUrl=https://smartstore.naver.com/rainbows9030/products/11102379008"
```

**Example Response:**
```json
{
  "preloadedState": {
    // Complete __PRELOADED_STATE__ data from the product page
  }
}
```

### Batch Mode

Process multiple product URLs:

```bash
node index.js batch
```

**Note:** Currently configured as placeholder. Add product URLs to `src/main.js` for batch processing.

## ⚙️ Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PROXIES` | `""` | Comma-separated list of proxies |
| `HEADLESS` | `false` | Browser headless mode |
| `PORT` | `3001` | API server port |
| `MAX_CONCURRENT` | `1` | Maximum concurrent requests |

### Proxy Format

```bash
# Without authentication
PROXIES=192.168.1.1:8080,10.0.0.1:3128

# With authentication
PROXIES=proxy.example.com:8080:user:pass,another.proxy.com:3128:user2:pass2
```

## 🔧 System Architecture

### Core Components

```
src/
├── naverProductScraper.js  # Main scraper logic
├── api.js                  # REST API server
└── main.js                 # Batch processing orchestrator

config/
├── browser.js              # Browser configuration
└── proxy.js                # Proxy management

utils/
├── logger.js               # Winston logging
└── delay.js                # Random delay utilities
```

### Scraping Flow

1. **Cookie Initialization** (if needed):
   - Navigate to Naver.com
   - Click shopping link
   - Simulate human behavior (scroll, mouse movements)
   - Extract cookies (X-Wtm-Cpt-Tk, NA_CO)

2. **Product Scraping**:
   - Load cookies from file
   - Navigate to product URL with shopping referer
   - Extract `__PRELOADED_STATE__` from page
   - Return JSON data

3. **Error Handling**:
   - Retry mechanism (3 attempts)
   - CAPTCHA detection
   - Error page detection
   - Proxy rotation on failure

## 🛡️ Anti-Detection Features

### Browser Stealth
- **Puppeteer Stealth Plugin**: Hides automation indicators
- **UA Anonymization**: Random user agent rotation
- **Fingerprint Rotation**: Random viewport and user agent
- **Resource Blocking**: Disables images, CSS, fonts for performance

### Request Management
- **Proxy Rotation**: Round-robin and random selection
- **Rate Limiting**: Configurable concurrent request limits
- **Random Delays**: 1-5 second delays between requests
- **Referer Management**: Proper referer headers

### Human Behavior Simulation
- **Mouse Movements**: Random mouse cursor movements
- **Scrolling**: Natural page scrolling patterns
- **Click Simulation**: Random safe element clicks
- **Dropdown Handling**: Automatic overlay/dropdown closing

## 📊 Logging

The system uses Winston for comprehensive logging:

- **File Logging**: All logs saved to files
- **Console Logging**: Real-time terminal output
- **Level-based**: Error, Warn, Info, Debug levels
- **Structured**: Timestamp, level, and detailed messages

## 🚨 Error Handling

### Automatic Retry
- **3 Attempts**: Failed requests automatically retried
- **Exponential Backoff**: Increasing delays between retries
- **Proxy Rotation**: Switch proxy on failure

### Error Detection
- **CAPTCHA Detection**: Identifies and handles CAPTCHA pages
- **Error Page Detection**: Detects various error pages
- **Blocked Page Detection**: Identifies blocked/restricted pages

### Response Validation
- **URL Validation**: Ensures valid Naver SmartStore URLs
- **Data Validation**: Verifies `__PRELOADED_STATE__` extraction
- **Cookie Validation**: Checks cookie freshness and validity

## 🔄 Proxy Management

### Proxy Selection Strategies
- **Round-robin**: Sequential proxy rotation
- **Random**: Random proxy selection
- **Index-based**: Proxy selection by index

### Proxy Validation
- **Format Validation**: Checks proxy string format
- **Length Validation**: Ensures proper proxy string length
- **Pattern Matching**: Validates proxy patterns

## 📈 Performance

### Optimization Features
- **Resource Blocking**: Disables unnecessary resources
- **Connection Pooling**: Efficient browser instance management
- **Memory Management**: Automatic browser cleanup
- **Concurrent Processing**: Parallel request handling

### Expected Performance
- **Latency**: 3-8 seconds per request
- **Success Rate**: >95% with proper proxy configuration
- **Concurrent Capacity**: Configurable (default: 1)
- **Uptime**: Stable for extended periods

## 🛠️ Development

### Project Structure
```
naver-task/
├── src/                    # Source code
│   ├── naverProductScraper.js
│   ├── api.js
│   └── main.js
├── config/                 # Configuration
│   ├── browser.js
│   └── proxy.js
├── utils/                  # Utilities
│   ├── logger.js
│   └── delay.js
├── index.js               # Entry point
├── package.json           # Dependencies
└── README.md              # Documentation
```

### Key Dependencies
- `puppeteer-extra`: Enhanced Puppeteer with plugins
- `puppeteer-extra-plugin-stealth`: Anti-detection plugin
- `puppeteer-extra-plugin-anonymize-ua`: User agent anonymization
- `p-limit`: Request rate limiting
- `winston`: Logging framework
- `express`: HTTP server

## 🚀 Deployment

### Local Development
```bash
npm start
```

### Production
```bash
# Set production environment
export NODE_ENV=production
export HEADLESS=true
export MAX_CONCURRENT=3

# Start server
npm start
```

### Docker (if needed)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3001
CMD ["npm", "start"]
```

## 📝 License

This project is for educational purposes. Please ensure compliance with Naver's terms of service and applicable laws.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## ⚠️ Disclaimer

This tool is designed for educational and research purposes. Users are responsible for ensuring compliance with:
- Naver's Terms of Service
- Applicable laws and regulations
- Rate limiting and respectful usage

Use responsibly and ethically! 🎯 