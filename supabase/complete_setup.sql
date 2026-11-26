-- ==============================================================================
-- UNITEL CREDIT SCORING & FINANCING - COMPLETE DATABASE SETUP SCRIPT
-- ==============================================================================
-- Run this script in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/jmuuybsqlmdsrfzfgodh/sql/new
--
-- Features:
-- 1. Creates all tables with TEXT primary keys (supports both text IDs like 'app-seed-001' and UUIDs).
-- 2. Fully compatible with browser-direct read/write (REST API) on localhost & Vercel.
-- 3. Enables Row Level Security (RLS) with open read/write policies for anon and authenticated users.
-- 4. Seeds the 8 standard demo applications, 8 evaluations, customer personas, notifications, and equipment.
-- ==============================================================================

-- 1. Create Core Tables
-- ------------------------------------------------UPDATE the existing Unitel Credit Scoring POC. Do NOT rebuild it. Keep everything that works: roles (Analyst / Approver / Admin), the separate Credit score evaluation menu, New Application form, audit log, Nodemailer email server, Supabase with localStorage fallback, existing segments, and the styling rule (orange only on top bar, active sidebar item, headings, primary buttons; everything else neutral). All data is synthetic. Keep it simple. Show a short plan first, then build.

A. ML SERVICE (new /ml folder, Python FastAPI + scikit-learn)
- Endpoints: GET /health, POST /segment, POST /similar, POST /retrain. The Node server proxies to it. Add one command (for example npm run dev:all) that starts the web app, the email server and the ML service.
- A training script generates 500 synthetic customers with: SIM age in months, top-up regularity, average monthly top-up, spend stability, airtime loans repaid ratio, wallet level, and an outcome (repaid on time / paid late). Plant realistic correlations with noise. Save the models with joblib.

B. SEGMENTS RUN ON ML (same behaviour as before, no switch)
- Keep the current segment names, screens and workflows exactly as they are.
- Segmentation now runs on an ML model: K-Means with k equal to the number of existing segments, on scaled features. Map each cluster to an existing segment by its majority overlap with the old rule-based labels, so the output uses the same segment names.
- Do NOT add any ML/Rules switch in the UI. In Admin > Segments show a read-only validation card: agreement percentage with the old rules, a small confusion table and the cluster sizes.
- Only if the ML service is down, silently use the old rules and show a small "ML service offline - temporary fallback" note.

C. KNN "SIMILAR PAST CUSTOMERS" (approver side)
- A card on the approver's screen. The ML service finds the 5 nearest past customers (scaled features) and returns them with their outcomes.
- Show a small table (SIM age, top-up regularity, spend, outcome) and the line: "5 similar customers: 4 repaid on time, 1 paid late. Estimated repayment chance: 80%." Label it "Based on synthetic demo history". It supports the decision and never changes the score.

D. APPROVER SUMMARY (AI or ML)
- At the top of the approver's screen, before Approve, show a summary generated from the application data: name, age, marital status, occupation, city, assets, score and band, confidence, credit limit, equipment, EMI, plus the ML facts (segment, KNN result) and any red flags.
- Generate it with the AI API when a key is set, otherwise with a built-in template filled from the same fields. Label it "AI-generated" or "Template summary - approver decides".
- The provider, key and model come from server .env (AI_PROVIDER, AI_API_KEY, AI_MODEL). Do not hardcode model names.

