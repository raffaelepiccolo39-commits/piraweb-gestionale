INSERT INTO profiles (id, email, full_name, role) VALUES
  ('11111111-1111-1111-1111-111111111111','raffaele@piraweb.it','Raffaele','admin'),
  ('22222222-2222-2222-2222-222222222222','bernis@piraweb.it','Bernis','social_media_manager');

INSERT INTO deals (id, title, company_name, stage, value, monthly_value, source, owner_id, created_by, created_at) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','Lead da sito','Alfa Srl','lead',0,NULL,'website','11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111', now() - interval '40 days'),
  ('aaaaaaaa-0000-0000-0000-000000000002','Proposta social','Beta Spa','proposal',0,600,'referral','11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111', now() - interval '30 days'),
  ('aaaaaaaa-0000-0000-0000-000000000003','Sito vetrina','Gamma','negotiation',3500,NULL,'cold_outreach','11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111', now() - interval '20 days'),
  ('aaaaaaaa-0000-0000-0000-000000000004','Cliente chiuso','Delta','closed_won',0,900,'ads','11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111', now() - interval '60 days'),
  ('aaaaaaaa-0000-0000-0000-000000000005','Persa','Epsilon','closed_lost',1200,NULL,'event','11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111', now() - interval '50 days');

INSERT INTO deal_activities (deal_id, type, title, description, completed, created_by, created_at) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000002','call','Chiamata di apertura','Prima call', true,'11111111-1111-1111-1111-111111111111', now() - interval '29 days'),
  ('aaaaaaaa-0000-0000-0000-000000000003','note','Nota interna',NULL, false,'11111111-1111-1111-1111-111111111111', now() - interval '19 days');
