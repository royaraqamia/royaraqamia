-- Pin/featured posts so authors can keep key articles at the top of their dashboard
alter table public.posts add column if not exists featured boolean not null default false;
