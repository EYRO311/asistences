-- Preferencias de viaje del usuario guardadas en su perfil.
-- preferred_transport: modo principal que usa (auto/bici/transporte público/a pie).
-- extra_buffer_minutes: minutos adicionales de margen que quiere sumar al tiempo de salida.
alter table profiles
  add column preferred_transport text check (preferred_transport in ('car','bike','public_transport','walking')),
  add column extra_buffer_minutes int not null default 0;
