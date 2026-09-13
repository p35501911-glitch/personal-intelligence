/**
 * Keyboard Navigation Controller & Helpers for Personal Intelligence Feed.
 *
 * Supported shortcuts:
 * - J / j: Move selection to next story
 * - K / k: Move selection to previous story
 * - Enter / O / o: Open currently selected story in detail modal
 * - Escape: Close detail modal and return focus to feed
 * - S / s: Toggle bookmark on currently selected story (with in-flight debounce guard)
 */

export interface FeedKeyEvent {
  key: string;
  target: unknown;
  preventDefault?: () => void;
}

export type FeedKeyboardActionType =
  | 'SELECT_NEXT'
  | 'SELECT_PREVIOUS'
  | 'OPEN_SELECTED'
  | 'CLOSE_MODAL'
  | 'TOGGLE_BOOKMARK'
  | 'IGNORE';

export interface FeedKeyboardAction {
  type: FeedKeyboardActionType;
}

/**
 * Determines whether an event target is an interactive text editing control
 * where keyboard shortcuts should be strictly suppressed.
 */
export function isEditableTarget(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false;

  const element = target as {
    tagName?: string;
    isContentEditable?: boolean;
    getAttribute?: (attr: string) => string | null;
  };

  const tagName = element.tagName ? element.tagName.toLowerCase() : '';

  if (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    Boolean(element.isContentEditable)
  ) {
    return true;
  }

  if (typeof element.getAttribute === 'function') {
    const role = element.getAttribute('role');
    if (role === 'textbox' || role === 'searchbox') {
      return true;
    }
  }

  return false;
}

/**
 * Computes the next selected story index with strict boundary protection.
 * If currentIndex is -1 (no selection), moves to the first story (0).
 */
export function getNextSelectedIndex(currentIndex: number, totalCount: number): number {
  if (totalCount <= 0) return -1;
  if (currentIndex < 0) return 0;
  return Math.min(totalCount - 1, currentIndex + 1);
}

/**
 * Computes the previous selected story index with strict boundary protection.
 * If currentIndex is -1 (no selection), moves to the first story (0).
 */
export function getPreviousSelectedIndex(currentIndex: number, totalCount: number): number {
  if (totalCount <= 0) return -1;
  if (currentIndex < 0) return 0;
  return Math.max(0, currentIndex - 1);
}

/**
 * In-flight debounce guard for bookmark operations to prevent race conditions
 * or duplicate network requests from rapid keyboard presses.
 */
export class BookmarkDebounceGuard {
  private inFlightStoryIds = new Set<string>();

  /**
   * Attempts to acquire a lock for a story bookmark operation.
   * Returns true if acquired, false if an operation for this story is already in flight.
   */
  public acquire(storyId: string): boolean {
    if (!storyId || this.inFlightStoryIds.has(storyId)) {
      return false;
    }
    this.inFlightStoryIds.add(storyId);
    return true;
  }

  /**
   * Releases the in-flight lock for the given storyId.
   */
  public release(storyId: string): void {
    this.inFlightStoryIds.delete(storyId);
  }

  /**
   * Checks whether an operation is currently in flight for a story.
   */
  public isInFlight(storyId: string): boolean {
    return this.inFlightStoryIds.has(storyId);
  }

  /**
   * Clears all in-flight locks.
   */
  public reset(): void {
    this.inFlightStoryIds.clear();
  }
}

export interface FeedKeyboardOptions {
  isModalOpen?: boolean;
  hasStories?: boolean;
}

/**
 * Interprets a raw keydown event and determines the appropriate feed action.
 */
export function interpretFeedKeyboardEvent(
  event: FeedKeyEvent,
  options: FeedKeyboardOptions = {}
): FeedKeyboardAction {
  // If target is inside an input/textarea/editable element, ignore all feed shortcuts
  if (isEditableTarget(event.target)) {
    return { type: 'IGNORE' };
  }

  const key = event.key;

  // When modal is open: Escape closes modal
  if (options.isModalOpen) {
    if (key === 'Escape') {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      return { type: 'CLOSE_MODAL' };
    }
    // Don't trigger feed navigation behind open modal
    return { type: 'IGNORE' };
  }

  // If there are no stories in the feed, no story actions can be performed
  if (options.hasStories === false) {
    return { type: 'IGNORE' };
  }

  switch (key) {
    case 'j':
    case 'J': {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      return { type: 'SELECT_NEXT' };
    }
    case 'k':
    case 'K': {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      return { type: 'SELECT_PREVIOUS' };
    }
    case 'Enter':
    case 'o':
    case 'O': {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      return { type: 'OPEN_SELECTED' };
    }
    case 's':
    case 'S': {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      return { type: 'TOGGLE_BOOKMARK' };
    }
    default:
      return { type: 'IGNORE' };
  }
}
