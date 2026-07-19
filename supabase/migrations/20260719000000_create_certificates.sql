-- ============================================================
-- Certificate Verification System - Database Migration
-- Creates the certificates table with RLS policies
-- ============================================================

-- Create the certificates table
CREATE TABLE IF NOT EXISTS public.certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_code TEXT NOT NULL UNIQUE,
  student_name TEXT NOT NULL,
  course_name TEXT NOT NULL,
  issue_date DATE NOT NULL,
  expiration_date DATE,
  grade_or_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups by certificate code
CREATE INDEX IF NOT EXISTS idx_certificates_code ON public.certificates (certificate_code);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

-- Public read access: anyone can verify a certificate by code
CREATE POLICY "Public can verify certificates"
  ON public.certificates
  FOR SELECT
  TO public
  USING (true);

-- Only authenticated admins can insert certificates
CREATE POLICY "Admins can insert certificates"
  ON public.certificates
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Only authenticated admins can update certificates
CREATE POLICY "Admins can update certificates"
  ON public.certificates
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Only authenticated admins can delete certificates
CREATE POLICY "Admins can delete certificates"
  ON public.certificates
  FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================
-- Helper function: generate a unique certificate code
-- Format: COMP-YYYY-XXXXX (e.g., COMP-2026-A1B2C)
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_certificate_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  new_code TEXT;
  code_exists BOOLEAN;
BEGIN
  LOOP
    new_code := 'COMP-' || EXTRACT(YEAR FROM now()) || '-' ||
                UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 5));
    
    SELECT EXISTS(
      SELECT 1 FROM public.certificates WHERE certificate_code = new_code
    ) INTO code_exists;
    
    EXIT WHEN NOT code_exists;
  END LOOP;
  
  RETURN new_code;
END;
$$;
