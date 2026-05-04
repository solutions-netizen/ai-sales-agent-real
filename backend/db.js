// backend/db.js — SQLite database for the Life Insurance Sales Platform
import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "../data/insurance_leads.db");

const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ── Leads ──────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id            TEXT PRIMARY KEY,
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now')),

    -- Contact
    first_name    TEXT NOT NULL,
    last_name     TEXT,
    email         TEXT,
    phone         TEXT,

    -- Insurance needs
    product_interest TEXT DEFAULT 'term-life',  -- term-life | whole-life | iul | final-expense | mortgage-protection | annuity
    coverage_amount  INTEGER,                    -- requested coverage in dollars
    monthly_budget   INTEGER,                    -- stated monthly premium budget
    health_rating    TEXT,                       -- excellent | good | fair | poor
    tobacco_use      INTEGER DEFAULT 0,          -- 0/1
    age              INTEGER,
    beneficiary      TEXT,                       -- spouse | children | parents | business | estate

    -- Pipeline stage
    stage         TEXT DEFAULT 'new',           -- new | contacted | quoted | applied | placed | lost
    ai_score      INTEGER DEFAULT 0,            -- 0-100 AI readiness score
    score_reason  TEXT,

    -- Source
    source        TEXT DEFAULT 'landing-page',  -- landing-page | referral | zapier | brevo | manual
    referral_id   TEXT,                         -- FK to referrals table

    -- Agent notes
    notes         TEXT,
    last_contact  TEXT,
    next_followup TEXT,

    -- Soft delete (#11)
    deleted_at    TEXT DEFAULT NULL
  );
`);

// ── Follow-up sequence log ─────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS followups (
    id         TEXT PRIMARY KEY,
    lead_id    TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    sent_at    TEXT DEFAULT (datetime('now')),
    channel    TEXT NOT NULL,   -- sms | email | call
    sequence   INTEGER,         -- touch number (1=day0, 2=day2, 3=day5 …)
    status     TEXT DEFAULT 'sent',  -- sent | delivered | failed | responded
    message    TEXT,
    ai_reply   TEXT
  );
`);

// ── Referrals ──────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS referrals (
    id             TEXT PRIMARY KEY,
    created_at     TEXT DEFAULT (datetime('now')),
    policyholder_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    referred_lead_id TEXT REFERENCES leads(id) ON DELETE SET NULL,

    -- Referral contact info (may not be a lead yet)
    ref_first_name TEXT NOT NULL,
    ref_last_name  TEXT,
    ref_phone      TEXT,
    ref_email      TEXT,
    ref_relationship TEXT,  -- spouse | sibling | coworker | friend | business-partner

    status         TEXT DEFAULT 'pending',  -- pending | contacted | converted | lost
    converted_at   TEXT,
    notes          TEXT
  );
`);

// ── Campaigns ─────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS campaigns (
    id          TEXT PRIMARY KEY,
    created_at  TEXT DEFAULT (datetime('now')),
    name        TEXT NOT NULL,
    type        TEXT NOT NULL,   -- sms | email | call
    trigger     TEXT NOT NULL,   -- new-lead | stage-change | anniversary | referral-request
    product     TEXT DEFAULT 'all',
    message_template TEXT NOT NULL,
    active      INTEGER DEFAULT 1,
    sent_count  INTEGER DEFAULT 0
  );
`);

// ── Activity log ──────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS activity (
    id         TEXT PRIMARY KEY,
    created_at TEXT DEFAULT (datetime('now')),
    lead_id    TEXT REFERENCES leads(id) ON DELETE CASCADE,
    type       TEXT NOT NULL,  -- call | sms | email | note | stage-change | score-update | referral-sent
    description TEXT NOT NULL,
    metadata   TEXT            -- JSON blob
  );
`);

// ── Migrations — add columns that didn't exist in earlier schema versions ──
const leadCols = db.prepare("PRAGMA table_info(leads)").all().map(c => c.name);
if (!leadCols.includes("deleted_at")) {
  db.exec("ALTER TABLE leads ADD COLUMN deleted_at TEXT DEFAULT NULL");
}

// ── Seed default campaigns if empty ───────────────────────────────────────
const campaignCount = db.prepare("SELECT COUNT(*) as c FROM campaigns").get().c;
if (campaignCount === 0) {
  const insert = db.prepare(`
    INSERT INTO campaigns (id, name, type, trigger, product, message_template, active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);
  [
    ["c1", "New Lead Welcome SMS", "sms", "new-lead", "all",
     "Hi {{firstName}}! This is {{agentName}} with {{agencyName}}. Thanks for your interest in life insurance. I'll be reaching out shortly — or you can reply CALL ME to get started now!"],
    ["c2", "Day-2 Follow-Up SMS", "sms", "new-lead", "all",
     "Hi {{firstName}}, just checking in! Have you had a chance to think about protecting your family? A quick 10-min call could save you thousands. Reply READY when you'd like to chat!"],
    ["c3", "Day-5 Quote Nudge SMS", "sms", "new-lead", "all",
     "{{firstName}}, did you know a $500K term life policy can cost less than a Netflix subscription? Let me run a free quote for you — no obligation. Reply YES to get your number!"],
    ["c4", "New Lead Welcome Email", "email", "new-lead", "all",
     "Welcome! We received your request for a life insurance quote. Here's what happens next..."],
    ["c5", "Anniversary Check-In", "sms", "anniversary", "all",
     "Hi {{firstName}}! It's {{agentName}} — your policy turns {{policyAge}} today 🎉 Life changes fast. Want a free coverage review to make sure you're still protected? Reply YES!"],
    ["c6", "Referral Request", "sms", "anniversary", "all",
     "{{firstName}}, you're one of my favorite clients! Do you know anyone — a friend, spouse, or coworker — who could use the same protection you have? Send them this link: {{referralLink}}"],
  ].forEach(row => insert.run(...row));
}

export default db;
