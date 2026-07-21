grant usage on schema public to authenticated;

create or replace function public.current_player(target_game_id uuid)
returns public.players
language sql
security definer
set search_path = public
stable
as $$
  select players.*
  from public.players
  where players.game_id = target_game_id
    and players.user_id = auth.uid()
    and players.is_active = true
  limit 1;
$$;

create or replace function public.create_game(nickname text, game_name text default 'We''re All Going to Hell')
returns table (
  game_id uuid,
  room_code varchar(4),
  player_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate_code text;
  created_game_id uuid;
  created_player_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if btrim(nickname) = '' then
    raise exception 'Nickname is required';
  end if;

  loop
    candidate_code :=
      substr(allowed, 1 + floor(random() * length(allowed))::int, 1) ||
      substr(allowed, 1 + floor(random() * length(allowed))::int, 1) ||
      substr(allowed, 1 + floor(random() * length(allowed))::int, 1) ||
      substr(allowed, 1 + floor(random() * length(allowed))::int, 1);

    exit when not exists (
      select 1
      from public.games
      where games.room_code = candidate_code
    );
  end loop;

  insert into public.games (room_code, name, host_user_id, status)
  values (
    candidate_code,
    coalesce(nullif(left(btrim(game_name), 48), ''), 'We''re All Going to Hell'),
    auth.uid(),
    'lobby'
  )
  returning id into created_game_id;

  insert into public.players (game_id, user_id, nickname, seat_order, is_host)
  values (created_game_id, auth.uid(), left(btrim(nickname), 32), 0, true)
  returning id into created_player_id;

  return query
  select created_game_id, candidate_code::varchar(4), created_player_id;
end;
$$;

create or replace function public.join_game(room_code_input text, nickname text)
returns table (
  game_id uuid,
  room_code varchar(4),
  player_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_game public.games;
  existing_player public.players;
  created_player_id uuid;
  next_seat integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into target_game
  from public.games
  where games.room_code = upper(room_code_input);

  if target_game.id is null then
    raise exception 'Room not found';
  end if;

  if target_game.status <> 'lobby' then
    raise exception 'Game already started';
  end if;

  select *
  into existing_player
  from public.players
  where players.game_id = target_game.id
    and players.user_id = auth.uid();

  if existing_player.id is not null then
    update public.players
    set nickname = left(btrim(nickname), 32),
        is_connected = true,
        last_seen_at = now()
    where id = existing_player.id;

    return query
    select target_game.id, target_game.room_code, existing_player.id;
    return;
  end if;

  if (
    select count(*)
    from public.players
    where players.game_id = target_game.id
      and players.is_active = true
  ) >= 8 then
    raise exception 'Room is full';
  end if;

  select coalesce(max(players.seat_order), -1) + 1
  into next_seat
  from public.players
  where players.game_id = target_game.id;

  insert into public.players (game_id, user_id, nickname, seat_order)
  values (target_game.id, auth.uid(), left(btrim(nickname), 32), next_seat)
  returning id into created_player_id;

  return query
  select target_game.id, target_game.room_code, created_player_id;
end;
$$;

create or replace function public.start_game(target_game_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_player public.players;
  presenter_player_id uuid;
  chosen_prompt_id bigint;
  created_round_id uuid;
begin
  acting_player := public.current_player(target_game_id);

  if acting_player.id is null or not acting_player.is_host then
    raise exception 'Only the host can start the game';
  end if;

  if (
    select count(*)
    from public.players
    where players.game_id = target_game_id
      and players.is_active = true
  ) < 2 then
    raise exception 'At least two players are required';
  end if;

  perform 1
  from public.games
  where games.id = target_game_id
  for update;

  select players.id
  into presenter_player_id
  from public.players
  where players.game_id = target_game_id
    and players.is_active = true
  order by random()
  limit 1;

  if not exists (
    select 1
    from public.game_prompt_deck
    where game_prompt_deck.game_id = target_game_id
  ) then
    insert into public.game_prompt_deck (game_id, prompt_card_id, deck_position)
    select target_game_id, prompt_cards.id, row_number() over (order by random())
    from public.prompt_cards
    where prompt_cards.is_active = true;
  end if;

  select game_prompt_deck.prompt_card_id
  into chosen_prompt_id
  from public.game_prompt_deck
  where game_prompt_deck.game_id = target_game_id
    and game_prompt_deck.used_at is null
  order by game_prompt_deck.deck_position
  limit 1;

  insert into public.rounds (
    game_id,
    round_number,
    presenter_player_id,
    prompt_card_id,
    status,
    submission_deadline_warning_at
  )
  values (
    target_game_id,
    1,
    presenter_player_id,
    chosen_prompt_id,
    'collecting',
    now() + interval '60 seconds'
  )
  returning id into created_round_id;

  update public.games
  set status = 'active',
      round_number = 1,
      started_at = now(),
      current_round_id = created_round_id,
      current_presenter_player_id = presenter_player_id
  where id = target_game_id;

  update public.game_prompt_deck
  set used_at = now()
  where game_id = target_game_id
    and prompt_card_id = chosen_prompt_id;

  return created_round_id;
end;
$$;

create or replace function public.submit_response(target_round_id uuid, response_text_input text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_round public.rounds;
  acting_player public.players;
  response_id uuid;
begin
  select *
  into target_round
  from public.rounds
  where rounds.id = target_round_id
  for update;

  if target_round.id is null then
    raise exception 'Round not found';
  end if;

  acting_player := public.current_player(target_round.game_id);

  if acting_player.id is null or not acting_player.is_active then
    raise exception 'Only active players can submit';
  end if;

  if acting_player.id = target_round.presenter_player_id then
    raise exception 'Presenter cannot submit';
  end if;

  if target_round.status <> 'collecting' then
    raise exception 'Round is not collecting responses';
  end if;

  if btrim(response_text_input) = '' then
    raise exception 'Response cannot be blank';
  end if;

  insert into public.responses (round_id, player_id, response_text)
  values (target_round_id, acting_player.id, left(response_text_input, 300))
  returning id into response_id;

  perform public.finalize_submissions(target_round_id);

  return response_id;
end;
$$;

create or replace function public.finalize_submissions(target_round_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_round public.rounds;
  eligible_count integer;
  submitted_count integer;
begin
  select *
  into target_round
  from public.rounds
  where rounds.id = target_round_id
  for update;

  if target_round.id is null then
    raise exception 'Round not found';
  end if;

  select count(*)
  into eligible_count
  from public.players
  where players.game_id = target_round.game_id
    and players.is_active = true
    and players.id <> target_round.presenter_player_id;

  select count(*)
  into submitted_count
  from public.responses
  where responses.round_id = target_round_id;

  if submitted_count < eligible_count then
    return;
  end if;

  with randomized as (
    select responses.id, row_number() over (order by random()) as display_order
    from public.responses
    where responses.round_id = target_round_id
  )
  update public.responses
  set display_order = randomized.display_order
  from randomized
  where public.responses.id = randomized.id;

  update public.rounds
  set status = 'judging',
      all_submitted_at = now()
  where id = target_round_id
    and winner_response_id is null;
end;
$$;

create or replace function public.select_winner(target_round_id uuid, target_response_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_round public.rounds;
  acting_player public.players;
  winning_player_id uuid;
begin
  select *
  into target_round
  from public.rounds
  where rounds.id = target_round_id
  for update;

  if target_round.id is null then
    raise exception 'Round not found';
  end if;

  acting_player := public.current_player(target_round.game_id);

  if acting_player.id is null or acting_player.id <> target_round.presenter_player_id then
    raise exception 'Only the presenter can select the winner';
  end if;

  if target_round.winner_response_id is not null then
    raise exception 'Winner already selected';
  end if;

  select responses.player_id
  into winning_player_id
  from public.responses
  where responses.id = target_response_id
    and responses.round_id = target_round_id;

  if winning_player_id is null then
    raise exception 'Response not found in this round';
  end if;

  update public.responses
  set is_winner = true
  where id = target_response_id;

  update public.rounds
  set winner_response_id = target_response_id,
      status = 'winner_selected',
      completed_at = now()
  where id = target_round_id;

  update public.players
  set score = score + 1
  where id = winning_player_id;

  return target_response_id;
end;
$$;

create or replace function public.advance_round(target_game_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_round public.rounds;
  acting_player public.players;
  next_presenter_id uuid;
  chosen_prompt_id bigint;
  next_round_id uuid;
begin
  select *
  into previous_round
  from public.rounds
  where rounds.game_id = target_game_id
  order by rounds.round_number desc
  limit 1
  for update;

  if previous_round.id is null then
    raise exception 'Round not found';
  end if;

  acting_player := public.current_player(target_game_id);

  if acting_player.id is null or acting_player.id <> previous_round.presenter_player_id then
    raise exception 'Only the presenter can advance the round';
  end if;

  if previous_round.winner_response_id is null then
    raise exception 'Winner must be selected first';
  end if;

  select players.id
  into next_presenter_id
  from public.players
  where players.game_id = target_game_id
    and players.is_active = true
    and players.seat_order > (
      select seat_order
      from public.players
      where players.id = previous_round.presenter_player_id
    )
  order by players.seat_order
  limit 1;

  if next_presenter_id is null then
    select players.id
    into next_presenter_id
    from public.players
    where players.game_id = target_game_id
      and players.is_active = true
    order by players.seat_order
    limit 1;
  end if;

  select game_prompt_deck.prompt_card_id
  into chosen_prompt_id
  from public.game_prompt_deck
  where game_prompt_deck.game_id = target_game_id
    and game_prompt_deck.used_at is null
  order by game_prompt_deck.deck_position
  limit 1;

  if chosen_prompt_id is null then
    update public.game_prompt_deck
    set used_at = null
    where game_id = target_game_id;

    select game_prompt_deck.prompt_card_id
    into chosen_prompt_id
    from public.game_prompt_deck
    where game_prompt_deck.game_id = target_game_id
    order by deck_position
    limit 1;
  end if;

  insert into public.rounds (
    game_id,
    round_number,
    presenter_player_id,
    prompt_card_id,
    status,
    submission_deadline_warning_at
  )
  values (
    target_game_id,
    previous_round.round_number + 1,
    next_presenter_id,
    chosen_prompt_id,
    'collecting',
    now() + interval '60 seconds'
  )
  returning id into next_round_id;

  update public.games
  set current_round_id = next_round_id,
      current_presenter_player_id = next_presenter_id,
      round_number = previous_round.round_number + 1
  where id = target_game_id;

  update public.game_prompt_deck
  set used_at = now()
  where game_id = target_game_id
    and prompt_card_id = chosen_prompt_id;

  return next_round_id;
end;
$$;

create or replace function public.end_game(target_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_player public.players;
begin
  acting_player := public.current_player(target_game_id);

  if acting_player.id is null or not acting_player.is_host then
    raise exception 'Only the host can end the game';
  end if;

  update public.games
  set status = 'ended',
      ended_at = now()
  where id = target_game_id;
end;
$$;

create or replace function public.get_game_state(room_code_input text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_game public.games;
  viewer public.players;
  current_round public.rounds;
  presenter public.players;
  viewer_response public.responses;
  prompt_text_value text;
  eligible_count integer := 0;
  submitted_count integer := 0;
  players_json jsonb := '[]'::jsonb;
  responses_json jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into target_game
  from public.games
  where games.room_code = upper(room_code_input);

  if target_game.id is null then
    return null;
  end if;

  select *
  into viewer
  from public.players
  where players.game_id = target_game.id
    and players.user_id = auth.uid()
    and players.is_active = true
  limit 1;

  if viewer.id is null then
    return null;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', players.id,
        'nickname', players.nickname,
        'seatOrder', players.seat_order,
        'score', players.score,
        'isHost', players.is_host,
        'isActive', players.is_active,
        'isConnected', players.is_connected,
        'joinedAt', players.joined_at
      )
      order by players.seat_order
    ),
    '[]'::jsonb
  )
  into players_json
  from public.players
  where players.game_id = target_game.id;

  if target_game.current_round_id is not null then
    select *
    into current_round
    from public.rounds
    where rounds.id = target_game.current_round_id;

    select prompt_cards.prompt_text
    into prompt_text_value
    from public.prompt_cards
    where prompt_cards.id = current_round.prompt_card_id;

    select *
    into presenter
    from public.players
    where players.id = current_round.presenter_player_id;

    select count(*)
    into eligible_count
    from public.players
    where players.game_id = target_game.id
      and players.is_active = true
      and players.id <> current_round.presenter_player_id;

    select count(*)
    into submitted_count
    from public.responses
    where responses.round_id = current_round.id;

    select *
    into viewer_response
    from public.responses
    where responses.round_id = current_round.id
      and responses.player_id = viewer.id;

    if viewer.id = current_round.presenter_player_id
      and current_round.status in ('judging', 'winner_selected', 'completed') then
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', responses.id,
            'responseText', responses.response_text,
            'displayOrder', responses.display_order,
            'isWinner', responses.is_winner,
            'authorNickname',
              case
                when current_round.winner_response_id is not null and responses.is_winner then winning_player.nickname
                else null
              end
          )
          order by responses.display_order
        ),
        '[]'::jsonb
      )
      into responses_json
      from public.responses
      join public.players as winning_player on winning_player.id = responses.player_id
      where responses.round_id = current_round.id;
    elsif viewer_response.id is not null then
      responses_json := jsonb_build_array(
        jsonb_build_object(
          'id', viewer_response.id,
          'responseText', viewer_response.response_text,
          'displayOrder', viewer_response.display_order,
          'isWinner', viewer_response.is_winner,
          'authorNickname', null
        )
      );
    elsif current_round.winner_response_id is not null then
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', responses.id,
            'responseText', responses.response_text,
            'displayOrder', responses.display_order,
            'isWinner', responses.is_winner,
            'authorNickname',
              case when responses.is_winner then winning_player.nickname else null end
          )
          order by responses.display_order nulls last
        ),
        '[]'::jsonb
      )
      into responses_json
      from public.responses
      join public.players as winning_player on winning_player.id = responses.player_id
      where responses.round_id = current_round.id
        and responses.is_winner = true;
    end if;
  end if;

  return jsonb_build_object(
    'id', target_game.id,
    'roomCode', target_game.room_code,
    'name', target_game.name,
    'status', target_game.status,
    'currentRoundId', target_game.current_round_id,
    'currentPresenterPlayerId', target_game.current_presenter_player_id,
    'roundNumber', target_game.round_number,
    'createdAt', target_game.created_at,
    'startedAt', target_game.started_at,
    'endedAt', target_game.ended_at,
    'viewerPlayerId', viewer.id,
    'players', players_json,
    'currentRound',
      case
        when current_round.id is null then null
        else jsonb_build_object(
          'id', current_round.id,
          'roundNumber', current_round.round_number,
          'presenterPlayerId', current_round.presenter_player_id,
          'promptId', current_round.prompt_card_id,
          'promptText', prompt_text_value,
          'status', current_round.status,
          'startedAt', current_round.started_at,
          'submissionWarningAt', current_round.submission_deadline_warning_at,
          'allSubmittedAt', current_round.all_submitted_at,
          'completedAt', current_round.completed_at,
          'winnerResponseId', current_round.winner_response_id,
          'submittedCount', submitted_count,
          'eligibleCount', eligible_count,
          'winnerAuthorNickname',
            (
              select players.nickname
              from public.responses
              join public.players on players.id = responses.player_id
              where responses.id = current_round.winner_response_id
            ),
          'winnerResponseText',
            (
              select responses.response_text
              from public.responses
              where responses.id = current_round.winner_response_id
            ),
          'responses', responses_json
        )
      end
  );
end;
$$;

revoke all on function public.current_player(uuid) from public, anon;
revoke all on function public.create_game(text, text) from public, anon;
revoke all on function public.join_game(text, text) from public, anon;
revoke all on function public.start_game(uuid) from public, anon;
revoke all on function public.submit_response(uuid, text) from public, anon;
revoke all on function public.finalize_submissions(uuid) from public, anon;
revoke all on function public.select_winner(uuid, uuid) from public, anon;
revoke all on function public.advance_round(uuid) from public, anon;
revoke all on function public.end_game(uuid) from public, anon;
revoke all on function public.get_game_state(text) from public, anon;

grant execute on function public.create_game(text, text) to authenticated;
grant execute on function public.join_game(text, text) to authenticated;
grant execute on function public.start_game(uuid) to authenticated;
grant execute on function public.submit_response(uuid, text) to authenticated;
grant execute on function public.select_winner(uuid, uuid) to authenticated;
grant execute on function public.advance_round(uuid) to authenticated;
grant execute on function public.end_game(uuid) to authenticated;
grant execute on function public.get_game_state(text) to authenticated;
