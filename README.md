# AI Image Enhancer

Professional AI-powered image upscaling service with modern web interface and reliable cloud storage integration.

## Features

- **AI-Powered Enhancement** - 2x and 4x upscaling using advanced algorithms
- **Drag & Drop Interface** - Intuitive file upload with visual feedback
- **Cloud Storage** - Integrated with Herta file storage for reliable hosting
- **Real-time Processing** - Live status updates during enhancement
- **Mobile Responsive** - Optimized for all devices
- **Fast Processing** - Efficient image enhancement pipeline

## Tech Stack

- **Backend**: Node.js, Express.js
- **Frontend**: Vanilla JavaScript, Tailwind CSS
- **Storage**: Herta Cloud Storage
- **Enhancement**: imglarger.com API
- **Deployment**: Vercel

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Production build
npm start
```

Server runs on `http://localhost:3000`

## API Endpoints

- `POST /api/enhance` - Upload and enhance image
- `GET /api/health` - Service health check

## File Support

- **Formats**: JPEG, PNG, GIF, BMP, WebP, SVG
- **Size Limit**: 10MB maximum
- **Output**: Enhanced image with download/preview options

## Environment

- Node.js 18+
- Memory-based file processing
- Configurable scaling ratios (2x, 4x)

## Deployment

Configured for Vercel with automatic API routing and static file serving.
