# Generated sources

Do not treat delimiter-based bundle splitting as source recovery. JavaScript
regexes, templates, and nested factories make those boundaries ambiguous.
Maintain recovered behavior in `../runtime/`; keep `../source/cli-bundle.js`
as the byte-equivalent evidence and compatibility snapshot.
