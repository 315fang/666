# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

分佣云库存微商小程序 (S2B2C Digital Franchise System) - A WeChat mini-program distribution system with multi-level commission, cloud inventory management, and order processing.

## Tech Stack

- **Mini Program**: WeChat native framework with custom Observable Store
- **Backend**: Node.js + Express + Sequelize + MySQL + JWT + Swagger
- **Admin UI**: Vue 3 + Element Plus + Vite + Pinia

## Key Commands

### Backend
```bash
cd backend
npm install
npm run dev      # Development
npm start        # Production
```

### Admin UI
```bash
cd admin-ui
npm install
npm run dev      # http://localhost:5173/admin/
npm run build    # Production build
```

### Mini Program
Open in WeChat DevTools, configure API URL in `miniprogram/config/env.js`

## Project Structure

```
jingxiang_wl/
├── admin-ui/                # Admin dashboard (Vue 3)
│   └── src/
├── backend/                 # API server (Node.js + Express)
│   ├── controllers/         # 40+ controllers
│   ├── models/             # 50+ Sequelize models
│   ├── routes/             # API routes
│   ├── services/           # Business logic
│   └── ...
├── miniprogram/            # WeChat mini-program
│   ├── components/        # 13 reusable components
│   ├── pages/              # 40+ pages
│   ├── store/              # Observable state management
│   └── utils/              # Request, cache, helpers
└── docker/                 # Docker configuration
```

## Core Features

- Multi-level distribution (Member → Team Leader → Agent)
- Cloud inventory management for agents
- Order system with refund handling
- Marketing: lottery, group-buy, price-cut, coupons
- Commission calculation (fixed amount or percentage)
- AI assistant integration

## Development Notes

- Use `project.private.config.json` for local WeChat appid
- Backend API docs: `http://localhost:3000/api-docs`
- All endpoints prefixed with `/api/`
