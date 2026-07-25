-- Custom SQL migration file, put your code below! --

-- uuid_generate_v7(): time-ordered UUIDv7 generator (not stock Postgres; uuid-ossp
-- only ships v1/v4). Built on gen_random_uuid() (built-in since PG13) — overlays the
-- current unix-millis timestamp into the first 48 bits and stamps version 7.
-- Table PK defaults reference this, so it must exist before any CREATE TABLE.
CREATE OR REPLACE FUNCTION uuid_generate_v7()
RETURNS uuid
AS $$
BEGIN
  RETURN encode(
    set_bit(
      set_bit(
        overlay(
          uuid_send(gen_random_uuid())
          PLACING substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
          FROM 1 FOR 6
        ),
        52, 1
      ),
      53, 1
    ),
    'hex')::uuid;
END
$$
LANGUAGE plpgsql
VOLATILE;
