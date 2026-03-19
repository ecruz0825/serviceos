-- =============================================================================
-- Test Script for respond_to_quote_public() Validation and Idempotency
-- Run this in Supabase SQL Editor to validate the RPC function
-- =============================================================================

-- Setup: Create test data (adjust company_id and customer_id to match your test data)
-- You may need to replace these UUIDs with actual IDs from your database

DO $$
DECLARE
  v_test_company_id uuid;
  v_test_customer_id uuid;
  v_valid_token uuid := gen_random_uuid();
  v_expired_token uuid := gen_random_uuid();
  v_result jsonb;
  v_job_id_1 uuid;
  v_job_id_2 uuid;
BEGIN
  -- Get test company and customer (use first available, or set specific IDs)
  SELECT id INTO v_test_company_id FROM public.companies LIMIT 1;
  SELECT id INTO v_test_customer_id FROM public.customers WHERE company_id = v_test_company_id LIMIT 1;

  IF v_test_company_id IS NULL OR v_test_customer_id IS NULL THEN
    RAISE EXCEPTION 'Test setup failed: Need at least one company and customer';
  END IF;

  RAISE NOTICE 'Using company_id: %, customer_id: %', v_test_company_id, v_test_customer_id;

  -- Clean up any existing test quotes
  DELETE FROM public.quotes WHERE public_token IN (v_valid_token, v_expired_token);

  -- Create test quote 1: Valid, not expired, status='sent'
  INSERT INTO public.quotes (
    company_id,
    customer_id,
    quote_number,
    status,
    expires_at,
    public_token,
    total
  ) VALUES (
    v_test_company_id,
    v_test_customer_id,
    'TEST-VALID-001',
    'sent',
    now() + interval '14 days',  -- Valid for 14 days
    v_valid_token,
    100.00
  );

  -- Create test quote 2: Expired, status='sent'
  INSERT INTO public.quotes (
    company_id,
    customer_id,
    quote_number,
    status,
    expires_at,
    public_token,
    total
  ) VALUES (
    v_test_company_id,
    v_test_customer_id,
    'TEST-EXPIRED-001',
    'sent',
    now() - interval '1 day',  -- Expired yesterday
    v_expired_token,
    200.00
  );

  RAISE NOTICE '=== Test 1: Accept valid quote (should succeed) ===';
  v_result := public.respond_to_quote_public(
    v_valid_token,
    'accept',
    'Test User',
    'Test comment'
  );
  RAISE NOTICE 'Result: %', v_result;
  
  -- Extract job_id for idempotency test
  v_job_id_1 := v_result->>'job_id';
  
  IF (v_result->>'ok')::boolean = true AND v_result->>'status' = 'accepted' AND v_job_id_1 IS NOT NULL THEN
    RAISE NOTICE '✓ Test 1 PASSED: Accept valid quote succeeded';
  ELSE
    RAISE EXCEPTION '✗ Test 1 FAILED: Expected ok=true, status=accepted, job_id not null';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '=== Test 2: Accept same quote again (idempotency - should return same job_id) ===';
  v_result := public.respond_to_quote_public(
    v_valid_token,
    'accept',
    'Test User 2',
    'Different comment'
  );
  RAISE NOTICE 'Result: %', v_result;
  
  v_job_id_2 := v_result->>'job_id';
  
  IF (v_result->>'ok')::boolean = true 
     AND v_result->>'status' = 'accepted' 
     AND v_job_id_2 = v_job_id_1 THEN
    RAISE NOTICE '✓ Test 2 PASSED: Idempotent accept returned same job_id';
  ELSE
    RAISE EXCEPTION '✗ Test 2 FAILED: Expected ok=true, status=accepted, job_id=% but got %', v_job_id_1, v_job_id_2;
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '=== Test 3: Reject after acceptance (should fail with already_responded) ===';
  v_result := public.respond_to_quote_public(
    v_valid_token,
    'reject',
    'Test User 3',
    'Trying to reject'
  );
  RAISE NOTICE 'Result: %', v_result;
  
  IF (v_result->>'ok')::boolean = false 
     AND v_result->>'error' = 'already_responded' THEN
    RAISE NOTICE '✓ Test 3 PASSED: Reject after acceptance correctly rejected';
  ELSE
    RAISE EXCEPTION '✗ Test 3 FAILED: Expected ok=false, error=already_responded';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '=== Test 4: Accept expired quote (should fail with expired) ===';
  v_result := public.respond_to_quote_public(
    v_expired_token,
    'accept',
    'Test User 4',
    'Trying to accept expired'
  );
  RAISE NOTICE 'Result: %', v_result;
  
  IF (v_result->>'ok')::boolean = false 
     AND v_result->>'error' = 'expired' THEN
    RAISE NOTICE '✓ Test 4 PASSED: Accept expired quote correctly rejected';
  ELSE
    RAISE EXCEPTION '✗ Test 4 FAILED: Expected ok=false, error=expired';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '=== All Tests Passed! ===';
  
  -- Cleanup
  DELETE FROM public.quotes WHERE public_token IN (v_valid_token, v_expired_token);
  DELETE FROM public.jobs WHERE id = v_job_id_1;
  
  RAISE NOTICE 'Test cleanup completed';

EXCEPTION
  WHEN OTHERS THEN
    -- Cleanup on error
    DELETE FROM public.quotes WHERE public_token IN (v_valid_token, v_expired_token);
    IF v_job_id_1 IS NOT NULL THEN
      DELETE FROM public.jobs WHERE id = v_job_id_1;
    END IF;
    RAISE;
END $$;

