/**
 * Copyright 2025 The Lotusia Stewardship
 * Github: https://github.com/LotusiaStewardship
 * License: MIT
 */
/**
 * Interface for mutator classes that process various types of Twitter DOM elements.
 * Each method is responsible for handling a specific type of element mutation,
 * such as posts, notifications, conversations, profile popups, and UI components.
 * Implementations may mutate the DOM, update caches, or trigger UI changes.
 */
export interface Mutator {
  /**
   * Processes a post element, e.g., timeline or feed post.
   * May parse post data, hide ads, or trigger post-specific UI changes.
   * @param element - The jQuery-wrapped post element to process.
   */
  processPost(element: JQuery<HTMLElement>): Promise<void>

  /**
   * Processes a notification element, e.g., notification timeline entry.
   * May update avatar badges or handle notification-specific UI.
   * @param element - The jQuery-wrapped notification element to process.
   */
  processNotification(element: JQuery<HTMLElement>): Promise<void>

  /**
   * Processes a conversation element, e.g., direct message thread.
   * May update avatars or handle message-specific UI.
   * @param element - The jQuery-wrapped conversation element to process.
   */
  processConversation(element: JQuery<HTMLElement>): Promise<void>

  /**
   * Processes a profile popup element, e.g., hovercard or profile preview.
   * May update avatar badges or hide unwanted UI components.
   * @param element - The jQuery-wrapped profile popup element to process.
   */
  processProfilePopup(element: JQuery<HTMLElement>): Promise<void>

  /**
   * Processes a primary column element, e.g., main content column on profile pages.
   * May update profile badges, hide buttons, or perform column-specific mutations.
   * @param element - The jQuery-wrapped primary column element to process.
   */
  processPrimaryColumn(element: JQuery<HTMLElement>): Promise<void>

  /**
   * Processes a button row element, e.g., row of action buttons under a post.
   * May insert or update custom vote buttons and handle button row mutations.
   * @param element - The jQuery-wrapped button row element to process.
   */
  processButtonRows(element: JQuery<HTMLElement>): Promise<void>

  /**
   * Processes a button element, e.g., Grok or profile summary buttons.
   * May hide or mutate specific buttons within the element.
   * @param element - The jQuery-wrapped button element to process.
   */
  processButtons(element: JQuery<HTMLElement>): Promise<void>

  /**
   * Processes an avatar element in a conversation context, e.g., message avatars.
   * May update avatar badges for message participants.
   * @param element - The jQuery-wrapped avatar conversation element to process.
   */
  processAvatarConversation(element: JQuery<HTMLElement>): Promise<void>

  /**
   * Processes avatar elements, e.g., user profile images.
   * May set or update reputation badge classes on avatars.
   * @param element - The jQuery-wrapped avatar element(s) to process.
   */
  processAvatars(element: JQuery<HTMLElement>): Promise<void>

  /**
   * Processes a profile stats element, e.g., followers/following row on profile pages.
   * May insert or update ranking/vote stats in the profile stats row.
   * @param element - The jQuery-wrapped profile stats element to process.
   */
  processProfileStats(element: JQuery<HTMLElement>): Promise<void>

  /**
   * Processes Grok-related UI elements, e.g., Grok scroll lists or drawers.
   * May hide or mutate Grok UI components within the element.
   * @param element - The jQuery-wrapped Grok elements to process.
   */
  processGrokElements(element: JQuery<HTMLElement>): Promise<void>
}
