-- Migration: Add application_no to loan_applications with unique constraint
-- 5-digit sequence from 10001 to 99999

ALTER TABLE public.loan_applications 
ADD COLUMN IF NOT EXISTS application_no INT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_loan_applications_application_no 
ON public.loan_applications(application_no);
