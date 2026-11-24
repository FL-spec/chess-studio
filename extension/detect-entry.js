(async () => {
  // Injected again by the panel into tabs opened before the extension
  // (re)loaded. Skip if a live copy of this script is already running here.
  if (globalThis.__chessStudioAlive?.()) return;
  globalThis.__chessStudioAlive = () => Boolean(chrome.runtime?.id);
  const { automaticArrows, supported, placement, lichessPlacement, reconstruct } = await import(
    chrome.runtime.getURL("detect.mjs")
  );
  const { drawMark, isFlipped } = await import(chrome.runtime.getURL("board-mark.mjs"));
  const { Chess } = await import(chrome.runtime.getURL("vendor/chess.mjs"));
  let marker, markerExpiry, markerFrame, markerCheck, markerResize;
  const liveLines = new Map();
  function clearMark() {
    clearTimeout(markerExpiry);
    cancelAnimationFrame(markerFrame);
    cancelAnimationFrame(markerCheck);
    markerFrame = markerCheck = undefined;
    markerResize?.disconnect();
    markerResize = undefined;
    removeEventListener("scroll", queuePosition, true);
    removeEventListener("resize", queuePosition);
    marker?.overlay.remove();
    marker = undefined;
  }
  // Event-driven overlay upkeep: reposition on scroll/resize (one rAF per frame at
  // most) and re-validate on board mutations, instead of polling every 125 ms.
  function queuePosition() {
    if (!marker || markerFrame) return;
    markerFrame = requestAnimationFrame(() => {
      markerFrame = undefined;
      marker?.position();
    });
  }
  function queueCheck() {
    if (!marker || markerCheck) return;
    markerCheck = requestAnimationFrame(() => {
      markerCheck = undefined;
      if (!marker) return;
      const { board, fen, owner } = marker;
      const current = capture();
      if (
        pageBoard() !== board ||
        current.fen !== fen || current.flipped !== marker.flipped ||
        (owner && !current.automaticArrows)
      ) clearMark();
      else marker.position();
    });
  }
  function readPlayers(board, flipped, lichess) {
    if (lichess) return {};
    const layout = board.closest(".board-layout-main");
    const readName = (side) =>
      layout?.querySelector(".board-layout-" + side + " .cc-user-username-component")
        ?.textContent.trim() || "";
    const top = readName("top");
    const bottom = readName("bottom");
    const names = { w: flipped ? top : bottom, b: flipped ? bottom : top };
    // Ratings beside the names, e.g. "(1543)"; absent for unrated or hidden ratings.
    const readRating = (side) => {
      const text = layout?.querySelector(
        ".board-layout-" + side + " [class*='cc-user-rating'], .board-layout-" + side + " .user-tagline-rating",
      )?.textContent || "";
      const value = Number(text.replace(/[^\d]/g, ""));
      return value >= 100 && value <= 3500 ? value : null;
    };
    const topRating = readRating("top");
    const bottomRating = readRating("bottom");
    const ratings = topRating || bottomRating
      ? { w: flipped ? topRating : bottomRating, b: flipped ? bottomRating : topRating }
      : undefined;
    const profile = document.querySelector('#sidebar-main-menu a[href*="/member/"]');
    const account = profile?.pathname.split("/").filter(Boolean).at(-1)?.toLowerCase();
    // Names can carry a title or flag text ("GM name"): match the last word.
    const plain = (value) => (value || "").toLowerCase().trim().split(/\s+/).at(-1);
    const match = account && Object.keys(names).find((color) => plain(names[color]) === account);
    const practiceSite = /^\/(?:[a-z]{2}(?:-[a-z]{2,4})?\/)?play\/(coach|computer)(?:\/|$)/i
      .test(location.pathname);
    // While you play, Chess.com puts your side at the bottom of the board.
    const playing = /^\/(?:[a-z]{2}(?:-[a-z]{2,4})?\/)?(?:play\/online|game\/(?:live|daily))(?:\/|$)/i
      .test(location.pathname) && !account;
    return {
      names,
      ratings,
      playerColor: match || (practiceSite || playing ? (flipped ? "b" : "w") : undefined),
    };
  }
  function pageBoard() {
    return document.querySelector(
      location.hostname === "lichess.org"
        ? ".analyse__board cg-board, .cg-wrap cg-board"
        : "wc-chess-board, chess-board, #board-single, .chessboard",
    );
  }
  let previous, stamp, cached, route;
  function capture() {
    if (!supported(location.href)) {
      previous = stamp = cached = undefined;
      return { status: "unsupported" };
    }
    if (route !== location.pathname) {
      route = location.pathname;
      previous = stamp = cached = undefined;
    }
    const lichess = location.hostname === "lichess.org";
    const site = lichess ? "LICHESS" : "CHESS.COM";
    const startFen = lichess
      ? decodeURIComponent(
          location.pathname.split("/").slice(3).join("/"),
        ).replaceAll("_", " ") || undefined
      : undefined;
    const board = pageBoard();
    if (!board) return { status: "waiting" };
    const flipped = isFlipped(board);
    const players = readPlayers(board, flipped, lichess);
    const pieces = lichess ? lichessPlacement(board) : placement(board);
    const fen =
      board.getAttribute("data-fen") ||
      board.getAttribute("fen") ||
      board.getAttribute("data-chess-studio-fen");
    const moves = [
      ...document.querySelectorAll(
        lichess
          ? "rm6 kwdb, .analyse__moves move"
          : "wc-simple-move-list .node, vertical-move-list .node, wc-move-list .node, .vertical-move-list .node, .move-list .move-text",
      ),
    ]
      .map((node) => {
        const clone = node.cloneNode(true);
        for (const icon of clone.querySelectorAll(
          "[data-figurine], [data-piece]",
        )) {
          const glyph =
            icon.getAttribute("data-figurine") ||
            icon.getAttribute("data-piece");
          if (/^[KQRBN]$/.test(glyph)) icon.replaceWith(glyph);
        }
        return clone.textContent
          .replace(/[\s\u200b]/g, "")
          .replace(/[!?]+$/, "");
      })
      .filter((text) =>
        /^(?:[KQRBN]?[a-h1-8]*x?[a-h][1-8](?:=[QRBN])?|[O0]-[O0](?:-[O0])?)[+#]?$/.test(
          text,
        ),
      );
    const key = JSON.stringify([location.pathname, pieces, fen, moves, flipped, players]);
    if (stamp === key && cached) return cached;
    stamp = key;
    const position = reconstruct(pieces, { fen, moves, previous, startFen });
    if (!position) return (cached = { status: "position" });
    previous = position;
    return (cached = {
      status: "ready", site, flipped, ...players, ...position,
      analysis: /(?:^|\/)analysis(?:\/|$)/i.test(location.pathname),
      automaticArrows: automaticArrows(location.href),
    });
  }
  function mark(message, owner) {
    if (message?.type !== "chess-studio-mark") return false;
    const observed = capture();
    const board = pageBoard();
    if (
      observed.status !== "ready" ||
      !board ||
      (owner && !observed.automaticArrows) ||
      message.fen !== observed.fen ||
      !Array.isArray(message.lines) ||
      message.lines.length > 5
    ) return false;
    const legal = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
    // A premove is your move after the opponent replies: it must be legal
    // after at least one of their moves (the sites' own premove rule).
    let premove = "";
    if (typeof message.premove === "string" && legal.test(message.premove)) {
      const game = new Chess(observed.fen);
      const fits = game.moves({ verbose: true }).some((reply) => {
        game.move(reply);
        const ok = game.moves({ verbose: true }).some((move) => move.from + move.to === message.premove.slice(0, 4));
        game.undo();
        return ok;
      });
      if (fits) premove = message.premove;
    }
    if (message.lines.length === 0 && !premove) {
      if (marker?.owner === owner) clearMark();
      return true;
    }
    const visible = [];
    if (premove) visible.push({ premove });
    try {
      for (const line of message.lines) {
        if (!legal.test(line?.move) || (line.reply && !legal.test(line.reply))) return false;
        const game = new Chess(observed.fen);
        game.move(line.move);
        if (line.reply) game.move(line.reply);
        visible.push({
          move: line.showMove ? line.move : "",
          reply: line.showReply ? line.reply : "",
        });
      }
    } catch {
      return false;
    }
    clearMark();
    marker = drawMark(board, visible);
    if (marker) {
      marker.owner = owner;
      marker.board = board;
      marker.fen = message.fen;
      if (!owner) markerExpiry = setTimeout(restoreLiveMark, 4200);
      markerResize = new ResizeObserver(queuePosition);
      markerResize.observe(board);
      addEventListener("scroll", queuePosition, { capture: true, passive: true });
      addEventListener("resize", queuePosition, { passive: true });
    }
    return Boolean(marker);
  }
  function restoreLiveMark() {
    clearMark();
    for (const [owner, line] of [...liveLines].reverse()) {
      if (mark(line, owner)) return;
    }
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message === "chess-studio-position") respond(capture());
    else if (message?.type === "chess-studio-mark") respond(mark(message));
  });
  chrome.runtime.onConnect.addListener((port) => {
    if (port.sender?.id !== chrome.runtime.id || port.name !== "chess-studio-live-arrows") return;
    port.onMessage.addListener((line) => {
      if (!mark(line, port)) return;
      liveLines.delete(port);
      liveLines.set(port, line);
    });
    port.onDisconnect.addListener(() => {
      liveLines.delete(port);
      if (marker?.owner === port) restoreLiveMark();
    });
  });
  let watchedBoard, notification, signature;
  const observer = new MutationObserver((records) => {
    const board = pageBoard();
    const relevant = board !== watchedBoard ||
      (board && records.some(({ target }) => board.contains(target)));
    watchedBoard = board;
    if (marker) {
      if (relevant || marker.board !== board) queueCheck();
      else queuePosition();
    }
    if (!relevant || notification || !supported(location.href)) return;
    notification = setTimeout(async () => {
      notification = undefined;
      const position = capture();
      const next = JSON.stringify([
        location.pathname,
        position.status,
        position.fen,
        position.last?.san,
        position.flipped,
        position.playerColor,
        position.names,
      ]);
      if (next === signature) return;
      signature = next;
      await chrome.runtime.sendMessage({ type: "chess-studio-board-changed" }).catch(() => {});
    }, 35);
  });
  addEventListener("popstate", queueCheck);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class", "style", "data-fen", "fen", "data-chess-studio-fen"],
  });
})();
