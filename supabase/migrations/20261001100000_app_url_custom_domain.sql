-- The app now lives on its own domain; links in emails, billing return URLs and deck fonts use APP_URL.
select vault.update_secret(id, 'https://www.centralegtm.com') from vault.secrets where name = 'APP_URL';
