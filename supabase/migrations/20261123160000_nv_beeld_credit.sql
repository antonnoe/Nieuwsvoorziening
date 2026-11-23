-- Bronvermelding bij een beeld (Unsplash: maker, link naar maker, link naar de foto). Besluit 23-11-2026.
alter table public.nv_berichten add column if not exists beeld_credit jsonb;
