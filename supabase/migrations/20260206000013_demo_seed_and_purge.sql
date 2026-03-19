BEGIN;

-- =============================================================================
-- Demo Data Engine: Seed and Purge
-- Adds metadata column to track demo data and RPCs for seeding/purging
-- =============================================================================

-- 1) Add metadata jsonb column to tables (if missing)
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.crew_members
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2) Create RPC: public.seed_demo_data(p_company_id uuid)
CREATE OR REPLACE FUNCTION public.seed_demo_data(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id uuid;
  v_caller_company_id uuid;
  v_role text;
  v_demo_metadata jsonb := jsonb_build_object('demo', true);
  
  -- Customer IDs
  v_customer_ids uuid[] := ARRAY[]::uuid[];
  v_customer_id uuid;
  
  -- Service IDs
  v_service_ids uuid[] := ARRAY[]::uuid[];
  v_service_id uuid;
  
  -- Quote IDs
  v_quote_ids uuid[] := ARRAY[]::uuid[];
  v_quote_id uuid;
  
  -- Job IDs
  v_job_ids uuid[] := ARRAY[]::uuid[];
  v_job_id uuid;
  
  -- Invoice IDs
  v_invoice_ids uuid[] := ARRAY[]::uuid[];
  v_invoice_id uuid;
  
  -- Payment IDs
  v_payment_ids uuid[] := ARRAY[]::uuid[];
  v_payment_id uuid;
  
  -- Crew member IDs
  v_crew_ids uuid[] := ARRAY[]::uuid[];
  v_crew_id uuid;
  
  v_error_message text;
BEGIN
  -- 1) Require authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'AUTH_REQUIRED',
      'message', 'Authentication required'
    );
  END IF;

  -- 2) Get caller profile: company_id + role
  SELECT p.company_id, p.role INTO v_caller_company_id, v_role
  FROM public.profiles p
  WHERE p.id = v_user_id;

  IF v_caller_company_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'NO_COMPANY',
      'message', 'User must be associated with a company'
    );
  END IF;

  -- 3) Only admin/manager can seed demo data
  IF v_role NOT IN ('admin', 'manager') THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'FORBIDDEN',
      'message', 'Only admins and managers can seed demo data'
    );
  END IF;

  -- 4) Validate company_id matches caller's company
  IF p_company_id != v_caller_company_id THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'FORBIDDEN',
      'message', 'Cannot seed demo data for another company'
    );
  END IF;

  -- 5) Insert 5 demo customers
  BEGIN
    WITH ins AS (
      INSERT INTO public.customers (company_id, full_name, email, phone, address, metadata)
      VALUES
        (p_company_id, 'John Smith', 'john.smith@example.com', '(555) 111-1111', '123 Oak St, Springfield, IL 62701', v_demo_metadata),
        (p_company_id, 'Sarah Johnson', 'sarah.j@example.com', '(555) 222-2222', '456 Maple Ave, Springfield, IL 62702', v_demo_metadata),
        (p_company_id, 'Mike Williams', 'mike.w@example.com', '(555) 333-3333', '789 Elm Dr, Springfield, IL 62703', v_demo_metadata),
        (p_company_id, 'Emily Davis', 'emily.d@example.com', '(555) 444-4444', '321 Pine Rd, Springfield, IL 62704', v_demo_metadata),
        (p_company_id, 'David Brown', 'david.b@example.com', '(555) 555-5555', '654 Cedar Ln, Springfield, IL 62705', v_demo_metadata)
      RETURNING id
    )
    SELECT array_agg(id) INTO v_customer_ids FROM ins;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
    RAISE WARNING 'Error inserting demo customers: %', v_error_message;
    -- Continue - may already exist
  END;

  -- If insert didn't return IDs (duplicates), fetch existing demo customers
  IF array_length(v_customer_ids, 1) IS NULL OR array_length(v_customer_ids, 1) = 0 THEN
    SELECT ARRAY_AGG(id) INTO v_customer_ids
    FROM public.customers
    WHERE company_id = p_company_id
      AND metadata->>'demo' = 'true'
    LIMIT 5;
  END IF;

  -- 6) Insert 3 demo services
  BEGIN
    WITH ins AS (
      INSERT INTO public.services (company_id, name, default_price, metadata)
      VALUES
        (p_company_id, 'Lawn Mowing', 50.00, v_demo_metadata),
        (p_company_id, 'Weed Control', 75.00, v_demo_metadata),
        (p_company_id, 'Fertilization', 100.00, v_demo_metadata)
      ON CONFLICT DO NOTHING
      RETURNING id
    )
    SELECT array_agg(id) INTO v_service_ids FROM ins;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
    RAISE WARNING 'Error inserting demo services: %', v_error_message;
  END;

  -- Fetch service IDs if needed
  IF array_length(v_service_ids, 1) IS NULL OR array_length(v_service_ids, 1) = 0 THEN
    SELECT ARRAY_AGG(id) INTO v_service_ids
    FROM public.services
    WHERE company_id = p_company_id
      AND metadata->>'demo' = 'true'
    LIMIT 3;
  END IF;

  -- 7) Insert 5 demo quotes (draft/sent/accepted/rejected)
  BEGIN
    -- Quote 1: Draft
    IF array_length(v_customer_ids, 1) >= 1 THEN
      INSERT INTO public.quotes (company_id, customer_id, services, subtotal, tax, total, status, metadata)
      VALUES (
        p_company_id,
        v_customer_ids[1],
        jsonb_build_array(
          jsonb_build_object('name', 'Lawn Mowing', 'qty', 1, 'rate', 50.00)
        ),
        50.00, 0, 50.00, 'draft', v_demo_metadata
      )
      RETURNING id INTO v_quote_id;
      v_quote_ids := array_append(v_quote_ids, v_quote_id);
    END IF;

    -- Quote 2: Sent
    IF array_length(v_customer_ids, 1) >= 2 THEN
      INSERT INTO public.quotes (company_id, customer_id, services, subtotal, tax, total, status, sent_at, metadata)
      VALUES (
        p_company_id,
        v_customer_ids[2],
        jsonb_build_array(
          jsonb_build_object('name', 'Weed Control', 'qty', 1, 'rate', 75.00)
        ),
        75.00, 0, 75.00, 'sent', now() - interval '2 days', v_demo_metadata
      )
      RETURNING id INTO v_quote_id;
      v_quote_ids := array_append(v_quote_ids, v_quote_id);
    END IF;

    -- Quote 3: Accepted
    IF array_length(v_customer_ids, 1) >= 3 THEN
      INSERT INTO public.quotes (company_id, customer_id, services, subtotal, tax, total, status, sent_at, accepted_at, metadata)
      VALUES (
        p_company_id,
        v_customer_ids[3],
        jsonb_build_array(
          jsonb_build_object('name', 'Fertilization', 'qty', 1, 'rate', 100.00)
        ),
        100.00, 0, 100.00, 'accepted', now() - interval '5 days', now() - interval '3 days', v_demo_metadata
      )
      RETURNING id INTO v_quote_id;
      v_quote_ids := array_append(v_quote_ids, v_quote_id);
    END IF;

    -- Quote 4: Rejected
    IF array_length(v_customer_ids, 1) >= 4 THEN
      INSERT INTO public.quotes (company_id, customer_id, services, subtotal, tax, total, status, sent_at, rejected_at, metadata)
      VALUES (
        p_company_id,
        v_customer_ids[4],
        jsonb_build_array(
          jsonb_build_object('name', 'Lawn Mowing', 'qty', 2, 'rate', 50.00)
        ),
        100.00, 0, 100.00, 'rejected', now() - interval '7 days', now() - interval '6 days', v_demo_metadata
      )
      RETURNING id INTO v_quote_id;
      v_quote_ids := array_append(v_quote_ids, v_quote_id);
    END IF;

    -- Quote 5: Sent (another)
    IF array_length(v_customer_ids, 1) >= 5 THEN
      INSERT INTO public.quotes (company_id, customer_id, services, subtotal, tax, total, status, sent_at, metadata)
      VALUES (
        p_company_id,
        v_customer_ids[5],
        jsonb_build_array(
          jsonb_build_object('name', 'Lawn Mowing', 'qty', 1, 'rate', 50.00),
          jsonb_build_object('name', 'Weed Control', 'qty', 1, 'rate', 75.00)
        ),
        125.00, 0, 125.00, 'sent', now() - interval '1 day', v_demo_metadata
      )
      RETURNING id INTO v_quote_id;
      v_quote_ids := array_append(v_quote_ids, v_quote_id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
    RAISE WARNING 'Error inserting demo quotes: %', v_error_message;
  END;

  -- 8) Insert 5 demo jobs
  BEGIN
    -- Job 1: Unscheduled
    IF array_length(v_customer_ids, 1) >= 1 THEN
      INSERT INTO public.jobs (company_id, customer_id, services_performed, job_cost, status, metadata)
      VALUES (
        p_company_id,
        v_customer_ids[1],
        'Lawn Mowing',
        50.00,
        'Pending',
        v_demo_metadata
      )
      RETURNING id INTO v_job_id;
      v_job_ids := array_append(v_job_ids, v_job_id);
    END IF;

    -- Job 2: Scheduled
    IF array_length(v_customer_ids, 1) >= 2 THEN
      INSERT INTO public.jobs (company_id, customer_id, services_performed, job_cost, status, service_date, metadata)
      VALUES (
        p_company_id,
        v_customer_ids[2],
        'Weed Control',
        75.00,
        'Scheduled',
        CURRENT_DATE + interval '3 days',
        v_demo_metadata
      )
      RETURNING id INTO v_job_id;
      v_job_ids := array_append(v_job_ids, v_job_id);
    END IF;

    -- Job 3: In Progress (optional - using status)
    IF array_length(v_customer_ids, 1) >= 3 THEN
      INSERT INTO public.jobs (company_id, customer_id, services_performed, job_cost, status, service_date, metadata)
      VALUES (
        p_company_id,
        v_customer_ids[3],
        'Fertilization',
        100.00,
        'In Progress',
        CURRENT_DATE,
        v_demo_metadata
      )
      RETURNING id INTO v_job_id;
      v_job_ids := array_append(v_job_ids, v_job_id);
    END IF;

    -- Job 4: Completed (no invoice)
    IF array_length(v_customer_ids, 1) >= 4 THEN
      INSERT INTO public.jobs (company_id, customer_id, services_performed, job_cost, status, service_date, completed, completed_at, metadata)
      VALUES (
        p_company_id,
        v_customer_ids[4],
        'Lawn Mowing',
        50.00,
        'Completed',
        CURRENT_DATE - interval '5 days',
        true,
        CURRENT_DATE - interval '5 days',
        v_demo_metadata
      )
      RETURNING id INTO v_job_id;
      v_job_ids := array_append(v_job_ids, v_job_id);
    END IF;

    -- Job 5: Completed (invoiced)
    IF array_length(v_customer_ids, 1) >= 5 THEN
      INSERT INTO public.jobs (company_id, customer_id, services_performed, job_cost, status, service_date, completed, completed_at, invoice_path, invoice_uploaded_at, metadata)
      VALUES (
        p_company_id,
        v_customer_ids[5],
        'Lawn Mowing + Weed Control',
        125.00,
        'Completed',
        CURRENT_DATE - interval '10 days',
        true,
        CURRENT_DATE - interval '10 days',
        'demo/invoice-' || gen_random_uuid()::text || '.pdf',
        CURRENT_DATE - interval '8 days',
        v_demo_metadata
      )
      RETURNING id INTO v_job_id;
      v_job_ids := array_append(v_job_ids, v_job_id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
    RAISE WARNING 'Error inserting demo jobs: %', v_error_message;
  END;

  -- 9) Insert 3 demo payments
  BEGIN
    -- Payment 1: Partial (for job 5)
    IF array_length(v_job_ids, 1) >= 5 THEN
      INSERT INTO public.payments (company_id, job_id, amount, payment_method, paid, date_paid, status, metadata)
      VALUES (
        p_company_id,
        v_job_ids[5],
        50.00,
        'Cash',
        true,
        CURRENT_DATE - interval '7 days',
        'posted',
        v_demo_metadata
      )
      RETURNING id INTO v_payment_id;
      v_payment_ids := array_append(v_payment_ids, v_payment_id);
    END IF;

    -- Payment 2: Full (for job 4)
    IF array_length(v_job_ids, 1) >= 4 THEN
      INSERT INTO public.payments (company_id, job_id, amount, payment_method, paid, date_paid, status, metadata)
      VALUES (
        p_company_id,
        v_job_ids[4],
        50.00,
        'Check',
        true,
        CURRENT_DATE - interval '4 days',
        'posted',
        v_demo_metadata
      )
      RETURNING id INTO v_payment_id;
      v_payment_ids := array_append(v_payment_ids, v_payment_id);
    END IF;

    -- Payment 3: Another partial (for job 5)
    IF array_length(v_job_ids, 1) >= 5 THEN
      INSERT INTO public.payments (company_id, job_id, amount, payment_method, paid, date_paid, status, metadata)
      VALUES (
        p_company_id,
        v_job_ids[5],
        25.00,
        'Credit Card',
        true,
        CURRENT_DATE - interval '2 days',
        'posted',
        v_demo_metadata
      )
      RETURNING id INTO v_payment_id;
      v_payment_ids := array_append(v_payment_ids, v_payment_id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
    RAISE WARNING 'Error inserting demo payments: %', v_error_message;
  END;

  -- 10) Insert 3 demo invoices (via upsert_invoice_from_job)
  BEGIN
    -- Invoice 1: Sent (for job 5)
    IF array_length(v_job_ids, 1) >= 5 THEN
      BEGIN
        PERFORM public.upsert_invoice_from_job(v_job_ids[5]);
        SELECT id INTO v_invoice_id
        FROM public.invoices
        WHERE job_id = v_job_ids[5]
          AND company_id = p_company_id
        LIMIT 1;
        
        IF v_invoice_id IS NOT NULL THEN
          UPDATE public.invoices
          SET metadata = v_demo_metadata,
              status = 'sent',
              sent_at = CURRENT_DATE - interval '8 days',
              due_date = CURRENT_DATE - interval '8 days' + interval '14 days'
          WHERE id = v_invoice_id;
          v_invoice_ids := array_append(v_invoice_ids, v_invoice_id);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
        RAISE WARNING 'Error creating invoice for job: %', v_error_message;
      END;
    END IF;

    -- Invoice 2: Overdue (create another job for this)
    IF array_length(v_customer_ids, 1) >= 1 THEN
      BEGIN
        INSERT INTO public.jobs (company_id, customer_id, services_performed, job_cost, status, service_date, completed, completed_at, invoice_path, invoice_uploaded_at, metadata)
        VALUES (
          p_company_id,
          v_customer_ids[1],
          'Lawn Mowing',
          50.00,
          'Completed',
          CURRENT_DATE - interval '20 days',
          true,
          CURRENT_DATE - interval '20 days',
          'demo/invoice-' || gen_random_uuid()::text || '.pdf',
          CURRENT_DATE - interval '18 days',
          v_demo_metadata
        )
        RETURNING id INTO v_job_id;
        
        PERFORM public.upsert_invoice_from_job(v_job_id);
        SELECT id INTO v_invoice_id
        FROM public.invoices
        WHERE job_id = v_job_id
          AND company_id = p_company_id
        LIMIT 1;
        
        IF v_invoice_id IS NOT NULL THEN
          UPDATE public.invoices
          SET metadata = v_demo_metadata,
              status = 'overdue',
              sent_at = CURRENT_DATE - interval '18 days',
              due_date = CURRENT_DATE - interval '4 days' -- Past due
          WHERE id = v_invoice_id;
          v_invoice_ids := array_append(v_invoice_ids, v_invoice_id);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
        RAISE WARNING 'Error creating overdue invoice: %', v_error_message;
      END;
    END IF;

    -- Invoice 3: Paid (for job 4, but need to mark invoice as paid)
    IF array_length(v_job_ids, 1) >= 4 THEN
      BEGIN
        PERFORM public.upsert_invoice_from_job(v_job_ids[4]);
        SELECT id INTO v_invoice_id
        FROM public.invoices
        WHERE job_id = v_job_ids[4]
          AND company_id = p_company_id
        LIMIT 1;
        
        IF v_invoice_id IS NOT NULL THEN
          UPDATE public.invoices
          SET metadata = v_demo_metadata,
              status = 'paid',
              sent_at = CURRENT_DATE - interval '6 days',
              paid_at = CURRENT_DATE - interval '4 days',
              due_date = CURRENT_DATE - interval '6 days' + interval '14 days'
          WHERE id = v_invoice_id;
          
          -- Recompute to ensure balance_due is correct
          BEGIN
            PERFORM public.recompute_invoice_status(v_invoice_id);
          EXCEPTION WHEN OTHERS THEN
            NULL; -- Ignore if function doesn't exist yet
          END;
          
          v_invoice_ids := array_append(v_invoice_ids, v_invoice_id);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
        RAISE WARNING 'Error creating paid invoice: %', v_error_message;
      END;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
    RAISE WARNING 'Error inserting demo invoices: %', v_error_message;
  END;

  -- 11) Insert 2 demo crew members
  BEGIN
    WITH ins AS (
      INSERT INTO public.crew_members (company_id, full_name, email, phone, role, metadata)
      VALUES
        (p_company_id, 'Demo Worker One', 'demo.worker1@example.com', '(555) 666-6666', 'crew', v_demo_metadata),
        (p_company_id, 'Demo Worker Two', 'demo.worker2@example.com', '(555) 777-7777', 'lead', v_demo_metadata)
      ON CONFLICT DO NOTHING
      RETURNING id
    )
    SELECT array_agg(id) INTO v_crew_ids FROM ins;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
    RAISE WARNING 'Error inserting demo crew members: %', v_error_message;
  END;

  -- Fetch crew IDs if needed
  IF array_length(v_crew_ids, 1) IS NULL OR array_length(v_crew_ids, 1) = 0 THEN
    SELECT ARRAY_AGG(id) INTO v_crew_ids
    FROM public.crew_members
    WHERE company_id = p_company_id
      AND metadata->>'demo' = 'true'
    LIMIT 2;
  END IF;

  -- Return success
  RETURN jsonb_build_object(
    'status', 'ok',
    'customers_created', COALESCE(array_length(v_customer_ids, 1), 0),
    'services_created', COALESCE(array_length(v_service_ids, 1), 0),
    'quotes_created', COALESCE(array_length(v_quote_ids, 1), 0),
    'jobs_created', COALESCE(array_length(v_job_ids, 1), 0),
    'payments_created', COALESCE(array_length(v_payment_ids, 1), 0),
    'invoices_created', COALESCE(array_length(v_invoice_ids, 1), 0),
    'crew_created', COALESCE(array_length(v_crew_ids, 1), 0)
  );
