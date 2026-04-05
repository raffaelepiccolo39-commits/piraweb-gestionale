-- ============================================
-- Migration 00006: Bacheca (Internal Bulletin Board)
-- ============================================

CREATE TYPE post_category AS ENUM (
  'announcement',
  'update',
  'idea',
  'question',
  'celebration'
);

CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category post_category NOT NULL DEFAULT 'update',
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_posts_author ON posts(author_id);
CREATE INDEX idx_posts_pinned ON posts(is_pinned DESC, created_at DESC);

CREATE TRIGGER set_posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Post comments
CREATE TABLE post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_post_comments_post ON post_comments(post_id);

CREATE TRIGGER set_post_comments_updated_at
  BEFORE UPDATE ON post_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Post reactions (emoji reactions)
CREATE TABLE post_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL DEFAULT '👍',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id, emoji)
);

CREATE INDEX idx_post_reactions_post ON post_reactions(post_id);

-- RLS for posts
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Posts viewable by all authenticated"
  ON posts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create posts"
  ON posts FOR INSERT
  TO authenticated
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "Authors and admins can update posts"
  ON posts FOR UPDATE
  TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Authors and admins can delete posts"
  ON posts FOR DELETE
  TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- RLS for post_comments
ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Post comments viewable by all authenticated"
  ON post_comments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can add post comments"
  ON post_comments FOR INSERT
  TO authenticated
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "Authors can update own post comments"
  ON post_comments FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid());

CREATE POLICY "Authors and admins can delete post comments"
  ON post_comments FOR DELETE
  TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- RLS for post_reactions
ALTER TABLE post_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reactions viewable by all authenticated"
  ON post_reactions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can add own reactions"
  ON post_reactions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can remove own reactions"
  ON post_reactions FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