E. FREE-FORM CHATBOT (floating widget on every page, role-aware)
- The user can ask anything about the portal in their own words. The chatbot must answer from real portal knowledge and data, not from a fixed list of questions.
- Knowledge: auto-generate a knowledge file from the app itself (screens, workflow, scoring parameters and weights from scoring_config, segment definitions, rules, glossary, the AI features) and keep it updated when the config changes. Retrieve the relevant parts for each question.
- Data tools (read-only, called by the model in a short loop, maximum 5 calls per question): get_application, get_score_breakdown, get_segment, get_similar_customers, get_weekly_stats, list_applications. The server enforces permissions on every call, whatever the model asks.
- Permissions: a customer sees only their own application. Analyst, Approver and Admin see what their role can already see in the portal. Never reveal another customer's data to a customer.
- Customer / form side (new "Applicant page"): the customer enters their mobile number and a demo code (123456), then sees their application and the chat. Typical questions: what is a credit score and what is mine, my status and queue position, my limit, how to proceed, what documents I need, how to improve my score, plus any general doubt. The chat can request a cancellation, but the server only cancels after the user presses a Confirm button; then it marks the application Cancelled, sends the email and logs it.
- Analyst side: help with the form (what a field means, what is missing, why something is flagged).
- Approver side: why this application got its score and limit, red flags, segment, similar customers, and statistics for any period such as the last 7 days (received, approved, rejected, approval rate, average score, top rejection reasons, segment mix). The chat can never approve or reject.
- Admin: the same as the approver, plus portfolio and configuration questions.
- If the answer is not in the knowledge or data, say "I don't know" and point to the screen where it can be found. Never invent numbers.
- If no AI key is set, run in basic mode (keyword retrieval plus the same data tools with template answers) and show "Basic chat mode".
- Save every message in the audit log with the role and application id. Show role-based suggested question chips.

F. ACCEPTANCE TESTS (run them and report)
1. Admin > Segments shows the ML validation card, and there is no ML/Rules switch. All old segment screens behave as before.
2. Stop the ML service: the app still works with the temporary fallback note.
3. The approver's screen shows the KNN card and the summary before Approve, in both AI mode and template mode.
4. Applicant page: enter the mobile number and 123456, ask "What is my status?", "How is my score calculated?", "Why is my limit this low?" and "Cancel my application", then press Confirm. Status becomes Cancelled and the email and audit log update.
5. Approver chat: ask "Why was this rated Fair?", "What happened in the last 7 days?" and "Which applications were rejected this week and why?", and get correct answers from the data.
6. Ask a question in free wording, such as "what does the red-flag thing do?", and get a sensible answer from the knowledge file.
7. A customer asks about another customer: refused. A question with no answer in the data gets "I don't know".------------------------------

