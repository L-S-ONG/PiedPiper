import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// API to Create/Update a Provider and go Live
app.post('/api/providers', async (req, res) => {
  const { name, category, timing, description, address, isLive, location } = req.body;
  
  if (!location || !name) {
    return res.status(400).json({ error: 'Missing name or location' });
  }

  try {
    // For prototype purposes, we use a single hardcoded user ID.
    // In production, this would be the logged-in User ID.
    const fakeUserId = "demo-user-123"; 

    // Ensure user exists
    await prisma.user.upsert({
      where: { email: 'demo@example.com' },
      update: {},
      create: {
        id: fakeUserId,
        email: 'demo@example.com',
        passwordHash: 'fake',
        role: 'PROVIDER'
      }
    });

    const provider = await prisma.providerProfile.upsert({
      where: { userId: fakeUserId },
      update: {
        businessName: name,
        category,
        openingHours: timing,
        description,
        address,
        isLiveNow: isLive,
        latitude: location[0],
        longitude: location[1]
      },
      create: {
        userId: fakeUserId,
        businessName: name,
        category,
        openingHours: timing,
        description,
        address,
        isLiveNow: isLive,
        latitude: location[0],
        longitude: location[1]
      }
    });

    res.json({ success: true, provider });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save provider data' });
  }
});

// Helper to check if a provider is still open based on GMT+8
function isCurrentlyOpen(timingStr: string | null): boolean {
  if (!timingStr) return true; // If no timing specified, assume open indefinitely

  // Extract all time patterns (e.g., "8am", "6:00 PM")
  const matches = [...timingStr.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/ig)];
  if (matches.length === 0) return true; // Unparseable, assume open

  // We assume the last matched time in the string is the closing time
  const lastMatch = matches[matches.length - 1];
  let closingHour = parseInt(lastMatch[1]);
  const closingMinute = parseInt(lastMatch[2] || '0');
  const ampm = lastMatch[3].toLowerCase();

  // Convert to 24-hour format
  if (ampm === 'pm' && closingHour < 12) closingHour += 12;
  if (ampm === 'am' && closingHour === 12) closingHour = 0;

  // Get current GMT+8 time (Singapore Time)
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const sgTime = new Date(utc + (3600000 * 8));
  
  const currentHour = sgTime.getHours();
  const currentMinute = sgTime.getMinutes();

  // Check if current time is past the closing time
  if (currentHour > closingHour || (currentHour === closingHour && currentMinute >= closingMinute)) {
    return false; // CLOSED
  }
  
  return true; // STILL OPEN
}

// API to fetch all Live Providers for the Customer Map
app.get('/api/providers/live', async (req, res) => {
  try {
    const liveProviders = await prisma.providerProfile.findMany({
      where: { isLiveNow: true }
    });

    const genuinelyOpenProviders = [];
    const expiredProviderIds = [];

    // Filter providers by their operating hours
    for (const provider of liveProviders) {
      // Prisma JSON types need to be cast to string if it was saved as string, 
      // but in our schema we used JSON for openingHours and saved string. Let's cast to string safely.
      const timingStr = typeof provider.openingHours === 'string' ? provider.openingHours : String(provider.openingHours);
      
      if (isCurrentlyOpen(timingStr)) {
        genuinelyOpenProviders.push(provider);
      } else {
        expiredProviderIds.push(provider.id);
      }
    }

    // Automatically toggle off providers who forgot to stop broadcasting
    if (expiredProviderIds.length > 0) {
      await prisma.providerProfile.updateMany({
        where: { id: { in: expiredProviderIds } },
        data: { isLiveNow: false }
      });
      console.log(`Auto-closed ${expiredProviderIds.length} expired providers based on GMT+8.`);
    }

    res.json(genuinelyOpenProviders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch live providers' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend is running and connected successfully!' });
});

// Vercel serverless environment does not need app.listen()
if (process.env.VERCEL !== '1') {
  app.listen(port, () => {
    console.log(`Backend server is running on http://localhost:${port}`);
  });
}

export default app;
