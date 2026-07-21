create or replace function public.is_game_member(target_game_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.players
    where game_id = target_game_id
      and user_id = (select auth.uid())
      and is_active = true
  );
$$;

drop policy if exists "players can view only their own responses" on public.responses;

create policy "players can view only their own responses"
on public.responses
for select
to authenticated
using (
  exists (
    select 1
    from public.players
    join public.rounds on public.rounds.id = public.responses.round_id
    where public.players.id = public.responses.player_id
      and public.players.user_id = (select auth.uid())
      and public.is_game_member(public.rounds.game_id)
  )
);

create index if not exists idx_game_events_actor_player_id on public.game_events(actor_player_id);
create index if not exists idx_game_events_game_id on public.game_events(game_id);
create index if not exists idx_game_events_round_id on public.game_events(round_id);
create index if not exists idx_game_prompt_deck_prompt_card_id on public.game_prompt_deck(prompt_card_id);
create index if not exists idx_responses_player_id on public.responses(player_id);
create index if not exists idx_rounds_presenter_player_id on public.rounds(presenter_player_id);
create index if not exists idx_rounds_prompt_card_id on public.rounds(prompt_card_id);
create index if not exists idx_rounds_winner_response_id on public.rounds(winner_response_id);

revoke all on function public.current_player(uuid) from authenticated;
revoke all on function public.finalize_submissions(uuid) from authenticated;
