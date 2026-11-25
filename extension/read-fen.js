(() => {
  const supported =
    /^\/(?:[a-z]{2}(?:-[a-z]{2,4})?\/)?(?:play\/(?:computer|coach|online)|game\/(?:live|[0-9]+)|live|analysis)(?:\/|$)/i;
  // A tab may still have the reader from before an extension reload.
  const readerVersion = supported.source;
  if (window.__chessStudioFenReader === readerVersion) return;
  window.__chessStudioFenReader = readerVersion;
  function read() {
    if (!supported.test(location.pathname)) return;
    const board = document.querySelector(
      "wc-chess-board, chess-board, #board-single, .chessboard",
    );
    if (!board) return;
    try {
      const game = board.game;
      const fen = game?.getFEN?.() ?? game?.getFen?.();
      if (
        typeof fen === "string" &&
        /^[\w/ -]{15,130}$/.test(fen) &&
        board.getAttribute("data-chess-studio-fen") !== fen
      ) {
        board.setAttribute("data-chess-studio-fen", fen);
      }
    } catch {
      /* Move history remains available when the board API changes. */
    }
  }
  // Background tabs skip the read; the tab reads once when it is shown again.
  const timer = setInterval(() => {
    if (window.__chessStudioFenReader !== readerVersion) {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onShow);
      return;
    }
    if (!document.hidden) read();
  }, 350);
  function onShow() {
    if (!document.hidden) read();
  }
  document.addEventListener("visibilitychange", onShow);
  read();
})();
