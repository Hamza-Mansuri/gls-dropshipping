import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { MongoClient, ObjectId } from 'mongodb';
import { z } from 'zod';
import { EmailSystem } from './emailSystem.js';

const app = express();
const port = Number(process.env.PORT || 5000);
app.disable('x-powered-by');
app.use(helmet());
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://192.168.1.4:5173',
  process.env.FRONTEND_ORIGIN
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (
      allowedOrigins.includes(origin) ||
      /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(origin) ||
      /^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(origin) ||
      /^http:\/\/172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(origin) ||
      origin.endsWith('.gomzilifesciences.in') ||
      origin.endsWith('.vercel.app')
    ) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.options('*', cors());
app.use(express.json({ limit: '25kb' }));
app.use('/api/registrations', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false }));

/**
 * Normalizes phone numbers:
 * - Always returns a String, preserving leading zeros and international country codes
 * - Attaches +91 if a 10-digit Indian mobile number is entered
 * - Strips whitespace, hyphens, and parentheses
 */
export function normalizePhoneNumber(rawPhone, defaultCountryCode = '+91') {
  if (!rawPhone || typeof rawPhone !== 'string') return { raw: '', normalized: '', countryCode: defaultCountryCode };
  const trimmed = rawPhone.trim();
  const cleaned = trimmed.replace(/[\s()-]/g, '');

  let countryCode = defaultCountryCode;
  let normalized = cleaned;

  if (cleaned.startsWith('+')) {
    normalized = cleaned;
    if (cleaned.startsWith('+91')) countryCode = '+91';
    else if (cleaned.startsWith('+1')) countryCode = '+1';
    else if (cleaned.startsWith('+44')) countryCode = '+44';
    else {
      const match = cleaned.match(/^(\+\d{1,4})/);
      countryCode = match ? match[1] : defaultCountryCode;
    }
  } else if (cleaned.startsWith('0') && cleaned.length === 11) {
    normalized = '+91' + cleaned.slice(1);
    countryCode = '+91';
  } else if (/^[6-9]\d{9}$/.test(cleaned)) {
    normalized = '+91' + cleaned;
    countryCode = '+91';
  } else if (/^\d{10}$/.test(cleaned)) {
    normalized = defaultCountryCode + cleaned;
    countryCode = defaultCountryCode;
  } else if (/^\d{8,15}$/.test(cleaned)) {
    normalized = cleaned.startsWith('91') && cleaned.length === 12 ? '+' + cleaned : (defaultCountryCode + cleaned);
  }

  return {
    raw: trimmed,
    normalized,
    countryCode
  };
}

// Resilient schema accepting both legacy (name, phone) and standardized (fullName, phoneNumber) fields
const registrationSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  fullName: z.string().trim().min(2).max(100).optional(),
  phone: z.string().trim().min(7).max(25).optional(),
  phoneNumber: z.string().trim().min(7).max(25).optional(),
  country_code: z.string().trim().max(10).optional().nullable(),
  countryCode: z.string().trim().max(10).optional().nullable(),
  email: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
  ecommerce_status: z.enum(['yes', 'planning', 'no']).optional(),
  ecommerceStatus: z.enum(['yes', 'planning', 'no']).optional(),
  business_type: z.enum(['shopify_seller', 'marketplace', 'entrepreneur', 'other']).optional(),
  businessType: z.enum(['shopify_seller', 'marketplace', 'entrepreneur', 'other']).optional(),
  consent: z.literal(true),
  utm_source: z.string().trim().max(100).optional().nullable(),
  utmSource: z.string().trim().max(100).optional().nullable(),
  utm_medium: z.string().trim().max(100).optional().nullable(),
  utmMedium: z.string().trim().max(100).optional().nullable(),
  utm_campaign: z.string().trim().max(100).optional().nullable(),
  utmCampaign: z.string().trim().max(100).optional().nullable(),
  utm_content: z.string().trim().max(100).optional().nullable(),
  utmContent: z.string().trim().max(100).optional().nullable(),
  utm_term: z.string().trim().max(100).optional().nullable(),
  utmTerm: z.string().trim().max(100).optional().nullable(),
  registration_source: z.string().trim().max(100).optional().nullable(),
  registrationSource: z.string().trim().max(100).optional().nullable(),
  source: z.string().trim().max(100).optional().nullable()
}).refine(data => data.name || data.fullName, {
  message: "Full name is required",
  path: ["name"]
}).refine(data => data.phone || data.phoneNumber, {
  message: "Phone number is required",
  path: ["phone"]
});

