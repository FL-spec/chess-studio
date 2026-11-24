# Third-party notices

Chess Studio includes or downloads the components below. Each keeps its own license. License texts for bundled components ship next to them in the extension folder.

| Component | Version | License | Location | Source |
| --- | --- | --- | --- | --- |
| Stockfish.js, Full Single build | 19.0.1 | GPL-3.0 | `extension/vendor/stockfish-19-single.*`, license in `vendor/Stockfish-LICENSE.txt` | [nmrugg/stockfish.js v19.0.1](https://github.com/nmrugg/stockfish.js/tree/v19.0.1) |
| chess.js | 1.4.0 | BSD-2-Clause | `extension/vendor/chess.mjs`, license in `vendor/chess-js-LICENSE` | [jhlywa/chess.js v1.4.0](https://github.com/jhlywa/chess.js/tree/v1.4.0) |
| ONNX Runtime Web | 1.26.0 | MIT | `extension/vendor/ort/`, with `LICENSE` and `ThirdPartyNotices.txt` | [microsoft/onnxruntime](https://github.com/microsoft/onnxruntime) |
| cburnett chess pieces, by Colin M. L. Burnett | | GPL-2.0-or-later | `extension/pieces/`, license in `pieces/LICENSE.txt` | [lichess-org/lila COPYING.md](https://github.com/lichess-org/lila/blob/master/COPYING.md) |
| Nunito font | | SIL Open Font License 1.1 | `extension/fonts/` | [googlefonts/nunito](https://github.com/googlefonts/nunito) |
| Maia-3 browser model (`maia3_simplified.onnx`) | commit `91516ec` | GPL-3.0 (repository license) | Not bundled. Downloaded on first use and checked against a pinned SHA-256 digest | [CSSLab/maia-platform-frontend](https://github.com/CSSLab/maia-platform-frontend/tree/91516ecb3be4c4f3ef3b0470a78570443ff27eb3) |

## Notes

- The Stockfish build is distributed unmodified. Its corresponding source and build files are at the linked tag.
- The toolbar icons are raster derivatives of the cburnett knight and are covered by the same GPL-2.0-or-later license.
- The Maia-3 model file comes from CSSLab's browser implementation, which is licensed GPL-3.0. CSSLab's research repository, [CSSLab/maia3](https://github.com/CSSLab/maia3), is licensed AGPL-3.0. Whether the browser file matches a named research checkpoint is not confirmed upstream ([discussion](https://github.com/CSSLab/maia3/issues/12)), so Chess Studio identifies it by source commit and digest. Maia-3 is described in the [Chessformer paper](https://arxiv.org/abs/2605.19091).
- The built-in human model was trained on the [Lichess January 2013 export](https://database.lichess.org/), released under CC0.
