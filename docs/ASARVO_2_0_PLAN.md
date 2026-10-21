# ASARVO 2.0 — plan rozwoju

Data rozpoczecia: 2026-10-21
Baza: ASARVO 1.0 Beta (main, commit 4ea89820b272e15867d36214ef89192f61130aa3)
Galaz: develop/asarvo-2.0

## Cel
Zintegrowac rozwiazania wypracowane podczas prac nad ASARVO, lecz niewdrozone do stabilnej wersji 1.0 Beta. Bez automatycznego przenoszenia zmian, ktore nie przeszly walidacji.

## Zakres priorytetowy
1. Sklepy: audyt wszystkich ok. 400-445 skonfigurowanych domen/adaptorow. Konfiguracja nie oznacza dzialajacych sklepow. Dla kazdego sklepu odroznic: skonfigurowany, dostepny, wykrywa produkty, potwierdza strone produktu i cene, przechodzi realne E2E. Naprawiac etapami i zwiekszac liczbe realnie dzialajacych zrodel.
2. Silnik wyszukiwania: odzyskiwanie wynikow, exact match, deduplikacja, nazwa/parametry, weryfikacja ceny, odpornosc na 403/429; zachowac dzialajacy silnik 1.0 jako punkt odniesienia.
3. UI 2.0: polaczenie wczesniej wybranych koncepcji 2 i 3; premium karty wynikow, sidebar po lewej na XL, 2 kolumny wynikow na XL, poziome filtry mobilne, wyizolowane ulubione. Nowy UI wdrazac za niezaleznym adresem lub flaga, nie nadpisywac od razu strony glownej.
4. Funkcje: porownanie cen i dostawy, oceny/opinie i parametry, historia, ulubione, alerty cen, filtry; zachowac dzialajace funkcje 1.0 i wprowadzac reszte po testach.
5. Jakosc: backup, automatyczny rollback, exact SHA gate, build/typecheck, testy deterministyczne i realne E2E na Vercel; oddzielac symulowane przypadki od realnych HTTP.

## Znane ryzyka
- Poprzednia galaz release/asarvo-1.0 na Preview miala zero ofert mimo lokalnych wynikow; NIE scalac jej w calosci do main ani do 2.0.
- Liczba skonfigurowanych sklepow NIE jest liczba potwierdzonych dzialajacych sklepow.
- Beta 1.0 ma oddzielna, dzialajaca produkcje. Zachowac main jako stabilna linie.
- Drobne narzedziowe podatnosci npm audit i rzeczywista skutecznosc WAF/rate limit trzeba okresowo kontrolowac.

## Proces zmian
- Przed zmianami ustalic baze SHA i stan gita.
- Male, odwracalne paczki zmian; osobne testy dla UI i adapterow.
- Kazda nowa funkcja -> lokalny build -> niezalezne testy -> Vercel Preview -> dopiero PR do main.
- Raport: liczniki QUERY_COUNT / OFFERS / HOSTS, wyniki i nastepny krok; co 10 istotnych wynikow pelny raport.
- Zakaz force-push na main i nadpisywania dzialajacego silnika bez zielonych testow.

## Pierwszy etap
Inwentaryzacja kodu i gałęzi: main vs release/asarvo-1.0 oraz istniejące adaptery i UI. Sporzadzic liste zmian do bezpiecznego przeniesienia. Potem uruchomic UI 2.0 obok produkcji i osobny audyt adapterow.
