-- 043: Renderer provenance on reports.
--
-- WHY: when a practitioner reported a PDF as "plain text, no branding", the
-- only way to establish which renderer produced it was forensic — downloading
-- the PDFs and fingerprinting decoded content streams — because the
-- structured-vs-fallback decision lived only in a transient action-result
-- note. The answer to "which renderer made this file" should be a query.
--
-- `renderer`: which path produced the stored PDF. NULL on rows that predate
-- this migration (their provenance is genuinely unknown without forensics)
-- and on rows with no PDF at all.
-- `render_fallback_reason`: the error message that made the structured layout
-- fall back, when it did — the exact string previously surfaced only in the
-- transient warning. NULL when the structured path succeeded.
alter table reports
  add column if not exists renderer text check (renderer in ('structured', 'fallback')),
  add column if not exists render_fallback_reason text;

comment on column reports.renderer is
  'Which PDF renderer produced file_url: ''structured'' (lib/reportPdf/ layouts) or ''fallback'' (the original markdown renderer, used when the structured path throws). NULL predates migration 043 or means no PDF. Written by lib/reportPdfDelivery.ts after upload.';
comment on column reports.render_fallback_reason is
  'When renderer=''fallback'', the error that made the structured layout fall back. The diagnostic that used to exist only as a transient UI note.';

-- RLS unchanged: reports policies already govern row visibility, and these
-- columns carry no data the row''s reader may not see.

notify pgrst, 'reload schema';
