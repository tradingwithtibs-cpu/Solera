"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { FeedComment, FeedPost } from "@/lib/feed";
import type { FeedItem } from "@/components/discover/feed";
import { feedTargetOf } from "@/components/discover/feed-posts";
import {
  acquireFeed,
  addComment as storeAddComment,
  clearFeedError,
  EMPTY_COMMENTS,
  getFeedState,
  INITIAL_STATE,
  loadComments as storeLoadComments,
  setFeedToken,
  subscribeFeed,
  voteOn,
  type CommentsEntry,
  type FeedState,
} from "@/components/discover/feed-store";
import { useSession } from "./use-session";

const serverSnapshot = () => INITIAL_STATE;
const NO_THREAD: CommentsEntry = { items: [], isLoaded: true, error: null };

/**
 * The posts behind the rows on screen: scores, the person's own votes and
 * comment counts from GET /api/feed (feed-store.ts). Mount it once per
 * list; the store polls while anything reads it and reloads when the
 * session changes so `myVote` fills in after sign-in. Pass `ticker` to
 * scope the load to one symbol's posts.
 */
export function useFeed(opts: { ticker?: string | null } = {}): FeedState & {
  signedIn: boolean;
  owner: string | null;
  postFor: (item: FeedItem) => FeedPost | undefined;
  vote: (item: FeedItem, dir: -1 | 0 | 1) => Promise<void>;
  addComment: (item: FeedItem, body: string) => Promise<FeedComment>;
  clearError: () => void;
} {
  const { token, signedIn, owner } = useSession();
  const snapshot = useSyncExternalStore(subscribeFeed, getFeedState, serverSnapshot);
  const ticker = opts.ticker ?? null;

  // The token first, so the load the first reader starts already carries it.
  useEffect(() => {
    setFeedToken(token);
  }, [token]);
  useEffect(() => acquireFeed(ticker), [ticker]);

  const postFor = useCallback((item: FeedItem) => snapshot.posts[feedTargetOf(item).key], [snapshot.posts]);
  const vote = useCallback((item: FeedItem, dir: -1 | 0 | 1) => voteOn(feedTargetOf(item), dir, token), [token]);
  const addComment = useCallback((item: FeedItem, body: string) => storeAddComment(feedTargetOf(item), body, token), [token]);

  return { ...snapshot, signedIn, owner, postFor, vote, addComment, clearError: clearFeedError };
}

/** One post's thread, loaded on first read. `null` (no post yet) is an empty, loaded thread. */
export function useComments(postId: string | null): CommentsEntry {
  const snapshot = useSyncExternalStore(subscribeFeed, getFeedState, serverSnapshot);
  useEffect(() => {
    if (postId) void storeLoadComments(postId);
  }, [postId]);
  if (!postId) return NO_THREAD;
  return snapshot.comments[postId] ?? EMPTY_COMMENTS;
}
