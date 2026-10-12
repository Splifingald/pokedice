-- Admin → Trades reads the open listings straight from trade_listings (src/admin/sections/TradesSection.tsx), but 0044
-- revoked every privilege on the table from `authenticated` and granted none back, so the read stopped at "permission
-- denied for table trade_listings" before 0044's admin policy was ever asked. Players still read and write listings
-- only through the trade_* functions: SELECT alone comes back, and the policy shows rows to the admin and nobody else
-- (as players: 0028). Removing a listing stays trade_remove. Run after 0044; safe to run again.

grant select on trade_listings to authenticated;
