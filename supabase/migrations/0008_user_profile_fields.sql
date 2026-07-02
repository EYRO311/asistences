alter table profiles
  add column if not exists age integer check (age >= 0 and age <= 120),
  add column if not exists gender text check (gender in ('masculino', 'femenino', 'no_binario', 'prefiero_no_decir'));