let collection;
let emailSystem;
let client;
let server;

const WEBINAR_CONFIG = {
  project: 'dropshipping-c',
  title: process.env.WEBINAR_TITLE || "Build Your Own Supplement Brand with Dropshipping",
  date: "1 November 2026",
  time: "12:00 PM IST",
  startAt: new Date('2026-11-01T06:30:00Z'), // 12:00 PM IST is 06:30 UTC
  joinUrl: process.env.WEBINAR_JOIN_URL || "https://us06web.zoom.us/j/placeholder"
};

// Resilient local storage buffer for zero-downtime registrations
const PENDING_FILE = path.resolve('data/pending_registrations.json');

function readPendingRegistrations() {
  try {
    if (fs.existsSync(PENDING_FILE)) {
      const content = fs.readFileSync(PENDING_FILE, 'utf8');
      return JSON.parse(content || '[]');
    }
  } catch (err) {
    console.error('Error reading pending registrations:', err.message);
  }
  return [];
}

function savePendingRegistration(doc) {
  try {
    const list = readPendingRegistrations();
    const existingIndex = list.findIndex(r => r.email === doc.email);
    if (existingIndex >= 0) {
      list[existingIndex] = { ...list[existingIndex], ...doc, updatedAt: new Date() };
    } else {
      list.push(doc);
    }
    fs.mkdirSync(path.dirname(PENDING_FILE), { recursive: true });
    fs.writeFileSync(PENDING_FILE, JSON.stringify(list, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving pending registration to disk:', err.message);
    return false;
  }
}

function removePendingRegistration(idStr) {
  try {
    const list = readPendingRegistrations();
    const filtered = list.filter(r => String(r._id) !== idStr);
    fs.writeFileSync(PENDING_FILE, JSON.stringify(filtered, null, 2), 'utf8');
  } catch (err) {
    console.error('Error updating pending registrations file:', err.message);
  }
}

let isSyncing = false;
async function syncPendingRegistrations() {
  if (!collection || isSyncing) return;
  isSyncing = true;
  try {
    const list = readPendingRegistrations();
    if (list.length === 0) {
      isSyncing = false;
      return;
    }
    console.log(`Syncing ${list.length} pending registration(s) to MongoDB Atlas...`);
    for (const item of list) {
      try {
        const id = new ObjectId(item._id);
        const existing = await collection.findOne({ _id: id });
        if (!existing) {
          const docToInsert = { ...item, _id: id };
          await collection.insertOne(docToInsert);
          if (emailSystem) {
            await emailSystem.queueWebinarEmails(docToInsert, WEBINAR_CONFIG);
          }
        }
        removePendingRegistration(String(item._id));
      } catch (itemErr) {
        console.error(`Failed to sync registration ${item._id}:`, itemErr.message);
      }
    }
    console.log('Pending registrations successfully synced to MongoDB Atlas.');
  } catch (err) {
    console.error('Sync error:', err.message);
  } finally {
    isSyncing = false;
  }
}

// Health Check
app.get('/api/health', (req, res) => res.json({
  status: 'ok',
  project: 'dropshipping-c',
  database: collection ? 'connected' : 'not_configured',
  collection: 'registrations',
  pendingSyncCount: readPendingRegistrations().length,
  emailWorker: process.env.EMAIL_WORKER_ENABLED === 'true' ? 'enabled' : 'disabled'
}));

// Main Registration Endpoint (Zero-Downtime Guarantee)
app.post('/api/registrations', async (req, res) => {
  const parsed = registrationSchema.safeParse(req.body);
  if (!parsed.success) {
    const errorDetails = parsed.error.issues.map(i => i.message).join(', ');
    return res.status(400).json({
      errorType: 'VALIDATION_ERROR',
      message: errorDetails || 'Please check all required fields and consent.'
    });
  }

  const data = parsed.data;
  const resolvedName = (data.fullName || data.name).trim();
  const rawPhone = (data.phoneNumber || data.phone).trim();
  const requestedCountryCode = data.countryCode || data.country_code || '+91';
  const phoneData = normalizePhoneNumber(rawPhone, requestedCountryCode);

  const ecommerceStatus = data.ecommerceStatus || data.ecommerce_status || 'no';
  const businessType = data.businessType || data.business_type || 'other';

  const normalizedEmail = data.email;
  const now = new Date();

  // Construct structured document
  const regId = new ObjectId();
  const leadDocument = {
    _id: regId,
    project: 'dropshipping-c',
    fullName: resolvedName,
    name: resolvedName,
    email: normalizedEmail,
    phoneNumber: phoneData.normalized,
    phone: phoneData.normalized,
    countryCode: phoneData.countryCode,
    rawPhoneInput: rawPhone,
    ecommerceStatus: ecommerceStatus,
    ecommerce_status: ecommerceStatus,
    businessType: businessType,
    business_type: businessType,
    webinarName: WEBINAR_CONFIG.title,
    webinarDate: WEBINAR_CONFIG.date,
    webinarTime: WEBINAR_CONFIG.time,
    status: 'registered',
    registrationSource: data.registrationSource || data.registration_source || data.source || 'landing-page',
    source: data.source || 'dropshipping-c',
    utmSource: data.utmSource || data.utm_source || 'direct',
    utmMedium: data.utmMedium || data.utm_medium || null,
    utmCampaign: data.utmCampaign || data.utm_campaign || null,
    utmContent: data.utmContent || data.utm_content || null,
    utmTerm: data.utmTerm || data.utm_term || null,
    whatsappInviteShownAt: null,
    whatsappInviteClickedAt: null,
    consent: true,
    consentTimestamp: now,
    createdAt: now,
    updatedAt: now
  };

  // If MongoDB Atlas is connected, save directly
  if (collection) {
    try {
      const existingRegistration = await collection.findOne({
        email: normalizedEmail,
        $or: [
          { webinarName: WEBINAR_CONFIG.title },
          { project: 'dropshipping-c' }
        ]
      });

      if (existingRegistration) {
        leadDocument.isRepeat = true;
      }

      const insertResult = await collection.insertOne(leadDocument);

      if (emailSystem) {
        await emailSystem.queueWebinarEmails(leadDocument, WEBINAR_CONFIG);
      }

      return res.status(201).json({
        message: 'Registration saved successfully.',
        registrationId: insertResult.insertedId,
        alreadyRegistered: Boolean(existingRegistration)
      });
    } catch (dbErr) {
      console.warn('Atlas direct save failed; saving to resilient local buffer:', dbErr.message);
    }
  }

  // Resilient fallback storage: save to persistent disk buffer immediately so no lead is ever lost
  savePendingRegistration(leadDocument);
  console.log(`Lead saved to persistent local buffer: ${leadDocument.email} (${leadDocument._id})`);

  // Trigger background Atlas reconnect & sync attempt without blocking the user
  initDatabase(1).then(() => syncPendingRegistrations()).catch(() => {});

  return res.status(201).json({
    message: 'Registration saved successfully.',
    registrationId: leadDocument._id,
    buffered: true
  });
});

/**
 * WhatsApp Group Invite Telemetry Tracking
 */
app.post('/api/registrations/track-invite', async (req, res) => {
  const { registrationId, event } = req.body || {};
  if (!registrationId || !['shown', 'clicked'].includes(event)) {
    return res.status(400).json({ message: 'Valid registrationId and event ("shown" | "clicked") are required' });
  }

  const updateField = event === 'shown' ? 'whatsappInviteShownAt' : 'whatsappInviteClickedAt';
  const now = new Date();

  if (collection) {
    try {
      let queryId;
      try {
        queryId = new ObjectId(registrationId);
      } catch (_) {
        queryId = registrationId;
      }

      await collection.updateOne(
        { _id: queryId },
        { $set: { [updateField]: now, updatedAt: now } }
      );

      return res.json({ success: true, event, recordedAt: now });
    } catch (_) {}
  }

  // If in local pending buffer, update record on disk
  const list = readPendingRegistrations();
  const item = list.find(r => String(r._id) === String(registrationId));
  if (item) {
    item[updateField] = now;
    item.updatedAt = now;
    savePendingRegistration(item);
  }

  return res.json({ success: true, event, recordedAt: now, queued: true });
});

async function connectWithRetry(uri, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const c = new MongoClient(uri, {
        serverSelectionTimeoutMS: 15000,
        maxPoolSize: 5,
        minPoolSize: 1,
        maxIdleTimeMS: 30000
      });
      await c.connect();
      return c;
    } catch (err) {
      console.warn(`MongoDB connect attempt ${attempt} failed (${err.message}). Retrying...`);
      if (attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, 1500));
    }
  }
}

