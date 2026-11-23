(() => {
  if (window.__chessStudioFenReader) return;
  window.__chessStudioFenReader = true;
  const supported =
    /^\/(?:[a-z]{2}(?:-[a-z]{2,4})?\/)?(?:play\/(?:computer|coach|online)|game\/live|live|analysis)(?:\/|$)/i;
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
  setInterval(read, 350);
})();
