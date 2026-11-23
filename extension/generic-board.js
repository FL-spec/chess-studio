(() => {
  if (globalThis.chessStudioGenericReader) return;
  globalThis.chessStudioGenericReader = true;
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (
      sender.id !== chrome.runtime.id ||
      message !== "chess-studio-generic-position"
    )
      return;
    const positions = new Set();
    for (const element of document.querySelectorAll(
      "[data-fen],[fen],[data-position]",
    )) {
      if (!element.getClientRects().length) continue;
      for (const name of ["data-fen", "fen", "data-position"]) {
        const value = element.getAttribute(name)?.trim();
        if (
          value &&
          /^[prnbqkPRNBQK1-8/]+ [wb] (?:[KQkq]+|-) (?:[a-h][36]|-) \d{1,7} \d{1,7}$/.test(
            value,
          )
        )
          positions.add(value);
      }
    }
    if (positions.size === 1) {
      respond({
        status: "ready",
        fen: [...positions][0],
        site: location.hostname,
        generic: true,
      });
    } else {
      respond({
        status: positions.size ? "generic-ambiguous" : "generic-missing",
      });
    }
  });
})();
