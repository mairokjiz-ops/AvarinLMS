-- StockBills table for tracking goods receipts, inward bills, and R2 receipt images
CREATE TABLE IF NOT EXISTS public."StockBills" (
  id TEXT PRIMARY KEY,
  bill_no TEXT NOT NULL DEFAULT '',
  bill_date TEXT NOT NULL DEFAULT '',
  supplier_name TEXT NOT NULL DEFAULT '',
  branch TEXT DEFAULT '',
  category TEXT DEFAULT 'สินค้าขาย (Stock)',
  total_amount NUMERIC DEFAULT 0,
  vat_type TEXT DEFAULT 'none',
  vat_amount NUMERIC DEFAULT 0,
  net_amount NUMERIC DEFAULT 0,
  payment_status TEXT DEFAULT 'paid',
  status TEXT DEFAULT 'completed',
  image_url TEXT DEFAULT '',
  images TEXT DEFAULT '[]',
  items_detail TEXT DEFAULT '[]',
  notes TEXT DEFAULT '',
  created_by TEXT DEFAULT '',
  created_by_name TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stockbills_bill_date ON public."StockBills"(bill_date);
CREATE INDEX IF NOT EXISTS idx_stockbills_supplier ON public."StockBills"(supplier_name);
CREATE INDEX IF NOT EXISTS idx_stockbills_branch ON public."StockBills"(branch);
CREATE INDEX IF NOT EXISTS idx_stockbills_created_by ON public."StockBills"(created_by);

ALTER TABLE public."StockBills" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on StockBills" ON public."StockBills"
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- Default Settings for Stock Bills Access Control
INSERT INTO public."Settings" ("key", "value", "updated_at")
VALUES
  ('stock_bill_allowed_roles', 'admin,approver,supervisor', NOW()),
  ('stock_bill_allowed_users', '', NOW()),
  ('stock_bill_notify_target', '', NOW())
ON CONFLICT ("key") DO NOTHING;
