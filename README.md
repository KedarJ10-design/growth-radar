# ⚡ Growth Radar

A highly secure, AI-powered personal productivity and habit-tracking system. Growth Radar helps you track your daily activities across custom dimensions, maintain streaks, and uses AI to generate optimized daily schedules based on your goals and gaps in your progress.

## 🚀 Features

- **Personal Dimensions:** Track any area of your life (e.g., Coding, Fitness, Career, Social).
- **Daily Logging & Streaks:** Keep yourself accountable with daily activity logging.
- **AI Schedule Generator:** Powered by Llama 3 (via Groq), it generates highly personalized daily schedules by analyzing your recent activity gaps and daily goals.
- **Google Calendar Sync:** Instantly export your AI-generated schedule directly to your Google Calendar.
- **PIN Protection:** The entire interface and backend API are locked behind a secure PIN gate.
- **Cloud Database:** Backed by Turso (Cloud SQLite) for fast, reliable edge storage.
- **Data Export:** Download your entire history in CSV or Excel format.

## 🛠️ Tech Stack

- **Frontend:** React + Vite
- **Backend:** Node.js + Express
- **Database:** LibSQL / Turso Cloud (with local SQLite fallback)
- **AI Integration:** Langchain + Groq SDK
- **Security:** Helmet, express-rate-limit, HTTP-only Auth Cookies

## 💻 Running Locally

### Prerequisites
1. Node.js (v18+)
2. API Keys for Groq and Google OAuth.

### Setup
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the `server` folder with the following keys:
   ```env
   # Security
   APP_PIN=976312
   PORT=3001
   
   # AI Services
   GROQ_API_KEY=your_groq_api_key
   
   # Google OAuth (For Calendar Sync)
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   GOOGLE_REDIRECT_URI=http://localhost:3001/api/calendar/callback
   
   # Database (Optional - will fall back to local sqlite file if left blank)
   TURSO_DB_URL=libsql://your-turso-url.turso.io
   TURSO_AUTH_TOKEN=your_turso_token
   ```

4. Start the development server (runs both frontend and backend concurrently):
   ```bash
   npm run dev
   ```

## ☁️ Deployment

This repository includes a `render.yaml` Blueprint for 1-click deployment on [Render](https://render.com). 

1. Connect this repository to your Render account as a Blueprint.
2. Fill in the required environment variables in the Render dashboard.
3. Don't forget to update your Google Cloud Console OAuth settings to include your live Render URL as an authorized redirect URI!

---
*Built with ❤️ and Antigravity AI*
