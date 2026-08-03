-- SpecialCommissionProducts table
CREATE TABLE IF NOT EXISTS public."SpecialCommissionProducts" (
  id TEXT PRIMARY KEY,
  sku TEXT DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  unit TEXT DEFAULT 'ตัว',
  commission_rate NUMERIC DEFAULT 0,
  bonus_min_qty NUMERIC DEFAULT 0,
  bonus_amount NUMERIC DEFAULT 0,
  bonus_description TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  is_active TEXT DEFAULT 'yes',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public."SpecialCommissionProducts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public."SpecialCommissionProducts"
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- SpecialCommissionSales table
CREATE TABLE IF NOT EXISTS public."SpecialCommissionSales" (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL DEFAULT '',
  user_id TEXT NOT NULL DEFAULT '',
  quantity NUMERIC DEFAULT 0,
  sale_date TEXT DEFAULT '',
  branch TEXT DEFAULT '',
  order_no TEXT DEFAULT '',
  created_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public."SpecialCommissionSales" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public."SpecialCommissionSales"
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- Seed default products
INSERT INTO public."SpecialCommissionProducts" (id, sku, name, unit, commission_rate, bonus_min_qty, bonus_amount, bonus_description, image_url, is_active)
VALUES
  ('prod-heart-shirt', 'AVR004002XL, AVR00400L, AVR00400M, AVR00400S, AVR00400XL, AVR003002XL, AVR00300L, AVR00300M, AVR00300S, AVR00300XL', 'เสื้อ AVR รูปหัวใจ (ทั้ง 2 ลาย)', 'ตัว', 30, 5, 200, 'ขายครบ 5 ตัว รับเพิ่ม 200 บาท (จ่าย 1 ครั้งต่อรอบการคำนวณ)', '', 'yes'),
  ('prod-velo-core', 'AVRMS005, AVRMS003, AVRMS002, AVRMS001, AVRMS004', 'เสื้อ AVR Velo Core', 'ตัว', 50, 0, 0, 'ไม่มีโบนัสเพิ่มเติม (ไม่มี On Top)', '', 'yes'),
  ('prod-crop-luma', 'AVRWC003, AVRWC002, AVRWC001', 'เสื้อ AVR Crop Luma Swift', 'ตัว', 50, 0, 0, 'ไม่มีโบนัสเพิ่มเติม (ไม่มี On Top)', '', 'yes'),
  ('prod-shorts', 'AVRMS008, AVRMS007, AVRMS006, AVRMS009, AVRWS003, AVRWS002, AVRWS001, AVRWS004', 'กางเกง AVR', 'ตัว', 50, 0, 0, 'ไม่มีโบนัสเพิ่มเติม (ไม่มี On Top)', '', 'yes'),
  ('prod-socks', '8852906202601, 8852906202600', 'ถุงเท้า AVR', 'คู่', 20, 10, 200, 'ขายครบ 10 คู่ รับเพิ่ม 200 บาท (จ่าย 1 ครั้งต่อรอบการคำนวณ)', '', 'yes')
ON CONFLICT (id) DO NOTHING;
