import MatchType = CompletersNS.MatchType;
import SugType = CompletersNS.SugType;

BgUtils_.timeout_(200, function (): void {
type Domain = CompletersNS.Domain;

const enum RankingEnums {
  recCalibrator = 0.666667, // 2 / 3,
  anywhere = 1,
  startOfWord = 1,
  wholeWord = 1,
  maximumScore = 3,
}
const enum TimeEnums {
  timeCalibrator = 1814400000, // 21 days
  futureTimeTolerance = 1.000165, // 1 + 5 * 60 * 1000 / timeCalibrator, // +5min
  futureTimeScore = 0.666446, // (1 - 5 * 60 * 1000 / timeCalibrator) ** 2 * RankingEnums.recCalibrator, // -5min
  bookmarkFakeVisitTime = 1000 * 60 * 5,
}
const enum InnerConsts {
  bookmarkBasicDelay = 1000 * 60, bookmarkFurtherDelay = bookmarkBasicDelay / 2,
  historyMaxSize = 20000,
}

type MatchRange = [number, number];

const enum BookmarkStatus {
  notInited = 0,
  initing = 1,
  inited = 2,
}

interface DecodedItem {
  readonly url_: string;
  text_: string;
}

interface Bookmark extends DecodedItem {
  readonly id_: string;
  readonly text_: string;
  readonly path_: string;
  readonly title_: string;
  readonly visible_: Visibility;
  readonly url_: string;
  readonly jsUrl_: string | null;
  readonly jsText_: string | null;
}
interface JSBookmark extends Bookmark {
  readonly jsUrl_: string;
  readonly jsText_: string;
}
interface HistoryItem extends DecodedItem {
  readonly url_: string;
  time_: number;
  title_: string;
  visible_: Visibility;
}
interface BrowserUrlItem {
  url: string;
  title?: string | null;
  sessionId?: string | number;
}
interface UrlDomain {
  domain_: string;
  schema_: Urls.SchemaId;
}

interface Completer {
  filter_ (query: CompletersNS.QueryStatus, index: number): void;
}

const enum FirstQuery {
  nothing = 0,
  waitFirst = 1,
  searchEngines = 2,
  history = 3,
  tabs = 4,

  QueryTypeMask = 0x3F,
  historyIncluded = QueryTypeMask + 1 + history,
}

type SuggestionConstructor =
  // pass enough arguments, so that it runs faster
  new (type: CompletersNS.ValidSugTypes, url: string, text: string, title: string,
       computeRelevancy: (this: void, sug: CompletersNS.CoreSuggestion, data: number) => number,
       extraData: number) => Suggestion;

type CachedRegExp = (RegExpOne | RegExpI) & RegExpSearchable<0>;

type HistoryCallback = (this: void, history: ReadonlyArray<Readonly<HistoryItem>>) => void;

type ItemToDecode = string | DecodedItem;

type CompletersMap = {
    [P in CompletersNS.ValidTypes]: ReadonlyArray<Completer>;
};
type SearchSuggestion = CompletersNS.SearchSuggestion;

const enum kVisibility {
  // as required in HistoryCache.OnPageVisited_, .visible must be 1
  hidden = 0,
  visible = 1,
  _mask = 2,
}
type Visibility = kVisibility.hidden | kVisibility.visible;

let queryType: FirstQuery = FirstQuery.nothing, matchType: MatchType = MatchType.plain,
    inNormal: boolean | null = null, autoSelect: boolean = false, singleLine: boolean = false,
    maxChars: number = 0, maxResults: number = 0, maxTotal: number = 0, matchedTotal: number = 0, offset: number = 0,
    queryTerms: string[] = [""], rawQuery: string = "", rawMore: string = "",
    wantInCurrentWindow = false,
    hasOmniTypePrefix = false,
    domainToSkip = "",
    allExpectedTypes = SugType.Empty,
    phraseBlacklist: string[] | null = null, showThoseInBlacklist: boolean = true;

const Suggestion: SuggestionConstructor = function (
    this: CompletersNS.WritableCoreSuggestion,
    type: CompletersNS.ValidSugTypes, url: string, text: string, title: string,
    computeRelevancy: (this: void, sug: CompletersNS.CoreSuggestion, data: number) => number, extraData: number
    ) {
  this.type_ = type;
  this.url_ = url;
  this.text_ = text;
  this.title = title;
  (this as Suggestion).relevancy_ = computeRelevancy(this, extraData);
} as any;

function prepareHtml(sug: Suggestion): void {
  if (sug.textSplit != null) {
    if (sug.text_ === sug.url_) { sug.text_ = ""; }
    return;
  }
  sug.title = cutTitle(sug.title);
  const text = sug.text_, str = shortenUrl(text);
  sug.text_ = text.length !== sug.url_.length ? str : "";
  sug.textSplit = cutUrl(str, getMatchRanges(str), text.length - str.length
    , singleLine ? maxChars - 13 - Math.min(sug.title.length, 40) : maxChars);
}
function cutTitle(title: string): string {
  let cut = title.length > maxChars + 40;
  cut && (title = BgUtils_.unicodeSubstring_(title, 0, maxChars + 39));
  return highlight(cut ? title + "\u2026" : title, getMatchRanges(title));
}
function highlight(this: void, str: string, ranges: number[]): string {
  if (ranges.length === 0) { return BgUtils_.escapeText_(str); }
  let out = "", end = 0;
  for (let _i = 0; _i < ranges.length; _i += 2) {
    const start = ranges[_i], end2 = ranges[_i + 1];
    out += BgUtils_.escapeText_(str.slice(end, start));
    out += "<match>";
    out += BgUtils_.escapeText_(str.slice(start, end2));
    out += "</match>";
    end = end2;
  }
  return out + BgUtils_.escapeText_(str.slice(end));
}
function shortenUrl(this: void, url: string): string {
  const i = BgUtils_.IsURLHttp_(url);
  return !i || i >= url.length ? url : url.slice(i, url.length - +(url.endsWith("/") && !url.endsWith("://")));
}
function getMatchRanges(str: string): number[] {
  const ranges: MatchRange[] = [];
  for (let i = 0, len = queryTerms.length; i < len; i++) {
    let index = 0, textPosition = 0, matchedEnd: number;
    const splits = str.split(RegExpCache.parts_[i]), last = splits.length - 1, tl = queryTerms[i].length;
    for (; index < last; index++, textPosition = matchedEnd) {
      matchedEnd = (textPosition += splits[index].length) + tl;
      ranges.push([textPosition, matchedEnd]);
    }
  }
  if (ranges.length === 0) { return ranges as never[]; }
  if (ranges.length === 1) { return ranges[0]; }
  ranges.sort(sortBy0);
  const mergedRanges: number[] = ranges[0];
  for (let i = 1, j = 1, len = ranges.length; j < len; j++) {
    const range = ranges[j];
    if (mergedRanges[i] >= range[0]) {
      if (mergedRanges[i] < range[1]) {
        mergedRanges[i] = range[1];
      }
    } else {
      mergedRanges.push(range[0], range[1]);
      i += 2;
    }
  }
  return mergedRanges;
}
function sortBy0(this: void, a: MatchRange, b: MatchRange): number { return a[0] - b[0]; }
// deltaLen may be: 0, 1, 7/8/9
function cutUrl(this: void, str: string, ranges: number[], deltaLen: number, maxLen: number): string {
  let out = "", end = str.length, cutStart = end;
  if (end <= maxLen) { /* empty */ }
  else if (deltaLen > 1) { cutStart = str.indexOf("/") + 1 || end; }
  else if ((cutStart = str.indexOf(":")) < 0) { cutStart = end; }
  else if (BgUtils_.protocolRe_.test(str.slice(0, cutStart + 3).toLowerCase())) {
    cutStart = str.indexOf("/", cutStart + 4) + 1 || end;
  } else {
    cutStart += 22; // for data:text/javascript,var xxx; ...
  }
  if (cutStart < end) {
    for (let i = ranges.length, start = end + 8; (i -= 2) >= 0 && start >= cutStart; start = ranges[i]) {
      const subEndInLeft = ranges[i + 1], delta = start - 20 - Math.max(subEndInLeft, cutStart);
      if (delta > 0) {
        end -= delta;
        if (end <= maxLen) {
          cutStart = subEndInLeft + (maxLen - end);
          break;
        }
      }
    }
  }
  end = 0;
  for (let i = 0; end < maxLen && i < ranges.length; i += 2) {
    const start = ranges[i], temp = Math.max(end, cutStart), delta = start - 20 - temp;
    if (delta > 0) {
      maxLen += delta;
      out += BgUtils_.escapeText_(BgUtils_.unicodeSubstring_(str, end, temp + 11));
      out += "\u2026";
      out += BgUtils_.escapeText_(BgUtils_.unicodeLsubstring_(str, start - 8, start));
    } else if (end < start) {
      out += BgUtils_.escapeText_(str.slice(end, start));
    }
    end = ranges[i + 1];
    out += "<match>";
    out += BgUtils_.escapeText_(str.slice(start, end));
    out += "</match>";
  }
  if (str.length <= maxLen) {
    return out + BgUtils_.escapeText_(str.slice(end));
  } else {
    return out + BgUtils_.escapeText_(BgUtils_.unicodeSubstring_(str, end, maxLen - 1 > end ? maxLen - 1 : end + 10)) +
      "\u2026";
  }
}
function ComputeWordRelevancy(this: void, suggestion: CompletersNS.CoreSuggestion): number {
  return RankingUtils.wordRelevancy_(suggestion.text_, suggestion.title);
}
function ComputeRelevancy(this: void, text: string, title: string, lastVisitTime: number): number {
  const recencyScore = RankingUtils.recencyScore_(lastVisitTime),
    wordRelevancy = RankingUtils.wordRelevancy_(text, title);
  return recencyScore <= wordRelevancy ? wordRelevancy : (wordRelevancy + recencyScore) / 2;
}
function get2ndArg(_s: CompletersNS.CoreSuggestion, score: number): number { return score; }

const bookmarkEngine = {
  bookmarks_: [] as Bookmark[],
  dirs_: [] as string[],
  currentSearch_: null as [CompletersNS.QueryStatus, number] | null,
  path_: "",
  depth_: 0,
  status_: BookmarkStatus.notInited,
  filter_ (query: CompletersNS.QueryStatus, index: number): void {
    if (queryTerms.length === 0 || !(allExpectedTypes & SugType.bookmark)) {
      Completers.next_([], SugType.bookmark);
      if (index !== 0) { return; }
    } else if (bookmarkEngine.status_ === BookmarkStatus.inited) {
      return bookmarkEngine.performSearch_(index);
    } else {
      bookmarkEngine.currentSearch_ = [query, index];
    }
    if (bookmarkEngine.status_ === BookmarkStatus.notInited) { return bookmarkEngine.refresh_(); }
  },
  StartsWithSlash_ (str: string): boolean { return str.charCodeAt(0) === kCharCode.slash; },
  performSearch_ (completerIndex: number): void {
    const isPath = queryTerms.some(this.StartsWithSlash_);
    const arr = this.bookmarks_, len = arr.length;
    let results: Array<[number, number]> = [];
    for (let ind = 0; ind < len; ind++) {
      const i = arr[ind];
      const title = isPath ? i.path_ : i.title_;
      if (!RankingUtils.Match2_(i.text_, title)) { continue; }
      if (showThoseInBlacklist || i.visible_) {
        results.push([-RankingUtils.wordRelevancy_(i.text_, i.title_), ind]);
      }
    }
    matchedTotal += results.length;
    if (queryType === FirstQuery.waitFirst || offset === 0) {
      results.sort(sortBy0);
      if (offset > 0) {
        results = results.slice(offset, offset + maxResults);
        offset = 0;
      } else if (results.length > maxResults) {
        results.length = maxResults;
      }
    }
    const results2: Suggestion[] = [],
    /** inline of {@link #RankingUtils.recencyScore_} */
    fakeTimeScore = completerIndex !== 2 ? 0
      : -1 * (1 - TimeEnums.bookmarkFakeVisitTime / TimeEnums.timeCalibrator)
        * (1 - TimeEnums.bookmarkFakeVisitTime / TimeEnums.timeCalibrator) * RankingEnums.recCalibrator;
    for (let [score, ind] of results) {
      const i = arr[ind];
      if (fakeTimeScore) {
        /** inline of {@link #ComputeRelevancy} */
        score = fakeTimeScore > score ? score : (score + fakeTimeScore) / 2;
      }
      const sug = new Suggestion("bookm", i.url_, i.text_, isPath ? i.path_ : i.title_, get2ndArg, -score);
      results2.push(sug);
      if (i.jsUrl_ === null) { continue; }
      (sug as CompletersNS.WritableCoreSuggestion).url_ = (i as JSBookmark).jsUrl_;
      sug.title = cutTitle(sug.title);
      sug.textSplit = "javascript: \u2026";
      sug.text_ = (i as JSBookmark).jsText_;
    }
    Completers.next_(results2, SugType.bookmark);
  },
  Listen_: function (): void {
    const bBm = chrome.bookmarks, { Delay_: listener, Expire_: Expire } = bookmarkEngine;
    if (!bBm.onCreated) { return; }
    bBm.onCreated.addListener(listener);
    bBm.onRemoved.addListener(Expire);
    bBm.onChanged.addListener(Expire);
    bBm.onMoved.addListener(listener);
    bBm.onImportBegan && bBm.onImportBegan.addListener(function (): void {
      chrome.bookmarks.onCreated.removeListener(bookmarkEngine.Delay_);
    });
    bBm.onImportEnded && bBm.onImportEnded.addListener(function (): void {
      const f = bookmarkEngine.Delay_;
      chrome.bookmarks.onCreated.addListener(f);
      f();
    });
  } as ((this: void) => void) | null,
  refresh_ (): void {
    bookmarkEngine.status_ = BookmarkStatus.initing;
    if (bookmarkEngine._timer) {
      clearTimeout(bookmarkEngine._timer);
      bookmarkEngine._timer = 0;
    }
    chrome.bookmarks.getTree(bookmarkEngine.readTree_);
  },
  readTree_ (this: void, tree: chrome.bookmarks.BookmarkTreeNode[]): void {
    const a = bookmarkEngine;
    a.status_ = BookmarkStatus.inited;
    a.bookmarks_ = [];
    a.dirs_ = [];
    tree.forEach(a.traverseBookmark_, a);
    const query = a.currentSearch_;
    a.currentSearch_ = null;
    setTimeout(() => Decoder.decodeList_(bookmarkEngine.bookmarks_), 50);
    if (a.Listen_) {
      setTimeout(a.Listen_, 0);
      a.Listen_ = null;
    }
    if (query && !query[0].o) {
      return a.performSearch_(query[1]);
    }
  },
  traverseBookmark_ (bookmark: chrome.bookmarks.BookmarkTreeNode): void {
    const a = bookmarkEngine;
    const title = bookmark.title, id = bookmark.id, path = a.path_ + "/" + (title || id);
    if (bookmark.children) {
      a.dirs_.push(id);
      const oldPath = a.path_;
      if (2 < ++a.depth_) {
        a.path_ = path;
      }
      bookmark.children.forEach(a.traverseBookmark_, a);
      --a.depth_;
      a.path_ = oldPath;
      return;
    }
    const url = bookmark.url as string, jsSchema = "javascript:", isJS = url.startsWith(jsSchema);
    a.bookmarks_.push({
      id_: id, path_: path, title_: title || id,
      text_: isJS ? jsSchema : url,
      visible_: phraseBlacklist ? BlacklistFilter.TestNotMatched_(url, title) : kVisibility.visible,
      url_: isJS ? jsSchema : url,
      jsUrl_: isJS ? url : null, jsText_: isJS ? BgUtils_.DecodeURLPart_(url) : null
    });
  },
  _timer: 0,
  _stamp: 0,
  _expiredUrls: false,
  Later_ (this: void): void {
    const _this = bookmarkEngine, last = performance.now() - _this._stamp;
    if (_this.status_ !== BookmarkStatus.notInited) { return; }
    if (last >= InnerConsts.bookmarkBasicDelay || last < -GlobalConsts.ToleranceOfNegativeTimeDelta) {
      _this._timer = _this._stamp = 0;
      _this._expiredUrls = false;
      _this.refresh_();
    } else {
      _this.bookmarks_ = [];
      _this.dirs_ = [];
      _this._timer = setTimeout(_this.Later_, InnerConsts.bookmarkFurtherDelay);
    }
  },
  Delay_ (this: void): void {
    bookmarkEngine._stamp = performance.now();
    if (bookmarkEngine.status_ < BookmarkStatus.inited) { return; }
    bookmarkEngine._timer = setTimeout(bookmarkEngine.Later_, InnerConsts.bookmarkBasicDelay);
    bookmarkEngine.status_ = BookmarkStatus.notInited;
  },
  Expire_ (
      this: void, id: string, info?: chrome.bookmarks.BookmarkRemoveInfo | chrome.bookmarks.BookmarkChangeInfo): void {
    const _this = bookmarkEngine, arr = _this.bookmarks_, len = arr.length,
    title = info && (info as chrome.bookmarks.BookmarkChangeInfo).title;
    let i = 0; for (; i < len && arr[i].id_ !== id; i++) { /* empty */ }
    if (i < len) {
      const cur: Bookmark = arr[i], url = cur.url_,
      url2 = info && (info as chrome.bookmarks.BookmarkChangeInfo).url;
      type WBookmark = Writable<Bookmark>;
      if (Decoder.enabled_ && (title == null ? url !== cur.text_ || !info : url2 != null && url !== url2)) {
        url in Decoder.dict_ && HistoryCache.binarySearch_(url) < 0 && delete Decoder.dict_[url];
      }
      if (title != null) {
        (cur as WBookmark).path_ = cur.path_.slice(0, -cur.title_.length) + (title || cur.id_);
        (cur as WBookmark).title_ = title || cur.id_;
        if (url2) {
          (cur as WBookmark).url_ = url2;
          (cur as WBookmark).text_ = Decoder.decodeURL_(url2, cur as WBookmark);
          Decoder.continueToWork_();
        }
        if (phraseBlacklist) {
          (cur as WBookmark).visible_ = BlacklistFilter.TestNotMatched_(cur.url_, cur.title_);
        }
      } else {
        arr.splice(i, 1);
        info || _this.Delay_(); // may need to re-add it in case of lacking info
      }
      return;
    }
    if (_this.dirs_.indexOf(id) < 0) { return; } // some "new" items which haven't been read are changed
    if (title != null) { /* a folder is renamed */ return _this.Delay_(); }
    // a folder is removed
    if (!_this._expiredUrls && Decoder.enabled_) {
      const dict = Decoder.dict_, bs = HistoryCache.binarySearch_;
      for (const { url_: url } of arr) {
        if ((url in dict) && bs(url) < 0) {
          delete dict[url];
        }
      }
      _this._expiredUrls = false;
    }
    return _this.Delay_();
  }
},

historyEngine = {
  filter_ (query: CompletersNS.QueryStatus, index: number): void {
    if (Build.BTypes & BrowserType.Edge && !chrome.history
        || !(allExpectedTypes & SugType.history)) { return Completers.next_([], SugType.history); }
    const history = HistoryCache.history_;
    if (queryType === FirstQuery.waitFirst) {
      queryType = queryTerms.length === 0 || index === 0 ? FirstQuery.history : FirstQuery.historyIncluded;
    }
    if (queryTerms.length > 0) {
      if (history) {
        return Completers.next_(historyEngine.quickSearch_(history), SugType.history);
      }
      return HistoryCache.use_(function (historyList): void {
        if (query.o) { return; }
        return Completers.next_(historyEngine.quickSearch_(historyList), SugType.history);
      });
    }
    if (history) {
      if (HistoryCache.updateCount_ > 10 || HistoryCache.toRefreshCount_ > 0) {
        HistoryCache.refreshInfo_();
      }
    } else if (!HistoryCache.lastRefresh_) {
      setTimeout(function (): void { HistoryCache.use_(); }, 50);
    }
    autoSelect = false;
    if (index === 0) {
      Completers.requireNormalOrIncognito_(historyEngine.loadTabs_, query);
    } else if (chrome.sessions) {
      chrome.sessions.getRecentlyClosed(historyEngine.loadSessions_.bind(historyEngine, query));
    } else {
      historyEngine.filterFill_([], query, {}, 0, 0);
    }
  },
  quickSearch_ (history: ReadonlyArray<Readonly<HistoryItem>>): Suggestion[] {
    const onlyUseTime = queryTerms.length === 1 && (queryTerms[0][0] === "."
      ? BgUtils_.commonFileExtRe_.test(queryTerms[0])
      : (BgUtils_.convertToUrl_(queryTerms[0], null, Urls.WorkType.KeepAll),
        BgUtils_.lastUrlType_ <= Urls.Type.MaxOfInputIsPlainUrl)
    ),
    results = [0.0, 0.0], sugs: Suggestion[] = [], Match2 = RankingUtils.Match2_,
    parts0 = RegExpCache.parts_[0], getRele = ComputeRelevancy;
    let maxNum = maxResults + ((queryType & FirstQuery.QueryTypeMask) === FirstQuery.history ? offset : 0)
      , i = 0, j = 0, matched = 0;
    domainToSkip && maxNum++;
    for (j = maxNum; --j; ) { results.push(0.0, 0.0); }
    maxNum = maxNum * 2 - 2;
    let curMinScore = 0.0;
    for (const len = history.length; i < len; i++) {
      const item = history[i];
      if (onlyUseTime ? !parts0.test(item.text_) : !Match2(item.text_, item.title_)) { continue; }
      if (!(showThoseInBlacklist || item.visible_)) { continue; }
      const score = onlyUseTime ? RankingUtils.recencyScore_(item.time_) : getRele(item.text_, item.title_, item.time_);
      matched++;
      if (curMinScore >= score) { continue; }
      for (j = maxNum - 2; 0 <= j && results[j] < score; j -= 2) {
        results[j + 2] = results[j], results[j + 3] = results[j + 1];
      }
      results[j + 2] = score;
      results[j + 3] = i;
      curMinScore = results[maxNum];
    }
    matchedTotal += matched;
    if (queryType === FirstQuery.history) {
      i = offset * 2;
      offset = 0;
    } else {
      i = 0;
    }
    for (; i <= maxNum; i += 2) {
      const score = results[i];
      if (score <= 0) { break; }
      const item = history[results[i + 1]];
      if (item.url_ !== domainToSkip) {
        sugs.push(new Suggestion("history", item.url_, item.text_, item.title_, get2ndArg, score));
      }
    }
    Decoder.continueToWork_();
    return sugs;
  },
  loadTabs_ (this: void, query: CompletersNS.QueryStatus, tabs: chrome.tabs.Tab[]): void {
    if (query.o) { return; }
    const arr: SafeDict<number> = BgUtils_.safeObj_();
    let count = 0;
    for (const { url, incognito } of tabs) {
      if (incognito && inNormal) { continue; }
      if (url in arr) { continue; }
      arr[url] = 1; count++;
    }
    return historyEngine.filterFill_([], query, arr, offset, count);
  },
  loadSessions_ (query: CompletersNS.QueryStatus, sessions: chrome.sessions.Session[]): void {
    if (query.o) { return; }
    const historys: BrowserUrlItem[] = [], arr: Dict<number> = {};
    let i = queryType === FirstQuery.history ? -offset : 0;
    return sessions.some(function (item): boolean {
      const entry = item.tab;
      if (!entry) { return false; }
      if (!showThoseInBlacklist && !BlacklistFilter.TestNotMatched_(entry.url, entry.title)) { return false; }
      const key = entry.url + "\n" + entry.title;
      if (key in arr) { return false; }
      arr[key] = 1; arr[entry.url] = 1;
      ++i > 0 && historys.push(entry);
      return historys.length >= maxResults;
    }) ? historyEngine.filterFinish_(historys) : historyEngine.filterFill_(historys, query, arr, -i, 0);
  },
  filterFill_ (historys: BrowserUrlItem[], query: CompletersNS.QueryStatus, arr: Dict<number>,
      cut: number, neededMore: number): void {
    chrome.history.search({
      text: "",
      maxResults: offset + maxResults * (showThoseInBlacklist ? 1 : 2) + neededMore
    }, function (historys2: chrome.history.HistoryItem[] | BrowserUrlItem[]): void {
      if (query.o) { return; }
      historys2 = (historys2 as chrome.history.HistoryItem[]).filter(historyEngine.urlNotIn_, arr);
      if (!showThoseInBlacklist) {
        historys2 = (historys2 as chrome.history.HistoryItem[]).filter(function (entry) {
          return BlacklistFilter.TestNotMatched_(entry.url, entry.title || "");
        });
      }
      if (cut < 0) {
        historys2.length = Math.min(historys2.length, maxResults - historys.length);
        historys2 = historys.concat(historys2);
      } else if (cut > 0) {
        historys2 = historys2.slice(cut, cut + maxResults);
      }
      return historyEngine.filterFinish_(historys2);
    });
  },
  filterFinish_: function (historys: Array<BrowserUrlItem | Suggestion>): void {
    historys.forEach(historyEngine.MakeSuggestion_);
    offset = 0;
    Decoder.continueToWork_();
    Completers.next_(historys as Suggestion[], SugType.history);
  } as (historys: BrowserUrlItem[]) => void,
  MakeSuggestion_ (e: BrowserUrlItem, i: number, arr: Array<BrowserUrlItem | Suggestion>): void {
    const u = e.url, o = new Suggestion("history", u, Decoder.decodeURL_(u, u), e.title || "",
      get2ndArg, (99 - i) / 100),
    sessionId = e.sessionId;
    sessionId && (o.sessionId_ = sessionId, o.label = "&#8617;");
    arr[i] = o;
  },
  urlNotIn_ (this: Dict<number>, i: chrome.history.HistoryItem): boolean {
    return !(i.url in this);
  }
},

domainEngine = {
  filter_ (query: CompletersNS.QueryStatus, index: number): void {
    let i: number;
    if (queryTerms.length !== 1 || queryType === FirstQuery.searchEngines
        || !(allExpectedTypes & SugType.domain)
        || (i = queryTerms[0].indexOf("/") + 1) && i < queryTerms[0].length) {
      return Completers.next_([], SugType.domain);
    }
    const cache = HistoryCache;
    if (cache.domains_) { /* empty */ }
    else if (cache.history_) {
      this.refresh_(cache.history_);
    } else {
      return index > 0 ? Completers.next_([], SugType.domain) : cache.use_(function () {
        if (query.o) { return; }
        return domainEngine.filter_(query, 0);
      });
    }
    return this.performSearch_();
  } ,
  performSearch_ (): void {
    const ref = BgUtils_.domains_ as EnsuredSafeDict<Domain>, p = RankingUtils.maxScoreP_,
    word = queryTerms[0].replace("/", "").toLowerCase();
    let sug: Suggestion | undefined, result = "", matchedDomain: Domain | undefined, result_score = -1;
    RankingUtils.maxScoreP_ = RankingEnums.maximumScore;
    for (const domain in ref) {
      if (domain.indexOf(word) === -1) { continue; }
      matchedDomain = ref[domain];
      if (showThoseInBlacklist || matchedDomain.count_ > 0) {
        const score = ComputeRelevancy(domain, "", matchedDomain.time_);
        if (score > result_score) { result_score = score; result = domain; }
      }
    }
    let isMainPart = result.length === word.length;
    if (result && !isMainPart) {
      if (!result.startsWith("www.") && !result.startsWith(word)) {
        let r2 = result.slice(result.indexOf(".") + 1);
        if (r2.indexOf(word) !== -1) {
          let d2: Domain | undefined;
          r2 = "www." + r2;
          if ((d2 = ref[r2]) && (showThoseInBlacklist || d2.count_ > 0)) { result = r2; matchedDomain = d2; }
        }
      }
      let mainLen = result.startsWith(word) ? 0 : result.startsWith("www." + word) ? 4 : -1;
      if (mainLen >= 0) {
        const [arr, partsNum] = BgUtils_.splitByPublicSuffix_(result), i = arr.length - 1;
        if (partsNum > 1) {
          mainLen = result.length - mainLen - word.length - arr[i].length - 1;
          if (!mainLen || partsNum === 3 && mainLen === arr[i - 1].length + 1) {
            isMainPart = true;
          }
        }
      }
    }
    if (result) {
      matchedTotal++;
      const url = ((matchedDomain as Domain).https_ ? "https://" : "http://") + result + "/";
      domainToSkip = url;
      if (offset > 0) {
        offset--;
      } else {
        autoSelect = isMainPart || autoSelect;
        sug = new Suggestion("domain", url, word === queryTerms[0] ? result : result + "/", "",
            get2ndArg, 2);
        prepareHtml(sug);
        const ind = HistoryCache.binarySearch_(url), item = (HistoryCache.history_ as HistoryItem[])[ind];
        item && (showThoseInBlacklist || item.visible_) && (sug.title = BgUtils_.escapeText_(item.title_));
        --maxResults;
      }
    }
    RankingUtils.maxScoreP_ = p;
    Completers.next_(sug ? [sug] : [], SugType.domain);
  },
  refresh_ (history: HistoryItem[]): void {
    this.refresh_ = null as never;
    const parse = this.ParseDomainAndScheme_, d = HistoryCache.domains_ = BgUtils_.domains_;
    for (const { url_: url, time_: time, visible_: visible } of history) {
      const item = parse(url);
      if (!item) { continue; }
      const {domain_: domain, schema_: schema} = item, slot = d[domain];
      if (slot) {
        if (slot.time_ < time) { slot.time_ = time; }
        slot.count_ += visible;
        if (schema >= Urls.SchemaId.HTTP) { slot.https_ = schema === Urls.SchemaId.HTTPS ? 1 : 0; }
      } else {
        d[domain] = {time_: time, count_: visible, https_: schema === Urls.SchemaId.HTTPS ? 1 : 0};
      }
    }
  },
  ParseDomainAndScheme_ (this: void, url: string): UrlDomain | null {
    let d: Urls.SchemaId;
    if (url.startsWith("http://")) { d = Urls.SchemaId.HTTP; }
    else if (url.startsWith("https://")) { d = Urls.SchemaId.HTTPS; }
    else if (url.startsWith("ftp://")) { d = Urls.SchemaId.FTP; }
    else { return null; }
    url = url.slice(d, url.indexOf("/", d));
    return { domain_: url !== "__proto__" ? url : ".__proto__", schema_: d };
  }
},

tabEngine = {
  filter_ (query: CompletersNS.QueryStatus): void {
    if (!(allExpectedTypes & SugType.tab)) { // just in case of logic in the future
      return Completers.next_([], SugType.tab);
    }
    Completers.requireNormalOrIncognito_(this.performSearch_, query);
  },
  performSearch_ (this: void, query: CompletersNS.QueryStatus, tabs0: chrome.tabs.Tab[]): void {
    if (query.o) { return; }
    if (queryType === FirstQuery.waitFirst) { queryType = FirstQuery.tabs; }
    const curTabId = TabRecency_.last_, noFilter = queryTerms.length <= 0,
    treeMode = wantInCurrentWindow && noFilter;
    let suggestions: CompletersNS.TabSuggestion[] = [], treeMap: SafeDict<Tab> | undefined;
    if (treeMode && tabs0.length > offset) {
      treeMap = BgUtils_.safeObj_<Tab>();
      for (const tab of tabs0) { treeMap[tab.id] = tab; }
      if (tabs0.length > maxTotal) {
        let curTab = treeMap[curTabId], pId = curTab ? curTab.openerTabId : 0, pTab = pId ? treeMap[pId] : null,
        start = pTab ? pTab.index : curTab ? <number> curTab.index - 1 : 0, i = pTab ? 0 : (maxTotal / 2) | 0;
        for (; 1 < --i && start > 0 && tabs0[start - 1].openerTabId === pId; start--) { /* empty */ }
        if (start > 0) {
          let tabs1 = tabs0.splice(0, start);
          tabs0 = tabs0.concat(tabs1);
        }
      }
    }
    const tabs: Array<{t: Tab, s: string}> = [], wndIds: number[] = [];
    for (const tab of tabs0) {
      if (!wantInCurrentWindow && inNormal && tab.incognito) { continue; }
      const u = tab.url, text = Decoder.decodeURL_(u, tab.incognito ? "" : u);
      if (noFilter || RankingUtils.Match2_(text, tab.title)) {
        const wndId = tab.windowId;
        !wantInCurrentWindow && wndIds.lastIndexOf(wndId) < 0 && wndIds.push(wndId);
        tabs.push({t: tab, s: text});
      }
    }
    matchedTotal += tabs.length;
    if (offset >= tabs.length) {
      if (queryType === FirstQuery.tabs) {
        offset = 0;
      } else {
        offset -= tabs.length;
      }
      return Completers.next_(suggestions, SugType.tab);
    }
    wndIds.sort(tabEngine.SortNumbers_);
    const c = noFilter ? treeMode ? tabEngine.computeIndex_ : tabEngine.computeRecency_ : ComputeWordRelevancy,
    treeLevels: SafeDict<number> = treeMode ? BgUtils_.safeObj_() : null as never,
    curWndId = wndIds.length > 1 ? TabRecency_.lastWnd_ : 0;
    let ind = 0;
    if (treeMode) {
      for (const {t: tab} of tabs) { // only from start to end, and should not execute nested queries
        const pid = tab.openerTabId, pLevel = pid && treeLevels[pid];
        treeLevels[tab.id] = pLevel
            ? pLevel < GlobalConsts.MaxTabTreeIndent ? pLevel + 1 : GlobalConsts.MaxTabTreeIndent : 1;
      }
    }
    for (const {t: tab, s: text} of tabs) {
      let id = "#";
      curWndId && tab.windowId !== curWndId && (id += `${wndIds.indexOf(tab.windowId) + 1}:`);
      id += <string> <string | number> (tab.index + 1);
      if (!inNormal && tab.incognito) { id += "*"; }
      if (tab.discarded || Build.BTypes & BrowserType.Firefox && tab.hidden) { id += "~"; }
      const tabId = tab.id, level = treeMode ? treeLevels[tabId] as number : 1,
      suggestion = new Suggestion("tab", tab.url, text, tab.title,
          c, treeMode ? ++ind : tabId) as CompletersNS.TabSuggestion;
      if (curTabId === tabId) {
        treeMode || (suggestion.relevancy_ = 1);
        id = `#(${id.slice(1)})`;
      }
      if (level > 1) {
        suggestion.level = " level-" + level;
      }
      suggestion.sessionId_ = tabId;
      suggestion.label = id;
      if (Build.BTypes & BrowserType.Firefox
          && (!(Build.BTypes & ~BrowserType.Firefox) || OnOther === BrowserType.Firefox)) {
        suggestion.favIcon = tab.favIconUrl;
      }
      suggestions.push(suggestion);
    }
    if (queryType !== FirstQuery.tabs && offset !== 0) { /* empty */ }
    else if (suggestions.sort(Completers.rsortByRelevancy_).length > offset + maxResults || !noFilter) {
      if (offset > 0) {
        suggestions = suggestions.slice(offset, offset + maxResults);
        offset = 0;
      } else if (suggestions.length > maxResults) {
        suggestions.length = maxResults;
      }
    } else if (offset > 0) {
      suggestions = suggestions.slice(offset).concat(suggestions.slice(0, maxResults + offset - suggestions.length));
      for (let i = 0, len = suggestions.length, score = len; i < len; i++) {
        suggestions[i].relevancy_ = score--;
      }
      offset = 0;
    }
    Decoder.continueToWork_();
    Completers.next_(suggestions, SugType.tab);
  },
  SortNumbers_ (this: void, a: number, b: number): number { return a - b; },
  computeRecency_ (_0: CompletersNS.CoreSuggestion, tabId: number): number {
    return TabRecency_.tabs_[tabId] || -tabId;
  },
  computeIndex_ (_0: CompletersNS.CoreSuggestion, index: number): number {
    return 1 / index;
  }
},

searchEngine = {
  _nestedEvalCounter: 0,
  filter_: BgUtils_.blank_,
  preFilter_ (query: CompletersNS.QueryStatus, failIfNull?: true): void | true {
    if (!(allExpectedTypes & SugType.search)) {
      return Completers.next_([], SugType.search);
    }
    let sug: SearchSuggestion, q = queryTerms, keyword = q.length > 0 ? q[0] : "",
       pattern: Search.Engine | null | undefined, promise: Promise<Urls.BaseEvalResult> | undefined;
    if (q.length === 0) { /* empty */ }
    else if (failIfNull !== true && keyword[0] === "\\" && keyword[1] !== "\\") {
      if (keyword.length > 1) {
        q[0] = keyword.slice(1);
      } else {
        q.shift();
      }
      keyword = rawQuery.slice(1).trimLeft();
      sug = searchEngine.makeUrlSuggestion_(keyword, "\\" + keyword);
      autoSelect = true;
      maxResults--;
      matchedTotal++;
      showThoseInBlacklist = showThoseInBlacklist && BlacklistFilter.IsExpectingHidden_([keyword]);
      return Completers.next_([sug], SugType.search);
    } else {
      pattern = Settings_.cache_.searchEngineMap[keyword as "__proto__"] as Search.Engine | null | undefined;
    }
    if (failIfNull === true) {
      if (!pattern) { return true; }
    } else if (!pattern) {
      if (matchType === MatchType.plain && q.length <= 1) {
        matchType = q.length ? searchEngine.calcNextMatchType_() : MatchType.reset;
      }
      return Completers.next_([], SugType.search);
    } else {
      autoSelect = true;
      maxResults--;
      matchedTotal++;
      if (queryType === FirstQuery.waitFirst) { q.push(rawMore); offset = 0; }
      q.length > 1 ? (queryType = FirstQuery.searchEngines) : (matchType = MatchType.reset);
    }
    if (q.length > 1) {
      q.shift();
      if (rawQuery.length > Consts.MaxCharsInQuery) {
        q = rawQuery.split(" ");
        q.shift();
      }
    } else {
      q = [];
    }
    showThoseInBlacklist = showThoseInBlacklist && BlacklistFilter.IsExpectingHidden_([keyword]);

    let { url_: url, indexes_: indexes } = BgUtils_.createSearch_(q, pattern.url_, pattern.blank_, []), text = url;
    if (keyword === "~") { /* empty */ }
    else if (url.startsWith("vimium://")) {
      const ret = BgUtils_.evalVimiumUrl_(url.slice(9), Urls.WorkType.ActIfNoSideEffects, true);
      if (ret instanceof Promise) {
        promise = ret;
      } else if (ret instanceof Array) {
        switch (ret[1]) {
        case "search":
          const newQuery = ret[0] as string[];
          const counter = searchEngine._nestedEvalCounter++;
          queryTerms = newQuery.length > 1 || newQuery.length === 1 && newQuery[0] ? newQuery : queryTerms;
          if (counter > 12) { break; }
          const subVal = searchEngine.preFilter_(query, true);
          if (counter <= 0) { searchEngine._nestedEvalCounter = 0; }
          if (subVal !== true) {
            return;
          }
          break;
        }
      }
    } else {
      url = BgUtils_.convertToUrl_(url, null, Urls.WorkType.KeepAll);
    }
    sug = new Suggestion("search", url, text
      , pattern.name_ + ": " + q.join(" "), get2ndArg, 9) as SearchSuggestion;

    if (q.length > 0) {
      sug.text_ = searchEngine.makeText_(text, indexes);
      sug.textSplit = highlight(sug.text_, indexes);
      sug.title = highlight(sug.title, [pattern.name_.length + 2, sug.title.length]);
      sug.visited_ = !!HistoryCache.history_ && HistoryCache.binarySearch_(url) >= 0;
    } else {
      sug.text_ = BgUtils_.DecodeURLPart_(shortenUrl(text));
      sug.textSplit = BgUtils_.escapeText_(sug.text_);
      sug.title = BgUtils_.escapeText_(sug.title);
      sug.visited_ = false;
    }
    sug.pattern_ = pattern.name_;

    if (!promise) {
      return Completers.next_([sug], SugType.search);
    }
    promise.then(searchEngine.onPrimose_.bind(searchEngine, query, sug));
  },
  onPrimose_ (query: CompletersNS.QueryStatus, output: Suggestion, arr: Urls.MathEvalResult): void {
    if (query.o) { return; }
    const result = arr[0];
    if (!result) {
      return Completers.next_([output], SugType.search);
    }
    const sug = new Suggestion("math", "vimium://copy " + result, result, result, get2ndArg, 9);
    --sug.relevancy_;
    sug.title = `<match style="text-decoration: none;">${BgUtils_.escapeText_(sug.title)}<match>`;
    sug.textSplit = BgUtils_.escapeText_(arr[2]);
    maxResults--;
    matchedTotal++;
    Completers.next_([output, sug], SugType.search);
  },
  searchKeywordMaxLength_: 0,
  timer_: 0,
  calcNextMatchType_ (): MatchType {
    const key = queryTerms[0], arr = Settings_.cache_.searchKeywords;
    if (arr == null) {
      searchEngine.timer_ = searchEngine.timer_ || setTimeout(searchEngine.BuildSearchKeywords_, 67);
      return MatchType.searching_;
    }
    if (key.length >= searchEngine.searchKeywordMaxLength_) { return MatchType.plain; }
    return arr.indexOf("\n" + key) >= 0 ? MatchType.searching_ : MatchType.plain;
  },
  makeText_ (url: string, arr: number[]): string {
    let len = arr.length, i: number, str: string, ind: number;
    str = BgUtils_.DecodeURLPart_(arr.length > 0 ? url.slice(0, arr[0]) : url);
    if (i = BgUtils_.IsURLHttp_(str)) {
      str = str.slice(i);
      i = 0;
    }
    if (arr.length <= 0) { return str; }
    ind = arr[0];
    while (arr[i] = str.length, len > ++i) {
      str += BgUtils_.DecodeURLPart_(url.slice(ind, arr[i]));
      ind = arr[i];
    }
    if (ind < url.length) {
      str += BgUtils_.DecodeURLPart_(url.slice(ind));
    }
    return str;
  },
  makeUrlSuggestion_ (keyword: string, text?: string): SearchSuggestion {
    const url = BgUtils_.convertToUrl_(keyword, null, Urls.WorkType.KeepAll),
    isSearch = BgUtils_.lastUrlType_ === Urls.Type.Search,
    sug = new Suggestion("search", url, text || BgUtils_.DecodeURLPart_(shortenUrl(url))
      , "", get2ndArg, 9) as SearchSuggestion;
    sug.textSplit = BgUtils_.escapeText_(sug.text_);
    sug.title = isSearch ? "~: " + highlight(keyword, [0, keyword.length]) : BgUtils_.escapeText_(keyword);
    sug.pattern_ = isSearch ? "~" : "";
    return sug;
  },
  BuildSearchKeywords_ (): void {
    let arr = Object.keys(Settings_.cache_.searchEngineMap), max = 0, j: number;
    for (const i of arr) {
      j = i.length;
      max < j && (max = j);
    }
    Settings_.set_("searchKeywords", "\n" + arr.join("\n"));
    searchEngine.searchKeywordMaxLength_ = max;
    searchEngine.timer_ = 0;
  }
},

Completers = {
  counter_: 0,
  sugTypes_: SugType.Empty,
  suggestions_: null as ReadonlyArray<Suggestion> | null,
  mostRecentQuery_: null as CompletersNS.QueryStatus | null,
  callback_: null as CompletersNS.Callback | null,
  filter_ (completers: ReadonlyArray<Completer>): void {
    if (Completers.mostRecentQuery_) { Completers.mostRecentQuery_.o = true; }
    const query: CompletersNS.QueryStatus = Completers.mostRecentQuery_ = {
      o: false
    };
    Completers.sugTypes_ = SugType.Empty;
    let i = 0, l = Completers.counter_ = allExpectedTypes & ~SugType.search ? completers.length : 1;
    Completers.suggestions_ = [];
    matchType = offset && MatchType.reset;
    if (completers[0] === searchEngine) {
      searchEngine.preFilter_(query);
      if (l < 2) {
        return;
      }
      i = 1;
    }
    RankingUtils.timeAgo_ = Date.now() - TimeEnums.timeCalibrator; // safe for time change
    RankingUtils.maxScoreP_ = RankingEnums.maximumScore * queryTerms.length || 0.01;
    if (queryTerms.indexOf("__proto__") >= 0) {
      queryTerms = queryTerms.join(" ").replace(<RegExpG> /(^| )__proto__(?=$| )/g, " __proto_").trimLeft().split(" ");
    }
    queryTerms.sort(Completers.rsortQueryTerms_);
    RegExpCache.buildParts_();
    for (; i < l; i++) {
      completers[i].filter_(query, i);
    }
  },
  rsortQueryTerms_ (a: string, b: string): number {
    return b.length - a.length || (a < b ? -1 : a === b ? 0 : 1);
  },
  requireNormalOrIncognito_<T> (
      func: (this: T, query: CompletersNS.QueryStatus, tabs: chrome.tabs.Tab[]) => void
      , query: CompletersNS.QueryStatus): 1 {
    const cb = func.bind(null, query);
    if (Build.MinCVer >= BrowserVer.MinNoUnmatchedIncognito || !(Build.BTypes & BrowserType.Chrome)) {
      inNormal = TabRecency_.incognito_ !== IncognitoType.true;
      return chrome.tabs.query(wantInCurrentWindow ? { currentWindow: true } : {}, cb);
    }
    if (inNormal === null) {
      inNormal = TabRecency_.incognito_ !== IncognitoType.mayFalse
        ? TabRecency_.incognito_ !== IncognitoType.true
        : CurCVer_ >= BrowserVer.MinNoUnmatchedIncognito || Settings_.CONST_.DisallowIncognito_
          || null;
    }
    if (inNormal !== null) {
      return chrome.tabs.query(wantInCurrentWindow ? { currentWindow: true } : {}, cb);
    }
    return chrome.windows.getCurrent({populate: wantInCurrentWindow}, function (wnd): void {
      if (query.o) { return; }
      inNormal = wnd ? !wnd.incognito : true;
      TabRecency_.incognito_ = inNormal ? IncognitoType.ensuredFalse : IncognitoType.true;
      if (wantInCurrentWindow) {
        return cb((wnd as chrome.windows.Window & { tabs: chrome.tabs.Tab[] }).tabs);
      }
      chrome.tabs.query({}, cb);
    });
  },
  next_ (newSugs: Suggestion[], type: Exclude<SugType, SugType.Empty>): void {
    let arr = Completers.suggestions_;
    if (newSugs.length > 0) {
      Completers.sugTypes_ |= type;
      Completers.suggestions_ = (arr as Suggestion[]).length === 0 ? newSugs : (arr as Suggestion[]).concat(newSugs);
    }
    if (0 === --Completers.counter_) {
      arr = null;
      return Completers.finish_();
    }
  },
  finish_ (): void {
    let suggestions = Completers.suggestions_ as Suggestion[];
    Completers.suggestions_ = null;
    suggestions.sort(Completers.rsortByRelevancy_);
    if (offset > 0) {
      suggestions = suggestions.slice(offset, offset + maxTotal);
      offset = 0;
    } else if (suggestions.length > maxTotal) {
      suggestions.length = maxTotal;
    }
    RegExpCache.words_ = RegExpCache.starts_ = null as never;
    if (queryTerms.length > 0) {
      let s0 = queryTerms[0], s1 = shortenUrl(s0), cut = s0.length !== s1.length;
      if (cut || s0.endsWith("/") && s0.length > 1) {
        queryTerms[0] = cut ? s1 : s0.slice(0, -1);
        RegExpCache.fixParts_();
      }
    }
    suggestions.forEach(prepareHtml);

    const someMatches = suggestions.length > 0,
    newAutoSelect = autoSelect && someMatches, matched = matchedTotal,
    mayGoToAnotherMode = rawQuery === ":" && !hasOmniTypePrefix,
    newMatchType = matchType < MatchType.plain ? (matchType === MatchType.searching_
          && !someMatches ? MatchType.searchWanted : MatchType.Default)
        : !showThoseInBlacklist ? MatchType.Default
        : queryTerms.length <= 0 ? MatchType.Default
        : someMatches ? MatchType.someMatches
        : mayGoToAnotherMode ? MatchType.searchWanted
        : MatchType.emptyResult,
    newSugTypes = newMatchType === MatchType.someMatches && !mayGoToAnotherMode ? Completers.sugTypes_ : SugType.Empty,
    func = Completers.callback_ as CompletersNS.Callback;
    Completers.cleanGlobals_();
    return func(suggestions, newAutoSelect, newMatchType, newSugTypes, matched);
  },
  cleanGlobals_ (): void {
    Completers.mostRecentQuery_ = Completers.callback_ = inNormal = null;
    queryTerms = [];
    rawQuery = rawMore = domainToSkip = "";
    RegExpCache.parts_ = null as never;
    RankingUtils.maxScoreP_ = RankingEnums.maximumScore;
    RankingUtils.timeAgo_ = matchType =
    Completers.sugTypes_ =
    maxResults = maxTotal = matchedTotal = maxChars = 0;
    queryType = FirstQuery.nothing;
    autoSelect = singleLine = hasOmniTypePrefix = false;
    wantInCurrentWindow = false;
    showThoseInBlacklist = true;
  },
  getOffset_ (this: void): void {
    let str = rawQuery, ind: number, i: number;
    offset = 0; queryType = FirstQuery.nothing; rawMore = "";
    if (str.length === 0 || (ind = (str = str.slice(-5)).lastIndexOf("+")) < 0
      || ind !== 0 && str.charCodeAt(ind - 1) !== kCharCode.space
    ) {
      return;
    }
    str = str.slice(ind);
    ind = rawQuery.length - str.length;
    if ((i = parseInt(str, 10)) >= 0 && "+" + i === str && i <= (ind > 0 ? 100 : 200)) {
      offset = i;
    } else if (str !== "+") {
      return;
    }
    rawQuery = rawQuery.slice(0, ind && ind - 1);
    rawMore = str;
    queryType = FirstQuery.waitFirst;
  },
  rsortByRelevancy_ (a: Suggestion, b: Suggestion): number { return b.relevancy_ - a.relevancy_; }
},
knownCs: CompletersMap & SafeObject = {
  __proto__: null as never,
  bookm: [bookmarkEngine],
  domain: [domainEngine],
  history: [historyEngine],
  omni: [searchEngine, domainEngine, historyEngine, bookmarkEngine],
  bomni: [searchEngine, domainEngine, bookmarkEngine, historyEngine],
  search: [searchEngine],
  tab: [tabEngine]
},

  RankingUtils = {
    Match2_ (s1: string, s2: string): boolean {
      const { parts_: parts } = RegExpCache;
      for (let i = 0, len = queryTerms.length; i < len; i++) {
        if (!(parts[i].test(s1) || parts[i].test(s2))) { return false; }
      }
      return true;
    },
    maxScoreP_: RankingEnums.maximumScore,
    _emptyScores: [0, 0] as [number, number],
    scoreTerm_ (term: number, str: string): [number, number] {
      let count = 0, score = 0;
      count = str.split(RegExpCache.parts_[term]).length;
      if (count < 1) { return this._emptyScores; }
      score = RankingEnums.anywhere;
      if (RegExpCache.starts_[term].test(str)) {
        score += RankingEnums.startOfWord;
        if (RegExpCache.words_[term].test(str)) {
          score += RankingEnums.wholeWord;
        }
      }
      return [score, (count - 1) * queryTerms[term].length];
    },
    wordRelevancy_ (url: string, title: string): number {
      let titleCount = 0, titleScore = 0, urlCount = 0, urlScore = 0, useTitle = !!title;
      RegExpCache.starts_ || RegExpCache.buildOthers_();
      for (let term = 0, len = queryTerms.length; term < len; term++) {
        let a = this.scoreTerm_(term, url);
        urlScore += a[0]; urlCount += a[1];
        if (useTitle) {
          a = this.scoreTerm_(term, title);
          titleScore += a[0]; titleCount += a[1];
        }
      }
      urlScore = urlScore / this.maxScoreP_ * this.normalizeDifference_(urlCount, url.length);
      if (titleCount === 0) {
        return title ? urlScore / 2 : urlScore;
      }
      titleScore = titleScore / this.maxScoreP_ * this.normalizeDifference_(titleCount, title.length);
      return (urlScore < titleScore) ? titleScore : ((urlScore + titleScore) / 2);
    },
    timeAgo_: 0,
    recencyScore_ (lastAccessedTime: number): number {
      let score = (lastAccessedTime - this.timeAgo_) / TimeEnums.timeCalibrator;
      return score < 0 ? 0 : score < 1 ? score * score * RankingEnums.recCalibrator
        : score < TimeEnums.futureTimeTolerance ? TimeEnums.futureTimeScore : 0;
    },
    normalizeDifference_ (a: number, b: number): number {
      return a < b ? a / b : b / a;
    }
  },

  RegExpCache = {
    parts_: null as never as CachedRegExp[],
    starts_: null as never as CachedRegExp[],
    words_: null as never as CachedRegExp[],
    buildParts_ (): void {
      const d: CachedRegExp[] = this.parts_ = [] as never;
      this.starts_ = this.words_ = null as never;
      for (const s of queryTerms) {
        d.push(new RegExp(s.replace(BgUtils_.escapeAllRe_, "\\$&"), BgUtils_.hasUpperCase_(s) ? "" : "i" as ""
          ) as CachedRegExp);
      }
    },
    buildOthers_ (): void {
      const ss = this.starts_ = [] as CachedRegExp[], ws = this.words_ = [] as CachedRegExp[];
      for (const s of queryTerms) {
        const start = "\\b" + s.replace(BgUtils_.escapeAllRe_, "\\$&"),
        flags = BgUtils_.hasUpperCase_(s) ? "" : "i" as "";
        ss.push(new RegExp(start, flags) as CachedRegExp);
        ws.push(new RegExp(start + "\\b", flags) as CachedRegExp);
      }
    },
    fixParts_ (): void {
      if (!this.parts_) { return; }
      let s = queryTerms[0];
      this.parts_[0] = new RegExp(s.replace(BgUtils_.escapeAllRe_, "\\$&"), BgUtils_.hasUpperCase_(s) ? "" : "i" as ""
        ) as CachedRegExp;
    }
  },

  HistoryCache = {
    lastRefresh_: 0,
    updateCount_: 0,
    toRefreshCount_: 0,
    history_: null as HistoryItem[] | null,
    _callbacks: null as HistoryCallback[] | null,
    domains_: null as typeof BgUtils_.domains_ | null,
    use_ (callback?: HistoryCallback): void {
      if (Build.BTypes & BrowserType.Edge && !chrome.history) { callback && callback([]); return; }
      if (this._callbacks) {
        callback && this._callbacks.push(callback);
        return;
      }
      this._callbacks = callback ? [callback] : [];
      this.lastRefresh_ = Date.now(); // safe for time changes
      chrome.history.search({
        text: "",
        maxResults: InnerConsts.historyMaxSize,
        startTime: 0
      }, function (history: chrome.history.HistoryItem[]): void {
        setTimeout(HistoryCache.Clean_ as (arr: chrome.history.HistoryItem[]) => void, 0, history);
      });
    },
    Clean_: function (this: void, arr: Array<chrome.history.HistoryItem | HistoryItem>): void {
      const _this = HistoryCache, len = arr.length;
      _this.Clean_ = null;
      for (let i = 0; i < len; i++) {
        let j = arr[i] as chrome.history.HistoryItem, url = j.url;
        if (url.length > GlobalConsts.MaxHistoryURLLength) {
          url = _this.trimTooLongURL_(url, j);
        }
        (arr as HistoryItem[])[i] = {
          text_: url,
          title_: Build.BTypes & ~BrowserType.Chrome ? j.title || "" : j.title as string,
          time_: j.lastVisitTime,
          visible_: kVisibility.visible,
          url_: url
        };
      }
      if (phraseBlacklist) {
        for (const k of arr as HistoryItem[]) {
          if (BlacklistFilter.TestNotMatched_(k.text_, k.title_) === 0) {
            k.visible_ = kVisibility.hidden;
          }
        }
      }
      setTimeout(function (): void {
        setTimeout(function (): void {
          Decoder.decodeList_(HistoryCache.history_ as HistoryItem[]);
          HistoryCache.domains_ || setTimeout(function (): void {
            domainEngine.refresh_ && domainEngine.refresh_(HistoryCache.history_ as HistoryItem[]);
          }, 200);
        }, 100);
        (HistoryCache.history_ as HistoryItem[]).sort((a, b) => a.url_ > b.url_ ? 1 : -1);
        chrome.history.onVisitRemoved.addListener(HistoryCache.OnVisitRemoved_);
        chrome.history.onVisited.addListener(HistoryCache.OnPageVisited_);
      }, 100);
      _this.history_ = arr as HistoryItem[];
      _this.use_ = function (this: typeof HistoryCache, callback?: HistoryCallback): void {
        if (callback) { callback(this.history_ as HistoryItem[]); }
      };
      _this._callbacks && _this._callbacks.length > 0 && setTimeout(function (ref: HistoryCallback[]): void {
        for (const f of ref) {
          f(HistoryCache.history_ as HistoryItem[]);
        }
      }, 1, _this._callbacks);
      _this._callbacks = null;
    } as ((arr: chrome.history.HistoryItem[]) => void) | null,
    OnPageVisited_ (this: void, newPage: chrome.history.HistoryItem): void {
      let _this = HistoryCache, url = newPage.url;
      if (url.length > GlobalConsts.MaxHistoryURLLength) {
        url = _this.trimTooLongURL_(url, newPage);
      }
      const time = newPage.lastVisitTime,
      title = Build.BTypes & ~BrowserType.Chrome ? newPage.title || "" : newPage.title as string,
      updateCount = ++_this.updateCount_,
      d = _this.domains_, i = _this.binarySearch_(url);
      if (i < 0) { _this.toRefreshCount_++; }
      if (updateCount > 59 || (updateCount > 10 && Date.now() - _this.lastRefresh_ > 300000)) { // safe for time change
        _this.refreshInfo_();
      }
      const j: HistoryItem = i >= 0 ? (_this.history_ as HistoryItem[])[i] : {
        text_: "",
        title_: title,
        time_: time,
        visible_: phraseBlacklist ? BlacklistFilter.TestNotMatched_(url, title) : kVisibility.visible,
        url_: url
      };
      let slot: Domain | undefined;
      if (d) {
        let domain = domainEngine.ParseDomainAndScheme_(url);
        if (!domain) { /* empty */ }
        else if (slot = d[domain.domain_]) {
          slot.time_ = time;
          if (i < 0) { slot.count_ += j.visible_; }
          if (domain.schema_ >= Urls.SchemaId.HTTP) { slot.https_ = domain.schema_ === Urls.SchemaId.HTTPS ? 1 : 0; }
        } else {
          d[domain.domain_] = { time_: time, count_: j.visible_, https_: domain.schema_ === Urls.SchemaId.HTTPS ? 1 : 0 };
        }
      }
      if (i >= 0) {
        j.time_ = time;
        if (title && title !== j.title_) {
          j.title_ = title;
          if (phraseBlacklist) {
            const newVisible = BlacklistFilter.TestNotMatched_(url, title);
            if (j.visible_ !== newVisible) {
              j.visible_ = newVisible;
              if (slot) {
                slot.count_ += newVisible || -1;
              }
            }
          }
        }
        return;
      }
      j.text_ = Decoder.decodeURL_(url, j);
      (_this.history_ as HistoryItem[]).splice(~i, 0, j);
    },
    OnVisitRemoved_ (this: void, toRemove: chrome.history.RemovedResult): void {
      Decoder._jobs.length = 0;
      const d = Decoder.dict_;
      if (toRemove.allHistory) {
        HistoryCache.history_ = [];
        if (HistoryCache.domains_) {
          HistoryCache.domains_ = BgUtils_.domains_ = BgUtils_.safeObj_<Domain>();
        }
        const d2 = BgUtils_.safeObj_<string>();
        for (const i of bookmarkEngine.bookmarks_) {
          const t = d[i.url_]; t && (d2[i.url_] = t);
        }
        Decoder.dict_ = d2;
        return;
      }
      const {binarySearch_: bs, history_: h, domains_: domains} = HistoryCache as EnsureNonNull<typeof HistoryCache>;
      let entry: Domain | undefined;
      for (const j of toRemove.urls) {
        const i = bs(j);
        if (i >= 0) {
          if (domains && h[i].visible_) {
            const item = domainEngine.ParseDomainAndScheme_(j);
            if (item && (entry = domains[item.domain_]) && (--entry.count_) <= 0) {
              delete domains[item.domain_];
            }
          }
          h.splice(i, 1);
          delete d[j];
        }
      }
    },
    trimTooLongURL_ (url: string, history: chrome.history.HistoryItem): string {
      const colon = url.lastIndexOf(":", 9), hasHost = colon > 0 && url.substr(colon, 3) === "://",
      title = history.title;
      url = url.slice(0, (hasHost ? url.indexOf("/", colon + 4) : colon)
                + GlobalConsts.TrimmedURLLengthForTooLongURL) + "\u2026";
      if (title && title.length > GlobalConsts.TrimmedTitleLengthForTooLongURL) {
        history.title = BgUtils_.unicodeSubstring_(title, 0, GlobalConsts.TrimmedTitleLengthForTooLongURL);
      }
      return url;
    },
    refreshInfo_ (): void {
      type Q = chrome.history.HistoryQuery;
      type C = (results: chrome.history.HistoryItem[]) => void;
      const a = HistoryCache, i = Date.now(); // safe for time change
      if (a.toRefreshCount_ <= 0) { /* empty */ }
      else if (i < a.lastRefresh_ + 1000 && i >= a.lastRefresh_) { return; }
      else {
        setTimeout(chrome.history.search as ((q: Q, c: C) => void | 1) as (q: Q, c: C) => void, 50, {
          text: "",
          maxResults: Math.min(999, a.updateCount_ + 10),
          startTime: i < a.lastRefresh_ ? i - 5 * 60 * 1000 : a.lastRefresh_
        }, a.OnInfo_);
      }
      a.lastRefresh_ = i;
      a.toRefreshCount_ = a.updateCount_ = 0;
      return Decoder.continueToWork_();
    },
    OnInfo_ (history: chrome.history.HistoryItem[]): void {
      const arr = HistoryCache.history_ as HistoryItem[], bs = HistoryCache.binarySearch_;
      if (arr.length <= 0) { return; }
      for (const info of history) {
        const j = bs(info.url);
        if (j < 0) {
          HistoryCache.toRefreshCount_--;
        } else {
          const item = arr[j], title = info.title;
          if (!title || title === item.title_) {
            continue;
          }
        }
        HistoryCache.updateCount_--;
        HistoryCache.OnPageVisited_(info);
      }
    },
    binarySearch_ (this: void, u: string): number {
      let e = "", a = HistoryCache.history_ as HistoryItem[], h = a.length - 1, l = 0, m = 0;
      while (l <= h) {
        m = (l + h) >>> 1;
        e = a[m].url_;
        if (e > u) { h = m - 1; }
        else if (e !== u) { l = m + 1; }
        else { return m; }
      }
      // if e > u, then l == h + 1 && l == m
      // else if e < u, then l == h + 1 && l == m + 1
      // (e < u ? -2 : -1) - m = (e < u ? -1 - 1 - m : -1 - m) = (e < u ? -1 - l : -1 - l)
      // = -1 - l = ~l
      return ~l;
    }
  },

  BlacklistFilter = {
    TestNotMatched_ (url: string, title: string): Visibility {
      for (const phrase of <string[]> phraseBlacklist) {
        if (title.indexOf(phrase) >= 0 || url.indexOf(phrase) >= 0) {
          return kVisibility.hidden;
        }
      }
      return kVisibility.visible;
    },
    IsExpectingHidden_ (query: string[]): boolean {
      if (!phraseBlacklist) { return true; }
      for (const word of query) {
        for (let phrase of <string[]> phraseBlacklist) {
          phrase = phrase.trim();
          if (word.indexOf(phrase) >= 0 || phrase.length > 9 && word.length + 2 >= phrase.length
              && phrase.indexOf(word) >= 0) {
            return true;
          }
        }
      }
      return false;
    },
    UpdateAll_ (this: void): void {
      if (bookmarkEngine.bookmarks_) {
        for (const k of bookmarkEngine.bookmarks_) {
          (k as Writable<Bookmark>).visible_ = phraseBlacklist ? BlacklistFilter.TestNotMatched_(k.text_, k.path_)
            : kVisibility.visible;
        }
      }
      if (!HistoryCache.history_) {
        return;
      }
      const d = HistoryCache.domains_;
      for (const k of HistoryCache.history_) {
        const newVisible = phraseBlacklist ? BlacklistFilter.TestNotMatched_(k.text_, k.title_) : kVisibility.visible;
        if (k.visible_ !== newVisible) {
          k.visible_ = newVisible;
          if (d) {
            const domain = domainEngine.ParseDomainAndScheme_(k.url_);
            if (domain) {
              const slot = d[domain.domain_];
              if (slot) {
                slot.count_ += newVisible || -1;
              }
            }
          }
        }
      }
    },
    OnUpdate_ (this: void, newList: string): void {
      const arr: string[] = [];
      for (let line of newList.split("\n")) {
        if (!(line && line.trimLeft().charCodeAt(0) > kCharCode.maxCommentHead)) { continue; } // mask: /[!"#]/
        if (line.trim()) {
          arr.push(line);
        }
      }
      phraseBlacklist = arr.length > 0 ? arr : null;
      (HistoryCache.history_ || bookmarkEngine.bookmarks_) && setTimeout(BlacklistFilter.UpdateAll_, 100);
    }
  },

  Decoder = {
    _f: decodeURIComponent, // core function
    decodeURL_ (a: string, o: ItemToDecode): string {
      if (a.length >= 400 || a.indexOf("%") < 0) { return a; }
      try {
        return this._f(a);
      } catch {}
      return this.dict_[a] || (o && this._jobs.push(o), a);
    },
    decodeList_ (a: DecodedItem[]): void {
      const { _f: f, dict_: m, _jobs: w } = this;
      let i = -1, j: DecodedItem | undefined, l = a.length, s: string | undefined;
      for (; ; ) {
        try {
          while (++i < l) {
            j = a[i]; s = j.url_;
            j.text_ = s.length >= 400 || s.indexOf("%") < 0 ? s : f(s);
          }
          break;
        } catch {
          (j as DecodedItem).text_ = m[s as string] || (w.push(j as DecodedItem), s as string);
        }
      }
      return this.continueToWork_();
    },
    dict_: BgUtils_.safeObj_<string>(),
    _jobs: [] as ItemToDecode[],
    _ind: -1,
    continueToWork_ (): void {
      if (this._jobs.length === 0 || this._ind !== -1) { return; }
      this._ind = 0;
      setTimeout(this.Work_, 17, null);
    },
    Work_ (xhr: XMLHttpRequest | null): void {
      let text: string | undefined;
      for (; Decoder._ind < Decoder._jobs.length; Decoder._ind++) {
        const url = Decoder._jobs[Decoder._ind], isStr = typeof url === "string",
        str = isStr ? url as string : (url as DecodedItem).url_;
        if (text = Decoder.dict_[str]) {
          isStr || ((url as DecodedItem).text_ = text);
          continue;
        }
        if (!xhr && !(xhr = Decoder.init_())) {
          Decoder._jobs.length = 0;
          Decoder._ind = -1;
          return;
        }
        xhr.open("GET", Decoder._dataUrl + (Build.MinCVer >= BrowserVer.MinWarningOfEscapingHashInBodyOfDataURL
            || !(Build.BTypes & BrowserType.Chrome)
            || CurCVer_ >= BrowserVer.MinWarningOfEscapingHashInBodyOfDataURL
          ? str.replace("#", "%25") : str), true);
        return xhr.send();
      }
    },
    OnXHR_ (this: XMLHttpRequest): void {
      if (Decoder._ind < 0) { return; } // disabled by the outsides
      const text = this.responseText, url = Decoder._jobs[Decoder._ind++];
      if (typeof url !== "string") {
        Decoder.dict_[url.url_] = url.text_ = text;
      } else {
        Decoder.dict_[url] = text;
      }
      if (Decoder._ind < Decoder._jobs.length) {
        return Decoder.Work_(this);
      }
      Decoder._jobs.length = 0;
      Decoder._ind = -1;
    },
    enabled_: true,
    _dataUrl: "1",
    xhr_ (): XMLHttpRequest | null {
      if (!this._dataUrl) { return null; }
      const xhr = new XMLHttpRequest();
      xhr.responseType = "text";
      xhr.onload = this.OnXHR_;
      xhr.onerror = this.OnXHR_;
      return xhr;
    },
    onUpdate_ (this: void, charset: string): void {
      const enabled = charset ? !(charset = charset.toLowerCase()).startsWith("utf") : false,
      newDataUrl = enabled ? ("data:text/plain;charset=" + charset + ",") : "",
      isSame = newDataUrl === Decoder._dataUrl;
      if (isSame) { return; }
      Decoder._dataUrl = newDataUrl;
      if (enabled) {
        Decoder.init_ === Decoder.xhr_ && /* inited */
        setTimeout(function (): void {
          if (HistoryCache.history_) {
            Decoder.decodeList_(HistoryCache.history_);
          }
          return Decoder.decodeList_(bookmarkEngine.bookmarks_);
        }, 100);
      } else {
        Decoder.dict_ = BgUtils_.safeObj_<string>();
        Decoder._jobs.length = 0;
      }
      if (Decoder.enabled_ === enabled) { return; }
      Decoder._jobs = enabled ? [] as ItemToDecode[] : { length: 0, push: BgUtils_.blank_ } as any;
      Decoder.enabled_ = enabled;
      Decoder._ind = -1;
    },
    init_ (): XMLHttpRequest | null {
      Settings_.updateHooks_.localeEncoding = Decoder.onUpdate_;
      Decoder.onUpdate_(Settings_.get_("localeEncoding"));
      Decoder.init_ = Decoder.xhr_;
      return Decoder.xhr_();
    }
  };

Completion_ = {
  filter_ (this: void, query: string, options: CompletersNS.FullOptions
      , callback: CompletersNS.Callback): void {
    autoSelect = false;
    rawQuery = (query = query.trim()) && query.replace(BgUtils_.spacesRe_, " ");
    Completers.getOffset_();
    query = rawQuery;
    queryTerms = query
      ? (query.length > Consts.MaxCharsInQuery ? query.slice(0, Consts.MaxCharsInQuery).trimRight()
          : query).split(" ")
      : [];
    maxChars = Math.max(Consts.LowerBoundOfMaxChars, Math.min((<number> options.c | 0) || 128
      , Consts.UpperBoundOfMaxChars));
    const flags = options.f;
    singleLine = !!(flags & CompletersNS.QueryFlags.SingleLine);
    maxTotal = maxResults = Math.min(Math.max(3, ((options.r as number) | 0) || 10), 25);
    matchedTotal = 0;
    Completers.callback_ = callback;
    let arr: ReadonlyArray<Completer> | null = knownCs[options.o], str = queryTerms.length >= 1 ? queryTerms[0] : ""
      , expectedTypes = options.t;
    if (arr === knownCs.tab) {
       wantInCurrentWindow = !!(flags & CompletersNS.QueryFlags.TabInCurrentWindow);
    }
    autoSelect = arr != null && arr.length === 1;
    hasOmniTypePrefix = false;
    if (str.length === 2 && str[0] === ":") {
      str = str[1];
      arr = str === "b" ? knownCs.bookm : str === "h" ? knownCs.history
        : str === "t" || str === "w" ? (wantInCurrentWindow = str === "w", knownCs.tab)
        : str === "B" ? knownCs.bomni
        : str === "d" ? knownCs.domain : str === "s" ? knownCs.search : str === "o" ? knownCs.omni : null;
      if (arr) {
        autoSelect = arr.length === 1;
        hasOmniTypePrefix = true;
        queryTerms.shift();
        rawQuery = query.slice(3);
        if (expectedTypes !== SugType.Empty) { arr = null; }
      }
    }
    if (queryTerms.length > 0) {
      queryTerms[0] = BgUtils_.fixCharsInUrl_(queryTerms[0]);
    }
    showThoseInBlacklist = BlacklistFilter.IsExpectingHidden_(queryTerms);
    allExpectedTypes = expectedTypes !== SugType.Empty ? expectedTypes : SugType.Full;
    Completers.filter_(arr || knownCs.omni);
  },
  removeSug_ (url, type, callback): void {
    switch (type) {
    case "tab":
      chrome.tabs.remove(+url, function (): void {
        const err = BgUtils_.runtimeError_();
        callback(!<boolean> <boolean | void> err);
        return err;
      });
      break;
    case "history":
      {
        const found = !HistoryCache.history_ || HistoryCache.binarySearch_(url) >= 0;
        chrome.history.deleteUrl({ url });
        callback(found);
      }
      break;
    }
  }
};

Settings_.updateHooks_.phraseBlacklist = BlacklistFilter.OnUpdate_;
Settings_.postUpdate_("phraseBlacklist");

BgUtils_.timeout_(80, function () {
  Settings_.postUpdate_("searchEngines", null);
});
if (!Build.NDEBUG) {
  (window as any).Completers = Completers;
  (window as any).knownCs = knownCs;
  (window as any).HistoryCache = HistoryCache;
  (window as any).Decoder = Decoder;
  (window as any).HistoryCache = HistoryCache;
}
});

var Completion_ = { filter_ (a: string, b: CompletersNS.FullOptions, c: CompletersNS.Callback): void {
  BgUtils_.timeout_(210, function () {
    return Completion_.filter_(a, b, c);
  });
}, removeSug_ (): void { /* empty */ } } as CompletersNS.GlobalCompletersConstructor;
