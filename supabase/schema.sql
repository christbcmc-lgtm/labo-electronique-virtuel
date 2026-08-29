-- ============================================================================
-- LABORATOIRE ÉLECTRONIQUE VIRTUEL — schéma Supabase (PostgreSQL)
-- ============================================================================
-- À exécuter UNE FOIS dans l'éditeur SQL de votre projet Supabase
-- (Dashboard → SQL Editor → New query → coller ce fichier en entier → Run).
--
-- Avant d'exécuter : remplacez la valeur ADMIN_EMAIL_A_REMPLACER ci-dessous
-- (deux occurrences) par l'adresse e-mail réelle de l'administrateur.
-- Cette adresse doit correspondre exactement au compte que l'administrateur
-- utilisera pour s'inscrire une première fois via le formulaire normal.
--
-- Ordre d'exécution recommandé : ce fichier peut être exécuté en une seule
-- fois, les sections sont ordonnées pour respecter les dépendances.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. PROFILS — une ligne par utilisateur, liée à auth.users (géré par Supabase Auth)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  nom           text not null default '',
  prenom        text not null default '',
  email         text not null,
  role          text not null default 'membre' check (role in ('membre','admin')),
  account_type  text not null default 'solo' check (account_type in ('solo','groupe','communaute')),
  mot_magique   text,        -- indice complémentaire optionnel, JAMAIS suffisant seul pour prouver l'identité
  avatar        text,
  created_at    timestamptz not null default now()
);

-- Création automatique du profil à chaque inscription (trigger sur auth.users).
-- L'e-mail administrateur reçoit automatiquement le rôle admin dès son inscription.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nom, prenom, email, role, account_type, avatar, mot_magique)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nom', ''),
    coalesce(new.raw_user_meta_data->>'prenom', ''),
    new.email,
    case when lower(new.email) = lower('ADMIN_EMAIL_A_REMPLACER') then 'admin' else 'membre' end,
    coalesce(new.raw_user_meta_data->>'accountType', 'solo'),
    upper(
      left(coalesce(new.raw_user_meta_data->>'prenom',''),1) ||
      left(coalesce(new.raw_user_meta_data->>'nom',''),1)
    ),
    new.raw_user_meta_data->>'motMagique'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Fonction utilitaire : l'utilisateur courant est-il administrateur ?
-- (security definer pour pouvoir être appelée depuis les policies RLS sans dépendre
--  des droits de lecture de l'appelant sur la table profiles elle-même)
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- ----------------------------------------------------------------------------
-- 2. PROJETS
-- ----------------------------------------------------------------------------
create table if not exists public.projects (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  titre         text not null,
  espace        text not null check (espace in ('electronique','electrotechnique','energies-renouvelables')),
  schema        jsonb not null default '{"items":[],"wires":[]}'::jsonb,
  erreurs       integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.project_collaborators (
  project_id  uuid not null references public.projects(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  added_at    timestamptz not null default now(),
  primary key (project_id, user_id)
);

-- ----------------------------------------------------------------------------
-- 3. COMMENTAIRES DE PROJET
-- ----------------------------------------------------------------------------
create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  texte       text not null,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 4. DISCUSSION COMMUNE (visible par tous les utilisateurs connectés)
-- ----------------------------------------------------------------------------
create table if not exists public.common_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  texte       text not null,
  pinned      boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Nettoyage automatique des messages non épinglés de plus de 24h.
-- Nécessite l'extension pg_cron (disponible sur les projets Supabase payants
-- et certains projets gratuits selon la région). Si pg_cron n'est pas
-- disponible sur votre projet, ignorez ce bloc : les messages s'accumuleront
-- simplement sans suppression automatique (aucune fonctionnalité cassée).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule(
      'cleanup-common-messages',
      '0 * * * *', -- toutes les heures
      $cron$ delete from public.common_messages where not pinned and created_at < now() - interval '24 hours'; $cron$
    );
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 5. MESSAGERIE PRIVÉE
-- ----------------------------------------------------------------------------
create table if not exists public.private_messages (
  id          uuid primary key default gen_random_uuid(),
  from_user   uuid not null references public.profiles(id) on delete cascade,
  to_user     uuid not null references public.profiles(id) on delete cascade,
  texte       text not null,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 6. SUGGESTIONS (strictement privées entre l'auteur et l'administration)
-- ----------------------------------------------------------------------------
create table if not exists public.suggestions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  texte           text not null,
  statut          text not null default 'en attente' check (statut in ('en attente','traitée')),
  reponse_admin   text,
  created_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 7. MEMBRES DE GROUPE (comptes de type groupe/communaute)
-- ----------------------------------------------------------------------------
create table if not exists public.group_members (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  nom         text not null,
  email       text not null,
  created_at  timestamptz not null default now()
);

-- ============================================================================
-- SÉCURITÉ — Row Level Security (RLS)
-- Chaque table est isolée : un utilisateur ne peut lire/modifier que ses
-- propres données (ou celles auxquelles il a explicitement accès), sauf
-- l'administrateur qui a un accès de lecture étendu pour la modération.
-- ============================================================================

alter table public.profiles              enable row level security;
alter table public.projects              enable row level security;
alter table public.project_collaborators enable row level security;
alter table public.comments              enable row level security;
alter table public.common_messages       enable row level security;
alter table public.private_messages      enable row level security;
alter table public.suggestions           enable row level security;
alter table public.group_members         enable row level security;

-- PROFILES : lecture ouverte à tout utilisateur connecté (annuaire nécessaire
-- pour la messagerie, les noms d'auteurs de commentaires/suggestions, etc. —
-- même principe que l'annuaire d'une messagerie d'entreprise : nom/prénom/e-mail
-- visibles entre collègues, mais jamais le mot de passe qui n'est de toute façon
-- jamais stocké dans cette table). Adaptez cette policy si vous souhaitez un
-- annuaire plus restreint (ex. limité aux membres d'un même groupe).
-- Le champ "role" ne doit jamais pouvoir être modifié par l'utilisateur lui-même
-- (sinon n'importe qui pourrait s'auto-promouvoir admin) : c'est garanti en
-- vérifiant que "role" reste inchangé dans la policy UPDATE ci-dessous.
create policy "profiles_select_authenticated" on public.profiles
  for select using (auth.role() = 'authenticated');

create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));

-- PROJECTS : le propriétaire et les collaborateurs peuvent lire ; seul le
-- propriétaire peut modifier/supprimer ; l'admin peut tout lire (support/modération).
create policy "projects_select_owner_collab_or_admin" on public.projects
  for select using (
    owner_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.project_collaborators pc where pc.project_id = id and pc.user_id = auth.uid())
  );

create policy "projects_insert_own" on public.projects
  for insert with check (owner_id = auth.uid());

create policy "projects_update_owner" on public.projects
  for update using (owner_id = auth.uid());

create policy "projects_delete_owner_or_admin" on public.projects
  for delete using (owner_id = auth.uid() or public.is_admin());

-- PROJECT_COLLABORATORS : visible par le propriétaire du projet et le collaborateur lui-même.
create policy "collab_select" on public.project_collaborators
  for select using (
    user_id = auth.uid()
    or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
  );
create policy "collab_insert_by_owner" on public.project_collaborators
  for insert with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
create policy "collab_delete_by_owner" on public.project_collaborators
  for delete using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));

