-- No backfill (#142): the only install is redeployed, so existing apps are dropped.
TRUNCATE "release", "app";