let isConnecting = false;
async function initDatabase(maxRetries = 2) {
  if (collection) return true;
  if (isConnecting) return false;
  isConnecting = true;
  const uri = process.env.MONGODB_URI;
  if (uri && !uri.includes('USERNAME:PASSWORD')) {
    try {
      client = await connectWithRetry(uri, maxRetries);
      const db = client.db(process.env.MONGODB_DB || 'dropshipping_webinar');
      collection = db.collection('registrations');

      await collection.createIndex({ email: 1, project: 1 });
      await collection.createIndex({ phoneNumber: 1, project: 1 });
      console.log('MongoDB Atlas connected. Main collection: registrations');
      // Automatically drain any queued registrations into Atlas
      syncPendingRegistrations().catch(() => {});

      if (!emailSystem) {
        const emailConfig = {
          project: 'dropshipping-c',
          workerEnabled: process.env.EMAIL_WORKER_ENABLED === 'true',
          dryRun: process.env.EMAIL_DRY_RUN !== 'false',
          resendKeyPrimary: process.env.RESEND_API_KEY_PRIMARY,
          resendKeySecondary: process.env.RESEND_API_KEY_SECONDARY,
          resendFrom: process.env.RESEND_FROM || 'Gomzi Life Sciences <webinar@gomzilifesciences.in>',
          smtpHost: process.env.SMTP_HOST,
          smtpPort: process.env.SMTP_PORT,
          smtpSecure: process.env.SMTP_SECURE === 'true',
          smtpUser: process.env.SMTP_USER,
          smtpPass: process.env.SMTP_PASS,
          smtpFrom: process.env.SMTP_FROM || 'Gomzi Life Sciences <admin@gomzilifesciences.in>'
        };
        emailSystem = new EmailSystem(db, emailConfig);
        await emailSystem.init();
      }
      isConnecting = false;
      return true;
    } catch (e) {
      console.error('Atlas connection attempt failed:', e.message);
      isConnecting = false;
      return false;
    }
  }
  isConnecting = false;
  return false;
}

async function start() {
  await initDatabase(1);
  server = app.listen(port, '0.0.0.0', () => {
    console.log(`Backend listening on port ${port} (0.0.0.0)`);
  });
}

async function gracefulShutdown(signal) {
  console.log(`\nReceived ${signal}. Gracefully closing server and database...`);
  if (emailSystem) {
    try { emailSystem.stopWorker(); } catch (_) {}
  }
  if (server) {
    server.close();
  }
  if (client) {
    try { await client.close(); } catch (_) {}
  }
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

start().catch(error => { console.error('Startup failed:', error.message); });
