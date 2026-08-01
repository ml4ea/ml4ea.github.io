-- Publish the portal launch message as a pinned discussion-board announcement.

do $$
declare
  v_author_id uuid;
  v_category_id uuid;
  v_title constant text := 'The ML4EA companion portal is now open';
  v_body constant text := 'After careful design and development, followed by diligent verification of its content and key workflows, we are pleased to launch the companion portal for Machine Learning for Engineering Applications.

Explore the book resources, work with the Application Examples, share questions and insights, and contribute corrections, perspectives, and teaching materials. Your participation will help the portal remain useful, accurate, and responsive to the ML4EA community.';
begin
  select id into v_author_id
  from auth.users
  where lower(email) = 'yjin@usc.edu'
  order by created_at
  limit 1;

  if v_author_id is null then
    raise exception 'The portal owner account yjin@usc.edu was not found.';
  end if;

  select id into v_category_id
  from public.discussion_categories
  where slug = 'announcements';

  if v_category_id is null then
    raise exception 'The Announcements discussion category was not found.';
  end if;

  update public.discussion_threads
  set author_id = v_author_id,
      author_name = 'Author',
      body = v_body,
      status = 'open',
      pinned = true,
      updated_at = now()
  where category_id = v_category_id
    and lower(title) = lower(v_title);

  if not found then
    insert into public.discussion_threads (
      category_id,
      author_id,
      author_name,
      title,
      body,
      status,
      pinned,
      last_activity_at
    ) values (
      v_category_id,
      v_author_id,
      'Author',
      v_title,
      v_body,
      'open',
      true,
      now()
    );
  end if;
end;
$$;
