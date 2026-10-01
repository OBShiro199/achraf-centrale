-- Testing price, matching the Whop plan while the full flow is tested. Set back to 149 before launch:
--   update public.plans set price = 149 where id = 'monthly';
update public.plans set price = 1 where id = 'monthly';
