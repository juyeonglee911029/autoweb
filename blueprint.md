# Pupu Tetris - Project Blueprint

## Overview
Pupu Tetris is a multiplayer Tetris game featuring real-time chat, betting (USDT), and competitive gameplay. It uses Firebase for authentication and data storage, and Socket.io for real-time multiplayer interactions.

## Features & Design
- **Tetris Engine:** Classic Tetris mechanics with ghost piece, hold piece, and next piece preview.
- **Multiplayer:** Send garbage lines to opponents when clearing 4 lines (Tetris).
- **Currency:** USDT (formerly Coins) for betting.
- **Real-time Chat:** Communicate with other players in the global room.
- **User System:** Firebase Auth (Google) for user profiles and balance tracking.
- **Visuals:** Modern, clean UI with Fredoka font. Responsive layout.
- **Dark Mode:** Supports light and dark themes.

## Current Plan: UI/UX Improvements & Fixes
1. **Currency Update:** Change all "Coin" (코인) references to "USDT".
2. **Login Fix:**
    - Ensure the game is playable even without login (Guest Mode).
    - Fix potential Firebase Auth issues or provide clearer feedback.
3. **Game Fix:**
    - Fix the issue where the game doesn't start or run correctly.
    - Expand/Adjust the Tetris board layout to remove unnecessary gaps.
4. **Dark Mode Implementation:**
    - Add a toggle switch.
    - Update CSS variables for dark theme.
5. **UI Enhancement:**
    - Add a proper Header.
    - Improve User Profile visibility (Name, USDT Balance).
    - Place Deposit/Withdraw buttons side-by-side near the balance.
    - Fix margin collapse/overlap issues in layout.
6. **Tetris Board Scaling:**
    - Adjust board size to fill the center area better.

## Technical Implementation Details
- **CSS:** Update `:root` variables and add `.dark-mode` class overrides. Use Flexbox/Grid for layout stability.
- **JS:**
    - Update `main.js` to handle USDT naming.
    - Modify auth logic to allow guest play.
    - Adjust canvas scaling or container sizing for the Tetris board.
- **HTML:** Restructure for better semantics (Header, Main, Footer).