-- COMMENTS : visibles par les participants du projet (propriétaire + collaborateurs).
create policy "comments_select_participants" on public.comments
  for select using (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and (p.owner_id = auth.uid()
             or exists (select 1 from public.project_collaborators pc where pc.project_id = p.id and pc.user_id = auth.uid()))
    )
  );
create policy "comments_insert_participants" on public.comments
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.projects p
      where p.id = project_id
        and (p.owner_id = auth.uid()
             or exists (select 1 from public.project_collaborators pc where pc.project_id = p.id and pc.user_id = auth.uid()))
    )
  );

-- COMMON_MESSAGES : lisibles par tout utilisateur connecté ; chacun écrit ses propres messages.
create policy "common_messages_select_authenticated" on public.common_messages
  for select using (auth.role() = 'authenticated');
create policy "common_messages_insert_own" on public.common_messages
  for insert with check (user_id = auth.uid());

-- PRIVATE_MESSAGES : uniquement visibles par l'expéditeur et le destinataire.
create policy "private_messages_select_participant" on public.private_messages
  for select using (from_user = auth.uid() or to_user = auth.uid());
create policy "private_messages_insert_own" on public.private_messages
  for insert with check (from_user = auth.uid());

-- SUGGESTIONS : strictement privées entre l'auteur et l'admin.
create policy "suggestions_select_own_or_admin" on public.suggestions
  for select using (user_id = auth.uid() or public.is_admin());
create policy "suggestions_insert_own" on public.suggestions
  for insert with check (user_id = auth.uid());
create policy "suggestions_update_admin_only" on public.suggestions
  for update using (public.is_admin());

-- GROUP_MEMBERS : visibles/gérés uniquement par le responsable du groupe (owner_id).
create policy "group_members_select_owner" on public.group_members
  for select using (owner_id = auth.uid());
create policy "group_members_insert_owner" on public.group_members
  for insert with check (owner_id = auth.uid());
create policy "group_members_delete_owner" on public.group_members
  for delete using (owner_id = auth.uid());

-- ============================================================================
-- FIN DU SCHÉMA.
-- Rappel : après exécution, vérifiez dans Authentication → Providers que
-- "Email" est activé, et dans Authentication → URL Configuration que l'URL
-- de votre application est bien ajoutée aux "Redirect URLs" (nécessaire pour
-- le lien de réinitialisation de mot de passe envoyé par e-mail).
-- ============================================================================
