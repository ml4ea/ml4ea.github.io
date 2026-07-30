-- Align protected AE delivery with the Restricted Educational Use Terms.

update public.ae_delivery_settings
set notice_version = 'restricted-educational-use-2026-07-30',
    notice_text = 'Application Example notebooks are limited to the authorized user''s personal learning and, for instructors, preparation and teaching of courses they personally teach. Do not share, redistribute, publish, post, sublicense, sell, or provide notebook files to others. Each student must obtain a personal copy through an authorized ML4EA portal account.',
    updated_at = now()
where singleton;