END;
$$;

-- 3) Create RPC: public.purge_demo_data(p_company_id uuid)
CREATE OR REPLACE FUNCTION public.purge_demo_data(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id uuid;
  v_caller_company_id uuid;
  v_role text;
  v_deleted_counts jsonb;
  v_customers_deleted int := 0;
  v_services_deleted int := 0;
  v_quotes_deleted int := 0;
  v_jobs_deleted int := 0;
  v_payments_deleted int := 0;
  v_invoices_deleted int := 0;
  v_crew_deleted int := 0;
BEGIN
  -- 1) Require authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'AUTH_REQUIRED',
      'message', 'Authentication required'
    );
  END IF;

  -- 2) Get caller profile: company_id + role
  SELECT p.company_id, p.role INTO v_caller_company_id, v_role
  FROM public.profiles p
  WHERE p.id = v_user_id;

  IF v_caller_company_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'NO_COMPANY',
      'message', 'User must be associated with a company'
    );
  END IF;

  -- 3) Only admin/manager can purge demo data
  IF v_role NOT IN ('admin', 'manager') THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'FORBIDDEN',
      'message', 'Only admins and managers can purge demo data'
    );
  END IF;

  -- 4) Validate company_id matches caller's company
  IF p_company_id != v_caller_company_id THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'FORBIDDEN',
      'message', 'Cannot purge demo data for another company'
    );
  END IF;

  -- 5) Delete demo data (order matters due to foreign keys)
  -- Delete payments first (references jobs)
  DELETE FROM public.payments
  WHERE company_id = p_company_id
    AND metadata->>'demo' = 'true';
  GET DIAGNOSTICS v_payments_deleted = ROW_COUNT;

  -- Delete invoices (references jobs)
  DELETE FROM public.invoices
  WHERE company_id = p_company_id
    AND metadata->>'demo' = 'true';
  GET DIAGNOSTICS v_invoices_deleted = ROW_COUNT;

  -- Delete jobs (references customers)
  DELETE FROM public.jobs
  WHERE company_id = p_company_id
    AND metadata->>'demo' = 'true';
  GET DIAGNOSTICS v_jobs_deleted = ROW_COUNT;

  -- Delete quotes (references customers)
  DELETE FROM public.quotes
  WHERE company_id = p_company_id
    AND metadata->>'demo' = 'true';
  GET DIAGNOSTICS v_quotes_deleted = ROW_COUNT;

  -- Delete customers
  DELETE FROM public.customers
  WHERE company_id = p_company_id
    AND metadata->>'demo' = 'true';
  GET DIAGNOSTICS v_customers_deleted = ROW_COUNT;

  -- Delete services
  DELETE FROM public.services
  WHERE company_id = p_company_id
    AND metadata->>'demo' = 'true';
  GET DIAGNOSTICS v_services_deleted = ROW_COUNT;

  -- Delete crew members
  DELETE FROM public.crew_members
  WHERE company_id = p_company_id
    AND metadata->>'demo' = 'true';
  GET DIAGNOSTICS v_crew_deleted = ROW_COUNT;

  -- Return deleted counts
  RETURN jsonb_build_object(
    'status', 'ok',
    'deleted_counts', jsonb_build_object(
      'customers', v_customers_deleted,
      'services', v_services_deleted,
      'quotes', v_quotes_deleted,
      'jobs', v_jobs_deleted,
      'payments', v_payments_deleted,
      'invoices', v_invoices_deleted,
      'crew_members', v_crew_deleted
    )
  );
END;
$$;

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION public.seed_demo_data(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_demo_data(uuid) TO authenticated;

COMMIT;
