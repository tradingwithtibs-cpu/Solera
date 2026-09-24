import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import fs from "node:fs";
import { createRequire } from "node:module";
const load = createRequire(import.meta.url);
load.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    filename,
  );
const { parseGoogleNewsRss, dedupeNews, decodeEntities, finnhubSymbolFor } = load("../src/lib/news.ts");

const RSS = `<?xml version="1.0"?><rss><channel>
<item><title>OpenAI Discloses Six New Incidents &amp; More - nytimes.com</title><link>https://news.google.com/rss/articles/A</link><guid isPermaLink="false">g1</guid><pubDate>Thu, 17 Sep 2026 00:12:24 GMT</pubDate><source url="https://www.nytimes.com">nytimes.com</source></item>
<item><title><![CDATA[Openai discloses six new incidents & more]]></title><link>https://news.google.com/rss/articles/B</link><guid>g2</guid><pubDate>Wed, 16 Sep 2026 22:03:21 GMT</pubDate><source url="https://x">Copycat</source></item>
<item><title>No date</title><link>https://x</link><guid>g3</guid><source>x</source></item>
</channel></rss>`;

test("parses Google News RSS items, strips the source suffix, decodes entities, skips undated items", () => {
  const items = parseGoogleNewsRss(RSS);
  assert.equal(items.length, 2);
  assert.equal(items[0].headline, "OpenAI Discloses Six New Incidents & More");
  assert.equal(items[0].source, "nytimes.com");
  assert.equal(items[0].id, "g1");
  assert.equal(items[0].publishedAt, Date.parse("Thu, 17 Sep 2026 00:12:24 GMT"));
  assert.equal(items[1].headline, "Openai discloses six new incidents & more");
});

test("dedupe keeps the newest of near-identical headlines and caps the list", () => {
  const items = parseGoogleNewsRss(RSS);
  const out = dedupeNews(items, 10);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "g1");
  assert.equal(dedupeNews([...items, { ...items[0], id: "z", headline: "Different story" }], 1).length, 1);
});

test("helpers", () => {
  assert.equal(decodeEntities("A &amp; B &#39;c&#x27; &quot;d&quot;"), `A & B 'c' "d"`);
  assert.equal(finnhubSymbolFor("AAPLx"), "AAPL");
  assert.equal(finnhubSymbolFor("SPYx"), "SPY");
});

test("extractArticleImage reads og:image, then twitter:image, and refuses placeholders and relative urls", () => {
  const { extractArticleImage } = load("../src/lib/news.ts");
  assert.equal(extractArticleImage('<html><head><meta property="og:image" content="https://img.example.com/a.jpg?w=1&amp;h=2"/></head>'), "https://img.example.com/a.jpg?w=1&h=2");
  assert.equal(extractArticleImage('<meta name="twitter:image:src" content="https://s.yimg.com/lo/api/x.jpg"><meta name="og:title" content="t">'), "https://s.yimg.com/lo/api/x.jpg");
  assert.equal(extractArticleImage('<meta property="og:image" content="https://s.yimg.com/rz/stage/p/yahoo_finance_en-US_h_p_finance_2.png">'), null);
  assert.equal(extractArticleImage('<meta property="og:image" content="/relative.png">'), null);
  assert.equal(extractArticleImage("<html><body>no meta</body></html>"), null);
});
