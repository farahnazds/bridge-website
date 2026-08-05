-- ============================================================================
-- Seed: elite_benchmarks — basketball, the platform's first onboarded sport
-- ============================================================================
-- database/schema.sql already has the elite_benchmarks table and its RLS
-- ("authenticated read" / "super admin writes" — unchanged, no new policy
-- needed here, this is data only). It has never been populated, which meant
-- the Body Composition report could describe an athlete's own trend over
-- time but could not compare them against elite benchmarks for their
-- sport/gender/age band — a real part of what makes that report useful, per
-- docs/07-ai-engine.md ("Multi-sport elite benchmarks... only the sport(s)
-- with a real onboarded club have populated data (currently basketball)").
--
-- *** STARTING REFERENCE VALUES — NOT CLINICALLY VALIDATED ***
-- Figures below are reasonable, defensible approximations drawn from
-- commonly cited sports-science body-composition norms for basketball
-- (e.g., NSCA/ACSM team-sport reference ranges: male basketball body fat
-- roughly 6-12%, female roughly 20-27%). They are meant to unblock the
-- Body Composition report's benchmark-comparison feature, NOT to stand as
-- clinically authoritative figures. Review with a qualified sports
-- nutritionist/dietitian before treating these as prescriptive for real
-- athletes — see source_note on each row.
--
-- Age bands: U18 = 13-17, U20 = 18-19, Senior = 20+. lean_mass_ratio is
-- derived directly from body_fat_pct (1 - body_fat_pct/100) for internal
-- consistency between the two figures.
-- ============================================================================

insert into elite_benchmarks
  (sport, gender, age_band, age_min, age_max, body_fat_pct, lean_mass_ratio, kcal_per_kg_lean_mass, source_note)
values
  ('Basketball', 'male',   'U18',    13, 17, 10.0, 0.90, 45,
   'Starting reference value, not clinically validated — approximate range based on commonly cited sports-science norms for basketball (NSCA/ACSM team-sport guidelines). Adolescent band uses a higher kcal/kg lean mass to account for concurrent growth + training demand. Review with a qualified sports nutritionist before clinical/prescriptive use.'),
  ('Basketball', 'male',   'U20',    18, 19, 9.0,  0.91, 44,
   'Starting reference value, not clinically validated — approximate range based on commonly cited sports-science norms for basketball (NSCA/ACSM team-sport guidelines). Review with a qualified sports nutritionist before clinical/prescriptive use.'),
  ('Basketball', 'male',   'Senior', 20, 99, 8.0,  0.92, 42,
   'Starting reference value, not clinically validated — approximate range based on commonly cited sports-science norms for elite senior basketball (NSCA/ACSM team-sport guidelines). Review with a qualified sports nutritionist before clinical/prescriptive use.'),
  ('Basketball', 'female', 'U18',    13, 17, 23.0, 0.77, 42,
   'Starting reference value, not clinically validated — approximate range based on commonly cited sports-science norms for basketball (NSCA/ACSM team-sport guidelines); female essential fat baseline is naturally higher than male. Adolescent band uses a higher kcal/kg lean mass to account for concurrent growth + training demand. Review with a qualified sports nutritionist before clinical/prescriptive use.'),
  ('Basketball', 'female', 'U20',    18, 19, 22.0, 0.78, 41,
   'Starting reference value, not clinically validated — approximate range based on commonly cited sports-science norms for basketball (NSCA/ACSM team-sport guidelines). Review with a qualified sports nutritionist before clinical/prescriptive use.'),
  ('Basketball', 'female', 'Senior', 20, 99, 21.0, 0.79, 40,
   'Starting reference value, not clinically validated — approximate range based on commonly cited sports-science norms for elite senior basketball (NSCA/ACSM team-sport guidelines). Review with a qualified sports nutritionist before clinical/prescriptive use.')
on conflict (sport, gender, age_band) do nothing;
