-- Link login accounts to employee records.
--
-- A login can only use the self-service portal when its profile is linked to an
-- employees row through employees.user_id. Older seed data created both records
-- with the same e-mail address but never set the link.
--
-- Backfill unambiguous matches first, then enforce one employee per login.

-- Never choose which existing employee should lose access automatically.
DO $$
BEGIN
  IF EXISTS (
    SELECT user_id FROM employees WHERE user_id IS NOT NULL
    GROUP BY user_id HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate employee login links exist; resolve employees.user_id duplicates before applying migration 0013';
  END IF;
END $$;

UPDATE employees e
SET user_id = p.user_id
FROM profiles p
WHERE e.shop_id = p.shop_id
  AND e.user_id IS NULL
  AND p.email IS NOT NULL
  AND e.email IS NOT NULL
  AND trim(e.email) <> ''
  AND lower(trim(e.email)) = lower(trim(p.email))
  AND (SELECT COUNT(*) FROM employees candidate
       WHERE candidate.shop_id = e.shop_id
         AND lower(trim(candidate.email)) = lower(trim(e.email))) = 1
  AND (SELECT COUNT(*) FROM profiles candidate
       WHERE candidate.shop_id = p.shop_id
         AND lower(trim(candidate.email)) = lower(trim(p.email))) = 1
  AND NOT EXISTS (
    SELECT 1 FROM employees linked WHERE linked.user_id = p.user_id
  );

CREATE UNIQUE INDEX IF NOT EXISTS ux_employees_user_id
  ON employees(user_id)
  WHERE user_id IS NOT NULL;
