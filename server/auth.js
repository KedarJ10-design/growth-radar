import cookieParser from 'cookie-parser';

export function setupAuth(app) {
  app.use(cookieParser());
  
  app.post('/api/auth/login', (req, res) => {
    const { pin } = req.body;
    const correctPin = process.env.APP_PIN || '976312';
    
    if (pin === correctPin) {
      // Set secure HTTP-only cookie, expires in 30 days
      res.cookie('auth_pin', pin, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000
      });
      res.json({ success: true });
    } else {
      res.status(401).json({ error: 'Invalid PIN' });
    }
  });

  app.get('/api/auth/check', (req, res) => {
    const pin = req.cookies.auth_pin;
    const correctPin = process.env.APP_PIN || '976312';
    if (pin === correctPin) {
      res.json({ authenticated: true });
    } else {
      res.status(401).json({ authenticated: false });
    }
  });
}

export function requireAuth(req, res, next) {
  // Allow health check and auth endpoints
  if (req.path === '/api/health' || req.path === '/api/auth/login' || req.path === '/api/auth/check') {
    return next();
  }

  // Also allow Google OAuth callback (it doesn't have the PIN cookie since it's redirected from Google)
  if (req.path === '/api/calendar/callback') {
    return next();
  }

  const pin = req.cookies.auth_pin;
  const correctPin = process.env.APP_PIN || '976312';

  if (pin === correctPin) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized. PIN required.' });
  }
}
