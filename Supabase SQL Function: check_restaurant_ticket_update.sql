CREATE OR REPLACE FUNCTION public.check_restaurant_ticket_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER -- Executa com os privilégios do criador (admin), permitindo acesso à tabela profiles
AS $$
DECLARE
    user_role text;
    user_restaurant_id text;
BEGIN
    -- Obter o papel e o restaurant_id do utilizador autenticado
    SELECT p.user_role, p.restaurant_id
    INTO user_role, user_restaurant_id
    FROM public.profiles p
    WHERE p.id = auth.uid();

    -- Se o utilizador for um 'restaurante' e o NEW.restaurant_id não corresponder ao seu, lançar um erro
    IF user_role = 'restaurante' AND NEW.restaurant_id IS DISTINCT FROM user_restaurant_id THEN
        RAISE EXCEPTION 'Permission denied: Restaurants can only update tickets belonging to their own restaurant_id.';
    END IF;

    -- Permitir a operação de UPDATE
    RETURN NEW;
END;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.check_restaurant_ticket_update() TO authenticated;