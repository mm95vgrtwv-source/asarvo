ASARVO — E-MAIL ALERTY CENOWE (BREVO)

WAŻNE: najpierw uruchom SUPABASE_EMAIL_ALERTS.sql w Supabase SQL Editor.

Następnie skopiuj foldery app i lib do:
C:\Users\artur\ai-shopping

Potem uzupełnij .env.local:
BREVO_API_KEY=TU_WKLEJ_SWÓJ_KLUCZ
BREVO_SENDER_EMAIL=TWÓJ_ZWERYFIKOWANY_NADAWCA
BREVO_SENDER_NAME=ASARVO

NIE wysyłaj nikomu klucza BREVO_API_KEY.

Po zmianie .env.local:
Ctrl+C
npm run dev

Test:
1. /account
2. Obserwowane ceny
3. Włącz e-maile
4. Wyślij testowy e-mail
5. Sprawdź skrzynkę i spam.

Mechanizm:
- e-mail jest wysyłany tylko gdy cena wejdzie w ustawiony próg,
- nie spamuje przy każdym kolejnym checku poniżej progu,
- gdy cena wyjdzie ponad próg, alert uzbraja się ponownie,
- zmiana progu uzbraja nowy alert.
