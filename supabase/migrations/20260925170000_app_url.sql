-- Public app URL used in notification email links (read by edge functions via get_app_secret).
select vault.create_secret('https://achraf-centrale.vercel.app', 'APP_URL');
