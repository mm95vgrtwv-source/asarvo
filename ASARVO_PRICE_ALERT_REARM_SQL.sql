-- ASARVO
-- Price alert re-arm protection
--
-- Gdy użytkownik faktycznie zmieni target_price,
-- alert e-mail zostaje ponownie uzbrojony.
--
-- Dzięki temu mechanizm działa niezależnie od miejsca,
-- z którego aplikacja aktualizuje próg ceny.

create or replace function public.asarvo_rearm_price_alert_on_target_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.target_price is distinct from old.target_price then
    new.email_alert_armed := true;
  end if;

  return new;
end;
$$;

drop trigger if exists asarvo_rearm_price_alert_on_target_change
on public.price_watches;

create trigger asarvo_rearm_price_alert_on_target_change
before update of target_price
on public.price_watches
for each row
execute function public.asarvo_rearm_price_alert_on_target_change();