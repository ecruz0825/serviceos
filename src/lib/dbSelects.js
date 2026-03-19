export const JOB_SELECT_REVENUE_HUB =
  'id, customer_id, status, service_date, scheduled_end_date, job_cost, services_performed, invoice_path, invoice_uploaded_at, completed_at, assigned_team_id, created_at, updated_at';

export const JOB_SELECT_MINIMAL =
  'id, customer_id, status, service_date, job_cost, services_performed, assigned_team_id, created_at, updated_at';

export const JOB_SELECT_JOBS_ADMIN =
  'id, services_performed, status, job_cost, crew_pay, notes, customer_id, assigned_team_id, service_date, scheduled_end_date, before_image, after_image, invoice_path, invoice_uploaded_at';

export const JOB_SELECT_CUSTOMERS_ADMIN =
  'id, status, job_cost, service_date';

export const JOB_SELECT_CUSTOMERS_ADMIN_INVOICES =
  'id, service_date, services_performed, status, job_cost, invoice_path';

export const INVOICE_SELECT_BASE =
  'id, company_id, customer_id, job_id, invoice_number, status, subtotal, tax, total, balance_due, pdf_path, sent_at, paid_at, voided_at, due_date, created_at, updated_at';

export const INVOICE_SELECT_JOBS_ADMIN =
  'id, job_id, invoice_number, status, total, balance_due, pdf_path, sent_at, paid_at, due_date, created_at';

export const INVOICE_SELECT_CUSTOMERS_ADMIN =
  'id, job_id, pdf_path, created_at';

export const INVOICE_SELECT_REVENUE_HUB =
  'id, job_id, status, balance_due, pdf_path, total, sent_at, paid_at, due_date, created_at';
