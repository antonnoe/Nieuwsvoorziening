-- Herstelronde 2 (23-11-2026). Beide kolommen zijn al door de regisseur toegevoegd; dit bestand is voor het archief.
alter table nv_berichten add column if not exists regelversie integer not null default 1;
alter table nv_peil_lezerszin add column if not exists titel text;
