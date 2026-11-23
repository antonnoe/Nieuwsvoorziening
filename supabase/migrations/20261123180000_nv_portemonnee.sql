-- Filter "Raakt uw portemonnee": berichten met een concreet financieel gevolg voor de lezer (herstelronde 1, 23-11-2026).
alter table public.nv_berichten add column if not exists portemonnee boolean not null default false;
