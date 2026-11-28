-- Insee als overheidsbron (28-11-2026): de officiele RSS "Publications conjoncturelles" (insee.fr/fr/flux/3, genoemd op
-- insee.fr/fr/information/2381941). Gecontroleerd op 28-11-2026: HTTP 200, application/rss+xml, 115 items met titel, link en pubDate (omschrijving bij de prijsberichten leeg, de kop bevat het cijfer),
-- waaronder de Informations rapides over de prijzen (flash-raming eind van de maand, definitieve IPC/IPCH midden van de maand). De IPCH van november
-- bepaalt de jaarlijkse verhoging van de taxe fonciere (revalorisation des valeurs locatives, art. 1518 bis CGI).
-- Status ACTIVE want de feed werkt. Wordt door de regisseur toegepast; veilig om opnieuw uit te voeren.
insert into public.nv_bronnen (id, naam, feed, domein, taal, land, groep, regime, status, prioriteit, frankrijk_filter, venster_uren, notitie, soort, actief, toegevoegd_door, uitsluit) values
  ('insee-conjoncture', 'Insee - publications conjoncturelles', 'https://www.insee.fr/fr/flux/3', 'insee.fr', 'fr', 'FR', 'overheid', 'overheid', 'ACTIVE', 2, false, 168, 'Officiele RSS van Insee (flux 3, Publications conjoncturelles), gecontroleerd 28-11-2026: 200, 115 items. Bevat de Informations rapides over prijzen (IPC, IPCH, flash-raming). Ook ander conjunctuurnieuws; het model beoordeelt de relevantie.', 'nieuws', true, 'bronnen.json (Insee, 28-11-2026)', null)
on conflict (id) do nothing;