-- Customers Table
CREATE TABLE IF NOT EXISTS public.customers (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT,
  msisdn TEXT NOT NULL,
  national_id_masked TEXT NOT NULL,
  date_of_birth TEXT NOT NULL,
  sim_activation_date TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Equipment Catalog Table
CREATE TABLE IF NOT EXISTS public.equipment (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price_kz BIGINT NOT NULL,
  active BOOLEAN DEFAULT true,
  is_custom BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Evaluations Table
CREATE TABLE IF NOT EXISTS public.evaluations (
  id TEXT PRIMARY KEY,
  customer_id TEXT,
  analyst_id TEXT,
  segment_code TEXT NOT NULL,
  segment_overridden BOOLEAN DEFAULT false,
  override_reason TEXT,
  config_version_id TEXT,
  wallet_available BOOLEAN DEFAULT true,
  wallet_used BOOLEAN DEFAULT false,
  income_band_code INT,
  income_source TEXT DEFAULT 'estimated',
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  customer JSONB,
  results JSONB
);

-- Loan Applications Table
CREATE TABLE IF NOT EXISTS public.loan_applications (
  id TEXT PRIMARY KEY,
  evaluation_id TEXT,
  equipment_id TEXT,
  price_kz BIGINT NOT NULL,
  term_months INT NOT NULL,
  rate_pct NUMERIC NOT NULL DEFAULT 0,
  monthly_emi_kz BIGINT NOT NULL,
  emi_share_pct NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',
  submitted_by TEXT,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  purchased_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  evaluation JSONB,
  equipment JSONB
);

-- Approver Decisions Table
CREATE TABLE IF NOT EXISTS public.approvals (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  approver_id TEXT,
  decision TEXT NOT NULL,
  reason TEXT NOT NULL,
  decided_at TIMESTAMPTZ DEFAULT now()
);

-- Notifications Ledger Table
CREATE TABLE IF NOT EXISTS public.notifications (
  id TEXT PRIMARY KEY,
  application_id TEXT,
  to_email TEXT NOT NULL,
  kind TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  html_body TEXT,
  status TEXT NOT NULL DEFAULT 'logged',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Immutable Audit Log Table
CREATE TABLE IF NOT EXISTS public.audit_log (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  at TIMESTAMPTZ DEFAULT now(),
  actor TEXT,
  actor_name TEXT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details JSONB
);

-- Scoring Configuration Versions Table
CREATE TABLE IF NOT EXISTS public.scoring_config_versions (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  version TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- External Data Sources (ds_telecom, ds_wallet, ds_bank, ds_assets, ds_utility)
CREATE TABLE IF NOT EXISTS public.ds_telecom (
  id TEXT PRIMARY KEY,
  customer_phone TEXT NOT NULL,
  tenure_months INT NOT NULL DEFAULT 0,
  arpu_kz BIGINT NOT NULL DEFAULT 0,
  recharge_regularity TEXT NOT NULL DEFAULT 'regular',
  airtime_balance_kz BIGINT NOT NULL DEFAULT 0,
  sim_swap_count_90d INT NOT NULL DEFAULT 0,
  last_sim_swap_days INT DEFAULT 365,
  airtime_loan_repaid_pct NUMERIC DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ds_wallet (
  id TEXT PRIMARY KEY,
  customer_phone TEXT NOT NULL,
  has_wallet BOOLEAN NOT NULL DEFAULT false,
  monthly_turnover_kz BIGINT NOT NULL DEFAULT 0,
  cash_in_out_ratio NUMERIC DEFAULT 1.0,
  merchant_payments_monthly INT DEFAULT 0,
  wallet_tenure_months INT DEFAULT 0,
  balance_kz BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ds_bank (
  id TEXT PRIMARY KEY,
  customer_phone TEXT NOT NULL,
  national_id TEXT,
  has_bank_account BOOLEAN NOT NULL DEFAULT false,
  bank_name TEXT,
  salary_detected BOOLEAN NOT NULL DEFAULT false,
  avg_monthly_salary_kz BIGINT DEFAULT 0,
  avg_balance_kz BIGINT DEFAULT 0,
  bounced_cheques_12m INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ds_assets (
  id TEXT PRIMARY KEY,
  customer_phone TEXT NOT NULL,
  national_id TEXT,
  has_vehicle BOOLEAN NOT NULL DEFAULT false,
  vehicle_type TEXT,
  has_land_title BOOLEAN NOT NULL DEFAULT false,
  has_registered_house BOOLEAN NOT NULL DEFAULT false,
  verified_source TEXT DEFAULT 'National Registry of Motor Vehicles and Property',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ds_utility (
  id TEXT PRIMARY KEY,
  customer_phone TEXT NOT NULL,
  national_id TEXT,
  ende_prepaid_meter TEXT,
  payment_regularity TEXT NOT NULL DEFAULT 'regular',
  avg_monthly_power_kz BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Indexes for High Performance
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_loan_applications_status ON public.loan_applications(status);
CREATE INDEX IF NOT EXISTS idx_loan_applications_deleted ON public.loan_applications(deleted_at);
CREATE INDEX IF NOT EXISTS idx_evaluations_deleted ON public.evaluations(deleted_at);
CREATE INDEX IF NOT EXISTS idx_notifications_to_email ON public.notifications(to_email);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON public.audit_log(entity, entity_id);

-- 3. Row Level Security (RLS) & Open Policies
-- ------------------------------------------------------------------------------
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scoring_config_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ds_telecom ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ds_wallet ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ds_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ds_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ds_utility ENABLE ROW LEVEL SECURITY;

-- Helper to grant open access policies for anonymous and authenticated web clients
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Public select policy" ON public.%I;', tbl);
    EXECUTE format('CREATE POLICY "Public select policy" ON public.%I FOR SELECT USING (true);', tbl);

    EXECUTE format('DROP POLICY IF EXISTS "Public insert policy" ON public.%I;', tbl);
    EXECUTE format('CREATE POLICY "Public insert policy" ON public.%I FOR INSERT WITH CHECK (true);', tbl);

    EXECUTE format('DROP POLICY IF EXISTS "Public update policy" ON public.%I;', tbl);
    EXECUTE format('CREATE POLICY "Public update policy" ON public.%I FOR UPDATE USING (true) WITH CHECK (true);', tbl);

    EXECUTE format('DROP POLICY IF EXISTS "Public delete policy" ON public.%I;', tbl);
    EXECUTE format('CREATE POLICY "Public delete policy" ON public.%I FOR DELETE USING (true);', tbl);

    EXECUTE format('GRANT ALL ON TABLE public.%I TO anon, authenticated, service_role;', tbl);
  END LOOP;
END $$;

-- 4. Initial Seed Data
-- ------------------------------------------------------------------------------

-- Seed Scoring Config
INSERT INTO public.scoring_config_versions (id, label, version, is_active)
VALUES ('cfg-v1', 'Unitel Credit Adjudication Engine v1.0', '1.0.0', true)
ON CONFLICT (id) DO NOTHING;

-- Seed Equipment Catalog
INSERT INTO public.equipment (id, name, category, price_kz, active, is_custom) VALUES
  ('e-1', 'Smartphone 4G Entry (Unitel A1)', 'Smartphone', 18000, true, false),
  ('e-2', 'Smartphone 4G Mid (Samsung Galaxy A05)', 'Smartphone', 35000, true, false),
  ('e-3', 'Smartphone 5G Advanced (Samsung Galaxy A25)', 'Smartphone', 65000, true, false),
  ('e-4', 'NetCasa 4G Router (ZTE MF286R)', 'NetCasa Router', 22000, true, false),
  ('e-5', 'NetCasa 5G Ultra Router (Huawei 5G CPE Pro 2)', 'NetCasa Router', 48000, true, false),
  ('e-6', 'POS Unitel Money Terminal (Sunmi V2 Pro)', 'POS Terminal', 42000, true, false)
ON CONFLICT (id) DO NOTHING;

-- Seed Customers
INSERT INTO public.customers (id, full_name, email, msisdn, national_id_masked, date_of_birth, sim_activation_date) VALUES
  ('c-joao-s1', 'João Silva', 'bhargownarravula777@gmail.com', '+244 923 111 222', '004***LA032', '1988-04-12', '2019-02-15'),
  ('c-amalia-s3', 'Amália Castro', 'bhargownarravula777@gmail.com', '+244 931 444 555', '007***LA089', '1992-08-23', '2020-06-10'),
  ('c-carlos-s7', 'Carlos Neto', 'bhargownarravula777@gmail.com', '+244 945 777 888', '002***LA015', '1985-11-03', '2017-09-01'),
  ('c-mateus-s3', 'Mateus Silva', 'bhargownarravula777@gmail.com', '+244 923 000 001', '005***LA045', '1990-05-15', '2020-03-12'),
  ('c-rosa-s1', 'Rosa Domingos', 'bhargownarravula777@gmail.com', '+244 931 000 002', '008***LA067', '1985-09-20', '2019-07-25'),
  ('c-alberto-s4', 'Alberto Kiala', 'bhargownarravula777@gmail.com', '+244 945 000 003', '003***LA023', '1978-12-05', '2015-11-18'),
  ('c-teresa-s5', 'Teresa Panzo', 'bhargownarravula777@gmail.com', '+244 924 000 004', '006***LA078', '1995-02-28', '2022-01-15'),
  ('c-manuel-s2', 'Manuel Afonso', 'bhargownarravula777@gmail.com', '+244 932 000 005', '001***LA090', '1982-07-10', '2016-04-30')
ON CONFLICT (id) DO NOTHING;

-- Seed Notifications
INSERT INTO public.notifications (id, application_id, to_email, kind, subject, body, status, created_at) VALUES
  ('notif-1', 'app-seed-001', 'bhargownarravula777@gmail.com', 'approval_notice', 'Your application is approved (CR-001)', 'Application for Smartphone 4G Entry has been approved. Monthly EMI: 3,000 Kz.', 'sent', now() - interval '3 days'),
  ('notif-2', 'app-seed-003', 'bhargownarravula777@gmail.com', 'submission_notice', 'New loan application: Carlos Neto', 'Carlos Neto applied for NetCasa 5G Ultra Router. Proxy score: 785/900.', 'sent', now() - interval '2 days'),
  ('notif-3', 'app-seed-004', 'bhargownarravula777@gmail.com', 'approval_notice', 'Your application is approved (CR-004)', 'Application for Smartphone 4G Mid has been approved. Status: Ready for purchase.', 'sent', now() - interval '1 day'),
  ('notif-4', 'app-seed-005', 'bhargownarravula777@gmail.com', 'rejection_notice', 'Application update (CR-005)', 'Application update: Minimum tenure criteria not met. Re-evaluation in 90 days.', 'sent', now() - interval '12 hours')
ON CONFLICT (id) DO NOTHING;
