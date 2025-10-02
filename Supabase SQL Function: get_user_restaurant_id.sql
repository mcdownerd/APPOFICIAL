CREATE OR REPLACE FUNCTION public.get_user_restaurant_id()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_restaurant_id text;
BEGIN
    SELECT restaurant_id INTO user_restaurant_id
    FROM public.profiles
    WHERE id = auth.uid();

    RETURN user_restaurant_id;
END;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_restaurant_id() TO authenticated;