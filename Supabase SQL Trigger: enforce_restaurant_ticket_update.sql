CREATE OR REPLACE TRIGGER enforce_restaurant_ticket_update
BEFORE UPDATE ON public.tickets
FOR EACH ROW
EXECUTE FUNCTION public.check_restaurant_ticket_update();